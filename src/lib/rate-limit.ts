import { NextRequest, NextResponse } from "next/server";

export type RateRule = { limit: number; windowMs: number };

// Per-route limits, keyed by client IP.
export const RATE_LIMITS = {
  authStrict: { limit: 8, windowMs: 15 * 60_000 }, // login / forgot / reset — anti brute-force
  authSignup: { limit: 10, windowMs: 60 * 60_000 }, // register
  resend: { limit: 4, windowMs: 15 * 60_000 }, // resend verification email
  inquiry: { limit: 6, windowMs: 10 * 60_000 }, // inquiry creation — anti-spam
  review: { limit: 10, windowMs: 60 * 60_000 }, // review submission
} as const;

// In-memory sliding-window store. NOTE: on serverless this state is per-instance
// and resets on cold start, so it is best-effort — enough to blunt naive
// brute-force and spam bursts. For strict, cross-instance limits, set
// UPSTASH_REDIS_REST_URL/TOKEN and back this with @upstash/ratelimit (the
// checkRateLimit interface is drop-in). See docs/RATE_LIMITING.md.
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

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Returns a 429 response when the caller is over the limit, otherwise null.
export function rateLimit(
  req: NextRequest,
  name: string,
  rule: RateRule
): NextResponse | null {
  const { success, retryAfterMs } = checkRateLimit(
    `${name}:${clientIp(req)}`,
    rule
  );
  if (success) return null;
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
