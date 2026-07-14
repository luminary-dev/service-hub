# trust-safety-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/trust-safety-service`](https://github.com/luminary-dev/service-hub/tree/main/services/trust-safety-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Owns the unified abuse-report store and moderation audit trail for Service Hub
(port **4009**, database `trust_safety_db`) — the trust & safety extraction
(see `docs/rfcs/trust-safety-service.md`, refs #375/#376). One `Report` model
covers all seven target types (`PROVIDER`, `WORK_PHOTO`, `INQUIRY`, `MESSAGE`,
`REVIEW`, `JOB`, `JOB_RESPONSE`) that previously lived as field-identical
copies in provider-, review- and job-service, plus the unified `AdminAuditLog`
with a `service` origin column and the canonical bilingual content filter
(#375). Content rows stay with their owning services: this service checks
target visibility, hydrates queue summaries and orchestrates takedown/restore
through the owners' `/internal/moderation/*` endpoints over S2S (RFC §3,
Option A). Reached only through the api-gateway; every request except
`/healthz` carries `x-internal-secret`.

> [!NOTE]
> **Dark launch (RFC §8 phase 1).** The service is fully functional and
> deployed, but NOTHING routes to it yet: the gateway still resolves the
> report/queue paths to provider/review/job, the owners still write their
> local Report/audit tables, and the owner `/internal/moderation/*` endpoints
> it calls don't exist until the cutover PR — so the takedown action route
> answers 502 and queue hydration degrades to `target: null` until then.

## Endpoints

### Public / report submission (via gateway; session optional, shared "report" rate-limit budget)

Paths and payloads are byte-identical to the per-service routes they replace
(`reason`: `spam`|`scam`|`offensive`|`fake`|`other`; optional `details` ≤ 500;
signed-in duplicates refresh the existing OPEN report). Target
existence/visibility is confirmed with the owning service first (404 matches
today's wording; owner outage → 503).

- `POST /api/providers/:id/report` — report a provider profile.
- `POST /api/photos/:id/report` — report a work photo.
- `POST /api/reviews/:id/report` — report a review.
- `POST /api/jobs/:id/report` — report a job post.
- `POST /api/messages/:id/report` — report an inquiry thread message (#376; thread parties only, others get the same 404 as a missing id).

### Admin (reads + resolve/dismiss require SUPPORT or ADMIN via `isSupportOrAdmin`; the action route requires full ADMIN; else 403)

- `GET /api/admin/reports` — the ONE moderation queue (open first) across all target types; `status` / `targetType` filters; page/pageSize/`total`; targets hydrated per page over S2S (owner outage → `target: null`).
- `GET /api/admin/reports/count` — `{ openReports }` for the admin hub badge (#233), replacing the three summed counts.
- `PATCH /api/admin/reports/:id` — resolve / dismiss a single report (records resolver + timestamp, audited).
- `PATCH /api/admin/reports` — bulk resolve / dismiss (`ids` ≤ 200) (#231).
- `POST /api/admin/reports/:id/action` — full ADMIN; takedown/restore the reported content via the owner's internal moderation endpoint (`{ action: "takedown"|"restore", reason?, resolve? }`); optionally resolves the report. 400 for target types with no takedown mutation (`INQUIRY`, `JOB_RESPONSE`); 502 when the owner call fails (write gates fail loudly — always, until the cutover PR adds the owner endpoints).
- `GET /api/admin/audit-log` — the unified moderation history (filter `adminId`, `action`, date range; 200-row cap); rows carry the `service` origin column.

### Internal (S2S)

- `POST /internal/reports/auto` — content-filter ingestion (#375): `{ targetType, targetId, fields }` → runs the canonical filter and files/refreshes the one OPEN SYSTEM report per target → `{ ok, flagged }`.
- `POST /internal/audit` — audit ingestion for owner-native admin actions that stay in place: `{ adminId, action, targetType, targetId, reason?, service }`.

`GET /healthz` is unauthenticated (checks Postgres; compose healthchecks).

## Data ownership (`prisma/schema.prisma`)

- **Report** — unified abuse report (`targetType`/`targetId`, derived `ownerService`, nullable `reporterId`, reason, status, `source` USER|SYSTEM, resolver audit fields, `updatedAt` backfill guard). IDs are preserved verbatim by the backfill (`scripts/migrate-trust-safety-backfill.sh`).
- **AdminAuditLog** — one row per admin moderation action, with the `service` origin column. identity-service's separate AdminAuditLog (user management) is out of scope.

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4009` | listen port |
| `DATABASE_URL` | — | Postgres (`trust_safety_db`) |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | S2S auth |
| `PROVIDER_SERVICE_URL` | `http://localhost:4002` | target validation/hydration + takedown for PROVIDER/WORK_PHOTO/INQUIRY/MESSAGE |
| `REVIEW_SERVICE_URL` | `http://localhost:4003` | same, for REVIEW |
| `JOB_SERVICE_URL` | `http://localhost:4004` | same, for JOB/JOB_RESPONSE |
| `WEB_ORIGIN` | `http://localhost:3000` | origin fallback |

## Gateway / S2S model

Only the api-gateway is public. Identity rides behind `x-internal-secret` via
gateway-forwarded `x-user-id` / `x-user-role` / `x-user-name`. Peer
dependencies: provider-, review- and job-service (owner validation reads,
queue hydration, takedown mutations). Read paths degrade gracefully
(`target: null`); write-path gates (submission validation, takedown) fail
loudly with 503/502.

## Development

```sh
cp .env.example .env
npm install
npm run db:push   # create tables in trust_safety_db
npm run dev
```

Checks: `npm run typecheck`, `npm test`, `npm run build`.
