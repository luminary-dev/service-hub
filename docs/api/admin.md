# Admin API (`/api/admin/*`)


All admin routes require an admin session; the gateway forwards the role and
each service enforces the tier. **Reads and report resolve/dismiss** gate on
`isSupportOrAdmin` (ADMIN or SUPPORT); **destructive writes** gate on
`isFullAdmin` (ADMIN only). Unauthorized → `403 { error: "Forbidden" }`.

#### Users, impersonation & signups — identity-service

| Method + path | Auth | Summary |
|---|---|---|
| `GET /api/admin/users` | SUPPORT+ | Search by email/name (`?q`, `?page`), newest first, page 20 → `{ users, total, page, pageSize }`. |
| `GET /api/admin/users/:id` | SUPPORT+ | Detail + favorites hydrated with provider names/phones (degrades to null). |
| `PATCH /api/admin/users/:id` | ADMIN | `{ action: lock\|unlock }` and/or `{ role: CUSTOMER\|PROVIDER\|ADMIN\|SUPPORT }` (a role change bumps `sessionVersion`). Self → 400. |
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

