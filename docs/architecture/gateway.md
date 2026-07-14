# API gateway (:4000) & endpoint routing


Public entry. Responsibilities:

1. **CSRF** (port of `src/lib/csrf.ts`): for non-GET/HEAD/OPTIONS, allow if
   `sec-fetch-site` ∈ {`same-origin`,`none`}; else compare `origin` host to
   `x-forwarded-host` ?? `host`. Reject → `403 { error: "Cross-site request
   blocked." }`.
2. **Rate limiting** (sliding window keyed by client IP from
   `x-forwarded-for`; the window lives in Redis when `REDIS_URL` is set — shared
   across instances, falling back to the per-instance in-memory store on Redis
   failure — otherwise in-memory):
   `POST /api/auth/login|forgot-password|reset-password|change-password|delete-account`
   → authStrict; `POST /api/auth/register` → authSignup;
   `POST /api/auth/resend-verification` → resend; `POST /api/jobs` and
   `POST /api/providers/:id/inquiries` → inquiry;
   `POST /api/providers/:id/contact` → contactReveal (phone-number reveal, #64);
   `POST /api/jobs/:id/responses`
   and `POST /api/providers/:id/reviews` → review;
   `POST /api/providers/:id/report`, `POST /api/photos/:id/report`,
   `POST /api/reviews/:id/report`, `POST /api/jobs/:id/report` and
   `POST /api/messages/:id/report` (#376) → report;
   `POST /api/notifications/read` → message (`notification-read` bucket, #394)
   and `POST /api/notification-preferences` → review (`notification-prefs`
   bucket); `GET /api/search/*` → search (the first rate-limited READ — the
   search endpoints are a query engine a scraper could walk, so they carry
   their own per-IP budget). 429 body/headers identical to the monolith
   (`Retry-After`).
3. **Session / identity headers** (`lib/proxy.ts#buildUpstreamHeaders`): strip
   any client-sent trusted headers first (`GATEWAY_HEADERS`: `x-user-id`,
   `x-user-role`, `x-user-name`, `x-impersonated-by`, `x-internal-secret`,
   `x-locale`, `x-origin`, `x-request-id`). Then:
   - A valid `impersonation_session` cookie takes **priority** over `sh_session`
     (admin "view as", #234): the gateway verifies it, checks `sv`, and forwards
     the *target* user's `x-user-id`/`x-user-role`/`x-user-name` plus
     `x-impersonated-by: <adminId>`. The admin's own `sh_session` is left
     untouched, so ending impersonation just drops the extra cookie.
   - Otherwise verify `sh_session`, check its `sv` against the user's current
     sessionVersion — a shared Redis revocation list first (authoritative,
     survives an identity outage, #374), falling back to the S2S identity
     lookup + 60s per-user cache (fail-open) only when Redis has no entry — and
     forward identity headers. Invalid/absent/revoked → forward without them
     (services decide 401s). See [AUTHZ.md](../AUTHZ.md#session-revocation-374).
   Always sets `x-internal-secret`, `x-locale`, `x-origin`, `x-request-id`.
4. **Routing** (`lib/routes.ts`, streaming proxy, preserves method/headers/body
   incl. multipart; passes `Set-Cookie` back). Longest-prefix first; anything
   containing `/internal` (raw or percent-encoded) is never forwarded → `404`.
   - `/api/files/{provider,review,category,user}/*` → media `/files/*`
   - `/api/account/inquiries` → provider; `/api/account/reviews` → review
   - `/api/account/profile`, `/api/account/avatar`,
     `/api/account/email/{change,confirm}` → identity
   - `/api/providers/:id/reviews` → review
   - `/api/admin/reviews/*`, `/api/admin/review-reports*`,
     `/api/admin/review-audit-log`, `/api/admin/review-stats` → review
   - `/api/reviews/*` → review
   - `/api/admin/users*`, `/api/admin/impersonate*`, `/api/admin/signups` →
     identity
   - `/api/admin/jobs*`, `/api/admin/job-reports*`,
     `/api/admin/job-audit-log` → job
   - all other `/api/admin/*` (providers, verifications, reports, photos,
     messages, categories, stats, `notifications/counts`, `audit-log`) →
     provider
   - `/api/notifications*`, `/api/notification-preferences` → notification
     (#394; placed after the `/api/admin/` fallback so the admin badge counts
     keep resolving to provider)
   - `/api/photos/:id/report` → provider (work-photo abuse reports)
   - `/api/messages/:id/report` → provider (inquiry-message abuse reports,
     #376)
   - `/api/auth/*`, `/api/favorites*` → identity
   - `/api/search/*` → search (provider search + geo discovery; the web
     listing queries it since RFC phase 3, while `/api/providers` browse
     deliberately stays at parity on provider-service until the cut-over has
     soaked — this table is the single cut-over point, search RFC §5.2)
   - `/api/providers*`, `/api/provider/*`, `/api/inquiries/*`,
     `/api/categories`, `/api/stats` → provider
   - `/api/jobs*` → job
   - anything else → `404 { error: "Not found" }`.

## Endpoint reference

The full, exhaustive endpoint list — every public `/api/*` route (method, auth/
role gate, params, request/response) and every internal `/internal/*` S2S route
— lives in **[API.md](../API.md)**, which is the canonical reference and is kept in
sync with the gateway routing table and the service handlers. This section only
summarizes which service owns which slice of the surface; consult API.md for the
routes themselves.

Public routes are reached through the gateway (browser hits same-origin
`/api/*`); `/internal/*` routes are S2S-only and never routed publicly. Ownership
by service:

- **identity-service (:4001)** — `/api/auth/*` (register/login/logout/session,
  email verification, password reset/change, self-service account deletion),
  `/api/favorites*`, and the admin user-management, impersonation ("view as") and
  signups-analytics routes. Signs the `sh_session` JWT; owns the S2S user
  hydration + session-version revocation check.
- **provider-service (:4002)** — the public directory/search (`/api/providers*`,
  `/api/categories`, `/api/stats`), provider profile pages, the provider
  dashboard (`/api/provider/*`), inquiries + threads (`/api/inquiries/*`,
  `/api/account/inquiries`), provider/photo/message abuse reports, and the bulk
  of the admin surface (providers, verifications, reports, message takedown,
  categories, auto-flagging, audit log, stats/notification counts).
- **review-service (:4003)** — public + write review routes
  (`/api/providers/:id/reviews`), `/api/account/reviews`, review photo delete,
  review abuse reports, and the admin review moderation queues
  (`/api/admin/review-*`).
- **job-service (:4004)** — `/api/jobs*` (post, board, mine, responses, status,
  abuse reports #376), the admin jobs oversight (incl. the hide/unhide takedown
  #376), and the job moderation queue + audit log (`/api/admin/job-reports*`,
  `/api/admin/job-audit-log`, #375). **Monetization (pricing, commission,
  payments) is intentionally deferred to v0.2** — v0.1 is free to use, so there
  is no transaction ledger and no price/commission field on a job (a JobRequest
  carries only an optional customer-stated `budget`).
- **notification-service (:4005)** — the notification center
  (`/api/notifications*` — feed, unread count, mark-read) and channel
  preferences (`/api/notification-preferences`), backed by `notification_db`
  (RFC stateful-notification-service); the generic S2S event ingestion
  (`/internal/notifications/events`, 202-ack fan-out to in-app rows + a
  Redis-backed email queue) and the en/si email templates
  (`/internal/email/*`); Resend when `RESEND_API_KEY` is set, else console log.
- **media-service (:4006)** — serves uploads at `GET /files/:namespace/*` (public
  through the gateway as `/api/files/<namespace>/*`) and the internal
  store/delete/sweep routes; bytes live in R2 (private) or on local disk.
- **chat-service (:4007)** — the streaming Claude marketplace assistant at
  `POST /internal/chat/:persona/stream`, reached only via the web app's
  `/agent/chat` proxy (never through the gateway, which would buffer the stream).
  Requires `ANTHROPIC_API_KEY` (unset → 503); model `claude-opus-4-8`. Its tools
  are read-only from the user's perspective: `search_providers` queries the
  public directory, and `propose_inquiry` only streams a draft to the browser —
  the actual inquiry write happens out-of-band when the user confirms the card
  in the web app (a normal authenticated `POST /api/providers/:id/inquiries`),
  never as a model-invoked action (#202).
- **search-service (:4008)** — the provider search & geo-discovery query plane
  (`/api/search/providers`, `/api/search/providers/nearby`): a derived PostGIS
  index over public provider card data, fed by S2S pushes from provider- and
  review-service and a daily reindex sweep (see the
  [search & discovery RFC](../rfcs/search-discovery-service.md)). Card DTOs are
  hydrated back from provider-service, so display data stays single-sourced.

