# RFC: Trust & safety service extraction

- **Status:** Proposed
- **Refs:** #375 (content moderation), #376 (job/message reporting + takedown), #612 (per-service DB roles pattern)
- **Stage:** Stage-2 Track 2 (service decomposition)

## 1. Problem

Moderation and reporting is now split across **three services**, each carrying a
near-identical copy of the same machinery:

| Concern | provider-service | review-service | job-service |
| --- | --- | --- | --- |
| Report targets | `PROVIDER`, `WORK_PHOTO`, `INQUIRY` (SYSTEM-only), `MESSAGE` | `REVIEW` | `JOB`, `JOB_RESPONSE` |
| Public submit | `POST /api/providers/:id/report`, `/api/photos/:id/report`, `/api/messages/:id/report` (`src/routes/reports.ts`) | `POST /api/reviews/:id/report` (`src/routes/reports.ts`) | `POST /api/jobs/:id/report` (`src/routes/reports.ts`) |
| Admin queue | `GET/PATCH /api/admin/reports[/:id]` (`src/routes/admin.ts:501+`) | `GET/PATCH /api/admin/review-reports[/:id]` | `GET/PATCH /api/admin/job-reports[/:id]` |
| Badge count | inside `GET /api/admin/notifications/counts` | `GET /api/admin/review-reports/count` | `GET /api/admin/job-reports/count` |
| Audit log | `GET /api/admin/audit-log` | `GET /api/admin/review-audit-log` | `GET /api/admin/job-audit-log` |
| Content filter | `src/lib/moderation.ts` + `moderation-terms.ts` + `auto-report.ts` | identical copies | identical copies |
| Prisma models | `Report`, `AdminAuditLog` | same shape | same shape |

The `Report` and `AdminAuditLog` models are field-for-field identical across the
three schemas (`services/*/prisma/schema.prisma`), the queue/pagination/audit
route code is copy-pasted (including the `sliceOpenClosed` OPEN-first paging and
the date-only `lte` snap), and the bilingual content filter shipped in #607 as
three verbatim copies whose denylists will drift the first time someone updates
only one. provider-service has become the accidental admin service — the
largest backend by far (~5k LOC of non-test source, ~1.1k of it
`src/routes/admin.ts` alone, plus reports and internal hydration) — and the
gateway's
`/api/admin/*` routing (`services/api-gateway/src/lib/routes.ts:56–136`) is a
stack of carve-outs (`review-reports`, `review-audit-log`, `review-stats`,
`job-reports`, `job-audit-log`, `users`, `impersonate`, `signups`, `jobs`) ahead
of a "everything else under `/api/admin/` → provider-service" fallback. The web
admin UI compensates by fetching and merging **three** queues, **three** counts
and **three** audit logs client-side (§6).

## 2. Proposal

Extract a **trust-safety-service** on port **:4009**, with its own database
`trust_safety_db` and Postgres role `trust_safety` per the #612
least-privilege pattern. (Port allocation: chat-service holds :4007; **:4008
is reserved for search-service** — the Stage-2 Track 1 extraction in the
search & discovery RFC, which builds first — so trust-safety takes :4009.)

**It owns:**

- The unified **`Report` store** — all seven target types
  (`PROVIDER | WORK_PHOTO | INQUIRY | MESSAGE | REVIEW | JOB | JOB_RESPONSE`).
- The unified **`AdminAuditLog`** for moderation actions (the three existing
  logs merge into it; identity-service's separate `AdminAuditLog` for
  user-management/self-service records stays put — different semantics, out of
  scope).
- The **content filter** — one canonical `lib/moderation.ts` +
  `moderation-terms.ts`, replacing the three copies.
- The **report lifecycle** — open → resolve/dismiss (single + batch), dedupe
  (one OPEN report per user+target; one OPEN SYSTEM report per target).
- The **admin moderation queue APIs** — list, count, audit log.

**It does NOT own:**

- **Takedown mutations** (provider suspend, photo/review/message soft-delete,
  job hide) — these stay in the owning services (§3).
- Content rows themselves (providers, photos, reviews, jobs, messages).
- Provider verification, categories, user management, impersonation, admin job
  management — those stay where they are; this RFC only extracts the
  moderation slice of `/api/admin/*`.
- Threshold auto-flagging (`POST /api/admin/flagging/run`,
  `provider-service/src/routes/admin.ts:789`) — it reads provider
  quality/rating data, so it stays in provider-service, but files its SYSTEM
  reports via S2S ingestion instead of a local `db.report.create`.

