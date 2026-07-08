# job-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/job-service`](https://github.com/luminary-dev/service-hub/tree/main/services/job-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Reverse-marketplace ("job board") service for Service Hub (Baas.lk). Customers
post job requests (category + district + title/description/optional LKR budget);
registered providers see open jobs matching their own category and district and
respond once per job. Owns `job_db` (`JobRequest`, `JobResponse`). Monetization
(pricing, commission, payments) is intentionally deferred to v0.2 — v0.1 is free
to use. Runs on port **4004** behind
the api-gateway — never public; every request except `/healthz` carries
`x-internal-secret`. See [ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Endpoints

### Public — jobs (`/api/jobs`, via gateway)

| method | path | description |
|---|---|---|
| `POST` | `/api/jobs` | Post a job request (category validated S2S) → `{ id }`. |
| `GET` | `/api/jobs/board` | Open jobs matching the caller's provider category + district (excludes own; 403 without a provider profile). |
| `GET` | `/api/jobs/mine` | The caller's own jobs with hydrated responses. |
| `PATCH` | `/api/jobs/:id` | Owner sets status `OPEN` \| `CLOSED`. |
| `POST` | `/api/jobs/:id/responses` | Provider responds to an open job (one per job; best-effort response email). |

### Admin (read-only oversight; require SUPPORT or ADMIN, `isSupportOrAdmin`, else 403)

| method | path | description |
|---|---|---|
| `GET` | `/api/admin/jobs` | Job list (filters `status`, `category`) with customer name + response count (#222). |
| `GET` | `/api/admin/jobs/:id` | Job detail with responses; customer + provider contact hydrated (#222). |

### Internal (service-to-service)

| method | path | description |
|---|---|---|
| `GET` | `/internal/jobs/count?category=&district=&excludeCustomerId=` | Open-jobs count for the provider dashboard → `{ count }`. |
| `POST` | `/internal/users/:id/erase` | Account-deletion fan-out (deletes the user's jobs + responses; idempotent). |

`GET /healthz` → `{ ok: true, service: "job-service" }` (no secret; checks Postgres).

## Data ownership (`prisma/schema.prisma`)

- **JobRequest** — a customer's posting (`customerId`, `category`, `district`, `title`, `description`, optional `budget`, `status`).
- **JobResponse** — a provider's reply to a job (FK cascade; unique per `(jobRequestId, providerId)`).

Monetization (pricing, commission, payments) is intentionally deferred to v0.2 — there is no transaction ledger and no price/commission field on a job in v0.1.

## Environment

| var | purpose |
|---|---|
| `PORT` | listen port (default 4004) |
| `DATABASE_URL` | Postgres connection for `job_db` |
| `INTERNAL_API_SECRET` | shared secret for gateway/S2S auth (required in production) |
| `IDENTITY_SERVICE_URL` | customer name/email hydration |
| `PROVIDER_SERVICE_URL` | provider gate + contact hydration + category validation |
| `NOTIFICATION_SERVICE_URL` | job-response emails |
| `WEB_ORIGIN` | origin fallback for email links |

## Gateway / S2S model

Only the api-gateway is public. Identity arrives via gateway-forwarded
`x-user-id` / `x-user-role` / `x-user-name`. S2S dependencies: provider-service
(provider gate + contact hydration + category validation, 60s cache with static
fallback), identity-service (customer hydration), notification-service
(best-effort `/internal/email/job-response`). Hydration failures degrade to
"Unknown" / null; the provider gate failing returns 502.

## Development

```sh
cp .env.example .env   # adjust if needed
npm install            # runs prisma generate
npm run db:push        # create tables in job_db
npm run db:seed        # clears job tables (no seed data)
npm run dev            # tsx watch on :4004
```

Checks: `npm run typecheck`, `npm test`, `npm run build`.
