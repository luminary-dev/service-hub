# notification-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/notification-service`](https://github.com/luminary-dev/service-hub/tree/main/services/notification-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Stateful notification service for Service Hub (Baas.lk), listening on `:4005`.
It owns `notification_db` — per-user in-app notifications and channel
preferences — plus the transactional email templates (English and Sinhala),
sent via [Resend](https://resend.com) when `RESEND_API_KEY` is set — otherwise
it logs the email to the console and reports `delivered: false`, so the whole
flow works locally without any account. User-controlled values are HTML-escaped
and links are scheme-validated before rendering.

Marketplace events arrive on one generic S2S ingestion endpoint that fans out
to the in-app feed (written inline, durable) and a Redis-backed email queue
(`notify:email`, BRPOPLPUSH worker + processing-list reclaim, 3 attempts with
30s × 2^n backoff; Redis unavailable → degraded one-attempt direct sends).
Every request except `/healthz` must carry
`x-internal-secret: $INTERNAL_API_SECRET` (constant-time checked), or it is
rejected with `403 { "error": "Forbidden" }`; the `/api/*` routes additionally
read the gateway's identity headers. See
[EMAIL_SETUP.md](../../docs/EMAIL_SETUP.md) for enabling real delivery.

## Endpoints

Public (via the api-gateway, identity-header auth — recipient-only, any role):

| method | path | body | response |
|---|---|---|---|
| `GET` | `/api/notifications?take&cursor` | — | `200 { notifications, nextCursor }` (own feed, newest first; `take` ≤ 50) |
| `GET` | `/api/notifications/unread-count` | — | `200 { count }` |
| `POST` | `/api/notifications/read` | `{ ids?: string[], all?: true }` | `200 { ok: true, updated }` (own rows only, idempotent) |
| `GET` | `/api/notification-preferences` | — | `200 { preferences }` (full type × channel matrix, defaults merged over overrides) |
| `POST` | `/api/notification-preferences` | `{ type, emailEnabled?, inAppEnabled? }` | `200 { preference }` (upsert one override) |

Internal (S2S):

| method | path | body | response |
|---|---|---|---|
| `GET` | `/healthz` | — | `200 { ok: true, service }` / `503` when Postgres is unreachable (readiness probe) |
| `POST` | `/internal/notifications/events` | `{ type, recipients: [{ userId, email?, name?, locale? }] (≤200), payload, link }` | `202 { ok: true, accepted }` — writes in-app rows inline, queues emails, acks before any send |
| `POST` | `/internal/users/:id/erase` | — | `200 { ok: true }` (account-deletion fan-out, idempotent) |
| `POST` | `/internal/email/verify` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/password-reset` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/change-email` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/account-exists` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/email-change-attempt` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/inquiry` | `{ to, url, customerName, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/job-response` | `{ to, url, providerName, jobTitle, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/new-job` | `{ recipients: string[], url, jobTitle, district, locale? }` | `202 { ok: true, accepted }` (sends in the background, #557) |
| `POST` | `/internal/email/new-provider-match` | `{ recipients: string[], url, providerName, district, locale? }` | `202 { ok: true, accepted }` (sends in the background) |

- `type` is one of the ten catalog `NotificationType`s (see
  `prisma/schema.prisma`); `payload` is zod-validated per type and stored
  denormalized — the web renders the sentence from `type` + `payload` at read
  time. The five auth email routes are permanent; the four marketplace email
  routes remain until their callers migrate to `/internal/notifications/events`.
- `locale` is `"en"` or `"si"`; it defaults to `"en"` and any other value is
  coerced to `"en"`.
- Invalid bodies return `400 { "error": "Invalid input" }`.

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4005` | listen port |
| `DATABASE_URL` | — | Postgres connection for `notification_db` |
| `REDIS_URL` | *(empty)* | email delivery queue; unset → degraded one-attempt direct sends |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | shared secret for internal calls |
| `RESEND_API_KEY` | *(empty)* | Resend API key; when unset, emails are logged to the console (`delivered: false`) |
| `EMAIL_FROM` | `Baas.lk <onboarding@resend.dev>` | From address (must be on a verified domain for real delivery) |

## Run

```sh
npm install
npm run db:migrate # prisma migrate deploy against $DATABASE_URL
npm run db:seed    # demo notifications (refuses under NODE_ENV=production unless SEED_DEMO_DATA=true)
npm run dev        # tsx watch, http://localhost:4005

npm run typecheck
npm test
npm run build      # emits dist/
npm start          # node dist/index.js (container CMD is start:migrate)
```

Or with Docker:

```sh
docker build -t notification-service .
docker run --rm -p 4005:4005 --env-file .env notification-service
```
