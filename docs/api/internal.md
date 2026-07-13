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

### provider-service

| Method + path | Purpose |
|---|---|
| `GET /internal/categories` | Full category list (incl. inactive) for peers' validation caches. |
| `POST /internal/providers` | Registration orchestration (called by identity); idempotent on the unique userId → `{ id }`. |
| `GET /internal/providers/by-user/:userId` | Provider owned by a user (login / job-board gate). |
| `POST /internal/providers/by-user/:userId/deactivate` | Self-downgrade (#403, called by identity `leave-provider`): hide the user's provider profile (`suspended = true`). Idempotent. |
| `POST /internal/providers/by-user/:userId/reactivate` | Re-upgrade (#403, called by identity `complete-provider` when a hidden profile exists): clear `suspended`. Idempotent. |
| `POST /internal/providers/avatar` | Denormalized avatar sync from identity (#434), `{ userId, avatarUrl }` — updates the provider's cached `avatarUrl`. No-op if the user has no provider. |
| `GET /internal/providers?ids=` | Batch provider hydration (≤500). |
| `GET /internal/inquiries/exists?providerId=&userId=` | Review gate — has this user inquired with this provider? → `{ exists }`. |
| `GET /internal/providers/:id/summary` | Existence/suspended check (favorites, reviews) — always 200. |
| `POST /internal/users/:id/erase` | Account-deletion fan-out: delete the user's provider + files + sent inquiries. Idempotent. |
| `POST /internal/maintenance/sweep-orphans` | Remove stored files no row references (ops tooling). |

### review-service

| Method + path | Purpose |
|---|---|
| `GET /internal/ratings?providerIds=a,b,c` | Batch rating summaries → `{ ratings }`. Each entry: `{ rating, count }` (authoritative for ranking) plus the additive per-dimension averages and 5→1 star `distribution` (#528) — existing consumers keep reading `rating`/`count`. |
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
| `POST /internal/email/change-email` | Change-email confirmation message (#396), sent to the new address. |
| `POST /internal/email/account-exists` | "Account already exists" notice (#373/#498), sent to the real owner when a registration reuses their email. |
| `POST /internal/email/email-change-attempt` | "Someone tried to move an account to your email" notice (#503), sent to the real owner when a change-email targets their (taken) address. |
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

