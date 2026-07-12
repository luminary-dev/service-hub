# Moderation


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
limits the report endpoints (see [RATE_LIMITING.md](../RATE_LIMITING.md)).

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

