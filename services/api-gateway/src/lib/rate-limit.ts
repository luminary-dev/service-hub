import { randomUUID } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, Next } from "hono";
import { Redis } from "ioredis";
import { log } from "./log";

export type RateRule = { limit: number; windowMs: number };

// Per-route limits, keyed by client IP.
export const RATE_LIMITS = {
  authStrict: { limit: 8, windowMs: 15 * 60_000 }, // login / forgot / reset — anti brute-force
  authSignup: { limit: 10, windowMs: 60 * 60_000 }, // register
  resend: { limit: 4, windowMs: 15 * 60_000 }, // resend verification email
  inquiry: { limit: 6, windowMs: 10 * 60_000 }, // inquiry creation — anti-spam
  review: { limit: 10, windowMs: 60 * 60_000 }, // review submission
  message: { limit: 30, windowMs: 10 * 60_000 }, // thread messages - conversational
  // Phone-number reveal (#64): generous enough for a human browsing several
  // profiles, tight enough to blunt a crawler harvesting the whole directory.
  contactReveal: { limit: 20, windowMs: 10 * 60_000 },
  // Image uploads (#520): every upload POST runs a CPU-expensive sharp
  // re-encode, so throttle them. Shared budget wide enough for a provider
  // filling out a photo gallery in one sitting, tight enough to blunt an
  // attacker hammering the re-encode path.
  upload: { limit: 20, windowMs: 15 * 60_000 },
} as const;

// In-memory sliding-window store. This state is per-instance and resets on
// restart, so it is best-effort — enough to blunt naive brute-force and spam
// bursts. For strict, cross-instance limits back this with a shared store
// (the checkRateLimit interface is drop-in).
const hits = new Map<string, number[]>();
const MAX_RETENTION_MS = 60 * 60_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, times] of hits) {
    if (times.length === 0 || times[times.length - 1] < now - MAX_RETENTION_MS) {
      hits.delete(key);
    }
  }
}

export function checkRateLimit(key: string, rule: RateRule, now = Date.now()) {
  sweep(now);
  const windowStart = now - rule.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  const success = recent.length < rule.limit;
  if (success) recent.push(now);
  hits.set(key, recent);
  const retryAfterMs = success ? 0 : recent[0] + rule.windowMs - now;
  return {
    success,
    remaining: Math.max(0, rule.limit - recent.length),
    retryAfterMs,
  };
}

