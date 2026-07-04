# Service Hub — Microservice Architecture

Service Hub (Baas.lk) is split into five backend services plus an API gateway,
with the Next.js app as a pure frontend. This repo is the **canonical monorepo**;
each service under `services/` is also mirrored to its own repository in the
`luminary-dev` org via `git subtree` (see `scripts/sync-service-repos.sh`).

```
browser ── same-origin /api/* ──> Next.js web (:3000)
                                   │  rewrites /api/* ──> api-gateway (:4000)
server components ── GET ─────────────────────────────────^
                                   gateway routes to:
                                   ├── identity-service     (:4001)  identity_db
                                   ├── provider-service     (:4002)  provider_db
                                   ├── review-service       (:4003)  review_db
                                   ├── job-service          (:4004)  job_db
                                   └── notification-service (:4005)  (no db)
```

Each service owns its database (separate Postgres databases on one local
cluster). No service touches another's tables — cross-service data access goes
through internal HTTP endpoints.

## Shared conventions (all services)

- **Stack**: TypeScript (CommonJS, `module: NodeNext`), Hono ^4 +
  `@hono/node-server` ^1.19.13, Prisma 7.8 + `@prisma/adapter-pg`, zod, vitest.
  Layout: `src/index.ts` (serve, reads `PORT`), `src/app.ts` (exports the Hono
  app for tests), `src/db.ts`, `src/routes/*.ts`, `src/lib/*.ts`,
  `prisma/schema.prisma`, `prisma/seed.js`, `prisma.config.ts` (same pattern as
  root: try `process.loadEnvFile()`), `Dockerfile`, `.env.example`, `README.md`.
  Scripts: `dev` (tsx watch), `build` (tsc -p tsconfig.build.json), `start`,
  `start:migrate` (`prisma migrate deploy && node dist/index.js`),
  `typecheck`, `test`, `db:migrate` (deploy), `db:migrate:dev` (author a new
  migration), `db:push` (prototyping only), `db:seed`, `postinstall`
  (prisma generate). Schema changes ship as committed migrations under
  `prisma/migrations/` (baseline `0_init`); dev databases created before
  the baseline run `scripts/baseline-migrations.sh` once.
  See `services/identity-service/` for the reference scaffold.
- **Logging**: structured JSON on stdout, one line per event —
  `{ level, time, service, msg, ...fields }` via the canonical
  `src/lib/logging.ts` (identical copy in every service incl. the gateway;
  each service instantiates it in `src/lib/log.ts`). The request middleware
  logs one line per request (`requestId`, `method`, `path`, `status`,
  `durationMs`); `/healthz` polling is never logged. The gateway generates
  `x-request-id` (client-sent values are stripped — it's on the trusted
  `GATEWAY_HEADERS` list) and propagates it upstream so one id follows a
  request across services; services log the id they receive. Errors go
  through `log.error(msg, { context, err })` — no bare `console.error`.
- **Error shape**: `{ "error": string }` with the exact monolith status codes
  and messages listed per endpoint below. Success shapes also match the
  monolith exactly.
- **Health**: `GET /healthz` → `200 { ok: true, service: "<name>" }`. Used by
  compose healthchecks and the E2E script.
- **Internal auth**: every request from the gateway or another service carries
  `x-internal-secret: $INTERNAL_API_SECRET`. A tiny middleware rejects any
  request without the correct secret with `403 { error: "Forbidden" }` —
  services are never exposed publicly; only the gateway is.
- **User identity**: the gateway verifies the `sh_session` JWT and forwards
  `x-user-id`, `x-user-role`, `x-user-name` (URI-encoded) headers. Services
  read these via a shared `getAuth(c)` helper returning
  `{ userId, role, name } | null`. Services still enforce their own authz
  (401/403/404 semantics identical to the monolith).
