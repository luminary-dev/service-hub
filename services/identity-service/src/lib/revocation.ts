// Redis-backed session revocation list (#374).
//
// identity-service is the source of truth for User.sessionVersion and bumps it
// on every revocation path (password change/reset, logout-all, admin
// force-logout / lock / role change). The api-gateway rejects tokens minted
// before a user's current version — but its only source used to be an S2S
// lookup to identity, which FAILED OPEN during an identity outage.
//
// To close that gap we mirror each bump into a shared Redis key the gateway can
// read WITHOUT calling identity: `revocation:<userId> -> <min-valid version>`.
// The gateway consults Redis first, so a revoked token is rejected even while
// identity is down, without failing closed for everyone (users with no entry
// still pass). The key self-expires after the max session lifetime, by which
// point every token minted before the bump has already expired.
//
// Publishing is BEST-EFFORT: a Redis blip must never turn a password change
// into a 500. Failures are swallowed and logged loudly — the gateway still
// catches the revocation via its identity-lookup fallback until the next
// successful publish.

import { Redis } from "ioredis";
import { log } from "./log";

// Must match the api-gateway's session-version.ts prefix.
export const REVOCATION_KEY_PREFIX = "revocation:";

// Session JWTs live 7 days (lib/session.ts). Keep the entry a little longer so
// a revoked token can never outlive its revocation record (clock-skew buffer).
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REVOCATION_TTL_MS = SESSION_TTL_MS + 24 * 60 * 60 * 1000; // 8 days

// Minimal command surface so tests can inject a fake without a live connection.
export type RevocationStore = {
  set(key: string, value: string, mode: "PX", ttlMs: number): Promise<unknown>;
  quit?(): Promise<unknown>;
  disconnect?(): void;
};

// undefined = not initialized yet; null = no REDIS_URL configured.
let redisClient: RevocationStore | null | undefined;

function getRedis(): RevocationStore | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  // Fail fast while disconnected (no offline queue) so a Redis outage makes
  // publishRevocation reject immediately into the best-effort catch below
  // instead of stalling the request that triggered the bump.
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  // Without an 'error' listener ioredis surfaces connection errors as unhandled
  // exceptions. Swallow-and-log (edge-triggered) — command failures are already
  // handled per-call in publishRevocation.
  client.on("error", (err) => {
    if (redisErrorLogged) return;
    redisErrorLogged = true;
    log.warn("revocation-list Redis connection error", { err });
  });
  redisClient = client;
  return redisClient;
}

let redisErrorLogged = false;

// Publish the user's new min-valid session version to the shared revocation
// list. Call this right after a successful sessionVersion bump, passing the
// updated (post-bump) version. Best-effort: never throws.
export async function publishRevocation(
  userId: string,
  minValidVersion: number,
  redis: RevocationStore | null = getRedis()
): Promise<void> {
  if (!redis) return; // no REDIS_URL — gateway falls back to its identity lookup
  try {
    await redis.set(
      `${REVOCATION_KEY_PREFIX}${userId}`,
      String(minValidVersion),
      "PX",
      REVOCATION_TTL_MS
    );
    redisErrorLogged = false; // recovered — allow the next connection error to log
  } catch (err) {
    // Loud, but non-fatal: the mutation already committed; the gateway still
    // enforces this revocation via its identity-lookup fallback.
    log.error("failed to publish session revocation to Redis", {
      userId,
      minValidVersion,
      err,
    });
  }
}

// Close the shared Redis connection during graceful shutdown. No-op when Redis
// was never initialized or no REDIS_URL is configured.
export async function closeRevocationRedis(): Promise<void> {
  const client = redisClient;
  redisClient = null;
  if (!client) return;
  try {
    await client.quit?.();
  } catch {
    // best-effort — force-disconnect if a graceful quit fails
    client.disconnect?.();
  }
}
