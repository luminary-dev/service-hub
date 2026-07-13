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

Merges three backends into one queue, sorted **open first, then newest
first**: `GET /api/admin/reports` (provider-service — `PROVIDER`,
`WORK_PHOTO` and `INQUIRY` targets), `GET /api/admin/review-reports`
(review-service — `REVIEW` targets) and `GET /api/admin/job-reports`
(job-service — `JOB` and `JOB_RESPONSE` targets, #375). Header stats:
open / total.

- **Filters** (URL-backed): target type (all / provider / photo / review /
  inquiry / job post / job response) and status (all / open / resolved /
  dismissed).
- **Pagination.** All backends are paginated 20 per page (#255); the page
  requests the same page N from each and merges the results, so a page can hold
  up to 20 rows from each source. Prev/next controls span the deepest source's
  page count. The open-count stat and hub badge come from the dedicated count
  endpoints (accurate across the whole queue, not just the current page).
- **Per-row actions** — gated by `hasSupportAccess`: *Resolve* and *Dismiss*
  send `PATCH` to the matching endpoint (`/api/admin/reports/{id}`,
  `/api/admin/review-reports/{id}` or `/api/admin/job-reports/{id}`) with
  `{ status: "RESOLVED" | "DISMISSED" }`.
- **Bulk actions** — also support-gated; only open rows are selectable. Selected
  ids are grouped by owning service and sent as `PATCH /api/admin/reports`,
  `PATCH /api/admin/review-reports` and/or `PATCH /api/admin/job-reports`
  with `{ ids, status }`.
- **Audit stamp.** A closed report shows *who* closed it and *when*
  (`resolvedBy` / `resolvedAt`).
- Each row shows the target (review preview, provider/photo with suspended /
  content-removed chips, inquiry-thread context, or job title + text) with a
  **Moderate** deep link, the reason and details, the reporter ("anonymous",
  or "System (auto-flagged)" for `SYSTEM`-sourced rows), and the created date.

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

The quality-score half of that rule depends on ratings hydrated from
review-service. Because that fetch degrades to "no reviews" on an outage — which
is indistinguishable from a provider genuinely having no reviews — the run uses a
discriminated ratings result (`fetchRatingsResult` in `lib/clients.ts`): when
hydration was incomplete (peer down / non-2xx), the **quality-score trigger is
skipped for that run** so healthy providers aren't falsely flagged, and only the
peer-independent **report-volume trigger** applies (#366).

#### Content filter (write-time auto-reports)

Every user-generated text write is checked server-side against a bilingual
denylist (#375): review comments (review-service), provider
headline/bio/service text and inquiry + thread messages (provider-service),
and job posts + job responses (job-service). The **decision for v0.1 is
auto-report, not reject**: a matching write always succeeds and the content
stays publicly visible; the filter only files a `SYSTEM`-sourced open report
(`reason: "auto-flag: content filter"`, `reporterId = null`) into the owning
service's reports queue so an admin can triage it. Filing is best-effort — a
moderation failure never fails the user's write.

- **Matcher** — `src/lib/moderation.ts` in each of the three services
  (canonical copies, same convention as `lib/logging.ts`); the denylist is a
  data file, `src/lib/moderation-terms.ts`. Latin-script terms (English +
  romanized Sinhala/"Singlish") match case-insensitively on word boundaries so
  ordinary words that merely contain a term never trip it; Sinhala-script
  terms match as substrings (suffixes attach to the stem in Sinhala). Input is
  NFKC-normalized with zero-width characters stripped.
- **Report targets** — the flagged review (`REVIEW`), the provider whose
  profile/service text matched (`PROVIDER` — same target the threshold
  flagging uses), the inquiry thread a message belongs to (`INQUIRY`, with the
  offending excerpt in the report's `details`), or the job post / response
  (`JOB` / `JOB_RESPONSE`).
- **Dedupe** — at most one open `SYSTEM` report per target; a repeat hit
  refreshes the existing report's details instead of stacking duplicates.

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

