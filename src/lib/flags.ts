// Server-side feature-flag evaluation (#675). Lets dark-launches and rollouts
// (routing to trust-safety, gating Tamil, gradual search-ranking, …) be flipped
// at RUNTIME from the self-hosted Unleash admin UI instead of being hardcoded
// conditionals that need a redeploy.
//
// Evaluation is SERVER-ONLY and goes through Unleash's Frontend API
// (GET {UNLEASH_URL}/frontend), which evaluates strategies (on/off, gradual
// rollout, constraints) inside the Unleash server and returns only the toggles
// that are ENABLED for the supplied context. We deliberately do NOT ship the
// browser/React SDK: flags are read in server components and never leak the
// token or the full flag set to the client.
//
// THE GRACEFUL-DEFAULT CONTRACT (read before you gate anything on a flag):
//   - When UNLEASH_URL or UNLEASH_FRONTEND_TOKEN is UNSET (dev, local, CI, and
//     prod before the flag service is provisioned), this helper is a pure
//     NO-OP: it never touches the network and returns the caller's `fallback`.
//     So the app behaves EXACTLY as today until Unleash is wired up.
//   - When the service is wired but unreachable / slow / returns garbage, we
//     still return `fallback` (bounded fetch, single attempt, no throw). A flag
//     lookup must never block a render or 500 a page.
//   - When the service IS reachable, a flag is "on" iff it exists AND is enabled
//     in the environment its token targets. The Frontend API only returns
//     enabled toggles, so a flag you have NOT created in Unleash reads as OFF.
//     => Always create + enable your flags in Unleash BEFORE setting
//        UNLEASH_FRONTEND_TOKEN in prod; the token is the activation switch.
//   - `fallback` MUST equal today's behavior for the conditional you're gating,
//     so that the unset/unreachable path is indistinguishable from the flag
//     being on (or off) exactly as it is now.
//
// See docs/OPERATIONS.md → "Feature flags" for how to define a flag and reach
// the (loopback-only) admin UI.
import "server-only";

// Bound every lookup so a slow/hung Unleash can't stall an SSR render.
const TIMEOUT_MS = 1500;
// Cache the evaluated toggle set briefly so a burst of server renders costs at
// most one call per context per window (mirrors the session-version cache).
const CACHE_TTL_MS = 30_000;
// Soft cap so distinct contexts (e.g. per-user gradual rollout) can't grow the
// cache unbounded over the process lifetime.
const CACHE_MAX_ENTRIES = 500;

// Evaluation context for strategy targeting (gradual rollout stickiness,
// per-user/constraint flags). Omit it for global on/off flags.
export type FlagContext = {
  userId?: string;
  sessionId?: string;
  properties?: Record<string, string>;
};

type CacheEntry = { at: number; enabled: Set<string> };
const cache = new Map<string, CacheEntry>();

// Read env at call time (not module load) so the process picks up config
// without a rebuild and so tests can stub it per-case.
function config(): { url: string; token: string } | null {
  const url = process.env.UNLEASH_URL;
  const token = process.env.UNLEASH_FRONTEND_TOKEN;
  if (!url || !token) return null; // unset → graceful no-op
  return { url: url.replace(/\/$/, ""), token };
}

function contextQuery(ctx?: FlagContext): string {
  const params = new URLSearchParams();
  if (ctx?.userId) params.set("userId", ctx.userId);
  if (ctx?.sessionId) params.set("sessionId", ctx.sessionId);
  for (const [k, v] of Object.entries(ctx?.properties ?? {})) {
    params.set(`properties[${k}]`, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Fetch the set of ENABLED toggle names for a context. Throws on any failure so
// the caller can fall back; never returns a partial/guessed result.
async function fetchEnabled(
  cfg: { url: string; token: string },
  ctx?: FlagContext
): Promise<Set<string>> {
  const res = await fetch(`${cfg.url}/frontend${contextQuery(ctx)}`, {
    headers: { Authorization: cfg.token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`unleash frontend api ${res.status}`);
  const data = (await res.json()) as {
    toggles?: { name?: string; enabled?: boolean }[];
  };
  const enabled = new Set<string>();
  for (const t of data.toggles ?? []) {
    // The Frontend API returns only enabled toggles, but guard the shape.
    if (t?.name && t.enabled !== false) enabled.add(t.name);
  }
  return enabled;
}

async function enabledSet(
  cfg: { url: string; token: string },
  ctx?: FlagContext
): Promise<Set<string>> {
  const key = contextQuery(ctx);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.enabled;

  const enabled = await fetchEnabled(cfg, ctx);
  // Drop the oldest entry if the cache is at its soft cap (cheap bound; the
  // common case is a single global-context entry).
  if (cache.size >= CACHE_MAX_ENTRIES && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: now, enabled });
  return enabled;
}

/**
 * Is `name` enabled? Returns `fallback` when the flag service is unconfigured
 * or unreachable (see the graceful-default contract above). `fallback` must
 * equal today's behavior for the conditional being gated.
 */
export async function isFlagEnabled(
  name: string,
  fallback: boolean,
  ctx?: FlagContext
): Promise<boolean> {
  const cfg = config();
  if (!cfg) return fallback; // unset → no-op, no network
  try {
    return (await enabledSet(cfg, ctx)).has(name);
  } catch {
    return fallback; // unreachable/slow/bad-shape → degrade to today's behavior
  }
}

// Test-only: reset the in-memory cache between cases.
export function __resetFlagCache(): void {
  cache.clear();
}
