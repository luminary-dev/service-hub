# Admin operations guide

The admin panel is the operations console for Baas.lk — moderation, provider
and user management, categories, jobs, and analytics. It lives inside
the Next.js web app under `/admin` and talks to the backend services through
the same API gateway as the rest of the app (see
[ARCHITECTURE.md](ARCHITECTURE.md)).

This document is the canonical reference for what each admin capability does
and how to reach it. For the authorization model (roles, gating helpers), see
[AUTHZ.md](AUTHZ.md); the source of truth is `src/lib/roles.ts`.

---

## Accessing the panel

- URL: **`/admin`** (Sinhala: `/si/admin`).
- The whole section is gated by `src/app/admin/layout.tsx`: no session →
  redirect to `/login`; a session whose role is not an admin tier → redirect to
  `/`. This is a coarse "can you enter `/admin` at all" gate; every admin page
  also keeps its own per-page check as a safety net.
- All admin pages are `force-dynamic` (no-store) so a moderation edit shows up
  on the next request.

### Role tiers

Defined in `src/lib/roles.ts` (`ADMIN_ROLES = ["ADMIN", "SUPPORT"]`). The
identity DB stores `role` as plain text with a CHECK constraint allowing
`CUSTOMER | PROVIDER | ADMIN | SUPPORT` (the role set was finalized by migration
`20260708200000`, which dropped an earlier unused admin value). The gateway
forwards the role to services as `x-user-role`.

| Tier | Access |
| --- | --- |
| **SUPPORT** | Read access to the moderation pages, plus resolving/dismissing abuse reports. Nothing destructive. |
| **ADMIN** | Full access: deletes, category edits, role changes, user management, everything SUPPORT can do. |

Gating helpers: `isAdminRole()` (enter `/admin`), `hasSupportAccess()`
(resolve/dismiss reports), `hasFullAdminAccess()` (destructive actions).

