# Public / client API (`/api/*`)


All routes below are reached through the gateway. The **Service** column notes
the upstream that owns the handler.

### Auth & session — identity-service

| Method + path | Auth | Summary |
|---|---|---|
| `POST /api/auth/register` | public | Register a CUSTOMER or PROVIDER (zod discriminated union). PROVIDER also creates the provider profile via S2S (on failure it compensates by erasing any committed-but-unacknowledged provider row + deleting the user, then 502). A **new** email creates the account, sets the session cookie, and sends a verification email → `{ user, providerId }`. A **duplicate** email is not rejected (no 409, #373): the endpoint returns the same generic `200 { ok: true }` (no session) and instead emails the real owner an "account already exists" notice out-of-band, so registration cannot be used to enumerate accounts. |
| `POST /api/auth/login` | public | bcrypt verify; per-account lockout (5 fails → 15 min); no email enumeration. Sets cookie → `{ user, providerId }`. 400/401 otherwise. Social-only accounts (no password) get the same uniform 401. |
| `GET /api/auth/oauth/:provider/start` | public | Social login (#398); `:provider` ∈ `google`, `facebook`. Sets state (+ PKCE) cookies, 302 → provider consent. Optional `?next=` (same-origin relative). Unknown/unconfigured provider → 302 `/login?error=oauth_unavailable`. |
| `GET /api/auth/oauth/:provider/callback` | public | Validates state (+ PKCE) + code, reads the provider identity (Google: id_token; Facebook: Graph API), then: existing linked account → sign in; matching verified email → link + sign in; new verified email → create a CUSTOMER (`emailVerified` set) + link; no email (some Facebook accounts) → create a CUSTOMER keyed on the provider id with a non-deliverable placeholder email (never auto-linked). Sets cookie, 302 → `/welcome` (new) or `next`/`/` (returning). Failures → `/login?error=oauth`. |
| `POST /api/auth/complete-provider` | authenticated | Turns the signed-in CUSTOMER into a PROVIDER: validates the provider profile (registration fields minus account fields), creates the profile via S2S, flips role, bumps `sessionVersion`, re-issues cookie → `{ user, providerId }`. 409 if already a provider. Re-upgrading a previously closed profile reactivates it (clears `suspended`). |
| `POST /api/auth/leave-provider` | authenticated (PROVIDER) | Counterpart to complete-provider (#403): hides the provider profile from listings via S2S (`suspended = true`, reversible — reviews/inquiries/responses kept), flips role → CUSTOMER, bumps `sessionVersion`, re-issues cookie, audit-logs. Profile-hide runs first: if provider-service is down → 502, role unchanged. 409 if not a provider. |
| `POST /api/auth/logout` | public | Clears the session cookie → `{ ok: true }`. |
| `POST /api/auth/logout-all` | authenticated | Bumps `sessionVersion` (revokes every session), re-issues this one → `{ ok: true }`. |
| `POST /api/auth/delete-account` | authenticated | Re-auth with `{ password }` (optional for social-only accounts, which have none — the session is the re-auth); resolves the user's `providerId` (fail-loud, so the job erase always receives it and deletes their JobResponses/PII), fans out S2S erase to review + job first and provider **last** (#551 — the provider erase deletes the Provider row the `providerId` lookup depends on, so it must not commit before the job erase succeeds or a retry would strand the JobResponses; any failure — including the `providerId` lookup — → 502 and the retry can finish), then deletes the User + records `AccountDeletion`. |
| `GET /api/auth/me` | public | `{ user: null }` when signed out, else `{ user: { id, name, email, phone, emailVerified, role, avatarUrl, providerId } }`. |
| `PUT /api/account/profile` | authenticated | `{ name, phone }` — edits the caller's own name/phone (phone normalized to E.164) and re-issues the cookie so the cached display name updates. Any role. |
| `POST /api/account/avatar` | authenticated | Multipart profile-photo upload (#434, any role) → media-service `user` namespace (R2 in prod). Sets `User.avatarUrl`, syncs the denormalized copy to the caller's provider profile (if any), and re-issues the session cookie so the top-nav avatar updates without a re-login. jpeg/png/webp ≤5MB → `{ avatarUrl }`. |
| `DELETE /api/account/avatar` | authenticated | Clears the caller's `avatarUrl` (and the provider copy) and re-issues the session cookie → `{ ok: true }`. |
| `POST /api/account/email/change` | authenticated | `{ email, password? }` — starts a change-email flow: the address is normalized (trimmed + lowercased, like register/login) so the taken-check and the stored value match, then emails a 1h confirmation link **to the new address**. Accounts with a password must re-authenticate (`password`, #504) — the same sensitive-op guard delete-account/change-password use; social-only accounts (no password) change on the session alone. 400 if it's the current address or the password is wrong. A **taken** target is **not** rejected with a 409 (#503, anti-enumeration): the endpoint returns the same generic `200 { ok: true }` and instead emails the real owner a "someone tried to move an account to your email" notice out-of-band, so a signed-in caller can't probe which addresses have accounts. Does not change the address yet. |
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
| `GET /api/providers/:id` | public | Legacy detail: provider + services + photos, contact as `user` (name/email only). Phone numbers are omitted (#64) — the payload carries `hasPhone`/`hasWhatsapp`/`hasPhone2` booleans instead; fetch the digits via `POST /:id/contact`. Admin moderation fields (`rejectionReason`) are never included (#506). Suspended → 404 unless caller is ADMIN. |
| `GET /api/providers/:id/full` | public | Full profile payload: services, first 50 photos (`photosTotal`), first page of reviews (`?reviewsTake`≤100, `?reviewsCursor`; `reviewsNextCursor` returned), `avgResponseMs`, `favorited`. Contact as `user` (name/email only) + `hasPhone`/`hasWhatsapp`/`hasPhone2` booleans — raw phone numbers are withheld (#64, see `POST /:id/contact`). Admin moderation fields (`rejectionReason`) are never included (#506). Suspended → 404 unless ADMIN. |
| `GET /api/providers/:id/card` | public | OG-image payload (name/category/city/rating/verification). Returns the `suspended` flag rather than 404. |
| `POST /api/providers/:id/contact` | public | Phone-number reveal (#64): returns `{ phone, whatsapp, phone2 }`. The public payloads omit these so crawlers can't harvest them; the web reveals them on an explicit "show number" tap. Rate-limited (`contactReveal`, 20/10 min per IP). Suspended → 404 unless ADMIN. |
| `POST /api/providers/:id/inquiries` | optional session | Send an inquiry `{ name, phone, email?, message, source? }`; emails the provider best-effort → `{ inquiry }`. |

`GET /api/providers` query params (normalized in `lib/query.ts`):

| Param | Meaning |
|---|---|
| `q` | Free text over headline/bio, the optional Sinhala headlineSi/bioSi (#515), city, contactName, services (pg_trgm) + Category label match (en/si). |
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
| `POST /api/provider/photos` | role: PROVIDER (owner) | Multipart upload; `kind=cover` sets the dedicated `coverPhoto` (#435), else creates a WorkPhoto. (`kind=avatar` still handled but the web now uploads avatars via `/api/account/avatar`.) 5 MB, jpeg/png/webp. |
| `DELETE /api/provider/cover` | role: PROVIDER (owner) | Clears the dedicated cover (#435) → the card falls back to the first work photo / category image. |
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
| `GET /api/providers/:id/reviews` | public | Paginated reviews (`?take` default 10, max 100; `?cursor`) → `{ reviews, nextCursor, summary }`. `summary` (#528) aggregates over **all** non-deleted reviews: `{ rating, count, dimensions: { quality, punctuality, value, communication } (each an avg over non-null values or null), distribution: { "1".."5": count } }`. Suspended/missing provider → 404. |
| `POST /api/providers/:id/reviews` | authenticated | Multipart `rating`/`comment` + optional 1–5 sub-ratings `quality`/`punctuality`/`value`/`communication` (#528, blank ⇒ omitted) + up to 3 photos. Hard interaction gate (must have inquired first, else 403); can't review own profile (400); upsert (one review per provider) → `{ ok: true }`. |
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
| `GET /api/files/:namespace/*` | public (via gateway) | Serve a stored image, streamed from R2 (private bucket) or local disk; long-cache immutable. The gateway routes the `provider`, `review`, `category` and `user` namespaces (→ media `/files/*`, supplying the internal secret). Optional `?variant=thumb\|medium` (#382) serves the 400px/800px derivative, falling back to the original when it's missing (pre-#382 uploads) or the value is unknown. Non-image extension / missing → 404. |

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

