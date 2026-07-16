// Session revocation check for the web app's page gating — a port of the
// gateway's src/lib/session-version.ts so UI gating and data access agree on
// whether a token is still valid. identity-service bumps User.sessionVersion on
// password change/reset and logout-everywhere; tokens carry the version they
// were minted with (sv claim). A token minted before the current version is
// stale (e.g. an admin whose role changed, or a logged-out-everywhere session).
//
// The lookup is cached briefly so it costs one call per user per TTL window,
// and it FAILS OPEN: if identity-service is unreachable, sessions keep working —
// an identity outage must not sign every user out of the UI.
import "server-only";
import { INTERNAL_API_SECRET } from "./internal-secret";

const TTL_MS = 60_000;

type CacheEntry = { v: number; exp: number };
const cache = new Map<string, CacheEntry>();
let lastSweep = 0;

// Evict expired entries so the map can't grow one permanent entry per distinct
// user over the process lifetime (#377). Throttled to at most once per TTL so
// a burst of requests doesn't rescan the whole map on every check (mirrors the
// chat rate limiter's sweep()).
function sweep(now: number) {
  if (now - lastSweep < TTL_MS) return;
  lastSweep = now;
  for (const [userId, entry] of cache) {
    if (entry.exp <= now) cache.delete(userId);
  }
}

const IDENTITY_SERVICE_URL =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";

// number = current version; null = user no longer exists; undefined = lookup
// unavailable (bad response shape counts too — fail open).
async function fetchVersion(
  userId: string
): Promise<number | null | undefined> {
  try {
    const res = await fetch(
      `${IDENTITY_SERVICE_URL}/internal/users/${encodeURIComponent(
        userId
      )}/session-version`,
      {
        headers: { "x-internal-secret": INTERNAL_API_SECRET },
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
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

// True when the token's sv is still current. A token carrying a NEWER version
// than our cache proves the cache is stale — adopt the newer version instead of
// rejecting (keeps a user signed in immediately after change-password mints
// their v+1 cookie while the old v is still cached).
export async function sessionVersionOk(
  userId: string,
  sv: number
): Promise<boolean> {
  const now = Date.now();
  sweep(now);
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

// Test-only: number of users currently cached.
export function cachedUserCount(): number {
  return cache.size;
}
