# Rate limiting

Rate limiting lives in the **api-gateway** — the single public entry point in
front of the microservices (see [ARCHITECTURE.md](ARCHITECTURE.md)). The
gateway runs a per-IP sliding window over the abuse-prone POST endpoints and
returns `429` with a `Retry-After` header when a client is over budget. The
implementation is `services/api-gateway/src/lib/rate-limit.ts`.

## Limits

The named rules live in `RATE_LIMITS`; `LIMITED_ROUTES` maps request paths to
them. Only `POST` requests are checked.

| Route | Rule | Limit |
| --- | --- | --- |
| `POST /api/auth/login` | `authStrict` | 8 / 15 min |
| `POST /api/auth/forgot-password` | `authStrict` | 8 / 15 min |
| `POST /api/auth/reset-password` | `authStrict` | 8 / 15 min |
| `POST /api/auth/change-password` | `authStrict` | 8 / 15 min |
| `POST /api/auth/delete-account` | `authStrict` | 8 / 15 min |
| `POST /api/auth/register` | `authSignup` | 10 / hour |
| `POST /api/auth/resend-verification` | `resend` | 4 / 15 min |
| `POST /api/jobs` | `inquiry` | 6 / 10 min |
| `POST /api/providers/[id]/inquiries` | `inquiry` | 6 / 10 min |
| `POST /api/jobs/[id]/responses` | `review` | 10 / hour |
| `POST /api/providers/[id]/reviews` | `review` | 10 / hour |
| `POST /api/inquiries/[id]/messages` | `message` | 30 / 10 min |
| `POST /api/providers/[id]/report`, `POST /api/photos/[id]/report`, `POST /api/reviews/[id]/report` | `review` | 10 / hour (shared `report` bucket) |

`change-password` and `delete-account` sit on the strict login budget because
each verifies the current password and is therefore a guessing oracle for a
hijacked session. The three abuse-report endpoints share a single `report`
bucket keyed per IP, since anonymous submissions are allowed and the IP budget
is the main spam control.

Over-limit requests get `429` with a JSON body
(`{ "error": "Too many requests. Please slow down and try again shortly." }`)
and a `Retry-After` header (seconds until the oldest hit leaves the window).

## Backend

Each request builds a key of `<rule-name>:<clientIp>` and checks it against a
sliding window. There are two interchangeable stores; `rateLimit()` picks one
at request time:

- **Redis (distributed)** — used when `REDIS_URL` is set. The window is a Redis
  sorted set (`checkRateLimitRedis`): expired hits are trimmed with
  `ZREMRANGEBYSCORE`, the current hit is added, then `ZCARD` counts the window
  and `PEXPIRE` bounds the key's lifetime. The add-then-count order keeps
  concurrent requests from double-spending the last slot. Because the state
  lives in Redis, the limit is **shared across every gateway instance and
  survives restarts** — this is what you want when running more than one
  gateway.
- **In-memory (per-instance fallback)** — used when `REDIS_URL` is unset. A
  `Map` of timestamps per key (`checkRateLimit`), swept periodically. This
  state is per-process and resets on restart, so it is best-effort: enough to
  blunt naive brute-force and spam bursts, but not a hard global limit across
  instances.

If a Redis call throws (outage, connection drop), the limiter **falls back to
the in-memory check** rather than failing the request — degraded per-instance
limiting beats returning errors or dropping the protection entirely. The Redis
client is created with `maxRetriesPerRequest: 1` and `enableOfflineQueue: false`
so an outage drops straight into the fallback instead of stalling requests.

`REDIS_URL` is a plain Redis connection string (e.g. `redis://redis:6379`),
consumed via `ioredis`. There is no Upstash/Vercel dependency — the stack
deploys as Docker containers behind Caddy (see [DEPLOYMENT.md](DEPLOYMENT.md)),
and Redis is just another service reached by URL.

## Client IP caveat (#201)

The limiter keys on the client IP taken from `x-forwarded-for` (first hop),
falling back to `x-real-ip`. Behind the production Caddy → web → gateway chain,
`X-Forwarded-For` is currently **forgeable** by the client, which means a
determined attacker could rotate the header to sidestep per-IP limits. The fix
is tracked in **#201**: set `TRUSTED_PROXY_HOPS` on the gateway so it reads the
real client IP from the correct position in the forwarded chain. This must land
before a public launch for the brute-force protection to be trustworthy.

## Adding or changing a limit

- Add or tune a named rule in `RATE_LIMITS`.
- Map a route to it by adding an entry to `LIMITED_ROUTES` (a `pattern`
  RegExp, a `name`, and a `rule`).
- Keep rule names stable — they form part of the Redis/in-memory key, so
  renaming one resets the corresponding window.

Complementary hardening already in place: per-account lockout after repeated
failed logins (identity-service). See [ARCHITECTURE.md](ARCHITECTURE.md) for
the gateway's other responsibilities (CSRF, session verification, routing).
