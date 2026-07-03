# Rate limiting

Per-IP rate limits protect the abuse-prone endpoints:

| Route | Limit |
| --- | --- |
| `POST /api/auth/login` | 8 / 15 min |
| `POST /api/auth/forgot-password` | 8 / 15 min |
| `POST /api/auth/reset-password` | 8 / 15 min |
| `POST /api/auth/register` | 10 / hour |
| `POST /api/auth/resend-verification` | 4 / 15 min |
| `POST /api/providers/[id]/inquiries` | 6 / 10 min |
| `POST /api/providers/[id]/reviews` | 10 / hour |

Over-limit requests get `429` with a `Retry-After` header. Client IP is taken
from `x-forwarded-for` (first hop) / `x-real-ip`. Limits live in
`RATE_LIMITS` in `src/lib/rate-limit.ts`.

## Backend

The default store is an **in-memory sliding window** (`src/lib/rate-limit.ts`).
It needs no setup and works immediately, but on serverless the state is
**per-instance** and resets on cold start — so it blunts naive brute-force and
spam bursts rather than enforcing a hard global limit.

## Upgrading to distributed limits (Upstash)

For strict, cross-instance limits, back the limiter with Upstash Redis (free
tier):

1. Create a Redis database at upstash.com.
2. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel.
3. `npm i @upstash/ratelimit @upstash/redis` and implement `checkRateLimit`
   with `Ratelimit.slidingWindow` when those env vars are present (the current
   function signature is drop-in — callers don't change).

Complementary hardening: account lockout after repeated failed logins (#20).