// How many trusted reverse-proxy hops sit in front of the gateway. The socket
// peer counts as the first hop, so 0 = trust nothing but the transport peer
// (the default — safe when the gateway is directly exposed or its topology is
// unknown). In production this is set to the real chain length (Caddy → web →
// gateway ⇒ 2) so the limiter reads the client IP the outermost trusted proxy
// inserted. See docs/RATE_LIMITING.md.
export function trustedProxyHops(env = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS;
  const n = raw === undefined ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Startup sanity check for TRUSTED_PROXY_HOPS (#374). Misconfiguring this is a
// silent footgun: behind the prod Caddy → web → gateway chain the value must be
// 2, but if it is unset/0 the limiter keys every request on the internal
// web-app IP — collapsing all users into ONE rate-limit bucket, so a single
// abuser can trip the shared limit and DoS the whole site. We only WARN (never
// crash): the topology can't be detected at runtime, and 0 is a legitimate
// value when the gateway is directly exposed. Call once at startup.
export function checkProxyConfig(env = process.env, logger = log): void {
  const raw = env.TRUSTED_PROXY_HOPS;

  // Set to something that silently coerces to 0 (NaN or negative) despite the
  // operator clearly not writing "0" — almost always a typo (e.g. "two", "-2").
  // "0" is a deliberate, valid value, so it drops to the production check below.
  if (raw !== undefined && raw.trim() !== "" && raw.trim() !== "0") {
    const parsed = Number.parseInt(raw, 10);
    if (!(Number.isFinite(parsed) && parsed > 0)) {
      logger.warn(
        `TRUSTED_PROXY_HOPS="${raw}" is not a valid positive integer; treating it as 0 ` +
          "(rate limits keyed on the socket peer). Behind the Caddy→web→gateway chain set it " +
          "to 2. See docs/RATE_LIMITING.md."
      );
      return;
    }
  }

  // In production the gateway sits behind Caddy → web (2 hops). Hops of 0 there
  // means the socket peer is the web app, so every client shares one bucket.
  if (env.NODE_ENV === "production" && trustedProxyHops(env) === 0) {
    logger.warn(
      "TRUSTED_PROXY_HOPS is unset or 0 in production: behind the Caddy→web→gateway chain this " +
        "keys every request on the internal web-app IP, collapsing all clients into a single " +
        "rate-limit bucket (one abuser can DoS the whole site). Set TRUSTED_PROXY_HOPS=2 to match " +
        "the deployed topology. See docs/RATE_LIMITING.md."
    );
  }
}

// Resolve the client IP to key rate limits on.
//
// The leftmost X-Forwarded-For token is always client-forgeable (#201): an
// attacker who rotates it lands every request in a fresh bucket and defeats the
// per-IP limits. So we never trust the left edge. Instead:
//   - hops === 0 (or no XFF): key on `socketPeer`, the transport-layer address
//     the client cannot forge.
//   - hops > 0: the chain in front of us has appended exactly `hops` entries
//     (one per trusted proxy), the last of which our socket peer added. Reading
//     from the RIGHT and skipping those trusted hops lands on the value the
//     OUTERMOST trusted proxy inserted — i.e. the real client — at index
//     `length - hops`. Anything the client prepended sits further left and is
//     ignored. A chain shorter than `hops` (index < 0) means the request did
//     not traverse the expected proxies, so we fall back to the socket peer
//     rather than trusting attacker-controlled data.
export function resolveClientIp(
  forwarded: string | undefined,
  hops: number,
  socketPeer: string | undefined
): string {
  if (hops > 0 && forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const idx = parts.length - hops;
    if (idx >= 0 && parts[idx]) return parts[idx];
  }
  return socketPeer || "unknown";
}

export function clientIp(c: Context): string {
  return resolveClientIp(
    c.req.header("x-forwarded-for"),
    trustedProxyHops(),
    socketPeer(c)
  );
}

// Transport-layer peer address. getConnInfo needs the Node server binding on
// the Hono context, which is absent under app.request() / non-node runtimes —
// guard so callers degrade to "unknown" instead of throwing.
function socketPeer(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Distributed backend (#117): when REDIS_URL is set the window lives in Redis
// (shared across gateway instances/restarts); otherwise the in-memory store
// above applies. Redis failures FALL BACK to the in-memory check — degraded
// per-instance limiting beats returning errors or no limiting at all.
// ---------------------------------------------------------------------------

// Minimal command surface so tests can inject a fake. `get` is used by the
// session-revocation check (session-version.ts, #374), which shares this same
// Redis connection rather than opening a second one.
export type RedisCommands = {
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zcard(key: string): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number, withScores: "WITHSCORES"): Promise<string[]>;
  pexpire(key: string, ms: number): Promise<number>;
  get(key: string): Promise<string | null>;
};

// Sliding window over a sorted set: drop expired hits, optimistically add
// this one, then count. Over the limit → remove our member again and report
// when the oldest hit leaves the window. The add-then-count order keeps
// concurrent requests from double-spending the last slot.
export async function checkRateLimitRedis(
  redis: RedisCommands,
  key: string,
  rule: RateRule,
  now = Date.now()
) {
  const windowStart = now - rule.windowMs;
  const member = `${now}:${randomUUID()}`;
  await redis.zremrangebyscore(key, 0, windowStart);
  await redis.zadd(key, now, member);
  const count = await redis.zcard(key);
  await redis.pexpire(key, rule.windowMs);

  if (count <= rule.limit) {
    return { success: true, remaining: rule.limit - count, retryAfterMs: 0 };
  }

  await redis.zrem(key, member);
  const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
  const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now;
  return {
    success: false,
    remaining: 0,
    retryAfterMs: Math.max(0, oldestScore + rule.windowMs - now),
  };
}

// Edge-triggered health flag for the shared Redis backend. A Redis failure
// silently falls back to per-instance limiting (see rateLimit below) which,
// across multiple gateway replicas, effectively multiplies every limit by the
// replica count — so ops must be able to see the degradation. We log only on
// the TRANSITION into/out of the degraded state, never per request: when Redis
// is down every request would otherwise flood the logs with the same line.
let redisDegraded = false;

// Called when a Redis rate-limit op throws and we fall back to in-memory. Logs
// once on the way into the degraded state; subsequent failures are silent.
// This warn is an intended ALERTING HOOK (#374): while degraded, limits are
// per-instance, so across N gateway replicas an attacker gets ~limit×N attempts
// — page on it.
function noteRedisFailure(err: unknown, key: string): void {
  if (redisDegraded) return;
  redisDegraded = true;
  log.warn(
    "rate-limit Redis backend unavailable; falling back to per-instance in-memory limiting (cross-instance limits degraded — alert on this)",
    { err, key }
  );
}

// Called after a successful Redis op; logs once when the backend recovers.
function noteRedisRecovered(): void {
  if (!redisDegraded) return;
  redisDegraded = false;
  log.info("rate-limit Redis backend recovered; resumed distributed limiting");
}

// Test-only: reset the edge-triggered health flag between cases.
export function resetRedisDegradedState(): void {
  redisDegraded = false;
}

// undefined = not initialized yet; null = no REDIS_URL configured.
let redisClient: RedisCommands | null | undefined;

// Shared Redis connection for the gateway. Exported so the session-revocation
// check (session-version.ts, #374) consults the same client instead of opening
// its own — one connection, one place to configure the fail-fast options.
export function getRedis(): RedisCommands | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  // Fail fast while disconnected (no offline queue) so a Redis outage drops
  // straight into the in-memory fallback instead of stalling requests.
  redisClient = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  return redisClient;
}

// Close the shared Redis connection during graceful shutdown. No-op when Redis
// was never initialized or no REDIS_URL is configured.
export async function closeRedis(): Promise<void> {
  const client = redisClient as unknown as
    | { quit(): Promise<unknown>; disconnect(): void }
    | null
    | undefined;
  redisClient = null;
  if (!client) return;
  try {
    await client.quit();
  } catch {
    // best-effort — force-disconnect if a graceful quit fails
    client.disconnect();
  }
}

// Run the limit check against Redis when available, otherwise the in-memory
// store. A Redis error falls back to the in-memory check (availability is
// intentionally preserved) and flips the edge-triggered degraded flag so the
// fallback is observable without logging on every request. Injecting `redis`
// keeps this unit-testable without a live connection.
export async function resolveRateLimit(
  redis: RedisCommands | null,
  key: string,
  rule: RateRule
): Promise<{ success: boolean; retryAfterMs: number }> {
  if (!redis) return checkRateLimit(key, rule);
  try {
    const result = await checkRateLimitRedis(redis, `rl:${key}`, rule);
    noteRedisRecovered();
    return result;
  } catch (err) {
    noteRedisFailure(err, key);
    return checkRateLimit(key, rule);
  }
}

// Returns a 429 response when the caller is over the limit, otherwise null.
export async function rateLimit(
  c: Context,
  name: string,
  rule: RateRule
): Promise<Response | null> {
  const key = `${name}:${clientIp(c)}`;
  const result = await resolveRateLimit(getRedis(), key, rule);
  if (result.success) return null;
  const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return c.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    429,
    { "Retry-After": String(retryAfter) }
  );
}

// The contract's rate-limit table. Rule names match the monolith's
// rateLimit(req, name, rule) calls exactly so keys stay identical.
export const LIMITED_ROUTES: { pattern: RegExp; name: string; rule: RateRule }[] = [
  { pattern: /^\/api\/auth\/login$/, name: "auth-login", rule: RATE_LIMITS.authStrict },
  { pattern: /^\/api\/auth\/forgot-password$/, name: "auth-forgot", rule: RATE_LIMITS.authStrict },
  { pattern: /^\/api\/auth\/reset-password$/, name: "auth-reset", rule: RATE_LIMITS.authStrict },
  // change-password and delete-account verify the current password, so each
  // is a guessing oracle for anyone holding a hijacked session — same budget
  // as login.
  { pattern: /^\/api\/auth\/change-password$/, name: "auth-change", rule: RATE_LIMITS.authStrict },
  { pattern: /^\/api\/auth\/delete-account$/, name: "auth-delete", rule: RATE_LIMITS.authStrict },
  { pattern: /^\/api\/auth\/register$/, name: "auth-register", rule: RATE_LIMITS.authSignup },
  { pattern: /^\/api\/auth\/resend-verification$/, name: "auth-resend", rule: RATE_LIMITS.resend },
  // Change-email (#505) sends a confirmation email to an attacker-CHOSEN
  // address on every call, so it sits on the same email-sending budget as
  // resend-verification.
  { pattern: /^\/api\/account\/email\/change$/, name: "account-email-change", rule: RATE_LIMITS.resend },
  { pattern: /^\/api\/jobs$/, name: "job-post", rule: RATE_LIMITS.inquiry },
  { pattern: /^\/api\/providers\/[^/]+\/inquiries$/, name: "inquiry", rule: RATE_LIMITS.inquiry },
  // Phone-number reveal (#64) — anti-scraping budget on the number-reveal POST.
  { pattern: /^\/api\/providers\/[^/]+\/contact$/, name: "contact-reveal", rule: RATE_LIMITS.contactReveal },
  { pattern: /^\/api\/jobs\/[^/]+\/responses$/, name: "job-response", rule: RATE_LIMITS.review },
  { pattern: /^\/api\/providers\/[^/]+\/reviews$/, name: "review", rule: RATE_LIMITS.review },
  // Provider responses to reviews (#395) — one-shot form, same budget as
  // review submission.
  { pattern: /^\/api\/reviews\/[^/]+\/response$/, name: "review-response", rule: RATE_LIMITS.review },
  // Thread messages (#13) are conversational - wider budget than one-shot forms.
  { pattern: /^\/api\/inquiries\/[^/]+\/messages$/, name: "message", rule: RATE_LIMITS.message },
  // Abuse reports (#50, #376) accept anonymous submissions (messages
  // excepted — thread-party only), so the IP budget is the main spam
  // control. One shared "report" bucket across the five target types, on the
  // review budget.
  { pattern: /^\/api\/providers\/[^/]+\/report$/, name: "report", rule: RATE_LIMITS.review },
  { pattern: /^\/api\/photos\/[^/]+\/report$/, name: "report", rule: RATE_LIMITS.review },
  { pattern: /^\/api\/reviews\/[^/]+\/report$/, name: "report", rule: RATE_LIMITS.review },
  { pattern: /^\/api\/jobs\/[^/]+\/report$/, name: "report", rule: RATE_LIMITS.review },
  { pattern: /^\/api\/messages\/[^/]+\/report$/, name: "report", rule: RATE_LIMITS.review },
  // Notification center (#394): mark-read fires at conversational frequency
  // (each bell-dropdown open marks a page read) → the message budget; the
  // preference upsert is a settings form → the review budget. The GETs (feed,
  // unread-count poll) stay unthrottled like every other read.
  { pattern: /^\/api\/notifications\/read$/, name: "notification-read", rule: RATE_LIMITS.message },
  { pattern: /^\/api\/notification-preferences$/, name: "notification-prefs", rule: RATE_LIMITS.review },
  // Image uploads (#520): each runs a CPU-expensive sharp re-encode, so they
  // share one per-IP "upload" bucket across the four upload POST endpoints.
  { pattern: /^\/api\/account\/avatar$/, name: "upload", rule: RATE_LIMITS.upload },
  { pattern: /^\/api\/provider\/photos$/, name: "upload", rule: RATE_LIMITS.upload },
  { pattern: /^\/api\/provider\/verification$/, name: "upload", rule: RATE_LIMITS.upload },
  { pattern: /^\/api\/admin\/categories\/image$/, name: "upload", rule: RATE_LIMITS.upload },
];

export async function rateLimitMiddleware(c: Context, next: Next) {
  if (c.req.method === "POST") {
    const pathname = new URL(c.req.url).pathname;
    for (const route of LIMITED_ROUTES) {
      if (route.pattern.test(pathname)) {
        const limited = await rateLimit(c, route.name, route.rule);
        if (limited) return limited;
        break;
      }
    }
  }
  await next();
}
