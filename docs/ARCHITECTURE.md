# Service Hub — Microservice Architecture

Service Hub (Baas.lk) is split into **eight backend services** plus an API
gateway, with the Next.js 16 app as a pure frontend. This repo is the
**canonical monorepo**; each service under `services/` is also mirrored to its
own repository in the `luminary-dev` org via `git subtree` (see
`scripts/sync-service-repos.sh`).

```
browser ── same-origin /api/* ──> Next.js web (:3000)
   │                               │  proxy.ts rewrites /api/* ──> api-gateway (:4000)
   │                               ^  server components fetch the gateway directly
   │  /agent/chat ──────────────────────────────> chat-service (:4007)  (direct, NOT via gateway)
   │
   gateway (only public entry) verifies sh_session JWT, forwards identity
   headers (x-user-id / x-user-role / x-user-name) + x-internal-secret and routes to:
     ├── identity-service     (:4001)  identity_db   User/auth/favorites/admin-users/impersonation
     ├── provider-service     (:4002)  provider_db   providers/categories/inquiries/reports/admin
     ├── review-service       (:4003)  review_db     reviews/review-reports/admin
     ├── job-service          (:4004)  job_db        jobs/responses/admin
     ├── notification-service (:4005)  (no db)        email templates (internal-only)
     ├── media-service        (:4006)  (no db)        upload bytes + sharp; serves /files/*
     └── chat-service         (:4007)  (no db)        streaming Claude assistant
```

Infra: one **Postgres 16** cluster (host port 5433 → container 5432) holding
four databases (`identity_db`, `provider_db`, `review_db`, `job_db`), and
**Redis 7** (gateway rate-limit window). Each service owns its database — no
service touches another's tables; cross-service data access goes through
internal HTTP endpoints. notification/media/chat are stateless (no DB).

The gateway never routes to notification-service (internal-only) or
chat-service (the web app proxies `/agent/chat` straight to it — the gateway
buffers, and a direct stream does not). Its `ServiceName` union is
`identity | provider | review | job | media`.

## Shared conventions (all services)

- **Stack**: TypeScript (CommonJS, `module: NodeNext`), Hono ^4 +
  `@hono/node-server`, Prisma 7 + `@prisma/adapter-pg`, zod, vitest. Layout:
  `src/index.ts` (serve, reads `PORT`), `src/app.ts` (exports the Hono app for
  tests), `src/db.ts`, `src/routes/*.ts`, `src/lib/*.ts`,
  `prisma/schema.prisma`, `prisma/seed.js`, `prisma.config.ts`, `Dockerfile`,
  `.env.example`, `README.md`. Scripts: `dev` (tsx watch), `build`, `start`,
  `start:migrate` (`prisma migrate deploy && node dist/index.js`), `typecheck`,
  `test`, `db:migrate`, `db:migrate:dev`, `db:push`, `db:seed`, `postinstall`
  (prisma generate). Schema changes ship as committed migrations under
  `prisma/migrations/` (baseline `0_init`); dev DBs created before the baseline
  run `scripts/baseline-migrations.sh` once. Reference scaffold:
  `services/identity-service/`.
- **Logging**: structured JSON on stdout, one line per event —
  `{ level, time, service, msg, ...fields }` via the canonical
  `src/lib/logging.ts` (identical copy in every service incl. the gateway; each
  service instantiates it in `src/lib/log.ts`). The request middleware logs one
  line per request (`requestId`, `method`, `path`, `status`, `durationMs`);
  `/healthz` polling is never logged. The gateway generates `x-request-id`
  (client-sent values are stripped — it's on the trusted `GATEWAY_HEADERS`
  list) and propagates it upstream so one id follows a request across services.
  Errors go through `log.error(msg, { context, err })` — no bare
  `console.error`.
- **Error shape**: `{ "error": string }`. Success shapes match the monolith.
- **Health**: `GET /healthz`. The **four DB services** (identity, provider,
  review, job) run it as a **readiness probe** — `SELECT 1` raced against a 2s
  timeout, returning `503 { ok: false, service, db: "down" }` if Postgres is
  unreachable so the orchestrator can depool the instance; success is
  `200 { ok: true, service }`. gateway, chat, notification and media return the
  static `200 { ok: true, service }`. Used by compose healthchecks and the E2E
  script.
