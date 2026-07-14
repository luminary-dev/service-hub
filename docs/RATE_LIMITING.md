# Rate limiting

Rate limiting lives in the **api-gateway** — the single public entry point in
front of the microservices (see [ARCHITECTURE.md](ARCHITECTURE.md)). The
gateway runs a per-IP sliding window over the abuse-prone endpoints and
returns `429` with a `Retry-After` header when a client is over budget. The
implementation is `services/api-gateway/src/lib/rate-limit.ts`.

## Limits

The named rules live in `RATE_LIMITS`; `LIMITED_ROUTES` maps **unsafe-method**
(`POST` / `PUT` / `PATCH` / `DELETE`) request paths to them and
`LIMITED_GET_ROUTES` maps the rate-limited reads (today just `/api/search/*` —
every other GET stays unthrottled). The middleware matches `LIMITED_ROUTES` on
**path only, not method** (#656): a rule guards *every* mutating verb on the
path, so a limiter rule can protect a `PUT`/`PATCH`/`DELETE` mutation and not
just a `POST`. GET keeps its own separate table, so no read can ever consume a
write bucket and vice versa.

| Route | Rule | Limit |
| --- | --- | --- |
| `POST /api/auth/login` | `authStrict` | 8 / 15 min |
| `POST /api/auth/forgot-password` | `authStrict` | 8 / 15 min |
| `POST /api/auth/reset-password` | `authStrict` | 8 / 15 min |
| `POST /api/auth/change-password` | `authStrict` | 8 / 15 min |
| `POST /api/auth/delete-account` | `authStrict` | 8 / 15 min |
| `POST /api/auth/register` | `authSignup` | 10 / hour |
| `POST /api/auth/resend-verification` | `resend` | 4 / 15 min |
| `POST /api/account/email/change` | `resend` | 4 / 15 min |
| `POST /api/jobs` | `inquiry` | 6 / 10 min |
| `POST /api/providers/[id]/inquiries` | `inquiry` | 6 / 10 min |
| `POST /api/providers/[id]/contact` | `contactReveal` | 20 / 10 min |
| `POST /api/jobs/[id]/responses` | `review` | 10 / hour |
| `POST /api/providers/[id]/reviews` | `review` | 10 / hour |
| `POST /api/reviews/[id]/response` | `review` | 10 / hour (own `review-response` bucket) |
| `POST /api/inquiries/[id]/messages` | `message` | 30 / 10 min |
| `POST /api/notifications/read` | `message` | 30 / 10 min (own `notification-read` bucket) |
| `POST /api/notification-preferences` | `review` | 10 / hour (own `notification-prefs` bucket) |
| `POST /api/providers/[id]/report`, `POST /api/photos/[id]/report`, `POST /api/reviews/[id]/report`, `POST /api/jobs/[id]/report`, `POST /api/messages/[id]/report` | `review` | 10 / hour (shared `report` bucket) |
| `POST /api/account/avatar`, `POST /api/provider/photos`, `POST /api/provider/verification`, `POST /api/admin/categories/image` | `upload` | 20 / 15 min (shared `upload` bucket) |
| `PUT /api/provider/profile` | `profile` | 20 / 15 min (`provider-profile` bucket) |
| `PUT /api/account/profile` | `profile` | 20 / 15 min (`account-profile` bucket) |
| `PATCH /api/provider/inquiries/:id` | `message` | 30 / 10 min (`inquiry-update` bucket) |
| `GET /api/search/*` | `search` | 60 / min (the only GET budget) |

`change-password` and `delete-account` sit on the strict login budget because
each verifies the current password and is therefore a guessing oracle for a
hijacked session. The five abuse-report endpoints (#50, #376) share a single
`report` bucket keyed per IP, since (message reports excepted) anonymous
submissions are allowed and the IP budget is the main spam control. The phone-number reveal (`contactReveal`, #64) sits
on its own per-IP budget: provider phone/WhatsApp numbers are withheld from the
public directory payloads and fetched only on an explicit tap, so this limit is
the main defence against a crawler harvesting the whole directory's numbers.
Change-email (`resend`, #505) reuses the email-sending budget because it fires a
confirmation email to an attacker-*chosen* address on every call, so an
unthrottled endpoint is a mail-bomb vector. The four image-upload endpoints
share one `upload` bucket (#520): each runs a CPU-expensive `sharp` re-encode,
so the budget is wide enough for a provider filling out a photo gallery in one
sitting yet tight enough to blunt an attacker hammering the re-encode path.
The notification-center writes (#394) reuse existing budgets: mark-read fires
at conversational frequency (each bell open marks a page read) so it sits on
the `message` rule, and the preference upsert is a settings form on the
`review` rule; the notification GETs (feed, unread-count poll) stay
unthrottled like every other read — the client controls polling frequency.
The `/api/search/*` reads (search & discovery RFC §5) are the one exception to
"reads are unthrottled": the search endpoints are a query engine a scraper
could walk the whole directory through, so they carry their own per-IP
`search` budget — generous enough for a human paging and refining filters
(each results page is one GET), tight enough to blunt a crawler.
The profile-edit and inquiry-status mutations (#656) were previously
**unthrottled** because the middleware only ran for `POST`/`GET` — every
`PUT`/`PATCH`/`DELETE` slipped past the limiter. They now share the
unsafe-method table: a provider profile save (`PUT`) fans out a search reindex
and re-runs bio moderation, and the account profile save (`PUT`) is an identity
write, so both sit on a `profile` budget (20 / 15 min) wide enough for a
provider iterating on their bio / service area / map pin in one sitting yet
tight enough to blunt an attacker hammering the moderation+reindex path — each
in its own per-IP bucket. The inquiry-status update (`PATCH`) can fire a
notification email to the customer on a status change, so it sits on the
conversational `message` budget (30 / 10 min): a provider triaging their inbox
legitimately updates many inquiries in one sitting.
Job posting is additionally capped **per account** inside job-service (#556):
each post fans out to up to 200 provider inboxes, and the per-IP rule alone is
rotatable — so job-service requires a verified email (403 otherwise) and allows
at most **10 posts per account per rolling 24 h** (429 beyond that), checked
against the jobs table before the write.

Several other endpoints carry a **per-user resource cap** to bound how much a
single account can accumulate (independent of request rate):

| Resource | Cap per user | Over-limit |
| --- | --- | --- |
| Saved searches (identity, #516) | 20 | 429 |
| Favorites (identity, #647) | 100 (new favorites only; re-favoriting is idempotent) | 429 |
| Job posts / rolling 24 h (job, #556) | 10 | 429 |
| Review photos / review (review) | 3 | 400 |
| Work-gallery photos / provider (provider, #647) | 30 (soft-deleted don't count) | 400 |

These are all **check-then-act** ("count the caller's rows, then insert"), which
a concurrent double-submit could otherwise race into a small overshoot. Each is
made race-safe (#647 L5): the count/dup check and the insert run in one
interactive transaction that first takes a **transaction-scoped Postgres
advisory lock** keyed by `(feature, userId)` (`pg_advisory_xact_lock`, see each
service's `src/lib/locks.ts`), so concurrent submits for the same user
serialize — a plain transaction alone wouldn't (under READ COMMITTED neither
sees the other's uncommitted rows). For the photo caps, the batch is validated
and stored first; if the in-transaction re-check finds the cap raced, the write
rolls back and the just-stored files are cleaned up.

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

The fallback is **observable**, and the transition `warn` is an intended
**alerting hook** (#374): the gateway emits a single `warn` log on the
*transition* into the degraded state (`rate-limit Redis backend unavailable …
alert on this`, with the error and key context) and an `info` log when Redis
recovers. Logging is edge-triggered — one line per state change, never one per
request — so a Redis outage does not flood the logs. **Page on this warning:**
while degraded, limits are per-instance, so with N gateway replicas an attacker
can effectively make `limit × N` attempts before being blocked (the per-account
lockout in identity-service is the real backstop in that window).

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

### Startup misconfiguration check (#374)

Because an unset/`0` value behind the prod proxy chain silently collapses every
client into one bucket (a single abuser can then trip the shared limit and DoS
the whole site), the gateway runs a startup sanity check (`checkProxyConfig`,
called from `src/index.ts`) that **warns** — it never crashes, since the
topology can't be detected at runtime and `0` is legitimate for a directly
exposed gateway. It logs a `warn` when:

- `NODE_ENV=production` and `TRUSTED_PROXY_HOPS` is unset or `0` (behind
  Caddy→web this should be `2`), or
- the value is set but not a valid non-negative integer (e.g. a stray space or
  typo), which `trustedProxyHops()` would otherwise silently coerce to `0`.

Watch for this warning on boot after a config change.

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
- **Why honeypot over CAPTCHA for the inquiry form.** A CAPTCHA (e.g. Cloudflare
  Turnstile) needs an external provider, a site key, and a server-side secret — a
  separate infrastructure/privacy decision, and the repo is public with runtime
  secrets kept out of the tree. For the anonymous inquiry form the honeypot is
  zero-dependency, zero-config, and has no false positives for real users, so it
  stays the first line there. Turnstile is layered **on top of** (not replacing)
  the honeypot and the per-IP limit where it earns its keep.

## Bot protection on registration (Cloudflare Turnstile, #633)

Registration auto-logs-in a new signup, so its response still differs from the
one a taken email gets — a residual enumeration oracle the per-IP `authSignup`
limit (10/hr) only *slows*. `POST /api/auth/register` is therefore gated behind
**Cloudflare Turnstile**, an actual bot barrier the throttle can't be.

- **Server-side + authoritative.** When `TURNSTILE_SECRET_KEY` is set,
  `identity-service` verifies the widget token via Cloudflare's siteverify
  (`identity-service/src/lib/turnstile.ts`) before any account work — a
  missing/invalid token is a `400`, a siteverify outage a retryable `503` (fail
  closed). The web signup forms render the widget only when
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set and include the token in the request.
- **Optional and graceful.** With the keys unset (dev/local, or a deploy before
  keys are provisioned) verification is skipped and registration behaves exactly
  as before — so it ships safely ahead of key provisioning. See
  [`../SECURITY.md`](../SECURITY.md) for the env vars and [`AUTHZ.md`](AUTHZ.md)
  for the enumeration model. Login/forgot-password (already uniform-response)
  could get the same widget later if abuse warrants it.
- **Timing trap — deliberately skipped.** Rejecting implausibly fast
  submissions was considered but not implemented: the only stateless signal is a
  client-supplied render timestamp, which is both trivially forgeable and prone
  to **false positives from client/server clock skew** (a 1–2 s skew could
  reject a genuine submission). A robust version needs a server-signed token
  (extra state/complexity), so it is deferred alongside CAPTCHA rather than
  shipped as a weak, false-positive-prone control.

## Adding or changing a limit

- Add or tune a named rule in `RATE_LIMITS`.
- Map a route to it by adding an entry to `LIMITED_ROUTES` (any unsafe method —
  `POST`/`PUT`/`PATCH`/`DELETE`, matched on path) or `LIMITED_GET_ROUTES`
  (reads) — a `pattern` RegExp, a `name`, and a `rule`.
- Keep rule names stable — they form part of the Redis/in-memory key, so
  renaming one resets the corresponding window.

Complementary hardening already in place: per-account lockout after repeated
failed logins (identity-service). See [ARCHITECTURE.md](ARCHITECTURE.md) for
the gateway's other responsibilities (CSRF, session verification, routing).
