# provider-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/provider-service`](https://github.com/luminary-dev/service-hub/tree/main/services/provider-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Owns the provider directory for Service Hub (Baas.lk): provider profiles,
services, work photos, verification documents, customer inquiries + message
threads, abuse reports, the managed service-category list, and a moderation
audit log — backed by its own `provider_db` Postgres database. `Provider.userId`
is a plain string reference to identity-service (no cross-service FKs); contact
fields (`contactName` / `contactEmail` / `contactPhone`) are denormalized at
registration and synced back to identity on profile updates. Ratings/reviews
(review-service), email-verification state (identity), open-jobs counts (job)
and image bytes (media) are hydrated over S2S HTTP at read time and degrade
gracefully.

Runs on **:4002** behind the api-gateway — never public; every request except
`/healthz` carries `x-internal-secret`. Identity arrives via `x-user-id` /
`x-user-role` / `x-user-name`. See [ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Endpoints

### Public directory (via gateway)

| Method | Path | Description |
|---|---|---|
| GET | `/api/categories` | Active categories (slug, labels, icon) for filters/forms. |
| GET | `/api/providers` | Directory listing: `q`, `category`, `district`, `sort`, `page`, `pageSize`, `take`, `priceMin/Max`, `ratingMin`, `availableOnly`, `ids` (input order). |
| GET | `/api/providers/ids` | `{ id, updatedAt }` for every non-suspended provider (sitemap). |
| GET | `/api/providers/:id` | Legacy detail (provider + services + photos + contact as `user`); suspended → 404 unless admin. |
| GET | `/api/providers/:id/full` | Full profile-page payload incl. paginated reviews and `avgResponseMs`. |
| GET | `/api/providers/:id/card` | OG-image payload (name, category, location, rating, verification). |
| POST | `/api/providers/:id/inquiries` | Create an inquiry (optional session; best-effort NEW_INQUIRY notification to the provider). |
| POST | `/api/providers/:id/contact` | Tap-to-reveal phone/WhatsApp (#64) — numbers are withheld from the public payloads. |
| GET | `/api/stats` | `{ providerCount, reviewCount }`. |

### Provider dashboard (require a PROVIDER session owning a provider, else 401)

| Method | Path | Description |
|---|---|---|
| GET | `/api/provider/dashboard` | Profile + services + photos + inquiries + rating summary + open-jobs count. |
| PUT | `/api/provider/profile` | Update profile (validates category; away-mode `awayUntil`; syncs name/phone to identity). |
| POST / PUT / DELETE | `/api/provider/services`, `/api/provider/services/:id` | Manage own service offerings. |
| POST | `/api/provider/photos` | Multipart `file`, `caption`, `kind`; `kind=avatar` sets the avatar. |
| PATCH | `/api/provider/photos/order` | Reorder the gallery. |
| DELETE | `/api/provider/photos/:id` | Hard-delete own photo + remove the stored file. |
| DELETE | `/api/provider/cover` | Remove the profile cover image. |
| GET / PATCH | `/api/provider/inquiries`, `/api/provider/inquiries/:id` | Own inquiries + set status `NEW`\|`RESPONDED`\|`CLOSED`. |
| POST | `/api/provider/verification` | Submit NIC / BUSINESS documents (→ PENDING). |

### Customer inquiry history / threads (session required; thread access = the inquiry's customer or provider)

| Method | Path | Description |
|---|---|---|
| GET | `/api/account/inquiries` | The signed-in user's sent inquiries with unread counts. |
| GET | `/api/inquiries/:id/messages` | Fetch a thread (`?after=` for polling); marks the caller's side read. |
| POST | `/api/inquiries/:id/messages` | Post a message; a provider's first reply flips NEW → RESPONDED. |

### Public abuse reporting (session optional)

| Method | Path | Description |
|---|---|---|
| POST | `/api/providers/:id/report` | Report a provider (`spam`\|`scam`\|`offensive`\|`fake`\|`other`). |
| POST | `/api/photos/:id/report` | Report a work photo. |
| POST | `/api/messages/:id/report` | Report an inquiry-thread message (#376 — session required, thread parties only). |

### Admin moderation (reads + report resolve/dismiss require SUPPORT or ADMIN via `isSupportOrAdmin`; destructive writes require full ADMIN via `isFullAdmin`; else 403)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/providers`, `/api/admin/providers/:id` | Moderation list (filters + sort) / detail with a 0–100 `quality` score. |
| PATCH | `/api/admin/providers/:id` | Single `verify`\|`unverify`\|`suspend`\|`unsuspend`. |
| PATCH | `/api/admin/providers` | Bulk suspend/unsuspend (`ids` ≤ 200). |
| GET | `/api/admin/verifications` | Pending verification queue with documents. |
| PATCH | `/api/admin/verifications/:id` | Approve / reject (reject stores a reason). |
| PATCH | `/api/admin/verifications` | Bulk approve / reject. |
| DELETE | `/api/admin/photos/:id` | Soft-delete a work photo. |
| PATCH | `/api/admin/photos/:id/restore` | Restore a soft-deleted photo. |
| DELETE | `/api/admin/messages/:id` | Soft-delete a reported thread message (takedown, #376). |
| PATCH | `/api/admin/messages/:id/restore` | Restore a soft-deleted message. |
| GET | `/api/admin/reports` | Abuse-report queue (open first) with hydrated targets. |
| PATCH | `/api/admin/reports/:id`, `/api/admin/reports` | Resolve / dismiss single or bulk (records resolver + timestamp). |
| GET | `/api/admin/categories` | Full category list (inactive included). |
| POST / PATCH | `/api/admin/categories`, `/api/admin/categories/:slug` | Create / edit a category (deactivate via `active=false`; no hard delete). |
| POST | `/api/admin/categories/image` | Upload a category cover image (#436). |
| GET | `/api/admin/notifications/counts` | `{ pendingVerifications, openReports }` for nav badges. |
| GET | `/api/admin/stats` | Dashboard analytics (active/suspended/total, pending, open reports, category distribution). |
| GET | `/api/admin/audit-log` | Read-only moderation history (filter by `adminId`, `action`, date range). |
| POST | `/api/admin/flagging/run` | Full ADMIN only. Auto-flagging sweep (#232): flags active providers with quality score `< 40` or `>= 3` open `USER` reports, opening a deduplicated `SYSTEM` report for each → `{ flagged }`. |

Every admin write appends an `AdminAuditLog` row. Auto-flagging (#232) is
implemented: `POST /api/admin/flagging/run` opens `SYSTEM`-sourced reports for
low-quality / heavily-reported providers (the `RunFlaggingButton` triggers it,
shown only to full admins); other reports are `USER`-sourced.

### Internal (S2S only; never routed by the gateway)

| Method | Path | Description |
|---|---|---|
| GET | `/internal/categories` | Category list for siblings' validation caches. |
| POST | `/internal/providers` | Registration orchestration (idempotent on `userId`) → `{ id }`. A fresh create also fires the best-effort saved-search alert fan-out (#516, `src/lib/saved-search-alerts.ts`) after responding. |
| GET | `/internal/providers/by-user/:userId` | The provider owned by a user (login / job-board gate). |
| POST | `/internal/providers/by-user/:userId/deactivate` / `reactivate` | Role-switch support (leave-provider / complete-provider, #403; admin suspensions are never self-lifted). |
| POST | `/internal/providers/avatar` / `/internal/providers/contact` | Identity-driven syncs: avatar and denormalized contact columns (#553/#582). |
| GET | `/internal/providers/matching?category&district&excludeUserId?` | Matching providers (`userId` + contact email) for the new-job fan-out (#501); mirrors the board scoping, capped ≤ 200, deduped. |
| GET | `/internal/providers?ids=` | Batch hydration (≤ 500). |
| GET | `/internal/providers/cards` / `/internal/providers/export` | search-service support (#48): batched card hydration for its query plane / the id-cursor index export its reindex sweep walks. |
| GET | `/internal/providers/:id/summary` | Existence / suspended check (+ `userId`/`contactEmail` for the NEW_REVIEW notification). |
| GET | `/internal/inquiries/exists?providerId&userId` | Review-gating check. |
| POST | `/internal/users/:id/erase` | Account-deletion fan-out (deletes provider + files + sent inquiries). |
| POST | `/internal/maintenance/sweep-orphans` | Remove stored files with no DB reference (via media). |

`GET /healthz` → `{ ok: true, service: "provider-service" }` (no secret; checks Postgres).

## Data ownership (`prisma/schema.prisma`)

- **Category** — managed service categories (slug PK, EN/SI labels, icon, active, sortOrder). Canonical; siblings read via `/internal/categories`.
- **Provider** — the profile (userId ref, denormalized contact, category/bio/district/city/socials/avatar, bilingual `headlineSi`/`bioSi` (#515), the multi-district `serviceDistricts` service area (#502), an optional `latitude`/`longitude` map pin (#48), `available` + `awayUntil`, `suspended` + `adminSuspended`, `verificationStatus`).
- **VerificationDocument** — uploaded NIC / BUSINESS docs (admin-only).
- **Service** — a provider's offering (title, price, priceType).
- **WorkPhoto** — gallery photo (url, caption, `sortOrder`, `deletedAt` soft-delete).
- **Report** — abuse report on a PROVIDER, WORK_PHOTO, INQUIRY (content-filter `SYSTEM` flags) or MESSAGE (#376) (reason, status, `source`, resolver audit fields).
- **Inquiry** — customer inquiry (nullable userId for anonymous, status, `respondedAt`, per-side read markers).
- **InquiryMessage** — one message in a thread (`sender` CUSTOMER\|PROVIDER, `deletedAt` admin-takedown soft-delete, #376).
- **AdminAuditLog** — one row per admin moderation write.

## Key features

Trigram-backed search/directory (`lib/search.ts`) with **multi-district
service areas** (#502) and an optional **geo map pin** (#48) — every indexed
write is also pushed best-effort to search-service (`lib/search-index.ts`) —
an admin **quality score**
(rating minus report penalty, `lib/quality-score.ts`), auto-expiring **away
mode** (`lib/availability.ts`), average **response time** on profiles
(`lib/response-time.ts`), polling inquiry **message threads** with read markers,
and the full admin moderation surface (single + bulk).

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4002` | listen port |
| `DATABASE_URL` | — | Postgres (`provider_db`) |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | S2S auth |
| `WEB_ORIGIN` | `http://localhost:3000` | email-link fallback (overridable via `x-origin`) |
| `IDENTITY_SERVICE_URL` | `http://localhost:4001` | profile sync, emailVerified |
| `REVIEW_SERVICE_URL` | `http://localhost:4003` | ratings, reviews, counts |
| `JOB_SERVICE_URL` | `http://localhost:4004` | dashboard open-jobs badge |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:4005` | notification events (inquiry, thread reply, verification, saved-search match, report resolution) |
| `MEDIA_SERVICE_URL` | `http://localhost:4006` | image upload / serve / sweep (S2S) |
| `SEARCH_SERVICE_URL` | `http://localhost:4008` | best-effort index pushes on every indexed write (`lib/search-index.ts`, #48) |

## Run

```bash
cp .env.example .env
npm install
npm run db:push     # create tables in provider_db
npm run db:seed     # demo providers with deterministic IDs
npm run dev         # tsx watch on :4002
```

`npm run typecheck`, `npm test` (vitest) and `npm run build` mirror CI.
Docker: `docker build -t provider-service .` (runs migrations on start).
