# review-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/review-service`](https://github.com/luminary-dev/service-hub/tree/main/services/review-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Owns customer reviews and review photos for Service Hub (port **4003**, database
`review_db`). One review per user per provider (upsert: re-posting replaces the
rating/comment and appends photos, up to 3). It computes provider rating
aggregates, sets a `verified` badge when the reviewer had a prior inquiry with
the provider (checked S2S), owns abuse reports filed against reviews (#50) and an
admin moderation queue with soft-delete/restore (#32), and keeps a moderation
audit log (#227). Photo bytes live in media-service; this service stores only
their URLs. Reached only through the api-gateway; every request except
`/healthz` carries `x-internal-secret`.

## Endpoints

### Public / reviews (via gateway)

- `GET /api/providers/:id/reviews` — paginated reviews for a profile (cursor; suspended provider → 404).
- `POST /api/providers/:id/reviews` — create/update the signed-in user's review (multipart: `rating`, `comment`, up to 3 `photos`); blocks self-review; sets `verified` from the prior-interaction check.
- `DELETE /api/reviews/photos/:id` — delete a single photo (review author or admin).
- `POST /api/reviews/:id/report` — file an abuse report (optional auth; `spam`\|`scam`\|`offensive`\|`fake`\|`other`; duplicate open reports are refreshed) (#50).
- `GET /api/account/reviews` — the signed-in user's own reviews with provider names hydrated (#46).

### Admin (reads + report resolve/dismiss require SUPPORT or ADMIN via `isSupportOrAdmin`; delete/restore require full ADMIN; else 403)

- `DELETE /api/admin/reviews/:id` — full ADMIN; soft-delete a review (sets `deletedAt`; audit `delete-review`).
- `PATCH /api/admin/reviews/:id/restore` — full ADMIN; restore a soft-deleted review (audit `restore-review`).
- `GET /api/admin/review-reports` — moderation queue (open first) with target summaries; `status` / `targetType` filters.
- `GET /api/admin/review-reports/count` — `{ openReports }` for the admin hub badge (#233).
- `PATCH /api/admin/review-reports/:id` — resolve / dismiss a single report (records resolver + timestamp).
- `PATCH /api/admin/review-reports` — bulk resolve / dismiss (`ids` ≤ 200) (#231).
- `GET /api/admin/review-audit-log` — read-only moderation history (filter `adminId`, `action`, date range) (#227).
- `GET /api/admin/review-stats` — `{ openReports }` for the merged admin dashboard metric (#219).

### Internal (S2S)

- `GET /internal/ratings?providerIds=a,b,c` → `{ ratings: { [id]: { rating, count } } }` (excludes soft-deleted).
- `GET /internal/by-provider/:id` → reviews with reviewer names hydrated from identity-service (cursor; `includeDeleted=1`).
- `GET /internal/count` → `{ count }`.
- `POST /internal/maintenance/sweep-orphans` — remove orphaned review-photo files (#36).
- `POST /internal/users/:id/erase` — account-deletion fan-out (hard-deletes the user's reviews; idempotent).

`GET /healthz` is unauthenticated (checks Postgres; compose healthchecks).

## Data ownership (`prisma/schema.prisma`)

- **Review** — a user's review of a provider (`rating`, `comment`, `verified`, `deletedAt`); unique per `(providerId, userId)`.
- **ReviewPhoto** — a photo URL attached to a review (FK cascade).
- **Report** — abuse report against a review (`targetType`/`targetId`, nullable `reporterId`, reason, status, resolver audit fields).
- **AdminAuditLog** — one row per admin moderation action (delete/restore/resolve/dismiss) (#227).

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4003` | listen port |
| `DATABASE_URL` | — | Postgres (`review_db`) |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | S2S auth |
| `IDENTITY_SERVICE_URL` | `http://localhost:4001` | reviewer name/email hydration |
| `PROVIDER_SERVICE_URL` | `http://localhost:4002` | provider existence + prior-interaction check |
| `MEDIA_SERVICE_URL` | `http://localhost:4006` | photo storage / serving / sweep |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:4005` | notification events (NEW_REVIEW / REVIEW_RESPONSE / report resolution) |
| `WEB_ORIGIN` | `http://localhost:3000` | origin fallback |

## Gateway / S2S model

Only the api-gateway is public. Identity rides behind `x-internal-secret` via
gateway-forwarded `x-user-id` / `x-user-role` / `x-user-name`. Peer dependencies:
provider-service (existence + prior-inquiry gate), identity-service (name
hydration), media-service (photo bytes). Read paths degrade to "Unknown" / open
on peer outage. Review photos (≤ 3) are forwarded to media-service over S2S
(`lib/storage.ts`, `storeImage("review", …)`), which does the sharp
re-encode/EXIF-strip and serves the bytes.

## Development

```sh
cp .env.example .env
npm install
npm run db:push   # create tables in review_db
npm run db:seed   # demo reviews (ids line up with identity/provider seeds)
npm run dev
```

Checks: `npm run typecheck`, `npm test`, `npm run build`.