**Enforcement is end-to-end (#226).** The tiers are honored in **both** the web
app and the backend services — see [AUTHZ.md](AUTHZ.md). Each service's
`src/lib/http.ts` exposes `isSupportOrAdmin` (reads + report resolve/dismiss) and
`isFullAdmin` (destructive writes), mirroring the web predicates. On the
**dashboard, verifications, reports, providers, and categories** pages SUPPORT
sees read-only/disabled controls while ADMIN can act. The **users, jobs,
audit-log, and impersonate** pages redirect any non-`ADMIN` session at the page
level, so they are ADMIN-only surfaces; a pure SUPPORT account works the
moderation set above.

---

## Dashboard

Route: **`/admin`** (`src/app/admin/page.tsx`,
`src/components/admin/AdminDashboardCharts.tsx`).

The home screen is the metrics view plus the nav grid. It fetches three
sources in parallel, each degrading to zeros rather than erroring:

- `GET /api/admin/stats` (provider-service) — active/suspended/total providers,
  `pendingVerifications`, `openReports`, `categoryDistribution`.
- `GET /api/admin/review-stats` (review-service) — review-side open reports.
- `GET /api/admin/signups` (identity-service) — 30-day daily signup series and
  totals split by customers vs providers.

**Stat tiles:** total signups, pending verifications, open reports (provider +
review reports summed), active providers, suspended providers.

**Charts** (recharts, colored from CSS vars so they follow dark mode):

- Signups line chart — two lines, customers vs providers, by day.
- Top categories bar chart — the 8 largest categories by provider count, labels
  localized EN/SI.

**Nav grid:** cards linking to Providers, Verifications, Categories, Reports,
Audit log, Jobs, and Users. The Verifications and Reports cards carry a live
notification badge (see [Notifications](#notifications)).

---

## Moderation

### Verification queue

Route: **`/admin/verifications`** (`src/app/admin/verifications/page.tsx`,
`VerificationQueue.tsx`, `VerificationActions.tsx`, `MarkQueueViewed.tsx`).

Lists providers with a pending verification submission, **oldest first**, via
`GET /api/admin/verifications`. Each row shows the provider, category/city/
email, and links to the uploaded documents (NIC front and/or business
registration — each opens in a new tab). Documents are private to the review
team.

- **SLA indicator.** Each row shows a "waiting N days" badge computed from the
  submission timestamp: **≥7 days → red**, **≥3 days → amber**, otherwise
  neutral.
- **Per-row actions.** *Approve* sets the provider to `VERIFIED`. *Reject* is a
  two-step confirm: the first click reveals a rejection-reason textarea
  (optional, max 1000 chars) and relabels the button; the second click submits.
  Sends `PATCH /api/admin/verifications/{providerId}` with
  `{ action: "approve" | "reject", reason? }`.
- **Bulk actions.** Per-row checkboxes plus "select all"; *Approve selected* /
  *Reject selected* (bulk reject shares one reason textarea). Sends
  `PATCH /api/admin/verifications` with `{ ids, action, reason? }` (1–200 ids;
  only rows still `PENDING` are touched).
- **Pagination.** Server-side, 20 per page (#255); prev/next controls with a
  page indicator. The PENDING header stat and the hub badge baseline track the
  full `total`, not the current page.

Any admin-tier user can act on this queue.

### Reports queue

Route: **`/admin/reports`** (`src/app/admin/reports/page.tsx`,
`AdminReportsList.tsx`, `ReportsFilterBar.tsx`, `ReportActions.tsx`,
`RunFlaggingButton.tsx`).

Merges two backends into one queue, sorted **open first, then newest first**:
`GET /api/admin/reports` (provider-service — `PROVIDER` and `WORK_PHOTO`
targets) and `GET /api/admin/review-reports` (review-service — `REVIEW`
targets). Header stats: open / total.

- **Filters** (URL-backed): target type (all / provider / photo / review) and
  status (all / open / resolved / dismissed).
- **Pagination.** Both backends are paginated 20 per page (#255); the page
  requests the same page N from each and merges the results, so a page can hold
  up to 20 rows from each source. Prev/next controls span the deeper source's
  page count. The open-count stat and hub badge come from the dedicated count
  endpoints (accurate across the whole queue, not just the current page).
- **Per-row actions** — gated by `hasSupportAccess`: *Resolve* and *Dismiss*
  send `PATCH` to the matching endpoint (`/api/admin/reports/{id}` or
  `/api/admin/review-reports/{id}`) with `{ status: "RESOLVED" | "DISMISSED" }`.
- **Bulk actions** — also support-gated; only open rows are selectable. Selected
  ids are grouped by source and sent as `PATCH /api/admin/reports` and/or
  `PATCH /api/admin/review-reports` with `{ ids, status }`.
- **Audit stamp.** A closed report shows *who* closed it and *when*
  (`resolvedBy` / `resolvedAt`).
- Each row shows the target (review preview, or provider/photo with suspended /
  content-removed chips) with a **Moderate** deep link, the reason and details,
  the reporter (or "anonymous"), and the created date.

Report reasons are `spam | scam | offensive | fake | other` (plus free-text
details, max 500 chars). Reports can be filed anonymously; the gateway rate-
limits the report endpoints (see [RATE_LIMITING.md](RATE_LIMITING.md)).

#### Auto-flagging ("Run flagging")

The reports page has a **Run flagging** button
(`src/components/admin/RunFlaggingButton.tsx`, shown **only to full admins**)
that triggers `POST /api/admin/flagging/run` (#232, gated `isFullAdmin`). There
is no cron/worker in the stack, so flagging is admin-triggered on demand (a
scheduler can call the same endpoint later). It sweeps every active provider and
flags one when its **quality score is below 40** *or* it carries **3+ open
`USER`-sourced reports**, creating a **system-sourced** open report for each
(`Report.source = "SYSTEM"`, `reporterId = null`; providers that already carry
an open system flag are skipped) and returning `{ flagged }`. System-flagged
providers then appear in the normal reports queue for a human to action.

### Provider quality score

Admins see a **quality-score badge** (0–100) on every provider in the list and
detail views, computed server-side in
`services/provider-service/src/lib/quality-score.ts`:

- `ratingComponent` = `(rating / 5) * 100` when the provider has reviews, else a
  neutral **70**.
- `reportPenalty` = `min(openReportCount * 15, 100)` — only **open** reports
  penalize.
- `qualityScore` = `clamp(round(ratingComponent - reportPenalty), 0, 100)`.

Badge color (`src/lib/quality.ts`): **≥80 emerald, ≥50 amber, else red**, with a
tooltip breakdown of rating / review count / open-report count.

---

## Providers

Route: **`/admin/providers`** and detail **`/admin/providers/[id]`**
(`src/app/admin/providers/**`, `AdminProvidersList.tsx`,
`AdminProvidersFilterBar.tsx`, `AdminProviderActions.tsx`,
`AdminDeleteButton.tsx`, `AdminRestoreButton.tsx`). Destructive actions gated by
`hasFullAdminAccess`; SUPPORT sees disabled controls.

**List** — `GET /api/admin/providers` with `q`, `category`, `city`, verification
`status`, `suspended`, `sort` (`newest` / `mostReviews`), and pagination
(`PAGE_SIZE = 20`). Rows show verified/pending/suspended chips, the quality-
score badge, category/city, review and photo counts, and a Moderate link.

- **Per-row actions:** verify / unverify and suspend / unsuspend, via
  `PATCH /api/admin/providers/{id}` with `{ action }`.
- **Bulk actions:** select-all + bulk suspend / unsuspend, via
  `PATCH /api/admin/providers` with `{ ids, suspended }`.

**Detail** — `GET /api/admin/providers/{id}`: header with avatar, contact, the
quality badge and breakdown, and the verify/suspend actions. Two panels:

- **Reviews** — each review has a delete control
  (`DELETE /api/admin/reviews/{id}`, a soft delete server-side); soft-deleted
  reviews show a **Restore** control.
- **Work photos** — grid with per-photo delete
  (`DELETE /api/admin/photos/{id}`, a soft delete that sets `deletedAt`; a
  provider deleting their own photo is a hard delete); soft-deleted photos show a
  **Restore** control.

**Restore.** `AdminRestoreButton` wires the restore endpoints directly from this
detail view: `PATCH /api/admin/photos/{id}/restore` (provider-service, clears
`deletedAt`) and `PATCH /api/admin/reviews/{id}/restore` (review-service). Both
are full-admin gated (`hasFullAdminAccess` in the UI, `isFullAdmin` server-side),
so SUPPORT sees a disabled control; restoring re-publishes the content and is
audited (`restore-photo` / `restore-review`).

---

## Categories

Route: **`/admin/categories`** (`src/app/admin/categories/page.tsx`,
`AdminCategoryManager.tsx`). Edits gated by `hasFullAdminAccess` — SUPPORT sees
the list read-only.

Lists every managed category (including inactive) via
`GET /api/admin/categories`. Header stats: total / active / inactive. Each
category has a `slug`, English label (`labelEn`), Sinhala label (`labelSi`),
`icon`, `active` flag, and `sortOrder`.

- **Add** — slug (pattern `^[a-z0-9-]{2,40}$`), icon, EN/SI labels, sort order →
  `POST /api/admin/categories` (409 on duplicate slug).
- **Edit** — inline edit of EN/SI labels, icon, sort order →
  `PATCH /api/admin/categories/{slug}`.
- **Active flag** — Activate / Deactivate toggles the `active` flag via
  `PATCH /api/admin/categories/{slug}`. There is **no hard delete by design**:
  deactivating hides a category from public lists while existing providers keep
  the slug.

---

## Users

Route: **`/admin/users`** and detail **`/admin/users/[id]`**
(`src/app/admin/users/**`, `AdminUserActions.tsx`). **ADMIN-only page** — the
page redirects any non-`ADMIN` session, and identity-service gates its
destructive writes on `isFullAdmin` (SUPPORT is redirected away).

**List** — `GET /api/admin/users?q=&page=` (page size 20): case-insensitive
search over email/name, newest first. Rows show role and locked chips and a
Moderate link.

**Detail** — `GET /api/admin/users/{id}`: role, joined date, locked state,
session version, and the user's favorites. Actions (hidden when viewing your
own account):

- **Change role** — CUSTOMER / PROVIDER / ADMIN via
  `PATCH /api/admin/users/{id}` `{ role }`.
- **Lock / unlock** — `PATCH /api/admin/users/{id}` `{ action }`. Lock sets a
  far-future `lockedUntil` (effectively permanent manual lock, reusing the same
  column as the 5-strike / 15-minute auto-lockout); unlock clears it and resets
  the failed-login counter.
- **Force logout** — `POST /api/admin/users/{id}/force-logout` bumps the user's
  `sessionVersion`, invalidating every existing token at the gateway's
  revocation check.

You cannot modify or force-logout your own account (the API returns 400).

---

## Jobs

Route: **`/admin/jobs`** and detail **`/admin/jobs/[id]`**
(`src/app/admin/jobs/**`, `AdminJobFilters.tsx`). **ADMIN-only page** (the page
redirects non-`ADMIN`; the job-service read endpoints themselves accept
`isSupportOrAdmin`).

Read-only oversight of the jobs reverse-marketplace (see
[FEATURES.md](FEATURES.md#jobs-reverse-marketplace)). `GET /api/admin/jobs`
lists jobs newest-first with customer name and response count hydrated; filters
by status (open/closed) and category. The detail view
(`GET /api/admin/jobs/{id}`) shows the job, budget, customer, description, and
the full response list (provider name/phone, message, link to the public
profile). There are no moderation actions on jobs — this section is for
visibility only.

---

## Monetization (deferred to v0.2)

There is **no billing in v0.1** — the platform is free to use. Pricing,
commission and payments are intentionally deferred to **v0.2**, so there is no
admin billing page, no transaction ledger, and no commission field on a job.

---

## Audit log

Route: **`/admin/audit-log`** (`src/app/admin/audit-log/page.tsx`). **ADMIN-only
page** (the page redirects non-`ADMIN`; the audit-log read endpoints themselves
accept `isSupportOrAdmin`).

A read-only, newest-first history of every moderation action. It merges two
sources and re-sorts:

- `GET /api/admin/audit-log` (provider-service) — provider verify/suspend, photo
  delete, report resolve/dismiss, category create/edit.
- `GET /api/admin/review-audit-log` (review-service) — review delete, review-
  report resolve/dismiss.

Every admin write across the services calls a best-effort `logAudit` that
records the **admin id, action, target type/id, timestamp, and reason** (when
present). Each row shows a target-type chip, the action, and a meta line with
the timestamp, admin id, and target. Filters: admin id, action, from/to date (a
bare `to` date is extended to end-of-day for inclusive ranges).

---

## Impersonation ("view as")

Route: **`/admin/impersonate`** (`src/app/admin/impersonate/page.tsx`,
`ImpersonateForm.tsx`). **ADMIN-only** (the page redirects non-`ADMIN`;
identity-service gates the impersonation endpoints on `isFullAdmin`). A stopgap
standalone page (#234), intended to later become a "View as" button on the user
detail page.

Enter a user id or email and submit; the app calls
`POST /api/admin/impersonate/{identifier}` (identity-service,
`admin-impersonation.ts`) and, on success, drops you into that user's session
so you can reproduce what they see for support debugging.

- **Short-lived and isolated.** Impersonation issues a 15-minute
  (`expiresInSeconds: 900`) token in a separate `impersonation_session` cookie —
  it never touches the admin's own `sh_session`. The gateway prefers the
  impersonation identity when present.
- **Guardrails.** You cannot impersonate yourself, and you cannot impersonate
  **any ADMIN account** (defense in depth).
- **Logged.** Each start writes an `ImpersonationLog` row (admin id, target user
  id, started-at) and a structured log line; ending
  (`POST /api/admin/impersonate/end`) clears the cookie, closes the log row
  (`endedAt`), and logs the event.

---

## Notifications

`src/components/admin/NotificationBadge.tsx` (+ `src/lib/adminNotifications.ts`).

The dashboard's Verifications and Reports cards show live count badges. On mount
and on every window focus (no polling/websockets) they fetch
`GET /api/admin/notifications/counts` (`{ pendingVerifications, openReports }`
from provider-service) and `GET /api/admin/review-reports/count`
(`{ openReports }` from review-service). The reports badge sums the two report
counts; the verifications badge shows pending verifications.

"New since last viewed" is approximated per-admin, per-browser: each queue page
records a localStorage baseline when opened (`MarkQueueViewed`), and the badge
turns red when the current count exceeds that baseline. Counts above 99 render
as `99+`; a zero count renders nothing.

---

## Bootstrapping the first admin

There are no seeded admin credentials. Create (or promote) the first admin by
running the non-interactive script on **identity-service**:

```bash
# from services/identity-service/
ADMIN_EMAIL=you@baas.lk ADMIN_PASSWORD='...' npm run create-admin
# or: npm run create-admin -- --email you@baas.lk --password '...' [--name "Ops"]
```

Script: `services/identity-service/prisma/create-admin.js`. Password must be
6–100 chars (bcrypt cost 10). If the email already exists it **promotes the
account to ADMIN, resets the password, and bumps `sessionVersion`** (killing old
sessions); otherwise it creates a new ADMIN with a verified email. The Users
page role-change control assigns `CUSTOMER | PROVIDER | ADMIN`; to grant the
**SUPPORT** tier, set `role = "SUPPORT"` directly in the identity DB.

See [DEPLOYMENT.md](DEPLOYMENT.md) for running this in production.
