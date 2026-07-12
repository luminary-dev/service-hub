# Service Hub — API reference

The consolidated endpoint reference for Service Hub (Baas.lk): every public
`/api/*` route the web app can call, and every internal `/internal/*` route
services call each other with. It is derived from the code — the gateway routing
table (`services/api-gateway/src/lib/routes.ts`) and each service's route
handlers — not from memory. [ARCHITECTURE.md](ARCHITECTURE.md) stays the
authority on *how* the system is wired; this file is the authority on *what the
endpoints are*.

## How requests reach a service

- **The api-gateway (:4000) is the only public entry.** Browsers and the web
  app's server components hit same-origin `/api/*`; Next's `src/proxy.ts`
  rewrites that to the gateway at request time.
- At the edge the gateway applies, in order: **CSRF** check (non-GET/HEAD/OPTIONS),
  **rate limiting** (per-route, keyed by client IP — see
  [RATE_LIMITING.md](RATE_LIMITING.md)), a **6 MB body limit** (413 above it),
  then it verifies the `sh_session` JWT (or an `impersonation_session` cookie),
  forwards `x-user-id` / `x-user-role` / `x-user-name` plus the shared
  `x-internal-secret`, and proxies to the owning service.
- **Auth is a httpOnly cookie** (`sh_session`, HS256), minted only by
  identity-service. Endpoints marked *authenticated* require it; *public*
  endpoints work without it; *optional session* endpoints behave differently
  when it is present (e.g. de-duplicated reports, attributed inquiries).
- **Roles** are `CUSTOMER`, `PROVIDER`, `ADMIN`, `SUPPORT`. Admin routes gate on
  `isSupportOrAdmin` (reads + report resolve/dismiss — ADMIN **or** SUPPORT) or
  `isFullAdmin` (destructive writes — ADMIN only). See [AUTHZ.md](AUTHZ.md).
- **Anything containing `/internal`** (raw or percent-encoded) is never routed
  publicly — the gateway returns 404. `/internal/*` routes are S2S-only,
  guarded by a constant-time internal-secret check.
- **No pricing, payments, transactions, commission or billing endpoints exist.**
  Monetization is deferred to v0.2; the platform is free to use in v0.1. (Job
  requests carry an optional customer-stated `budget`, but there is no
  transaction ledger, price agreement, or commission anywhere.)

Every service also exposes `GET /healthz` (unauthenticated). The four DB
services (identity, provider, review, job) run it as a readiness probe
(`200 {ok:true,service}` / `503 {ok:false,service,db:"down"}`); gateway, media,
notification and chat return the static `200 {ok:true,service}`.

---

## Public / client API (`/api/*`)

All routes below are reached through the gateway. The **Service** column notes
the upstream that owns the handler.

### Auth & session — identity-service

