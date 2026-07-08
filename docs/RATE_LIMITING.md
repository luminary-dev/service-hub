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

## Client IP resolution (`TRUSTED_PROXY_HOPS`, #201)

The limiter keys on the client IP. The **leftmost** `X-Forwarded-For` token is
always client-forgeable — an attacker who rotates it lands every request in a
fresh bucket and defeats the per-IP limits (unlimited login attempts, etc.). So
the gateway never trusts the left edge. Instead `clientIp()` (in
`services/api-gateway/src/lib/rate-limit.ts`) resolves the IP from the trusted
transport peer and a configurable number of trusted proxy hops:

- **`TRUSTED_PROXY_HOPS`** — integer, **default `0`**. The socket peer counts as
  the first trusted hop, so `0` means "trust nothing but the transport peer"
  (`getConnInfo`, which the client cannot forge). Use `0` when the gateway is
  directly exposed or its proxy topology is unknown — it is the safe default.
- When `> 0`, the reverse-proxy chain in front of the gateway has appended
  exactly that many `X-Forwarded-For` entries (one per trusted proxy, the last
  added by our own socket peer). The gateway reads `X-Forwarded-For` **from the
  right**, skipping those trusted hops, and takes the entry at
  `length - TRUSTED_PROXY_HOPS` — the value the **outermost trusted proxy**
  inserted, i.e. the real client. Anything the client prepended sits further
  left and is ignored.
- If `X-Forwarded-For` is absent, or the chain is shorter than
  `TRUSTED_PROXY_HOPS` (so the request did not traverse the expected proxies),
  the limiter falls back to the socket peer rather than trusting
  attacker-controlled data.

Set `TRUSTED_PROXY_HOPS` to match the deployed topology. In production the chain
is **Caddy → web → gateway**, so it is set to **`2`** (see
`docker-compose.prod.yml` / `.env.prod.example`). Getting this wrong is
fail-safe in one direction: too small a value keys on a proxy IP (all clients
share a bucket — over-limiting), never on a forgeable client value.

## Adding or changing a limit

- Add or tune a named rule in `RATE_LIMITS`.
- Map a route to it by adding an entry to `LIMITED_ROUTES` (a `pattern`
  RegExp, a `name`, and a `rule`).
- Keep rule names stable — they form part of the Redis/in-memory key, so
  renaming one resets the corresponding window.

Complementary hardening already in place: per-account lockout after repeated
failed logins (identity-service). See [ARCHITECTURE.md](ARCHITECTURE.md) for
the gateway's other responsibilities (CSRF, session verification, routing).