- **Context headers** (set by the gateway): `x-locale` (`en` | `si`, from the
  `lang` cookie, default `en`) and `x-origin` (public web origin, from
  `x-forwarded-proto`/`x-forwarded-host`, fallback `WEB_ORIGIN` env) — used for
  email language and links.
- **S2S calls**: plain `fetch` with a 5s `AbortSignal.timeout`, the
  `x-internal-secret` header, and JSON bodies. Read hydration degrades
  gracefully (missing names → `"Unknown"`); write-path dependency failures
  return `502 { error: "Upstream service unavailable" }`.
- **JWT session**: cookie `sh_session`, HS256 via `jose`, secret `AUTH_SECRET`,
  payload `{ userId, role, name, sv }`, 7-day expiry, `httpOnly`,
  `sameSite=lax`, `secure` in production, `path=/`. Signed ONLY by
  identity-service; verified by the gateway and by the web app (page gating).
- **Session revocation**: `sv` is `User.sessionVersion` at mint time. Identity
  bumps the version on password change/reset and `POST /api/auth/logout-all`;
  the gateway rejects tokens minted before the current version (checked via
  `GET identity /internal/users/:id/session-version`, cached 60s per user,
  fail-open on identity outage). Tokens minted before this scheme count as
  version 0. The web app's page-gating verifier stays a soft check — every
  data/state request goes through the gateway, which is the enforcement point.

## Environment variables

| var | used by |
|---|---|
| `PORT` | every service (defaults: see port map above) |
| `DATABASE_URL` | identity, provider, review, job |
| `AUTH_SECRET` | identity (sign), gateway + web (verify) |
| `INTERNAL_API_SECRET` | all services + gateway |
| `IDENTITY_SERVICE_URL`, `PROVIDER_SERVICE_URL`, `REVIEW_SERVICE_URL`, `JOB_SERVICE_URL`, `NOTIFICATION_SERVICE_URL` | gateway + any service that calls that peer |
| `RESEND_API_KEY`, `EMAIL_FROM` | notification (console fallback when unset) |
| `BLOB_READ_WRITE_TOKEN` | provider, review (uploads; local-disk fallback) |
| `UPLOAD_DIR` | provider, review (local upload dir, default `./data/uploads`) |
| `WEB_ORIGIN` | gateway (fallback for `x-origin`) |
| `GATEWAY_URL` | web (runtime `/api/*` proxy target in `src/proxy.ts` + server-side fetches; read per request, never baked into the build/image) |

## Data ownership

- **identity-service**: `User`, `PasswordResetToken`, `EmailVerificationToken`,
  `Favorite` (providerId is a plain string).
- **provider-service**: `Provider`, `Service`, `WorkPhoto`,
  `VerificationDocument`, `Inquiry`, `Report` (abuse reports on providers and
  work photos — each content-owning service keeps the reports on its own
  content; reporterId is a plain nullable string, null = anonymous),
  `Category` (the managed service-category
  list: slug PK, en/si labels, icon, active flag, sortOrder — no hard delete;
  deactivating hides a category from public lists while existing providers
  keep the slug). `Provider.userId` is a plain string.
  `Provider` additionally **denormalizes** `contactName`, `contactEmail`,
  `contactPhone` (copied from the user at registration; profile updates write
  both locally and S2S to identity). This replaces the monolith's
  `provider.user` joins for listing search, cards, admin lists and OG images.