| Method + path | Auth | Summary |
|---|---|---|
| `POST /api/auth/register` | public | Register a CUSTOMER or PROVIDER (zod discriminated union). PROVIDER also creates the provider profile via S2S (compensating-delete + 502 on failure). Dup email → 409. Sets the session cookie → `{ user, providerId }`. |
| `POST /api/auth/login` | public | bcrypt verify; per-account lockout (5 fails → 15 min); no email enumeration. Sets cookie → `{ user, providerId }`. 400/401 otherwise. Social-only accounts (no password) get the same uniform 401. |
| `GET /api/auth/oauth/google/start` | public | Social login (#398). Sets state + PKCE cookies, 302 → Google consent. Optional `?next=` (same-origin relative). Unconfigured → 302 `/login?error=oauth_unavailable`. |
| `GET /api/auth/oauth/google/callback` | public | Validates state/PKCE + code, reads the verified-email id_token, then: existing linked account → sign in; matching verified email → link + sign in; otherwise create a CUSTOMER (`emailVerified` set) + link. Sets cookie, 302 → `/welcome` (new) or `next`/`/` (returning). Failures → `/login?error=oauth\|oauth_email`. |
| `POST /api/auth/complete-provider` | authenticated | Turns the signed-in CUSTOMER into a PROVIDER: validates the provider profile (registration fields minus account fields), creates the profile via S2S, flips role, bumps `sessionVersion`, re-issues cookie → `{ user, providerId }`. 409 if already a provider. Re-upgrading a previously closed profile reactivates it (clears `suspended`). |
| `POST /api/auth/leave-provider` | authenticated (PROVIDER) | Counterpart to complete-provider (#403): hides the provider profile from listings via S2S (`suspended = true`, reversible — reviews/inquiries/responses kept), flips role → CUSTOMER, bumps `sessionVersion`, re-issues cookie, audit-logs. Profile-hide runs first: if provider-service is down → 502, role unchanged. 409 if not a provider. |
| `POST /api/auth/logout` | public | Clears the session cookie → `{ ok: true }`. |
| `POST /api/auth/logout-all` | authenticated | Bumps `sessionVersion` (revokes every session), re-issues this one → `{ ok: true }`. |
| `POST /api/auth/delete-account` | authenticated | Re-auth with `{ password }` (optional for social-only accounts, which have none — the session is the re-auth); fans out S2S erase to provider/review/job (any failure → 502, nothing deleted), then deletes the User + records `AccountDeletion`. |
| `GET /api/auth/me` | public | `{ user: null }` when signed out, else `{ user: { id, name, email, phone, emailVerified, role, providerId } }`. |
| `PUT /api/account/profile` | authenticated | `{ name, phone }` — edits the caller's own name/phone (phone normalized to E.164) and re-issues the cookie so the cached display name updates. Any role. |
| `POST /api/account/avatar` | authenticated | Multipart profile-photo upload (#434, any role) → media-service `user` namespace (R2 in prod). Sets `User.avatarUrl` and syncs the denormalized copy to the caller's provider profile (if any). jpeg/png/webp ≤5MB → `{ avatarUrl }`. |
| `DELETE /api/account/avatar` | authenticated | Clears the caller's `avatarUrl` (and the provider copy) → `{ ok: true }`. |
| `POST /api/account/email/change` | authenticated | `{ email }` — starts a change-email flow: emails a 1h confirmation link **to the new address**. 400 if it's the current address, 409 if already taken. Does not change the address yet. |
| `POST /api/account/email/confirm` | public | `{ token }` — consumes the change-email token and switches the address (sets `emailVerified`). Session is unaffected (email isn't in the JWT). 409 if the address was taken since the request. |
| `POST /api/auth/change-password` | authenticated | `{ currentPassword, newPassword }`; re-auth, bumps `sessionVersion`, re-issues cookie. |
| `POST /api/auth/verify-email` | public | `{ token }` — marks the email verified. |
| `POST /api/auth/resend-verification` | authenticated | Re-sends the verification email (best-effort). |
| `POST /api/auth/forgot-password` | public | `{ email }` — always `{ ok: true }` (no enumeration); emails a reset link only if the account exists. |
| `POST /api/auth/reset-password` | public | `{ token, password }` — resets the password, consumes the token, bumps `sessionVersion`. |

### Favorites — identity-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/favorites` | authenticated | The caller's favorited provider ids, newest first → `{ providerIds }`. |
| `POST /api/favorites/:id` | authenticated | Favorite a provider (S2S existence check; 404 if unknown, 502 on peer outage) → `{ favorited: true }`. |
| `DELETE /api/favorites/:id` | authenticated | Unfavorite → `{ favorited: false }`. |

### Providers & search — provider-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/categories` | public | Active categories, sorted → `{ categories }`. |
| `GET /api/providers` | public | Directory search. See params below. Returns `{ providers, total, page, pageSize }`. |
| `GET /api/providers/ids` | public | Every non-suspended provider `{ id, updatedAt }` (sitemap) → `{ providers }`. |
| `GET /api/stats` | public | `{ providerCount, reviewCount }` (review count via S2S). |
| `GET /api/providers/:id` | public | Legacy detail: provider + services + photos, contact as `user` (name/email only). Phone numbers are omitted (#64) — the payload carries `hasPhone`/`hasWhatsapp`/`hasPhone2` booleans instead; fetch the digits via `POST /:id/contact`. Suspended → 404 unless caller is ADMIN. |
| `GET /api/providers/:id/full` | public | Full profile payload: services, first 50 photos (`photosTotal`), first page of reviews (`?reviewsTake`≤100, `?reviewsCursor`; `reviewsNextCursor` returned), `avgResponseMs`, `favorited`. Contact as `user` (name/email only) + `hasPhone`/`hasWhatsapp`/`hasPhone2` booleans — raw phone numbers are withheld (#64, see `POST /:id/contact`). Suspended → 404 unless ADMIN. |
| `GET /api/providers/:id/card` | public | OG-image payload (name/category/city/rating/verification). Returns the `suspended` flag rather than 404. |
| `POST /api/providers/:id/contact` | public | Phone-number reveal (#64): returns `{ phone, whatsapp, phone2 }`. The public payloads omit these so crawlers can't harvest them; the web reveals them on an explicit "show number" tap. Rate-limited (`contactReveal`, 20/10 min per IP). Suspended → 404 unless ADMIN. |
| `POST /api/providers/:id/inquiries` | optional session | Send an inquiry `{ name, phone, email?, message, source? }`; emails the provider best-effort → `{ inquiry }`. |

`GET /api/providers` query params (normalized in `lib/query.ts`):

| Param | Meaning |
|---|---|
| `q` | Free text over headline/bio/city/contactName/services (pg_trgm) + Category label match (en/si). |
| `category`, `district` | Exact filters. |
| `sort` | `recommended` (default), `rating`, `reviews`, `price`, `experience`, `newest`. |
| `page` | ≥ 1 (default 1). |
| `pageSize` / `take` | Default 12, capped **24** (`take` is an alias). |
| `priceMin`, `priceMax` | Integer rupees (swapped if min > max). |
| `ratingMin` | Clamped to 1..5; applied in memory after S2S rating hydration. |
| `availableOnly` | `1`/`true` → effective-availability filter (away providers excluded). |
| `ids` | Comma list (≤500) → exactly those non-suspended providers in input order, no paging. |

### Provider dashboard — provider-service

Every route requires a provider owned by the authenticated user (else
`401 Unauthorized`).

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/provider/dashboard` | role: PROVIDER (owner) | Provider + contact + services + photos + inquiries + rating summary + `openJobsCount` (S2S). |
| `PUT /api/provider/profile` | role: PROVIDER (owner) | Update profile (tightened field rules; optional `awayUntil`, #49); category re-checked; syncs name/phone to identity via S2S. |
| `POST /api/provider/services` | role: PROVIDER (owner) | Add a service `{ title, description?, price, priceType }` → `{ service }`. |
| `PUT /api/provider/services/:id` | role: PROVIDER (owner) | Update own service (404 if not owned). |
| `DELETE /api/provider/services/:id` | role: PROVIDER (owner) | Delete own service. |
| `POST /api/provider/photos` | role: PROVIDER (owner) | Multipart upload; `kind=avatar` sets `avatarUrl`, else creates a WorkPhoto. 5 MB, jpeg/png/webp. |
| `PATCH /api/provider/photos/order` | role: PROVIDER (owner) | `{ ids }` → `sortOrder`; ids not owned are ignored. |
| `DELETE /api/provider/photos/:id` | role: PROVIDER (owner) | Hard-delete own photo + remove the file. |
| `GET /api/provider/inquiries` | role: PROVIDER (owner) | Own inquiries with `unreadCount`. |
| `PATCH /api/provider/inquiries/:id` | role: PROVIDER (owner) | `{ status: NEW\|RESPONDED\|CLOSED }`; first move to RESPONDED stamps `respondedAt`. |
| `POST /api/provider/verification` | role: PROVIDER (owner) | Multipart NIC/business docs → status PENDING (400 if already VERIFIED). |

### Inquiries (account history + threads) — provider-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/account/inquiries` | authenticated | The caller's sent inquiries (cap 50) with provider `{ id, name, category, suspended }` + `unreadCount` → `{ inquiries }`. |
| `GET /api/inquiries/:id/messages` | authenticated (thread party) | Thread messages; marks the caller's side read; `?after=<ISO>` for polling. Non-party → id-hiding 404. |
| `POST /api/inquiries/:id/messages` | authenticated (thread party) | Post `{ body }` (1–2000); a provider's first reply flips NEW → RESPONDED. |

### Reviews — review-service (except where noted)

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/providers/:id/reviews` | public | Paginated reviews (`?take` default 10, max 100; `?cursor`) → `{ reviews, nextCursor }`. Suspended/missing provider → 404. |
| `POST /api/providers/:id/reviews` | authenticated | Multipart `rating`/`comment` + up to 3 photos. Hard interaction gate (must have inquired first, else 403); can't review own profile (400); upsert (one review per provider) → `{ ok: true }`. |
| `GET /api/account/reviews` | authenticated | The caller's reviews (cap 50, excludes soft-deleted); provider names hydrated S2S → `{ reviews }`. |
| `DELETE /api/reviews/photos/:id` | authenticated (owner or ADMIN) | Remove a review photo. |

### Favorites, reports & abuse

| Method + path | Auth | Service | Summary |
|---|---|---|---|
| `POST /api/providers/:id/report` | optional session | provider | Report a provider `{ reason, details? }`; signed-in re-report updates the OPEN report → `{ ok: true }`. |
| `POST /api/photos/:id/report` | optional session | provider | Report a work photo (same shape). |
| `POST /api/reviews/:id/report` | optional session | review | Report a review; soft-deleted/missing → 404 → `{ ok: true }`. |

Reasons enum: `spam`, `scam`, `offensive`, `fake`, `other`.

### Jobs — job-service

| Method + path | Auth | Summary |
|---|---|---|
| `POST /api/jobs` | authenticated | Post a job `{ category, district, title, description, budget? }` (category checked S2S) → `{ id }`. |
| `PATCH /api/jobs/:id` | authenticated (owner) | `{ status: OPEN\|CLOSED }`; non-owner → 404. |
| `POST /api/jobs/:id/responses` | authenticated (PROVIDER) | Respond `{ message }`; provider gate + same category/district scope as the board; open + dup checks; emails the customer best-effort → `{ ok: true }`. |
| `GET /api/jobs/board` | authenticated (PROVIDER) | OPEN jobs matching the provider's category+district, excluding own, with customer names + `responded`. Paginated → `{ jobs, total, page, pageSize }`. |
| `GET /api/jobs/mine` | authenticated | Own jobs with responses hydrated with provider `{ name, phone }`. Paginated → `{ jobs, total, page, pageSize }`. |

Board/mine pagination: `page` ≥ 1, `pageSize`/`take` default 20, capped **50**.

### Media / files — media-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/files/:namespace/*` | public (via gateway) | Serve a stored image, streamed from R2 (private bucket) or local disk; long-cache immutable. The gateway only routes the `provider` and `review` namespaces (→ media `/files/*`, supplying the internal secret). Non-image extension / missing → 404. |

Uploads never go here directly — the provider/review services stream bytes to
media over S2S (`/internal/media/store`) and keep the returned URL, which
resolves back through `/api/files/<namespace>/*`.

### Chat assistant — chat-service (via the web app, NOT the gateway)

| Method + path | Auth | Summary |
|---|---|---|
| `POST /agent/chat` | authenticated (web route) | The web app's `src/app/agent/chat/route.ts` proxies to chat-service `POST /internal/chat/marketplace/stream` with the internal secret + forwarded cookie/IP/locale. Streams SSE (`text`/`tool`/`done`/`error`). Returns 503 when the assistant is disabled (`ANTHROPIC_API_KEY` unset). |

This is the one client-facing path that does **not** traverse the gateway (the
gateway buffers responses, which would break streaming). See the internal-API
section for the chat-service endpoint itself.

### Admin API

All admin routes require an admin session; the gateway forwards the role and
each service enforces the tier. **Reads and report resolve/dismiss** gate on
`isSupportOrAdmin` (ADMIN or SUPPORT); **destructive writes** gate on
`isFullAdmin` (ADMIN only). Unauthorized → `403 { error: "Forbidden" }`.

#### Users, impersonation & signups — identity-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/admin/users` | SUPPORT+ | Search by email/name (`?q`, `?page`), newest first, page 20 → `{ users, total, page, pageSize }`. |
| `GET /api/admin/users/:id` | SUPPORT+ | Detail + favorites hydrated with provider names/phones (degrades to null). |
| `PATCH /api/admin/users/:id` | ADMIN | `{ action: lock\|unlock }` and/or `{ role: CUSTOMER\|PROVIDER\|ADMIN }` (SUPPORT assigned out-of-band). Self → 400. |
| `POST /api/admin/users/:id/force-logout` | ADMIN | Bumps `sessionVersion` (self → 400). |
| `POST /api/admin/impersonate/:userId` | ADMIN | `:userId` may be id or email; can't target self or an ADMIN (400); mints a 15-min `impersonation_session` cookie → `{ ok, user, providerId, expiresInSeconds: 900 }`. |
| `POST /api/admin/impersonate/end` | ADMIN | Clears the cookie, closes the open log row → `{ ok: true }`. |
| `GET /api/admin/signups` | SUPPORT+ | Daily CUSTOMER vs PROVIDER signups over 30 days (zero-filled) → `{ series, totals }`. |

#### Providers, verifications, reports, categories & moderation — provider-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/admin/providers` | SUPPORT+ | Moderation list: `q`/`category`/`city`/`status`/`suspended` filters, sort `newest`\|`mostReviews`, paginated (default 20, cap 100) → `{ providers, total, page, pageSize }`. |
| `GET /api/admin/providers/:id` | SUPPORT+ | Detail + photos + reviews (incl. soft-deleted) + `quality` score (#229, computed live). |
| `GET /api/admin/verifications` | SUPPORT+ | PENDING queue + docs, oldest first, paginated (default 20, cap 100) → `{ providers, total, page, pageSize }`. |
| `PATCH /api/admin/providers/:id` | ADMIN | `{ action: verify\|unverify\|suspend\|unsuspend }`. |
| `PATCH /api/admin/providers` | ADMIN | Bulk suspend/unsuspend `{ ids, suspended }` → `{ ok, count }`. |
| `PATCH /api/admin/verifications/:id` | ADMIN | `{ action: approve\|reject, reason? }` → `{ status }`. |
| `PATCH /api/admin/verifications` | ADMIN | Bulk approve/reject `{ ids, action, reason? }` (only PENDING touched) → `{ status, count }`. |
| `DELETE /api/admin/photos/:id` | ADMIN | Soft-delete a work photo. |
| `PATCH /api/admin/photos/:id/restore` | ADMIN | Restore a soft-deleted photo. |
| `GET /api/admin/reports` | SUPPORT+ | Provider/work-photo report queue (OPEN first), `status`/`targetType` filters, paginated (default 20, cap 100) → `{ reports, total, page, pageSize }` with hydrated target. |
| `PATCH /api/admin/reports/:id` | SUPPORT+ | `{ status: RESOLVED\|DISMISSED }` (stamps `resolvedBy`/`resolvedAt`). |
| `PATCH /api/admin/reports` | SUPPORT+ | Bulk resolve/dismiss `{ ids, status }` → `{ ok, count }`. |
| `GET /api/admin/notifications/counts` | SUPPORT+ | `{ pendingVerifications, openReports }` (nav badges). |
| `GET /api/admin/stats` | SUPPORT+ | Provider active/suspended totals, pendingVerifications, openReports (provider half), category distribution. |
| `GET /api/admin/categories` | SUPPORT+ | Every category, inactive included. |
| `POST /api/admin/categories` | ADMIN | Create `{ slug (^[a-z0-9-]{2,40}$), labelEn, labelSi, icon?, imageUrl?, active?, sortOrder? }` (409 on dup). `imageUrl` is a relative media path (#436). |
| `PATCH /api/admin/categories/:slug` | ADMIN | Update labels/icon/`imageUrl`/active/sortOrder (no hard delete — deactivate). |
| `POST /api/admin/categories/image` | ADMIN | Multipart cover upload (#436) → media-service `category` namespace (R2 in prod); returns `{ url }` to save via create/patch. jpeg/png/webp, 5MB. |
| `GET /api/admin/audit-log` | SUPPORT+ | Moderation history, `adminId`/`action`/`from`/`to` filters, newest first, take 200. |
| `POST /api/admin/flagging/run` | ADMIN | Auto-flagging sweep (#232): opens a deduped SYSTEM report for each active provider with quality < 40 or ≥ 3 open USER reports → `{ flagged }`. |

#### Reviews & review reports — review-service

| Method + path | Auth | Summary |
|---|---|---|
| `DELETE /api/admin/reviews/:id` | ADMIN | Soft-delete a review (audited). |
| `PATCH /api/admin/reviews/:id/restore` | ADMIN | Restore a soft-deleted review (audited). |
| `GET /api/admin/review-reports` | SUPPORT+ | Review report queue (same shape as provider reports), `status`/`targetType` filters, paginated (default 20, cap 100) → `{ reports, total, page, pageSize }`. |
| `GET /api/admin/review-reports/count` | SUPPORT+ | `{ openReports }` (nav badge; summed with provider counts client-side). |
| `PATCH /api/admin/review-reports/:id` | SUPPORT+ | `{ status: RESOLVED\|DISMISSED }` (stamps `resolvedBy`/`resolvedAt`, audited). |
| `PATCH /api/admin/review-reports` | SUPPORT+ | Bulk resolve/dismiss `{ ids, status }` → `{ ok, count }`. |
| `GET /api/admin/review-audit-log` | SUPPORT+ | This service's moderation log (filters + take 200; merged with provider's in the UI). |
| `GET /api/admin/review-stats` | SUPPORT+ | `{ openReports }` (review half of the dashboard metric). |

#### Jobs oversight — job-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/admin/jobs` | SUPPORT+ | Jobs list (`?status`, `?category`), newest first, customer name + response count → `{ jobs }` (not paginated). |
| `GET /api/admin/jobs/:id` | SUPPORT+ | Job + responses with customer/provider contact hydrated. |

---

## Internal S2S API (`/internal/*`)

These routes are **never exposed publicly** — the gateway refuses to forward any
path containing `/internal` (raw or percent-encoded), and each service rejects a
request without the correct `x-internal-secret` (constant-time compare) with
`403 { error: "Forbidden" }`. Peers call them via each other's `*_SERVICE_URL`
using the shared `s2s()` helper (one bounded retry on idempotent GETs).

### identity-service

| Method + path | Purpose |
|---|---|
| `GET /internal/users?ids=a,b,c` | Batch name/email hydration (≤500 ids). |
| `GET /internal/users/:id/session-version` | Gateway revocation check → `{ v: number \| null }`. |
| `GET /internal/users/count` | Total user count. |
| `PATCH /internal/users/:id` | Profile sync `{ name?, phone? }` from provider-service. |

### provider-service

| Method + path | Purpose |
|---|---|
| `GET /internal/categories` | Full category list (incl. inactive) for peers' validation caches. |
| `POST /internal/providers` | Registration orchestration (called by identity); idempotent on the unique userId → `{ id }`. |
| `GET /internal/providers/by-user/:userId` | Provider owned by a user (login / job-board gate). |
| `GET /internal/providers?ids=` | Batch provider hydration (≤500). |
| `GET /internal/inquiries/exists?providerId=&userId=` | Review gate — has this user inquired with this provider? → `{ exists }`. |
| `GET /internal/providers/:id/summary` | Existence/suspended check (favorites, reviews) — always 200. |
| `POST /internal/users/:id/erase` | Account-deletion fan-out: delete the user's provider + files + sent inquiries. Idempotent. |
| `POST /internal/maintenance/sweep-orphans` | Remove stored files no row references (ops tooling). |

### review-service

| Method + path | Purpose |
|---|---|
| `GET /internal/ratings?providerIds=a,b,c` | Batch rating summaries → `{ ratings }`. |
| `GET /internal/by-provider/:id?take&cursor&includeDeleted` | Reviews for one provider (cursor-paginated) → `{ reviews, nextCursor }`. |
| `GET /internal/count` | Total (non-deleted) review count. |
| `POST /internal/users/:id/erase` | Account-deletion fan-out: delete the user's reviews + photo files. Idempotent. |
| `POST /internal/maintenance/sweep-orphans` | Remove orphaned review-photo files (ops tooling). |

### job-service

| Method + path | Purpose |
|---|---|
| `GET /internal/jobs/count?category&district&excludeCustomerId` | Open-jobs count for the provider dashboard. |
| `POST /internal/users/:id/erase` | Account-deletion fan-out: delete the user's JobRequests, plus JobResponses when `{ providerId }` is passed. Idempotent. |

### notification-service

All return `{ ok, delivered }` (`delivered:false` when `RESEND_API_KEY` is
unset — console fallback). Bodies carry `{ to, url, locale, ... }`.

| Method + path | Purpose |
|---|---|
| `POST /internal/email/verify` | Email-verification message. |
| `POST /internal/email/password-reset` | Password-reset message. |
| `POST /internal/email/inquiry` | New-inquiry notification (`customerName`). |
| `POST /internal/email/job-response` | Job-response notification (`providerName`, `jobTitle`). |

### media-service

| Method + path | Purpose |
|---|---|
| `POST /internal/media/store` | Multipart `{ namespace, prefix, file }` — sharp re-encode + EXIF strip, store → `{ url }`. 413 over 5 MB, 400 for a non-image. |
| `POST /internal/media/delete` | `{ url }` — best-effort delete, always `{ ok: true }`. |
| `POST /internal/media/sweep` | `{ namespace, referenced[], graceMs? }` — remove unreferenced files (24 h grace). |

### chat-service

| Method + path | Purpose |
|---|---|
| `POST /internal/chat/:persona/stream` | Streaming Claude tool loop (SSE). Persona `marketplace` today; tools `search_providers` + `create_inquiry` (call the gateway). 503 without `ANTHROPIC_API_KEY`, 404 for an unknown persona, 413 over 256 KB, 400 on empty history. Reached via the web `/agent/chat` proxy. |

---

## Conventions

- **Error shape:** every error is `{ "error": string }`. Success shapes are
  per-endpoint (documented above).
- **Status codes:** `400` invalid input, `401` unauthenticated, `403` forbidden
  (wrong role, failed CSRF, or missing internal secret), `404` not found
  (also used to hide existence — suspended providers, non-party inquiry threads),
  `409` conflict (duplicate email / category slug), `413` payload too large
  (> 6 MB at the gateway, > 5 MB at media), `429` rate limited (with
  `Retry-After`), `500` unhandled, `502` an upstream/S2S dependency was
  unavailable on a write path, `503` DB-service readiness failure / assistant
  disabled.
- **Locale:** the gateway sets `x-locale` (`en`|`si`) from the `lang` cookie;
  services localize emails and assistant replies from it. The web proxy is the
  trust boundary — a client-sent locale header can't reach the app.
- **Uploads** are multipart to the owning service (provider/review), which
  streams bytes to media-service over S2S; images are re-encoded with sharp,
  EXIF-stripped, limited to 5 MB and jpeg/png/webp. Stored URLs resolve back
  through `GET /api/files/<namespace>/*`.
- **Pagination:** list endpoints that page return `{ <items>, total, page,
  pageSize }`. Caps: public provider directory `pageSize` ≤ 24 (default 12);
  admin lists ≤ 100 (default 20); job board/mine ≤ 50 (default 20). Public
  reviews use cursor pagination (`take` ≤ 100, `cursor`/`nextCursor`).