- **Internal auth**: every request from the gateway or another service carries
  `x-internal-secret: $INTERNAL_API_SECRET`. A middleware
  (`requireInternalSecret`) rejects any request without the correct secret with
  `403 { error: "Forbidden" }`. The comparison is **constant-time**
  (`node:crypto` `timingSafeEqual`) so response timing can't leak the secret's
  length/prefix. Services are never exposed publicly; only the gateway is.
- **User identity**: the gateway verifies the `sh_session` JWT and forwards
  `x-user-id`, `x-user-role`, `x-user-name` (URI-encoded). Services read these
  via a shared `getAuth(c)` helper → `{ userId, role, name } | null`. Services
  still enforce their own authz (401/403/404).
- **Context headers** (set by the gateway): `x-locale` (`en` | `si`, from the
  `lang` cookie, default `en`) and `x-origin` (public web origin — a configured
  `WEB_ORIGIN` is authoritative and wins over client forwarding headers;
  `x-forwarded-proto`/`x-forwarded-host` fallback applies only in dev).
- **S2S calls**: `fetch` with a 5s `AbortSignal.timeout` and the
  `x-internal-secret` header. A **single bounded retry (with jitter)** is made
  on idempotent reads only (GET/HEAD); non-idempotent methods never retry. Read
  hydration degrades gracefully (missing names → `"Unknown"`); write-path
  dependency failures return `502 { error: "Upstream service unavailable" }`.
- **JWT session**: cookie `sh_session`, HS256 via `jose`, secret `AUTH_SECRET`,
  payload `{ userId, role, name, sv }`, 7-day expiry, `httpOnly`,
  `sameSite=lax`, `secure` in production, `path=/`. Signed ONLY by
  identity-service; verified by the gateway and by the web app (page gating).
- **Session revocation**: `sv` is `User.sessionVersion` at mint time. Identity
  bumps the version on password change/reset, `POST /api/auth/logout-all`, and
  admin force-logout; the gateway rejects tokens minted before the current
  version (checked via `GET identity /internal/users/:id/session-version`,
  cached 60s per user, fail-open on identity outage). Tokens minted before this
  scheme count as version 0. The web app's page-gating verifier is a soft
  check — every data/state request goes through the gateway, the enforcement
  point.

## Environment variables

