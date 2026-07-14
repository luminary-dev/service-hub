# Internal S2S API (`/internal/*`)


These routes are **never exposed publicly** — the gateway refuses to forward any
path containing `/internal` (raw or percent-encoded; it decodes until the path
stops changing, so double-/multi-encoded attempts are caught too, and treats
malformed encoding as not-forwardable), and each service rejects a
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
| `GET /internal/saved-searches/candidates?category=&districts=a,b&excludeUserId=` | Saved-search alert feed (#516): the searches a newly published provider could match, joined with the owner's email → `{ savedSearches: [{ id, query, locale, email }] }`. `districts` is the provider's full served set (#502 multi-district), so a search for any served district qualifies; a null filter on a search means "any". Only current CUSTOMER accounts with a verified email, cooled down ≥24 h since `lastNotifiedAt`; capped at 500 (oldest first). Free-text `query` is returned unevaluated — provider-service decides the actual match. |
| `POST /internal/saved-searches/notified` | Cooldown bookkeeping (#516): `{ ids[] (≤500) }` — stamps `lastNotifiedAt` on the searches whose owners were just emailed. |
| `POST /internal/maintenance/sweep-orphans` | Remove orphaned `user`-namespace avatar files (#555, ops tooling). |

### provider-service

| Method + path | Purpose |
|---|---|
| `GET /internal/categories` | Full category list (incl. inactive) for peers' validation caches. |
| `POST /internal/providers` | Registration orchestration (called by identity); optional `serviceDistricts` served set (#502) is deduped with the primary `district` pinned first, defaulting to `[district]`; optional `latitude`/`longitude` map pin (#48 — both or neither, Sri Lanka bounding box re-checked, else 400); idempotent on the unique userId → `{ id }`. A fresh create also fires the saved-search alert fan-out (#516) after responding — fetch matching candidates from identity (scoped to the full served set), evaluate free-text queries with `buildBrowseWhere` pinned to the new row, batch per-locale to notification, stamp the cooldown. Best-effort, never on the idempotent duplicate path. |
| `GET /internal/providers/by-user/:userId` | Provider owned by a user (login / job-board gate) — includes the `serviceDistricts` served set (#502). |
| `GET /internal/providers/matching?category&district&excludeUserId?` | Lead-gen fan-out (#501): non-suspended providers whose `category` matches and whose `serviceDistricts` set contains the district (#502) — capped at 200, deduped by contact email → `{ providers }`. |
| `POST /internal/providers/by-user/:userId/deactivate` | Self-downgrade (#403, called by identity `leave-provider`): hide the user's provider profile (`suspended = true`; `adminSuspended` untouched, so an active ADMIN suspension survives, #550). Idempotent. |
| `POST /internal/providers/by-user/:userId/reactivate` | Re-upgrade (#403, called by identity `complete-provider` and the admin CUSTOMER→PROVIDER promotion): clear `suspended`. Refuses an ADMIN suspension with 409 (#550) — only the admin unsuspend action clears `adminSuspended`. Idempotent otherwise — answers `{ reactivated: false }` when no profile exists, which the admin promotion treats as a 400 (#554). |
| `POST /internal/providers/avatar` | Denormalized avatar sync from identity (#434), `{ userId, avatarUrl }` — updates the provider's cached `avatarUrl`. No-op if the user has no provider. |
| `POST /internal/providers/contact` | Denormalized contact sync from identity (#553), `{ userId, name?, email?, phone? }` — mirrors account name/phone edits and email changes onto the cached `contactName`/`contactEmail`/`contactPhone`. Only provided fields are written; no-op if the user has no provider. |
| `GET /internal/providers?ids=` | Batch provider hydration (≤500). |
| `GET /internal/providers/cards?ids=` | Batched public **card DTO** hydration (≤500) for search-service's query plane (search RFC §4.1) — the same card shape browse builds (cover fallback, services, photos), rating fields zeroed (search-service overlays its own aggregates). Suspended providers excluded. Order not meaningful. |
| `GET /internal/providers/export?cursor=&take=` | Reindex export for search-service's sweep (search RFC §4.2): every **non-suspended** provider as a full index document (the exact shape the push path PUTs), id-cursor paginated (`take` default 100, max 500) → `{ providers, nextCursor }`. No contact PII beyond the display name. |
| `GET /internal/inquiries/exists?providerId=&userId=` | Review gate — has this user inquired with this provider? → `{ exists }`. |
| `GET /internal/providers/:id/summary` | Existence/suspended check (favorites, reviews) — always 200. |
| `POST /internal/users/:id/erase` | Account-deletion fan-out: delete the user's provider + files + sent inquiries. Idempotent. |
| `POST /internal/maintenance/sweep-orphans` | Remove stored files no row references, in the `provider` **and** `category` namespaces (#555, ops tooling). |

### review-service

| Method + path | Purpose |
|---|---|
| `GET /internal/ratings?providerIds=a,b,c` | Batch rating summaries → `{ ratings }`. Each entry: `{ rating, count }` (authoritative for ranking) plus the additive per-dimension averages and 5→1 star `distribution` (#528) — existing consumers keep reading `rating`/`count`. Also the ratings feed for search-service's reindex sweep. |
| `GET /internal/by-provider/:id?take&cursor&includeDeleted` | Reviews for one provider (cursor-paginated) → `{ reviews, nextCursor }`. Each review carries the provider's reply as `response` (#395), threaded through provider-service's `/full` composition unchanged. |
| `GET /internal/count` | Total (non-deleted) review count. |
| `POST /internal/users/:id/erase` | Account-deletion fan-out: delete the user's reviews + photo files. Idempotent. |
| `POST /internal/maintenance/sweep-orphans` | Remove orphaned review-photo files (ops tooling). |

### search-service

The derived provider-search index (search & discovery RFC). Ingestion is
push-based and best-effort: provider-service PUTs full documents fire-and-forget
from every indexed write, review-service POSTs rating patches; the reindex
sweep self-heals drift (run daily from ops tooling, like the sweep-orphans
endpoints). Suspended/erased providers are **deleted** from the index.

| Method + path | Purpose |
|---|---|
| `PUT /internal/search/providers/:id` | Full-document upsert (idempotent; last-write-wins on the source row's `updatedAt`, so replayed/out-of-order pushes never regress the index). Body = the document `provider-service/src/lib/search-index.ts` builds. Rating fields are never touched by this route. |
| `DELETE /internal/search/providers/:id` | Remove a provider from the index (suspend / self-deactivate / erase). Idempotent. |
| `POST /internal/search/ratings` | `{ providerId, ratingAvg, ratingCount }` rating-aggregate patch from review-service. No-op when the provider isn't indexed yet; a 0 count nulls the stored average. |
| `POST /internal/search/reindex` | Full sweep: walks provider-service's `/internal/providers/export`, upserts everything, refreshes ratings via review-service's `/internal/ratings`, deletes index rows absent from the export → `{ indexed, skipped, deleted }`. Fails loudly (502) on a peer outage — an outage is never mistaken for an empty source. |
| `GET /internal/search/stats` | `{ indexed, pinned }` — drift metric for the ops runbook (compare `indexed` against provider-service's non-suspended count). |

### job-service

| Method + path | Purpose |
|---|---|
| `GET /internal/jobs/count?category&districts&excludeCustomerId` | Open-jobs count for the provider dashboard. `districts` is the provider's comma-separated served set (#502, jobs in ANY count); the legacy single `district` param is still honored. |
| `POST /internal/users/:id/erase` | Account-deletion fan-out: delete the user's JobRequests, plus JobResponses when `{ providerId }` is passed. Idempotent. Identity erases this service before provider-service (#551), so the erase always receives the `providerId` while the Provider row (its only source) still exists. |

### notification-service

Single-recipient sends return `{ ok, delivered }` (`delivered:false` when
`RESEND_API_KEY` is unset — console fallback). Bodies carry
`{ to, url, locale, ... }`.

| Method + path | Purpose |
|---|---|
| `POST /internal/email/verify` | Email-verification message. |
| `POST /internal/email/password-reset` | Password-reset message. |
| `POST /internal/email/change-email` | Change-email confirmation message (#396), sent to the new address. |
| `POST /internal/email/account-exists` | "Account already exists" notice (#373/#498), sent to the real owner when a registration reuses their email. |
| `POST /internal/email/email-change-attempt` | "Someone tried to move an account to your email" notice (#503), sent to the real owner when a change-email targets their (taken) address. |
| `POST /internal/email/inquiry` | New-inquiry notification (`customerName`). |
| `POST /internal/email/job-response` | Job-response notification (`providerName`, `jobTitle`). |
| `POST /internal/email/new-job` | New-matching-job fan-out (#501): `{ recipients[] (≤200), url, jobTitle, district, locale? }`. Acks `202 { ok, accepted }` immediately and sends in the background (#557); the delivered count is logged, not returned. |
| `POST /internal/email/new-provider-match` | Saved-search new-match fan-out (#516): `{ recipients[] (≤200), url, providerName, district, locale? }`. Same accept-and-return contract as `/new-job`. |

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