- **review-service**: `Review`, `ReviewPhoto`, `Report` (abuse reports on
  reviews, same shape as provider-service's). `providerId`/`userId` plain
  strings; reviewer names hydrated from identity at read time.
- **job-service**: `JobRequest`, `JobResponse`. `customerId`/`providerId`
  plain strings; hydrated at read time.
- **notification-service**: stateless; owns the email templates (en/si) ported
  from `src/lib/email.ts`.

Cross-service uniqueness/cascades that FKs used to give us are preserved by
same-service constraints (`@@unique([providerId, userId])` etc.) and S2S
existence checks at write time. There are no cross-service delete cascades in
the product today (admin suspends/verifies; deletes are per-review/photo).

## Uploads

`storeImage(file, prefix)` (provider- and review-service) decodes and
re-encodes every upload with sharp before storing: non-images and formats
outside JPEG/PNG/WebP are rejected with 400 regardless of the claimed
content-type, ALL metadata (EXIF GPS etc.) is stripped, the EXIF orientation
is baked in first, and the re-encoded content decides the stored extension.
Storage backend:
Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (absolute URL stored),
otherwise local disk under `$UPLOAD_DIR/<prefix>/<uuid>.<ext>` with the URL
stored as `/api/files/<service>/<prefix>/<uuid>.<ext>`. Each uploading service
serves `GET /files/*` from `$UPLOAD_DIR` (public through the gateway). Limits
unchanged: 5MB, jpeg/png/webp. Deletion mirrors the monolith (unlink local /
blob `del`, errors swallowed). Seed photos stay in web `public/uploads/seed/`.

## api-gateway (:4000)

Public entry. Responsibilities:

1. **CSRF** (port of `src/lib/csrf.ts` + tests): for non-GET/HEAD/OPTIONS,
   allow if `sec-fetch-site` ∈ {`same-origin`,`none`}; else compare `origin`
   host to `x-forwarded-host` ?? `host`. Reject → `403 { error: "Cross-site
   request blocked." }` (this replaces the monolith middleware).
2. **Rate limiting** (port of `src/lib/rate-limit.ts` + tests, sliding
   window keyed by client IP from `x-forwarded-for`; the window lives in
   Redis when `REDIS_URL` is set — shared across instances, falling back to
   the per-instance in-memory store on Redis failure — otherwise in-memory):
   `POST /api/auth/login|forgot-password|reset-password|change-password|delete-account` →
   authStrict; `POST /api/auth/register` → authSignup;
   `POST /api/auth/resend-verification` → resend; `POST /api/jobs` and
   `POST /api/providers/:id/inquiries` → inquiry; `POST /api/jobs/:id/responses`
   and `POST /api/providers/:id/reviews` → review;
   `POST /api/providers/:id/report`, `POST /api/photos/:id/report` and
   `POST /api/reviews/:id/report` → report (review budget — abuse reports
   accept anonymous submissions, so the IP budget is the main spam control).
   429 body/headers identical to the monolith (`Retry-After`).
3. **Session**: verify `sh_session` (jose), then check the token's `sv`
   against the user's current sessionVersion (S2S to identity, 60s per-user
   cache, fail-open). Invalid/absent/revoked → forward without identity
   headers (services decide 401s). Strip any client-sent `x-user-*`,
   `x-internal-secret`, `x-locale`, `x-origin` headers first.
4. **Routing** (streaming proxy, preserves method/headers/body incl.
   multipart; passes `Set-Cookie` back):
   - `/api/auth/*`, `/api/favorites/*` → identity
   - `/api/account/inquiries` → provider; `/api/account/reviews` → review
     (exact paths — customer account history, each owned by the service that
     holds the data)
   - `/api/providers/:id/reviews` → review
   - `/api/providers*`, `/api/provider/*`, `/api/categories`, `/api/stats` →
     provider
   - `/api/reviews/*`, `/api/admin/reviews/*`, `/api/admin/review-reports*` →
     review
   - `/api/admin/*` (providers, photos, verifications, reports) → provider
   - `/api/photos/:id/report` → provider (work-photo abuse reports)
   - `/api/jobs*` → job
   - `/api/files/provider/*` → provider `/files/*`; `/api/files/review/*` →
     review `/files/*`
   - anything else → `404 { error: "Not found" }`. Never forwards `/internal/*`.

## identity-service (:4001)

Public endpoints (via gateway), all behavior/messages copied from the monolith:

- `POST /api/auth/register` — zod discriminated union (CUSTOMER/PROVIDER).
  Field rules (shared `lib/field-rules.ts`, identical copy in provider-service):
  SL phones normalized to E.164, social/website links validated http(s)-only
  (no credentials, dotted host, ≤200 chars), district `z.enum` against the
  canonical static list, prices integer rupees 50–10,000,000. Category is
  data, not code: after `safeParse`, provider registrations check the slug
  against provider-service's Category table (S2S `GET /internal/categories`,
  60s in-process cache, fallback to the static `CATEGORIES` list on any
  failure — shared `lib/categories.ts`, identical factory in all three
  validating services) and reject with `400 { error: "Invalid category" }`.
  Dup email → 409. Creates user (bcrypt 10).
  If PROVIDER: S2S `POST provider /internal/providers` with
  `{ userId, name, email, phone, profile..., services[] }`; on failure,
  compensating-delete the user and return 502. Sends verification email
  (S2S notification, url `${x-origin}/verify-email?token=`, best-effort).
  Sets session cookie. → `{ user: {id,name,role}, providerId }`.
- `POST /api/auth/login` — verify bcrypt; providerId via S2S
  `GET provider /internal/providers/by-user/:userId` (null if none). Sets
  cookie. Errors: 400 "Invalid input", 401 "Invalid email or password".
  Per-account lockout: 5 wrong passwords lock the account for 15 min
  (`failedLogins`/`lockedUntil`, reset on success); locked accounts and
  unknown emails get the identical 401 (no enumeration), and unknown emails
  burn a dummy bcrypt compare so timing matches.
- `POST /api/auth/logout` — clears cookie → `{ ok: true }`.
- `GET /api/auth/me` — from `x-user-id`; no session → `{ user: null }`; else
  `{ user: {id,name,email,role,providerId} }` (providerId S2S, fresh DB read
  for email/name).
- `POST /api/auth/verify-email`, `POST /api/auth/reset-password`,
  `POST /api/auth/forgot-password`, `POST /api/auth/resend-verification` —
  logic, transactions, anti-enumeration and messages identical to monolith;
  emails via notification-service. reset-password additionally bumps
  `sessionVersion` (signs out all devices).
- `POST /api/auth/change-password` — session required; verifies the current
  password (bcrypt), validates the new one with the shared registration
  password rule, updates the hash, consumes outstanding reset tokens, bumps
  `sessionVersion` and re-issues the requester's cookie.
- `POST /api/auth/logout-all` — session required; bumps `sessionVersion`
  (revoking every device) and re-issues the requester's cookie → `{ ok: true }`.
- `POST /api/auth/delete-account` — session required; re-auth with the current
  password, then fan out S2S to provider/review/job `POST
  /internal/users/:id/erase` (all idempotent; any failure → 502 and nothing is
  deleted locally so a retry finishes the job), then delete the User
  (Favorites/tokens cascade) and record an `AccountDeletion` audit row.
- `POST /api/favorites/:id` — 401 w/o session; S2S provider existence check
  (404 "Provider not found"); upsert → `{ favorited: true }`.
- `DELETE /api/favorites/:id` — deleteMany → `{ favorited: false }`.
- `GET /api/favorites` — session required (401); returns
  `{ providerIds: string[] }` ordered by createdAt desc (used by home,
  listing, account pages).

Internal: `GET /internal/users?ids=a,b,c` →
`{ users: [{id,name,email,phone,emailVerified}] }`;
`PATCH /internal/users/:id` `{ name?, phone? }` (profile sync);
`GET /internal/users/:id/session-version` → `{ v: number | null }` (gateway
revocation check; null = user gone);
`GET /internal/users/count` (unused today, cheap);
`POST /internal/users/:id/delete-compensation` is NOT needed — register
compensation is a local delete.

Owns port of `src/lib/tokens.ts` (+ its tests).

## provider-service (:4002)

Public (all monolith semantics preserved; `name` fields come from denormalized
`contactName`):