| var | used by |
|---|---|
| `PORT` | every service (defaults: identity 4001, provider 4002, review 4003, job 4004, notification 4005, media 4006, chat 4007, gateway 4000) |
| `DATABASE_URL` | identity, provider, review, job |
| `AUTH_SECRET` | identity (sign), gateway + web (verify) |
| `INTERNAL_API_SECRET` | all services + gateway + web (web calls chat-service and identity directly) |
| `REDIS_URL` | gateway (distributed rate-limit window; unset → per-instance in-memory fallback — see [RATE_LIMITING.md](RATE_LIMITING.md)) |
| `IDENTITY_SERVICE_URL` | gateway + provider + review + job (S2S peer) **and web** (`src/lib/session-version.ts` page-gating revocation check — reaches identity directly with the internal secret; fails open if unset) |
| `PROVIDER_SERVICE_URL`, `REVIEW_SERVICE_URL`, `JOB_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `MEDIA_SERVICE_URL` | gateway + any service that calls that peer |
| `CHAT_SERVICE_URL` | web (proxies `/agent/chat` → `${CHAT_SERVICE_URL}/internal/chat/marketplace/stream`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | notification (console fallback when `RESEND_API_KEY` unset) |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | media (uploads → Cloudflare R2; all four unset → local disk under `$MEDIA_DIR`) |
| `MEDIA_DIR` | media (local upload root, default `./data`; per-namespace subdirs; compose sets `/app/data`) |
| `ANTHROPIC_API_KEY` | **chat-service** (LLM assistant; unset → chat-service returns 503 and the widget degrades). NOT on the web app — the key is isolated from the web runtime. |
| `WEB_ORIGIN` | gateway (authoritative `x-origin`), prod compose (email links + CSRF) |
| `GATEWAY_URL` | web (runtime `/api/*` proxy target in `src/proxy.ts` + `src/lib/api.ts` server fetches + `sitemap.ts`; read per request, never baked into the build), chat-service (its tools call the gateway) |
| `NEXT_PUBLIC_SITE_URL` | web (sitemap/robots/OG canonical origin, optional) |
| `DOMAIN`, `ACME_EMAIL`, `IMAGE_TAG`, `POSTGRES_PASSWORD` | prod compose only (`docker-compose.prod.yml` / `.env.prod.example` — Caddy TLS host, ACME email, published image tag, Postgres superuser password used in every `DATABASE_URL`) |

## Data ownership

- **identity-service** (`identity_db`): `User`, `PasswordResetToken`,
  `EmailVerificationToken`, `Favorite` (providerId is a plain string),
  `AccountDeletion` (audit row that outlives the User), `ImpersonationLog`
  (admin "view as", #234 — adminId + targetUserId + startedAt/endedAt; no
  relations so it survives account deletion of either party).
  `User.role` is a **plain string** (never a native enum), valid values
  `CUSTOMER | PROVIDER | ADMIN | SUPPORT`, enforced by a `CHECK` constraint
  (hand-written, not diffed by `prisma migrate dev`; the set was finalized in
  migration `20260708200000`, which dropped an earlier unused admin value).
  `ADMIN` is the full-access tier; `SUPPORT` is a limited
  read-plus-report-resolve tier. See "Admin surface" below for how the tiers are
  enforced end-to-end.
  `User` also carries `sessionVersion` (revocation), `failedLogins`/`lockedUntil`
  (per-account lockout), `emailVerified`.
- **provider-service** (`provider_db`): `Provider`, `Service`, `WorkPhoto`
  (`sortOrder` manual order + `deletedAt` moderation soft-delete),
  `VerificationDocument`, `Inquiry` (+ `source`, per-party `customerLastReadAt`/
  `providerLastReadAt`, `respondedAt`), `InquiryMessage` (#13 threads),
  `Report` (abuse reports on providers and work photos), `Category` (managed
  category list: slug PK, en/si labels, icon, active flag, sortOrder — no hard
  delete), `AdminAuditLog` (#227 moderation trail for the actions this service
  owns).
  `Provider` denormalizes `contactName`/`contactEmail`/`contactPhone` (copied
  from the user at registration; profile updates write both locally and S2S to
  identity) and carries `awayUntil` (#49), `verificationStatus`/`verifiedAt`/
  `rejectionReason`, `suspended`. `userId` is a plain string.
  `Report` fields: `targetType` (`PROVIDER`|`WORK_PHOTO`), `targetId`,
  `reporterId` (nullable — anonymous allowed), `reason`, `details`, `status`
  (`OPEN`|`RESOLVED`|`DISMISSED`), `source` (`USER`|`SYSTEM`, #232 — SYSTEM is
  reserved for auto-flagging), and the audit fields `resolvedBy`/`resolvedAt`
  (#223, stamped when a report is closed).
- **review-service** (`review_db`): `Review` (+ `deletedAt` soft-delete,
  `verified` badge), `ReviewPhoto`, `Report` (same shape as provider-service's;
  `targetType` = `REVIEW`; same `resolvedBy`/`resolvedAt` audit fields),
  `AdminAuditLog` (identical model; the two audit logs are merged only in the
  admin frontend, never server-side). `providerId`/`userId` plain strings;
  reviewer names hydrated from identity at read time.
- **job-service** (`job_db`): `JobRequest` (`status` OPEN|CLOSED), `JobResponse`.
  `customerId`/`providerId` plain strings. **Monetization (pricing, commission,
  payments) is intentionally deferred to v0.2** — v0.1 is free to use, so there
  is no transaction ledger and no price/commission field on a job.
- **notification-service**: stateless; owns the en/si email templates ported
  from `src/lib/email.ts`.
- **media-service** / **chat-service**: stateless (no DB).

Cross-service uniqueness/cascades that FKs used to give us are preserved by
same-service constraints (`@@unique([providerId, userId])` etc.) and S2S
existence checks at write time. There are no cross-service delete cascades;
account deletion fans out over S2S erase endpoints (see job-service section).

## Uploads (media-service :4006)

Image processing and storage are owned by **media-service**:
`POST /internal/media/store` (multipart — decodes/re-encodes with sharp, strips
EXIF, returns the URL to persist), `POST /internal/media/delete`,
`POST /internal/media/sweep`. provider- and review-service call it over S2S via
a thin identical `lib/storage.ts` client (`storeImage(namespace, file,
prefix)`); the photo **rows** stay with them. Namespaces (`provider`, `review`)
preserve the `/api/files/<namespace>/...` URL shape.

**Backend precedence: Cloudflare R2 > local disk.** R2 (S3-compatible,
**private** bucket) is used when all four `R2_*` vars are set — the S3 client
talks to R2, no AWS involved — else local disk under `$MEDIA_DIR/<namespace>/`.
media serves `GET /files/<namespace>/*` (public through the gateway, which
routes `/api/files/provider/*` and `/api/files/review/*` → media `/files/*` and
supplies the internal secret). R2 objects are **streamed from the private
bucket** through the `/files` route, so stored URLs stay same-origin and match
the local-disk shape (no public bucket/domain needed). **No Vercel Blob.**
Limits: 5MB, jpeg/png/webp.

## api-gateway (:4000)

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
   `POST /api/providers/:id/inquiries` → inquiry; `POST /api/jobs/:id/responses`
   and `POST /api/providers/:id/reviews` → review;
   `POST /api/providers/:id/report`, `POST /api/photos/:id/report` and
   `POST /api/reviews/:id/report` → report. 429 body/headers identical to the
   monolith (`Retry-After`).
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
     sessionVersion (S2S to identity, 60s per-user cache, fail-open), and
     forward identity headers. Invalid/absent/revoked → forward without them
     (services decide 401s).
   Always sets `x-internal-secret`, `x-locale`, `x-origin`, `x-request-id`.
4. **Routing** (`lib/routes.ts`, streaming proxy, preserves method/headers/body
   incl. multipart; passes `Set-Cookie` back). Longest-prefix first; anything
   containing `/internal` (raw or percent-encoded) is never forwarded → `404`.
   - `/api/files/provider/*`, `/api/files/review/*` → media `/files/*`
   - `/api/account/inquiries` → provider; `/api/account/reviews` → review
   - `/api/providers/:id/reviews` → review
   - `/api/admin/reviews/*`, `/api/admin/review-reports*`,
     `/api/admin/review-audit-log`, `/api/admin/review-stats` → review
   - `/api/reviews/*` → review
   - `/api/admin/users*`, `/api/admin/impersonate*`, `/api/admin/signups` →
     identity
   - `/api/admin/jobs*` → job
   - all other `/api/admin/*` (providers, verifications, reports, photos,
     categories, stats, `notifications/counts`, `audit-log`) → provider
   - `/api/photos/:id/report` → provider (work-photo abuse reports)
   - `/api/auth/*`, `/api/favorites*` → identity
   - `/api/providers*`, `/api/provider/*`, `/api/inquiries/*`,
     `/api/categories`, `/api/stats` → provider
   - `/api/jobs*` → job
   - anything else → `404 { error: "Not found" }`.

## Endpoint reference

The full, exhaustive endpoint list — every public `/api/*` route (method, auth/
role gate, params, request/response) and every internal `/internal/*` S2S route
— lives in **[API.md](API.md)**, which is the canonical reference and is kept in
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
  `/api/account/inquiries`), provider/photo abuse reports, and the bulk of the
  admin surface (providers, verifications, reports, categories, auto-flagging,
  audit log, stats/notification counts).
- **review-service (:4003)** — public + write review routes
  (`/api/providers/:id/reviews`), `/api/account/reviews`, review photo delete,
  review abuse reports, and the admin review moderation queues
  (`/api/admin/review-*`).
- **job-service (:4004)** — `/api/jobs*` (post, board, mine, responses, status)
  and the read-only admin jobs oversight. **Monetization (pricing, commission,
  payments) is intentionally deferred to v0.2** — v0.1 is free to use, so there
  is no transaction ledger and no price/commission field on a job (a JobRequest
  carries only an optional customer-stated `budget`).
- **notification-service (:4005)** — internal-only en/si email templates
  (`/internal/email/*`); Resend when `RESEND_API_KEY` is set, else console log.
- **media-service (:4006)** — serves uploads at `GET /files/:namespace/*` (public
  through the gateway as `/api/files/<namespace>/*`) and the internal
  store/delete/sweep routes; bytes live in R2 (private) or on local disk.
- **chat-service (:4007)** — the streaming Claude marketplace assistant at
  `POST /internal/chat/:persona/stream`, reached only via the web app's
  `/agent/chat` proxy (never through the gateway, which would buffer the stream).
  Requires `ANTHROPIC_API_KEY` (unset → 503); model `claude-opus-4-8`; tools
  `search_providers` + `create_inquiry` call back through the gateway.

## Admin surface (roles and audit)

- **Role tiers (#226):** `User.role` allows `CUSTOMER | PROVIDER | ADMIN |
  SUPPORT` (CHECK constraint). There are two admin tiers, enforced **end-to-end**
  (web + backend):
  - **ADMIN** — full access: destructive moderation (verify/suspend, verification
    approve/reject, photo & review delete/restore, auto-flagging), category
    edits, user management, role changes, and impersonation.
  - **SUPPORT** — read access to every admin view, plus resolving/dismissing
    abuse reports. Nothing destructive.

  The **web app** gates the `/admin` UI via `src/lib/roles.ts`: `isAdminRole`
  (coarse `/admin` access for ADMIN/SUPPORT), `hasFullAdminAccess` (ADMIN — the
  destructive actions above), `hasSupportAccess` (ADMIN or SUPPORT — read +
  report resolve/dismiss). The **backend services enforce the same split**: each
  service's `src/lib/http.ts` exposes `isFullAdmin` (role === `ADMIN`) and
  `isSupportOrAdmin` (`ADMIN` or `SUPPORT`), and every admin route gates on the
  matching predicate — reads and report resolve/dismiss on `isSupportOrAdmin`,
  destructive writes on `isFullAdmin`. The web gate is UX/defence-in-depth; the
  service check is the authoritative one.
- **Audit trail (#227/#223):** provider- and review-service each keep an
  `AdminAuditLog` (one row per moderation write) exposed at
  `/api/admin/audit-log` and `/api/admin/review-audit-log`; abuse reports also
  carry `resolvedBy`/`resolvedAt`. The frontend merges the two logs client-side.
  Impersonation keeps its own `ImpersonationLog` (identity-service) —
  intentionally separate for now, to be reconciled with the general audit log
  later.

## Web app changes

- `src/proxy.ts` (Next 16's rename of middleware) rewrites `/api/:path*` →
  `${GATEWAY_URL}/api/:path*` at **request** time, so `GATEWAY_URL` is a pure
  runtime env var (unset → `http://localhost:4000`). Client components keep
  calling `/api/*` unchanged.
- The proxy is also the trust boundary for the `x-locale` request header
  (#67/#204): `/si*` URLs rewrite to the unprefixed route with `x-locale: si`;
  every other page route has `x-locale` overwritten to `en`. It runs on all page
  routes (matcher excludes only `/api`, `_next/*` and metadata assets) so a
  client-supplied `X-Locale` can never reach `getUrlLocale()`. The `lang` cookie
  still drives the rendered locale via `getLocale()`, which reads it directly.
- Server components fetch the gateway directly (`src/lib/api.ts`: `GATEWAY_URL` +
  forwarded `cookie`, `cache: "no-store"`); `src/app/sitemap.ts` fetches
  `/api/providers/ids`.
- Page gating: `auth.ts#getSession` (JWT verify only) + `src/lib/roles.ts`
  (admin tiers) + `src/lib/session-version.ts` (soft revocation check to
  identity via `IDENTITY_SERVICE_URL`, fail-open). CSRF, rate-limit, tokens,
  email, upload, favorites, provider-auth libs and `src/app/api/**` are gone —
  they live in the services now. Prisma is fully removed from the web app.
- `src/app/agent/chat/route.ts` proxies `POST /agent/chat` →
  `${CHAT_SERVICE_URL}/internal/chat/marketplace/stream` with the internal
  secret + forwarded cookie/IP; non-stream error responses (incl. 503 when the
  assistant is disabled) pass straight through.

## Local development

- `docker compose up -d postgres` then `npm run dev:all` (root script starts all
  eight services + web via `concurrently`), or `docker compose up --build` for
  the full stack (postgres + redis + 8 services + web). `npm run db:setup`
  pushes schemas + seeds all services (deterministic IDs; `password123`
  accounts).
- Ops scripts under `scripts/`: `dev-all.sh`, `setup.sh`, `dev-reset.sh`
  (tears the stack down **with volumes**, rebuilds, and reseeds — local data is
  disposable and never migrated between runs), `e2e-smoke.sh`,
  `baseline-migrations.sh`, `backup-dbs.sh`/`restore-db.sh`, `init-db.sql`
  (creates the four databases), `sync-service-repos.sh` (subtree mirror),
  `gen-icons.mjs`.
- Production: `docker-compose.prod.yml` + `.env.prod.example` (Caddy TLS via
  `DOMAIN`/`ACME_EMAIL`, `IMAGE_TAG`, required `AUTH_SECRET`/
  `INTERNAL_API_SECRET`/`POSTGRES_PASSWORD`).
