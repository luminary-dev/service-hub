# RFC: Stateful notification-service (in-app notification center)

- **Status:** Implemented — stateful core + `notification_db` (#618), in-app notification center (#621), producer events from the other services (#623)
- **Track:** Stage-2 Track 1
- **Refs:** #394 (in-app notification center), #393 (silent events), #516 (saved-search alerts — delivery half), #557/#580 (202-ack fan-out pattern), #612 (per-service DB roles, Redis auth)

## Summary

notification-service (:4005) is today a stateless internal mailer: nine
`POST /internal/email/*` routes (`services/notification-service/src/routes/email.ts`)
that render EN/SI templates and call Resend. It has no database, and the
gateway never routes to it — `ServiceName` in
`services/api-gateway/src/lib/routes.ts` is `identity | provider | review | job | media`.

This RFC upgrades it to the platform's **fifth stateful service**: a
`notification_db` storing per-user notifications and preferences, a generic
internal **event ingestion** endpoint that fans out to email *and* an in-app
feed, public routes for a notification center (bell + unread count + mark-read),
and a Redis-backed delivery queue. It absorbs #394, #393, and the delivery half
of #516 (which shipped email-only).

Non-goals: websockets/SSE push (v0.1 is poll/refetch), digest emails,
admin-facing notifications (the admin badge in
`src/components/admin/NotificationBadge.tsx` already works off queue counts and
stays as-is), and anything payment-related.

## Data model

New `services/notification-service/prisma/` (schema + hand-written migrations +
seed), following review-service exactly (`prisma-client-js` generator +
`@prisma/adapter-pg`, no cross-service FKs):

```prisma
enum NotificationType {
  NEW_INQUIRY            // provider: a customer sent an inquiry
  THREAD_REPLY           // either party: new message in an inquiry thread (#393)
  NEW_REVIEW             // provider: a review was published on their profile (#393)
  REVIEW_RESPONSE        // customer: the provider replied to their review
  VERIFICATION_APPROVED  // provider (#393)
  VERIFICATION_REJECTED  // provider (#393)
  NEW_JOB_MATCH          // provider: matching job posted (#501/#542)
  JOB_RESPONSE           // customer: a provider responded to their job
  SAVED_SEARCH_MATCH     // customer: new provider matches a saved search (#516)
  REPORT_RESOLVED        // reporter: their abuse report was actioned/dismissed
}

model Notification {
  id        String            @id @default(cuid())
  userId    String            // recipient — identity-service User id, no FK
  type      NotificationType
  payload   Json              // small, denormalized: names/titles needed to render
  link      String            // relative path, e.g. /account/inquiries/abc123
  readAt    DateTime?
  createdAt DateTime          @default(now())

  @@index([userId, createdAt(sort: Desc)])  // list page
  @@index([userId, readAt])                 // unread count
}

model NotificationPreference {
  id           String           @id @default(cuid())
  userId       String
  type         NotificationType
  emailEnabled Boolean          @default(true)
  inAppEnabled Boolean          @default(true)

  @@unique([userId, type])
}
```

Decisions:

- **Render at read time, store data not prose.** `payload` holds the facts
  (`{ providerName, rating }`, `{ jobTitle, district }`, …); the web app renders
  the sentence from `type` + `payload` via `src/lib/i18n.ts`, so a user who
  switches EN↔SI sees their whole feed in the new language. Emails keep
  rendering server-side from the existing templates in `lib/email.ts`.
- **Preferences are sparse overrides.** No row = both channels on. Only the ten
  catalog types are preference-gated; the transactional/security emails
  (`verify`, `password-reset`, `change-email`, `account-exists`,
  `email-change-attempt`) are **not** in the enum and can never be muted.
- **Retention is opportunistic, not scheduled.** On each insert for a user,
  delete that user's read notifications older than 90 days beyond the newest
  200 — no cron, no new infra. Account erasure adds the standard
  `POST /internal/users/:id/erase` fan-out route (identity already calls this on
  provider/review/job).
- **What stays out:** `SavedSearch` stays in identity-service (it's per-user
  query state; matching runs in provider-service's
  `src/lib/saved-search-alerts.ts` against `buildBrowseWhere`). notification
  only *delivers*. Likewise no mirror of users/providers — recipient ids and
  display names arrive in the event payload.

Migration plan: `0_init` creates both tables + enum (idempotent-guarded DDL per
repo convention). `package.json` gains the review-service prisma block
(`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`; `postinstall: prisma generate`;
`db:migrate`/`db:migrate:dev`/`db:seed`; `start:migrate: prisma migrate deploy && exec node dist/index.js`)
and the Dockerfile CMD switches to `start:migrate`.

## New notification_db & compose wiring

Dev (`docker-compose.yml` + `scripts/init-db.sql`):

- `scripts/init-db.sql`: add `CREATE DATABASE notification_db;`.
- `notification-service` block gains
  `DATABASE_URL: postgresql://postgres:postgres@postgres:5432/notification_db`,
  `REDIS_URL: redis://redis:6379`, and `depends_on: postgres + redis (service_healthy)`.
  Local data stays disposable (`./scripts/dev-reset.sh`).

Prod (`docker-compose.prod.yml`, #612 pattern):

- New secret `NOTIFICATION_DB_PASSWORD` — added to the postgres block's
  environment, `.env.prod.example`, and the two lists in
  `.github/workflows/deploy.yml` (env render ~line 135 and the required-secrets
  check ~line 180).
- `deploy/postgres-init.sh`: `create_service_db notification notification_db …`
  (fresh volumes). `deploy/migrate-db-roles.sh`: matching `migrate notification notification_db …`
  line — **this is the live-prod path**, run once against the existing pgdata
  before the release that ships the service.
- `notification-service` block:
  `DATABASE_URL: postgresql://notification:${NOTIFICATION_DB_PASSWORD:?}@postgres:5432/notification_db`,
  `REDIS_URL: redis://default:${REDIS_PASSWORD:?}@redis:6379` (Redis auth per
  #612, same commented form as identity/gateway), `depends_on` postgres + redis
  healthy, and healthcheck switched `*node-healthcheck` → `*db-healthcheck`
  (`start_period: 120s`, because `prisma migrate deploy` now runs on boot, #568).
- **Drop `read_only: true` + the tmpfs** from the block: the comment justifying
  it ("stateless — writes nothing to disk") stops being true, and the migration
  engine's temp-file behaviour under a read-only rootfs is the same unverified
  TODO the four existing DB services carry. `mem_limit` 256m → 384m to match
  them. Networks stay `[backend, egress]` (Postgres/Redis on backend, Resend on
  egress).

Backups & ops scripts:

- `scripts/backup-dbs.sh`: add `notification_db` to `DATABASES`.
- `scripts/restore-db.sh`: extend the usage string / allowed set.
- `scripts/verify-backup.sh`: add `notification_db:Notification` to the
  restore-check pairs (exempt from the identity-style zero-rows fatal — a fresh
  feed can legitimately be empty).
- `docs/BACKUPS.md`: mention the fifth database.
- Seeds: `prisma/seed.js` inserts a handful of demo notifications against the
  deterministic seed ids (`user_dilani`, `prov_nuwan`, …) under the same
  `SEED_DEMO_DATA` / refuse-on-production guard; add `notification-service` to
  `DB_SERVICES` in `scripts/setup.sh`, to the reseed loop in
  `scripts/e2e-smoke.sh`, and to the container-seed loop in `CLAUDE.md`.

## API

### Internal ingestion (S2S)

One generic endpoint replaces per-event email routes for **marketplace events**
(the transactional auth mails keep their dedicated `/internal/email/*` routes —
they are not notifications and take no preferences):

```
POST /internal/notifications/events
{
  type: NotificationType,
  recipients: [{ userId, email?, name?, locale? }],   // ≤ 200, deduped by userId
  payload: { ... },        // type-specific, zod-validated per type
  link: "/relative/path"   // absolute URLs rebuilt per channel from x-origin
}
→ 202 { ok: true, accepted: n }
```

Behaviour folds in the existing 202-ack contract (#557, shipped in #580, used
today by `/internal/email/new-job` and `/internal/email/new-provider-match`):
validate → load `NotificationPreference` rows for `(recipients × type)` →
`createMany` Notification rows for in-app-enabled recipients **inline**
(durable even if Redis or Resend is down) → enqueue one email job per
email-enabled recipient → ack `202` before any send. `email` is
caller-supplied, as today — every current caller already holds the address
(`contactEmail`, identity hydration), and it keeps notification free of a
synchronous identity dependency on the hot path. Recipients without an `email`
get in-app only.

The four existing marketplace email routes (`/inquiry`, `/job-response`,
`/new-job`, `/new-provider-match`) are kept during rollout and **deleted** once
their callers move to `/internal/notifications/events` (phase 3 below). The
five auth routes stay permanently.

### Public routes (via gateway, identity-header auth)

New routes on notification-service, gated by a `getAuth(c)` reading
`x-user-id`/`x-user-role` exactly like `services/review-service/src/lib/http.ts`
(401 without a session; every query is scoped `WHERE userId = auth.userId` —
recipient-only access, any role, per `docs/AUTHZ.md`):

| Route | Behaviour |
|---|---|
| `GET /api/notifications?take&cursor` | Own feed, newest first, cursor-paginated (take ≤ 50). |
| `GET /api/notifications/unread-count` | `{ count }` — the bell badge (cheap indexed count). |
| `POST /api/notifications/read` | `{ ids?: string[], all?: true }` — mark-read, own rows only, idempotent. |
| `GET /api/notification-preferences` | Full type × channel matrix (defaults merged over stored overrides). |
| `POST /api/notification-preferences` | Upsert one override `{ type, emailEnabled?, inAppEnabled? }`. |

Gateway changes (`services/api-gateway/src/lib/routes.ts`):

- Extend `ServiceName` with `"notification"`; add a `serviceUrl` case returning
  `NOTIFICATION_SERVICE_URL ?? "http://localhost:4005"` (the env var already
  exists in both compose files' `x-service-env`).
- In `resolveRoute`, after the `/api/admin/` fallback (so
  `/api/admin/notifications/counts` keeps resolving to provider-service):

```ts
if (pathname === "/api/notifications" || pathname.startsWith("/api/notifications/"))
  return { service: "notification", path: pathname };
if (pathname === "/api/notification-preferences")
  return { service: "notification", path: pathname };
```

- Rate limits (`services/api-gateway/src/lib/rate-limit.ts`): the middleware
  only limits POSTs, which fits — the writes are POSTs by design. Add to
  `LIMITED_ROUTES`: `/api/notifications/read` on the `message` budget (30/10 min,
  conversational-frequency) and `/api/notification-preferences` on the `review`
  budget (10/h, settings-form frequency). The GETs stay unthrottled like every
  other read; the client controls polling frequency (below).

## Delivery pipeline

Redis-backed, deliberately infra-free (no BullMQ, no streams consumer groups —
the same plain client the gateway/identity already use):

- **Enqueue:** `LPUSH notify:email` with
  `{ type, to, locale, payload, link, attempt: 0 }` per recipient.
- **Worker:** one in-process loop per instance:
  `BRPOPLPUSH notify:email notify:processing` (5 s timeout) → render the
  template → `sendMail` → `LREM notify:processing`. A periodic sweep (every
  60 s) reclaims `notify:processing` entries older than 2 min back onto the
  queue, so a crash mid-send retries instead of losing the job.
- **Retry/backoff:** on send failure re-enqueue with `attempt + 1` after
  `30s × 2^attempt`; after 3 attempts, drop and `log.error` — email remains
  best-effort/fail-soft, exactly the contract every current caller assumes.
- **Degraded mode:** Redis unavailable → fall back to the current in-memory
  `void (async () => …)` background fan-out from `routes/email.ts` (one
  attempt, logged). In-app rows are unaffected either way — they're written
  inline before the ack. Mirrors the gateway's Redis-down rate-limit fallback.
- Queue depth is bounded in practice by the ingestion cap (≤200
  recipients/event) and Resend's own throughput; `redis_data` is already a
  persisted volume (#571), so a restart doesn't drop queued sends.

## Event catalog & call sites

| Type | Emitter (exact site) | Recipient / notes |
|---|---|---|
| `NEW_INQUIRY` | `services/provider-service/src/lib/clients.ts` `sendInquiryEmail` (~155) → becomes `emitNotification` | Provider owner; already has email + locale. |
| `THREAD_REPLY` | `services/provider-service/src/routes/messages.ts` `POST /api/inquiries/:id/messages` (~85), after the message transaction | The *other* party: `Inquiry.userId` (customer, nullable → email-less guests get nothing) or `provider.userId`; email from `Inquiry.email` / `Provider.contactEmail`. **New — closes the #393 gap.** |
| `NEW_REVIEW` | `services/review-service/src/routes/reviews.ts` `POST /api/providers/:id/reviews` (~102), after create | Provider owner — `provider.userId` is already fetched via `/internal/providers/:id/summary`; extend the summary payload with `contactEmail`. **New (#393).** |
| `REVIEW_RESPONSE` | `services/review-service/src/routes/reviews.ts` `POST /api/reviews/:id/response` (~295) | Review author (`review.userId`); email hydrated via identity `GET /internal/users?ids=`. |
| `VERIFICATION_APPROVED/REJECTED` | `services/provider-service/src/routes/admin.ts` `PATCH /api/admin/verifications/:id` (~312) and the bulk `PATCH /api/admin/verifications` (~353) | Provider owner. **New (#393).** |
| `NEW_JOB_MATCH` | `services/job-service/src/routes/jobs.ts` (~162, today `/internal/email/new-job`) | Matched providers (#501/#542 fan-out). `GET /internal/providers/matching` must add `userId` per provider (today it dedupes to emails only). |
| `JOB_RESPONSE` | `services/job-service/src/routes/jobs.ts` (~437, today `/internal/email/job-response`) | Job's customer. |
| `SAVED_SEARCH_MATCH` | `services/provider-service/src/lib/saved-search-alerts.ts` (~131, today `/internal/email/new-provider-match`) | Saved-search owners (#516). identity's `GET /internal/saved-searches/candidates` must return `userId` alongside `email` so the in-app half is addressable. |
| `REPORT_RESOLVED` | resolve routes in `services/review-service/src/routes/reports.ts` (~240), `services/provider-service/src/routes/reports.ts`, `services/job-service` reports | Reporter (`reporterId`, nullable — anonymous/SYSTEM reports skip). In-app only in v1 (no email template yet). |

All emits are best-effort try/catch after the owning write, matching today's
`log.error("notification failed", …)` pattern; the 202 ack keeps every call
inside the `s2s()` 5 s budget.

## Web

- **`src/components/NotificationBell.tsx`** (client) in `src/components/Navbar.tsx`
  for signed-in users: badge from `GET /api/notifications/unread-count`,
  modeled on `src/components/admin/NotificationBadge.tsx` — fetch on mount +
  window-focus refresh, plus a slow 60 s poll while the tab is visible (the
  feed, unlike the admin badge, is the product's engagement loop). No
  websockets/SSE in v0.1. Fails to hidden on error (degrade like
  `FavoriteButton`).
- Bell opens a dropdown of the latest ~10 (marking them read via
  `POST /api/notifications/read`), with a "view all" link to
  **`/account/notifications`** — a server component page fetching via
  `src/lib/api.ts`, cursor-paginated, each row rendering `type + payload`
  through new keys in `src/lib/i18n.ts` (EN + SI, like the saved-searches
  strings just added) and linking to `link`.
- **Preferences UI**: a section on `/account` (alongside Saved searches)
  rendering the `GET /api/notification-preferences` matrix as per-type
  email/in-app toggles.

## Rollout

Three PRs, each independently deployable (single-host compose deploys
atomically, but callers and provider must never require each other's new code
within one release):

1. **`feat(notification): stateful service + notification_db + public routes`** —
   prisma schema/migration/seed, compose + init/migrate-role/backup/seed-script
   changes, ingestion endpoint, queue worker, public routes, gateway
   routing/rate-limit additions, docs (`docs/ARCHITECTURE.md` diagram + "no db"
   notes, `docs/architecture/data-model.md`, `docs/api/public.md`,
   `docs/api/internal.md`, `docs/BACKUPS.md`, `.env.prod.example`). No existing
   caller changes — old email routes untouched, so mixed states are safe.
   *Prod pre-step:* set the `NOTIFICATION_DB_PASSWORD` repo secret and run
   `deploy/migrate-db-roles.sh` on the server (existing pgdata never re-runs
   initdb).
2. **`feat(web): notification bell + center + preferences`** — pure consumer of
   PR 1's routes.
3. **`feat(backend): emit events for silent + existing notifications`** — the
   call-site table above; migrate the four marketplace email calls to
   `/internal/notifications/events`, add the new emitters, then delete
   `/internal/email/{inquiry,job-response,new-job,new-provider-match}` and
   update `docs/EMAIL_SETUP.md` + `docs/FEATURES.md`. Closes #393/#394.

Mirror repo: `luminary-dev/notification-service` picks everything up via the
normal `npm run sync:repos` after release — no special handling (prisma dirs
already mirror fine for the four DB services).

CI: **already covered** — the `services` matrix in `.github/workflows/ci.yml`
runs `typecheck`/`test`/`build` for `notification-service` today (and the deploy
workflow already builds/pushes its image), so only the e2e seed loop and
verify-backup gain entries.

### Risks

- **Boot now runs migrations**: a bad migration blocks the deploy health-gate →
  auto-rollback (mitigated by the `db-healthcheck` 120 s start_period and
  hand-written idempotent DDL). Removing `read_only` is a small hardening
  regression, accepted parity with the other DB services.
- **Queue loss**: Redis flush/loss drops queued *emails* only (in-app rows are
  already durable); acceptable for best-effort notifications, and `redis_data`
  persists across recreation.
- **New public dependency**: gateway → notification on user-facing routes. The
  bell degrades to hidden; only the notifications page itself errors.
- **Table growth**: bounded by the per-user retention sweep + the two indexes.
- **Payload staleness**: names/titles are denormalized at emit time (a renamed
  provider shows the old name in old notifications) — same trade-off emails
  already make.
- **Dual-write window** during phase 3 (some events on old routes, some new):
  bounded to one PR; no event double-sends since each call site moves atomically.