## 3. Takedown ownership decision

Two options were analyzed:

**Option A — takedown stays in the owning service, behind internal endpoints
trust-safety calls S2S (chosen).** The takedown state is a column on the owned
row — `Provider.suspended`, `WorkPhoto.deletedAt`, `Review.deletedAt`,
`InquiryMessage.deletedAt` (#376), `JobRequest.hiddenAt` (#376) — and every
public read path in the owning service filters on it (profile pages, thread
reads and unread counts, the job board and response gate). Each owner exposes
its existing mutation as an internal route (e.g. provider-service
`POST /internal/moderation/messages/:id/takedown`, job-service
`POST /internal/moderation/jobs/:id/takedown` mirroring today's
`PATCH /api/admin/jobs/:id { action: "hide" | "unhide" }`). trust-safety
exposes one admin-facing action route on the queue
(`POST /api/admin/reports/:id/action`, full-ADMIN), maps
`targetType → owner`, calls the owner over `s2s()` (write-path gate: fails
loudly on owner outage), writes the audit row, and optionally resolves the
report in the same request. Owner-native admin routes that serve their own
management pages (e.g. `PATCH /api/admin/providers/:id` suspend from the
providers page, `DELETE /api/admin/photos/:id`) remain, now writing their audit
entries to trust-safety via S2S (§5.3).

**Option B — move takedown into trust-safety (rejected).** trust-safety would
either need write access to three foreign databases (forbidden — db-per-service
with per-role isolation is the point of #612) or would hold a suppression table
that every owner consults on every public read — turning every profile/board
read into an S2S round-trip or a replicated-state consistency problem.
Reversibility ("restore" must flip the same row the reads filter on) makes
remote ownership strictly worse.

**Decision: Option A.** Data ownership is preserved, read paths stay local and
fast, and the moderation *decision* (who acted, on what report, why) is
centralized where the queue and audit log live.

## 4. Data model & migration

### 4.1 Schema (`services/trust-safety-service/prisma/schema.prisma`)

```prisma
model Report {
  id           String    @id            // preserved from source — no @default on backfilled rows; cuid() for new
  targetType   String                   // PROVIDER | WORK_PHOTO | INQUIRY | MESSAGE | REVIEW | JOB | JOB_RESPONSE
  targetId     String
  ownerService String                   // "provider" | "review" | "job" — derived from targetType, denormalized for filtering/hydration fan-out
  reporterId   String?
  reason       String
  details      String?
  status       String    @default("OPEN")
  source       String    @default("USER") // USER | SYSTEM
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  resolvedBy   String?
  resolvedAt   DateTime?

  @@index([status])
  @@index([targetType, targetId])
  @@index([createdAt])
}

model AdminAuditLog {
  id         String   @id
  adminId    String
  action     String
  targetType String
  targetId   String
  reason     String?
  service    String                     // originating service — replaces the web's client-side source tag
  createdAt  DateTime @default(now())

  @@index([adminId])
  @@index([action])
  @@index([createdAt])
}
```

Both models are supersets of the three existing ones; no field is dropped, so
backfill is a straight copy plus the derived `ownerService` / `service` tag.

### 4.2 One-time row migration

- **Script:** `scripts/migrate-trust-safety-backfill.sh` (shipped with
  phase 1), following the `deploy/migrate-db-roles.sh` conventions from #612 —
  idempotent, runs as the Postgres **superuser** (which #612 deliberately kept
  for cluster admin), and is safe to re-run:

  ```sh
  ./scripts/migrate-trust-safety-backfill.sh           # backfill + parity report
  ./scripts/migrate-trust-safety-backfill.sh --check   # parity check only (no writes)
  # dev/local drive: COMPOSE_FILE=docker-compose.yml ./scripts/migrate-trust-safety-backfill.sh
  ```

  Per source DB (`provider_db`, `review_db`, `job_db`):
  `psql \copy` the `Report` / `AdminAuditLog` tables out, load into a temp
  table in `trust_safety_db`, then upsert:
  - `Report`: `INSERT … ON CONFLICT (id) DO UPDATE SET status, details,
    resolvedBy, resolvedAt, updatedAt = excluded.* WHERE excluded."updatedAt" >
    "Report"."updatedAt"` — so a re-run (the delta pass, §8) picks up rows
    resolved in the old services during the cutover window without clobbering
    newer trust-safety state.
  - `AdminAuditLog` is append-only: `ON CONFLICT (id) DO NOTHING`.
- **ID preservation:** all three services generate `cuid()` PKs, which are
  globally unique in practice; IDs are copied verbatim so audit-log
  `targetId`s pointing at reports, `resolvedBy` stamps and any bookmarked
  admin URLs stay valid. The script fails loudly if the pre-insert distinct-id
  check across the three sources ever detects a collision (expected: never).
- **Verification:** after each pass the script compares per-source row counts
  and `max(updatedAt)` between source and destination and prints a diff table;
  a non-zero diff on the final pass blocks cleanup (§8 phase 5).
- **Downtime-free order:** copy first, flip writers second, delta-copy third —
  detailed in §8. The old tables are kept (read-only in practice — nothing
  routes to them) for one full release as a rollback net before a cleanup
  migration drops them.

### 4.3 Auto-report call sites switch to S2S

The three `lib/auto-report.ts` copies (`moderateContent(...)`) currently run
the local filter then `db.report.create`. They are replaced by a thin client
that POSTs `{ targetType, targetId, fields }` to trust-safety
`POST /internal/reports/auto` over `s2s()`; trust-safety runs `checkFields`
against the canonical denylist and applies the existing dedupe (refresh the one
OPEN SYSTEM report per target). Call sites — job post/response
(`job-service/src/routes/jobs.ts:131,428`), review create/edit
(`review-service/src/routes/reviews.ts`), provider profile/service text and
inquiry/thread messages (`provider-service` routes + `src/routes/internal.ts`)
— keep today's semantics: **best-effort, caught and logged, never fails the
user's write** (per the #375 decision, content stays visible; a lost check
only means a missed flag, and the filter no longer drifts three ways).

## 5. API surface

### 5.1 Public submission (paths unchanged at the gateway)

`POST /api/providers/:id/report`, `/api/photos/:id/report`,
`/api/reviews/:id/report`, `/api/jobs/:id/report`, `/api/messages/:id/report`
keep their exact paths — the gateway's rate-limit rules
(`api-gateway/src/lib/rate-limit.ts:349–357`, shared `"report"` budget) and
every web caller stay untouched — but re-route to trust-safety. Because
trust-safety can't check target existence/visibility locally, each owner
exposes `GET /internal/moderation/targets/:type/:id` returning
`{ exists, visible, parties? }`; trust-safety 404s hidden/soft-deleted targets
(same behavior as today's `hiddenAt`/`deletedAt` checks) and enforces the
MESSAGE thread-party gate (#376) from `parties`. Owner outage on this
validation read → 503 (write-path gates fail loudly). Session stays optional;
signed-in dedupe (refresh own OPEN report) moves with the store.

### 5.2 Admin queue (replaces three per-service sets)

- `GET /api/admin/reports` — one queue, all target types, existing
  page/pageSize/`total` contract and OPEN-first ordering (`sliceOpenClosed`
  moves here); `targetType` filter now actually filters instead of
  short-circuiting foreign types to empty lists.
- `PATCH /api/admin/reports/:id` + batch `PATCH /api/admin/reports` —
  resolve/dismiss, stamping `resolvedBy`/`resolvedAt`, audit-logged.
- `GET /api/admin/reports/count` → `{ openReports }` — replaces the three
  summed counts; provider-service's `GET /api/admin/notifications/counts`
  drops `openReports` and keeps `pendingVerifications`; `review-stats` and the
  `openReports` slice of provider `/api/admin/stats` are retired.
- `GET /api/admin/audit-log` — unified log with `service` column; the same
  `adminId`/`action`/`from`/`to` filters and 200-row cap.
- `POST /api/admin/reports/:id/action` — takedown/restore orchestration (§3).
- **Target hydration:** the queue hydrates rows per page via batched S2S reads
  (`GET /internal/moderation/targets?...` per owner, keyed by `ownerService`),
  returning the same per-type `target` summaries the three queues build today
  (`admin.ts:580+`, `reports.ts` in review/job). Owner outage degrades that
  slice to `target: null` — exactly how a hard-deleted target renders today.

### 5.3 Internal (S2S, never gateway-routed)

- `POST /internal/reports/auto` — content-filter ingestion (§4.3).
- `POST /internal/audit` — audit ingestion for owner-native admin actions that
  remain in place (provider verify/suspend, photo delete/restore, message
  takedown, review delete/restore, job hide/unhide, category edits): each
  service's `lib/audit.ts` `logAudit()` becomes an `s2s()` POST, keeping its
  current fire-and-record, never-fail-the-write semantics.
- Owners expose `GET /internal/moderation/targets*` (validation + hydration)
  and `POST /internal/moderation/<type>/:id/takedown|restore` (§3).

### 5.4 Gateway rewrite sketch (`services/api-gateway/src/lib/routes.ts`)

```ts
export type ServiceName = "identity" | "provider" | "review" | "job" | "media" | "trust-safety";

// Trust & safety: unified moderation queue, audit log and report submission.
if (
  pathname === "/api/admin/reports" ||
  pathname.startsWith("/api/admin/reports/") ||
  pathname === "/api/admin/audit-log"
) {
  return { service: "trust-safety", path: pathname };
}
if (/^\/api\/(providers|photos|reviews|jobs|messages)\/[^/]+\/report$/.test(pathname)) {
  return { service: "trust-safety", path: pathname };
}
```

…and **delete** the carve-outs for `/api/admin/review-reports*`,
`/api/admin/review-audit-log`, `/api/admin/review-stats`,
`/api/admin/job-reports*`, `/api/admin/job-audit-log` (routes.ts:65–76,
105–107, 122–128). The `/api/admin/*` → provider fallback stays for the
provider-owned admin surface, but loses its biggest tenant. `serviceUrl()`
gains `TRUST_SAFETY_SERVICE_URL ?? "http://localhost:4009"`.

### 5.5 Roles (docs/AUTHZ.md unchanged in spirit)

trust-safety gets the standard `lib/http.ts` gates: **SUPPORT or ADMIN** for
queue reads, counts, audit log, and resolve/dismiss (single + batch) — exactly
the current tier; **full ADMIN only** for `POST /api/admin/reports/:id/action`
(destructive, checked *before* the S2S call; the owner's internal route trusts
the internal secret as usual). Web gates stay `src/lib/roles.ts`
(`hasSupportAccess` for the queue, `hasFullAdminAccess` for takedown buttons).

## 6. Web changes — one source instead of three

Components that simplify (this merging code just landed with #605/#607/#376):

- `src/app/admin/reports/page.tsx` — the 7-way `Promise.all` (three queues +
  three counts + locale), the three-way `.map(service tag)` merge + re-sort,
  `providerTotal + reviewTotal + jobTotal`, the `Math.max(...)` per-source
  pagination and the summed `openCount` all collapse to **one** list fetch +
  **one** count fetch with real server-side pagination (today "page 2" is page
  2 of each source interleaved — a correctness fix, not just cleanup).
- `src/components/admin/AdminReportsList.tsx` — drops the
  `service: "provider" | "review" | "job"` discriminant on `ReportRow`, the
  `BATCH_ENDPOINTS` map, `bulkAct()`'s group-by-service `Promise.all`, and the
  `${r.service}-${r.id}` composite keys.
- `src/components/admin/ReportActions.tsx` (+ its test asserting per-service
  endpoint paths) — one canonical `/api/admin/reports/:id`.
- `src/components/admin/NotificationBadge.tsx` — `fetchCounts()` drops from
  three fetches to two (`/api/admin/reports/count` + provider
  `notifications/counts` for `pendingVerifications`).
- `src/app/admin/page.tsx` — the dashboard's `stats + review-stats +
  job-reports/count` sum becomes one figure.
- `src/app/admin/audit-log/page.tsx` — the three-source merge + client-side
  `source` tagging + re-sort becomes one fetch; the `service` column comes
  from the row.
- `src/lib/adminNotifications.ts` — unchanged logic, fed by a single count.

## 7. Compose / DB / CI / mirrors / deploy

Per the #612 pattern, the new service touches:

- **docker-compose.yml / docker-compose.prod.yml:** `trust-safety-service`
  block (`PORT: 4009`, `mem_limit`, hardening anchors, healthcheck,
  `depends_on: postgres`), `TRUST_SAFETY_SERVICE_URL: http://trust-safety-service:4009`
  in the shared `x-service-env`, gateway `depends_on` entry.
- **DB bootstrap:** `scripts/init-db.sql` gains `CREATE DATABASE
  trust_safety_db` (local); `deploy/postgres-init.sh` gains the
  `trust_safety` LOGIN role owning only `trust_safety_db` (fresh volumes);
  `deploy/migrate-db-roles.sh` gains the same block for the existing prod
  volume (idempotent; doubles as rotation, as #612 established).
  `DATABASE_URL: postgresql://trust_safety:${TRUST_SAFETY_DB_PASSWORD:?}@postgres:5432/trust_safety_db`.
- **Secrets/env:** `TRUST_SAFETY_DB_PASSWORD` in `.env.prod.example`, the
  GitHub repo secrets, and the `deploy.yml` env-render list; service
  `.env.example`; env table in `docs/ARCHITECTURE.md`.
- **CI:** `.github/workflows/ci.yml` — add `trust-safety-service` to the fast
  per-package matrix and the coverage matrix; the compose e2e picks it up via
  `docker compose up`; `scripts/e2e-smoke.sh` gains a report-submit →
  queue-visible → resolve assertion. `deploy.yml` builds/publishes
  `ghcr.io/luminary-dev/service-hub-trust-safety-service`.
- **Mirrors:** add `trust-safety-service` to `SERVICES` in
  `scripts/sync-service-repos.sh`; create the read-only
  `luminary-dev/service-hub-trust-safety-service` repo with the standard
  push-blocking branch protection before the first `npm run sync:repos`.
- **Migrations:** hand-written, applied on boot via `start:migrate`
  (`prisma migrate deploy`), like the other four DB services.
- **Docs (same PRs as the code):** `docs/ARCHITECTURE.md` (service table +
  endpoint reference), `docs/architecture/gateway.md`, `data-model.md`,
  `admin-surface.md`, `docs/api/admin.md`, `docs/api/internal.md`,
  `docs/api/public.md`, `docs/admin/moderation.md`, `docs/admin/audit-log.md`,
  `docs/AUTHZ.md`, `docs/DEPLOYMENT.md`, `docs/SECRET_ROTATION.md`,
  `docs/SUMMARY.md`.

## 8. Phased rollout

Dual-write was considered and **rejected**: report volume is low, the tables
are small, and dual-write doubles the failure modes while still needing a
reconciliation pass. An idempotent backfill + delta re-run (§4.2) gives the
same guarantee with one code path.

1. **Phase 1 — service up, dark.** Scaffold from `docs/service-template`;
   schema, queue/audit routes, internal ingestion/hydration endpoints; all §7
   wiring. Deployed with no gateway routes and no callers. Verifiable in
   isolation (unit tests + healthcheck).
2. **Phase 2 — backfill pass 1.** Run `scripts/migrate-trust-safety-backfill.sh`
   against prod; verify count/`max(updatedAt)` parity. Production writes still
   go to the old tables; the copy is warm, not authoritative.
3. **Phase 3 — cutover (one `dev → prod` release).** Gateway route flip
   (§5.4), the three services switch `auto-report`/`logAudit` to S2S and gain
   the internal target/takedown endpoints, web switches to the single source
   (§6). The stack deploys atomically behind the health gate; auto-rollback
   restores the previous routing wholesale if anything fails.
4. **Phase 4 — backfill delta (pass 2).** Re-run the script to catch rows
   written or resolved by old code during the deploy window (upsert-by-
   `updatedAt` makes this safe). Verify parity again; spot-check the admin
   queue, badge count and audit log against pre-cutover numbers.
5. **Phase 5 — cleanup PR (after one release of soak).** Drop the `Report`
   models + report/audit routes + `lib/moderation*`/`auto-report`/`audit`
   copies from provider/review/job (new migrations — never edit applied ones),
   delete the dead gateway carve-outs and web types, update docs.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| **Migration correctness** (rows resolved mid-window; double copies) — the biggest risk | Idempotent upsert keyed on preserved `id` with `updatedAt` guard; delta pass after cutover; count/parity verification gates cleanup; old tables retained one release. |
| **Report submission mid-cutover** — the other headline risk | Public paths are byte-identical, so the flip is a routing change only; the release health-gate + auto-rollback covers a sick trust-safety; a failed submit is a loud 5xx (retryable), never a silent drop. Rate-limit rules match on unchanged paths. |
| Queue hydration now fans out S2S to three owners | Batched per-page reads, bounded retry on idempotent GETs, degrade to `target: null` (identical to today's deleted-target rendering). Queue stays usable through any single owner outage. |
| Content filter becomes a network call | Already best-effort by design (#375: flag, never block); failure = missed flag, logged. Centralization ends denylist drift, which is the larger integrity risk. |
| Takedown path gains a hop (trust-safety → owner internal) | Write gates fail loudly with a clear error in the admin UI; owner-native admin routes remain as a fallback surface during rollout. |
| New service = new mirror/CI/deploy surface to forget | §7 is the checklist; PR template's env/migration checkboxes cover the rest. |

## 10. Out of scope

Identity-service's `AdminAuditLog` (user management + self-service trail),
provider verification review, chat-service content (no reporting surface
today), notification fan-out, and anything monetization-shaped (v0.2).