- `GET /api/categories` — the managed category list for browse filters and
  forms: active only, ordered by sortOrder then labelEn →
  `{ categories: [{ slug, labelEn, labelSi, icon }] }`. The web app degrades
  to its static constants if this fetch fails.
- `GET /api/providers` — query `q, category, district, sort, page, pageSize
  (default 12, max 24), ids, take, priceMin, priceMax (integer rupees; a
  provider matches when ANY service price is in range), ratingMin (1..5),
  availableOnly=1`. `availableOnly` filters on EFFECTIVE availability
  (`lib/availability.ts`: `available && (awayUntil == null || awayUntil <=
  now)`) — a provider away until a future date (#49) is excluded via the
  where clause, and flips back automatically once the date passes.
  Filters `suspended=false`, search across
  headline/bio/city/contactName/services.title (insensitive `contains`,
  backed by pg_trgm GIN indexes — migration `search_trgm`; a tsvector
  upgrade can layer on later). `q` is also resolved against the Category
  table's labelEn/labelSi (inactive included), and matching slugs join the
  search OR as `category IN (...)` — this is what makes category words and
  Sinhala queries ("mechanic", "කාර්මික") match even though provider data is
  stored in English (`lib/search.ts` builds the where, `lib/query.ts`
  normalizes/clamps the params, both unit-tested). Hydrates ratings via S2S
  `review /internal/ratings?providerIds=`; `ratingMin` is applied after
  hydration, in memory (consistent with the in-memory ranking below —
  no-review providers never pass a minimum). Sorts with the port of
  `src/lib/sort.ts` (+ tests) — keys recommended/rating/reviews/price/
  experience/newest — then paginates. Returns
  `{ providers: ProviderCardDTO[], total, page, pageSize }`.
  `ProviderCardDTO = { id, userId, name, category, headline, district, city,
  experience, available, awayUntil, verificationStatus, verifiedAt, createdAt,
  avatarUrl, coverPhoto, photos: [{url,caption}](first), services: [{id,title,
  price,priceType}](cheapest), fromPrice, fromPriceType, rating, reviewCount }`.
  `available` in card/detail/full payloads is the effective value (away
  providers report `false`); the raw `awayUntil` rides along so the web can
  render a localized "Away until {date}" chip.
  `ids=` returns those providers (suspended excluded) unsorted-by-input-order
  preserved — used by the account/favorites page.
- `GET /api/providers/ids` — `{ providers: [{id, updatedAt}] }` non-suspended
  (sitemap).
- `GET /api/providers/:id` — legacy detail JSON (kept: provider incl.
  services, photos; reviews NOT included here anymore; 404 "Provider not
  found").
- `GET /api/providers/:id/full` — page payload: provider + contact
  `{name, phone, email}` + services (price asc) + first 50 photos
  (sortOrder asc then createdAt desc — the provider's manual order,
  `photosTotal` alongside) + first page of reviews (S2S
  `review /internal/by-provider/:id`, hydrated reviewer names + photos;
  `reviewsTake`/`reviewsCursor` thread through, `reviewsNextCursor` returned)
  + `favorited` (S2S identity if `x-user-id`). Suspended → 404 unless
  `x-user-role=ADMIN`.
- `GET /api/providers/:id/card` — OG-image payload `{ name, category, city,
  district, suspended, rating, reviewCount, verificationStatus }`.
- `POST /api/providers/:id/inquiries` — optional session; zod rules and
  messages from monolith → `{ inquiry }`. Afterwards emails the provider
  (denormalized `contactEmail`, S2S notification `/internal/email/inquiry`,
  best-effort).
- `GET /api/stats` — `{ providerCount, reviewCount }` (S2S review
  `/internal/count`).
- `POST /api/providers/:id/report`, `POST /api/photos/:id/report` — abuse
  reports (#50); session OPTIONAL (anonymous visitors can report). Body
  `{ reason: "spam"|"scam"|"offensive"|"fake"|"other", details? (≤500) }`;
  missing target → 404. A signed-in user re-reporting the same target updates
  their existing OPEN report instead of creating another; anonymous duplicates
  are allowed (the gateway "report" rate budget is the backstop) →
  `{ ok: true }`.
- `GET|POST /api/inquiries/:id/messages` — inquiry message thread (#13):
  session required; only the inquiry's customer (signed-in inquiries) or the
  receiving provider resolve a party — everyone else gets an id-hiding 404.
  GET marks the caller's side read and supports `?after=<ISO>` incremental
  polling; POST (1–2000 chars) from the provider on a NEW inquiry flips it to
  RESPONDED with the once-only respondedAt stamp. Both inquiry lists carry
  `unreadCount` (messages from the other side newer than the caller's marker).
  Inquiry also gained `source` (attribution, e.g. "chat-agent") and per-party
  lastRead columns.
- `GET /api/account/inquiries` — session required (401); the caller's sent
  inquiries newest-first (cap 50), each hydrated with the provider's
  `{ id, name, category, suspended }` in a single local query (inquiries and
  providers are both local) → `{ inquiries }`. Anonymous inquiries
  (userId=null) never appear.
- Dashboard (all require a provider owned by `x-user-id`, else 401):
  `GET /api/provider/dashboard` — provider + services + photos + inquiries +
  ratings summary + contact (incl. `emailVerified` fresh from identity) +
  `openJobsCount` (S2S job `/internal/jobs/count?category&district&
  excludeCustomerId=`).
  `PUT /api/provider/profile` — same tightened field rules as registration
  (shared `lib/field-rules.ts`; phones normalized to E.164 BEFORE both the
  local write and the S2S sync); accepts optional `awayUntil` (#49: ISO date
  string or null to clear; must parse and be at most one year out — stored
  alongside `available`, the away window only affects public reads);
  category checked post-parse against the
  local Category table (60s cache, static fallback; inactive slugs stay
  valid so deactivation never blocks a profile save); updates provider +
  contactName/contactPhone, then S2S `PATCH identity /internal/users/:userId`
  `{name, phone}`. Returns `{ provider }`.
  `POST /api/provider/services`, `PUT|DELETE /api/provider/services/:id` —
  ownership checks, messages identical.
  `POST /api/provider/photos` (multipart; `kind=avatar` → avatarUrl update,
  else WorkPhoto; 5MB/type checks, messages identical; the web dashboard
  multi-uploads by looping this endpoint — one XHR per file for real progress
  events, at most 2 in flight since sharp re-encodes server-side).
  `PATCH /api/provider/photos/order` `{ ids: string[] }` — persists the
  drag-to-reorder: sets `WorkPhoto.sortOrder` to each id's index in the
  array; ids not owned by the caller are ignored (a stale/hostile payload
  can't touch other providers' photos), own photos missing from the payload
  keep their old sortOrder → `{ ok: true }`.
  `DELETE /api/provider/photos/:id`.
  Photo ordering everywhere (dashboard list, public `/full` gallery, card
  `coverPhoto`, legacy detail) is `sortOrder asc, createdAt desc` — the
  provider's manual order; new uploads default to sortOrder 0 so they
  surface first (and become the cover) until reordered.
  `GET /api/provider/inquiries`, `PATCH /api/provider/inquiries/:id`
  (status NEW|RESPONDED|CLOSED).
  `POST /api/provider/verification` — multipart nic/business docs,
  deleteMany + create + status PENDING, messages identical.
- Admin (require `x-user-role=ADMIN`, else 403):
  `GET /api/admin/providers` — all providers + contact + `_count` photos
  (local) + review counts (S2S ratings batch).
  `GET /api/admin/providers/:id` — provider + photos + contact email + reviews
  (S2S with reviewer names).
  `GET /api/admin/verifications` — PENDING + docs + contact.
  `PATCH /api/admin/providers/:id` — verify/unverify/suspend/unsuspend.
  `PATCH /api/admin/verifications/:id` — approve/reject →
  `{ status: "VERIFIED"|"REJECTED" }`.
  `DELETE /api/admin/photos/:id` (SOFT delete — reversible via
  `PATCH /api/admin/photos/:id/restore`; owner deletes stay hard).
  Category management: `GET /api/admin/categories` (all, inactive included),
  `POST /api/admin/categories` (slug `^[a-z0-9-]{2,40}$`, labels required),
  `PATCH /api/admin/categories/:slug` (labelEn/labelSi/icon/active/sortOrder).
  No hard delete — deactivate instead.
  Abuse-report queue: `GET /api/admin/reports` — OPEN first (newest first),
  then a bounded tail of recently closed ones; each report carries a hydrated
  target summary from local tables (provider name / photo url + owner; null
  when the target was hard-deleted). `PATCH /api/admin/reports/:id`
  `{ status: "RESOLVED"|"DISMISSED" }` → `{ ok: true }`.
- `GET /files/*` — serves `$UPLOAD_DIR` files.

Internal: `GET /internal/categories` → `{ categories: [...] }` (every
category, inactive included with its `active` flag — identity- and
job-service validation caches read this), `POST /internal/providers`
(register orchestration; creates
provider + services, returns `{ id }`), `GET /internal/providers/by-user/:userId`
→ `{ provider: {id, category, district, ...} | null }`,
`GET /internal/providers?ids=` → `{ providers: [{id, userId, contactName,
contactPhone, suspended}] }` (job-service hydration),
`GET /internal/providers/:id/summary` → existence/suspended/userId check
(favorites, reviews).

## review-service (:4003)

- `GET /api/providers/:id/reviews?take&cursor` — public paginated reviews
  (take default 10, max 100) → `{ reviews, nextCursor }` for profile
  lazy-loading; suspended/missing provider → 404 (check degrades open on a
  provider-service outage).
- `POST /api/providers/:id/reviews` — session required (401 "Sign in...");
  S2S provider summary (404; own-profile 400); multipart rating/comment +
  up to 3 photos (existing count enforced); upsert; photos stored with prefix
  `reviews`; messages identical → `{ ok: true }`.
- `GET /api/account/reviews` — session required (401); the caller's reviews
  newest-first excluding soft-deleted (cap 50), provider names hydrated via
  one S2S batch `GET provider /internal/providers?ids=` (degrades to
  `"Unknown"`) → `{ reviews: [{ id, rating, comment, verified, createdAt,
  provider: { id, name }, photos }] }`.
- `DELETE /api/reviews/photos/:id` — owner-or-admin (401/403/404), deletes
  file best-effort.
- `POST /api/reviews/:id/report` — abuse reports (#50); session OPTIONAL.
  Same body/semantics as provider-service's report endpoints (soft-deleted or
  missing review → 404) → `{ ok: true }`.
- `DELETE /api/admin/reviews/:id` — ADMIN only (403); SOFT delete (sets
  `deletedAt`; row/photos/files survive) → `{ ok: true }`.
- `PATCH /api/admin/reviews/:id/restore` — ADMIN only; clears `deletedAt`.
- `GET /api/admin/review-reports`, `PATCH /api/admin/review-reports/:id` —
  the review-report moderation queue, same shape/semantics as
  provider-service's `/api/admin/reports` (target summary = rating, comment,
  providerId, removed flag for soft-deleted reviews).
- `GET /files/*`.

Internal: `GET /internal/ratings?providerIds=` → `{ ratings: { [providerId]:
{ rating, count } } }`; `GET /internal/by-provider/:id?take&cursor` → reviews
(createdAt desc, cursor-paginated, take default 50 max 100) with reviewer
names (S2S identity batch) and photos, plus `nextCursor`;
`GET /internal/count` → `{ count }`.

## job-service (:4004)

- `POST /api/jobs` — session (401 "Sign in to post a job"); `jobSchema` port
  (zod, district enum from constants; category checked post-parse against
  provider `/internal/categories`, 60s cache, static fallback) → `{ id }`.
- `PATCH /api/jobs/:id` — owner only (404 semantics identical); status
  OPEN|CLOSED → `{ ok: true }`.
- `POST /api/jobs/:id/responses` — session (401 "Sign in to respond");
  provider gate via S2S by-user (403 "Only registered professionals can
  respond to jobs"); open check (400 "This job is closed"); dup check (400
  "You've already responded to this job"); creates response; best-effort
  email to customer (S2S identity for email → notification job-response
  template, url `${x-origin}/jobs`) → `{ ok: true }`.
- `GET /api/jobs/board` — provider gate (S2S by-user; 403 if none): OPEN jobs
  matching provider category+district, excluding own, with customer names
  (S2S identity) and `responded` flag → `{ jobs }`.
- `GET /api/jobs/mine` — session required: own jobs (createdAt desc) with
  responses hydrated with provider `{name, phone}` (S2S provider batch) →
  `{ jobs }`.

Internal: `GET /internal/jobs/count?category&district&excludeCustomerId` →
`{ count }`.

Maintenance: provider and review each expose
`POST /internal/maintenance/sweep-orphans` → `{ scanned, removed }` — removes
stored upload files no DB row references (24h grace window protects in-flight
uploads); run from ops tooling with the internal secret.

Erase endpoints (account deletion, all idempotent no-op-200 for unknown users):
provider `POST /internal/users/:id/erase` (Provider + cascades + upload files
+ the user's inquiries elsewhere), review `POST /internal/users/:id/erase`
(reviews + photo files), job `POST /internal/users/:id/erase` `{ providerId? }`
(own JobRequests; JobResponses when providerId given).

## notification-service (:4005)

Internal-only: `POST /internal/email/verify` `{ to, url, locale }`,
`POST /internal/email/password-reset` `{ to, url, locale }`,
`POST /internal/email/job-response` `{ to, url, providerName, jobTitle,
locale }`,
`POST /internal/email/inquiry` `{ to, url, customerName, locale }` →
`{ ok, delivered }`. Templates (en/si subjects + HTML) ported
verbatim from `src/lib/email.ts`; Resend when `RESEND_API_KEY` set, otherwise
console log with `delivered: false`.

## Web app changes

- `src/proxy.ts` (Next 16's rename of middleware) rewrites `/api/:path*` →
  `${GATEWAY_URL}/api/:path*` at **request** time, so `GATEWAY_URL` is a pure
  runtime env var and one web image can be promoted across environments.
  (A `rewrites()` entry in `next.config.ts` — the original approach — is
  resolved at build time and bakes the gateway address into the routes
  manifest.) Client components keep calling `/api/*` unchanged; when
  `GATEWAY_URL` is unset the proxy falls back to `http://localhost:4000`.
- Server components fetch the gateway directly (`src/lib/api.ts` helper:
  `GATEWAY_URL` + forwarded `cookie` header, `cache: "no-store"`).
- Delete `src/app/api/**`, `src/lib/db.ts`, and the moved libs (tokens, email,
  verification, upload, rate-limit, csrf, favorites, provider-auth) + their
  tests (they live in services now). Keep `auth.ts#getSession` (JWT verify
  only) for page gating; drop `createSession`/`destroySession`/
  `getCurrentUser`.
- `src/middleware.ts` (CSRF) is gone — CSRF now lives in the gateway. The
  only `proxy.ts` responsibility is the runtime `/api/*` rewrite above.
- Prisma is removed from the web app entirely (deps, scripts, prisma/).

## Local development

- `docker compose up -d postgres` then `npm run dev:all` (root script starts
  all services + web via `concurrently`), or `docker compose up --build` for
  the full stack. `npm run db:setup` pushes schemas + seeds all services
  (deterministic IDs so cross-service references line up; same demo data and
  `password123` accounts as before).
