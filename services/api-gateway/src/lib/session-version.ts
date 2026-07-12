// Session revocation check. identity-service bumps User.sessionVersion on
// password change/reset, logout-everywhere and the admin force-logout / lock /
// role-change paths; tokens carry the version they were minted with (sv claim).
// The gateway rejects tokens minted before the user's current version.
//
// Two sources, consulted in order (#374):
//   1. A shared Redis revocation list — identity publishes the user's min-valid
//      version to `revocation:<userId>` on every bump. This is AUTHORITATIVE and
//      needs no call to identity, so a revoked token is rejected even while
//      identity-service is down (no more fail-open on the revocation paths).
//   2. Fallback: the identity S2S lookup + a brief in-memory cache. Used only
//      when Redis has no entry for the user (the common case — most users never
//      revoke) or Redis itself is unavailable. This path still FAILS OPEN if
//      identity is unreachable, so an identity outage never signs everyone out.
//
// Residual: if Redis is entirely down we degrade to (2), i.e. today's behavior
// (a revoked token can be honored for up to the cache TTL during an identity
// outage). And if identity's best-effort Redis publish fails, that one
// revocation isn't reflected in (1) until the next successful bump — logged
// loudly on the identity side. See docs/AUTHZ.md.

import { getRedis } from "./rate-limit";
import { log } from "./log";

const TTL_MS = 60_000;

// Must match identity-service's lib/revocation.ts key prefix.
const REVOCATION_KEY_PREFIX = "revocation:";

type CacheEntry = { v: number; exp: number };
const cache = new Map<string, CacheEntry>();

// Minimal Redis surface this module needs (a subset of RedisCommands).
type RevocationStore = { get(key: string): Promise<string | null> };

// Tests only — the cache is process-global.
export function clearSessionVersionCache() {
  cache.clear();
}

// Edge-triggered health flag for the Redis revocation lookup: log once on the
// way into the degraded state (Redis unreachable → we fall back to the identity
// lookup), never per request. Mirrors the rate-limiter's fallback logging.
let revocationRedisDegraded = false;

function noteRevocationRedisFailure(err: unknown): void {
  if (revocationRedisDegraded) return;
  revocationRedisDegraded = true;
  log.warn(
    "session-revocation Redis lookup failed; falling back to the identity-service check (revocations may fail open during an identity outage until Redis recovers — alert on this)",
    { err }
  );
}

function noteRevocationRedisRecovered(): void {
  if (!revocationRedisDegraded) return;
  revocationRedisDegraded = false;
  log.info("session-revocation Redis lookup recovered");
}

// Test-only: reset the edge-triggered health flag between cases.
export function resetRevocationRedisState(): void {
  revocationRedisDegraded = false;
}

// Consult the shared revocation list. Returns the published min-valid version,
// or undefined when there is no entry OR Redis is unavailable — both mean
// "defer to the identity-backed check below".
async function fetchRevocation(
  userId: string,
  redis: RevocationStore | null
): Promise<number | undefined> {
  if (!redis) return undefined;
  try {
    const raw = await redis.get(`${REVOCATION_KEY_PREFIX}${userId}`);
    noteRevocationRedisRecovered();
    if (raw === null) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  } catch (err) {
    noteRevocationRedisFailure(err);
    return undefined;
  }
}

// number = current version; null = user no longer exists; undefined = lookup
// unavailable (bad response shape counts too — fail open).
async function fetchVersion(userId: string): Promise<number | null | undefined> {
  const base = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
  try {
    const res = await fetch(
      `${base}/internal/users/${encodeURIComponent(userId)}/session-version`,
      {
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "dev-internal-secret",
        },
        signal: AbortSignal.timeout(2000),
      }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { v?: number | null };
    if (typeof data.v === "number") return data.v;
    if (data.v === null) return null;
    return undefined;
  } catch {
    return undefined;
  }
}

// True when the token's sv is still current. `redis` defaults to the shared
// gateway client and is injectable for tests. sv sits inside the signed JWT, so
// a token carrying a NEWER version than our cache proves the cache is stale —
// adopt the newer version instead of rejecting. This is what keeps a user
// signed in immediately after change-password mints their v+1 cookie while the
// old v is still cached.
export async function sessionVersionOk(
  userId: string,
  sv: number,
  redis: RevocationStore | null = getRedis()
): Promise<boolean> {
  // 1. Authoritative Redis revocation list first — survives an identity outage.
  //    A token below the published min-valid version is revoked, full stop; a
  //    token at/above it passes. We only run the fallback when there is NO entry
  //    (or Redis is down), handled below.
  const minValid = await fetchRevocation(userId, redis);
  if (minValid !== undefined) return sv >= minValid;

  // 2. No revocation entry (or Redis down): identity lookup + in-memory cache.
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.exp > now) {
    if (sv > hit.v) {
      cache.set(userId, { v: sv, exp: now + TTL_MS });
      return true;
    }
    return sv === hit.v;
  }

  const v = await fetchVersion(userId);
  if (v === undefined) return true; // fail open — availability over revocation
  if (v === null) return false; // user deleted — token is dead
  cache.set(userId, { v: Math.max(v, sv), exp: now + TTL_MS });
  return sv >= v;
}
