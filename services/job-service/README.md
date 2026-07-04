# job-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/job-service`](https://github.com/luminary-dev/service-hub/tree/main/services/job-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Job request board ("reverse marketplace") service for Service Hub (Baas.lk).
Owns `job_db` (`JobRequest`, `JobResponse`). Customers post jobs; registered
providers see matching open jobs and respond. Runs on port **4004** behind the
api-gateway — never exposed publicly; every request must carry
`x-internal-secret`.

See `docs/ARCHITECTURE.md` in the monorepo for the full contract.

## Endpoints

Public (via gateway, which forwards `x-user-id` / `x-user-role` /
`x-user-name` / `x-locale` / `x-origin`):

| method | path | description |
|---|---|---|
| `POST` | `/api/jobs` | post a job request → `{ id }` |
| `GET` | `/api/jobs/board` | open jobs matching the caller's provider category + district → `{ jobs }` |
| `GET` | `/api/jobs/mine` | the caller's own jobs with hydrated responses → `{ jobs }` |
| `PATCH` | `/api/jobs/:id` | owner sets status `OPEN` \| `CLOSED` → `{ ok: true }` |
| `POST` | `/api/jobs/:id/responses` | provider responds to an open job → `{ ok: true }` |

Internal (service-to-service):

| method | path | description |
|---|---|---|
| `GET` | `/internal/jobs/count?category=&district=&excludeCustomerId=` | open-jobs count for the provider dashboard → `{ count }` |

Health: `GET /healthz` → `{ ok: true, service: "job-service" }` (no secret
required).

S2S dependencies: provider-service (provider gate + response hydration),
identity-service (customer name/email hydration), notification-service
(best-effort job-response email).

## Development

```sh
cp .env.example .env   # adjust if needed
npm install            # runs prisma generate
npm run db:push        # create tables in job_db
npm run db:seed        # no seed data; clears job tables
npm run dev            # tsx watch on :4004
```

Checks: `npm run typecheck`, `npm test`, `npm run build`.

## Environment

| var | purpose |
|---|---|
| `PORT` | listen port (default 4004) |
| `DATABASE_URL` | Postgres connection for `job_db` |
| `INTERNAL_API_SECRET` | shared secret for gateway/S2S auth |
| `IDENTITY_SERVICE_URL` | user hydration (names, emails) |
| `PROVIDER_SERVICE_URL` | provider gate + contact hydration |
| `NOTIFICATION_SERVICE_URL` | job-response emails |
