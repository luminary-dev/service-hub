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
| `POST /api/providers/[id]/contact` | `contactReveal` | 20 / 10 min |
| `POST /api/jobs/[id]/responses` | `review` | 10 / hour |
| `POST /api/providers/[id]/reviews` | `review` | 10 / hour |
| `POST /api/inquiries/[id]/messages` | `message` | 30 / 10 min |
| `POST /api/providers/[id]/report`, `POST /api/photos/[id]/report`, `POST /api/reviews/[id]/report` | `review` | 10 / hour (shared `report` bucket) |

`change-password` and `delete-account` sit on the strict login budget because
each verifies the current password and is therefore a guessing oracle for a
hijacked session. The three abuse-report endpoints share a single `report`
bucket keyed per IP, since anonymous submissions are allowed and the IP budget
is the main spam control. The phone-number reveal (`contactReveal`, #64) sits
on its own per-IP budget: provider phone/WhatsApp numbers are withheld from the
public directory payloads and fetched only on an explicit tap, so this limit is
the main defence against a crawler harvesting the whole directory's numbers.

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

The fallback is **observable**: the gateway emits a single `warn` log on the
*transition* into the degraded state (`rate-limit Redis backend unavailable …`,
with the error and key context) and an `info` log when Redis recovers. Logging
is edge-triggered — one line per state change, never one per request — so a
Redis outage does not flood the logs. Watch for this warning in operations:
while degraded, limits are per-instance, so with N gateway replicas an attacker
can effectively make `limit × N` attempts before being blocked.

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

## Bot protection on the public inquiry form (honeypot, #65)

The per-IP `inquiry` limit above caps *how fast* a client can post, but the
inquiry-create endpoint (`POST /api/providers/[id]/inquiries`) accepts
anonymous submissions, so a script could still spam every provider one slow
request at a time. It carries a **honeypot** as a complementary, per-request
bot filter — deliberately **not** a third-party CAPTCHA (see below).

- **How it works.** The web `InquiryForm` renders a decoy `company` text input
  that is hidden and inert for real users: moved off-screen (not `display:none`,
  which some bots skip), wrapped in `aria-hidden` so screen readers ignore it,
  `tabindex="-1"` so keyboard users never reach it, and `autocomplete="off"` so
  browsers never prefill it. It is uncontrolled and read straight off the DOM at
  submit, so a bot that writes the value without firing React events is still
  caught. Humans leave it blank; bots that fill every field populate it.
- **The check is server-side and authoritative.** `provider-service` validates
  the `company` field on the create route. A non-empty value is treated as a
  bot: the request gets the **same success-shaped `200` as a real submission**
  (a silent drop) so a scripted caller has no signal that it was filtered and
  nothing to adapt to — but **no inquiry is persisted and no provider email is
  sent**. An empty/absent field is a normal submission (other clients, e.g. the
  chat agent, simply omit it). The client control only carries the value; the
  gate lives in the service.
- **Why honeypot over CAPTCHA for v0.1.** A CAPTCHA (e.g. Cloudflare Turnstile)
  needs an external provider, a site key, and a server-side secret — a separate
  infrastructure/privacy decision, and the repo is public with runtime secrets
  kept out of the tree. The honeypot is zero-dependency, zero-config, and has no
  false positives for real users, so it is the right first line for v0.1.
  Turnstile remains a future option if abuse escalates, layered on top of (not
  replacing) the honeypot and the per-IP limit.
- **Timing trap — deliberately skipped.** Rejecting implausibly fast
  submissions was considered but not implemented: the only stateless signal is a
  client-supplied render timestamp, which is both trivially forgeable and prone
  to **false positives from client/server clock skew** (a 1–2 s skew could
  reject a genuine submission). A robust version needs a server-signed token
  (extra state/complexity), so it is deferred alongside CAPTCHA rather than
  shipped as a weak, false-positive-prone control.

## Adding or changing a limit

- Add or tune a named rule in `RATE_LIMITS`.
- Map a route to it by adding an entry to `LIMITED_ROUTES` (a `pattern`
  RegExp, a `name`, and a `rule`).
- Keep rule names stable — they form part of the Redis/in-memory key, so
  renaming one resets the corresponding window.

Complementary hardening already in place: per-account lockout after repeated
failed logins (identity-service). See [ARCHITECTURE.md](ARCHITECTURE.md) for
the gateway's other responsibilities (CSRF, session verification, routing).
