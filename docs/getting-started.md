# Getting started

## Prerequisites

- Node 22+ (services and web target Node 22; newer works)
- Docker (Postgres, and optionally the full containerized stack)

## First run

```bash
git clone https://github.com/luminary-dev/service-hub.git
cd service-hub
npm run setup      # installs all packages, creates .env files, starts Postgres, pushes schemas, seeds
npm run dev:all    # runs the gateway + all seven backend services + the web app (Ctrl-C stops everything)
```

Open http://localhost:3000.

Alternatively, run everything in containers:

```bash
docker compose up --build
```

## Ports

| Component | Port | Owns |
| --- | --- | --- |
| web (Next.js) | 3000 | UI only — no database |
| api-gateway | 4000 | public entry: CSRF, rate limits, session verify, routing |
| identity-service | 4001 | `identity_db` — users, auth, sessions, favorites |
| provider-service | 4002 | `provider_db` — profiles, services, photos, inquiries, verification |
| review-service | 4003 | `review_db` — reviews + review photos |
| job-service | 4004 | `job_db` — job request board |
| notification-service | 4005 | stateless — transactional email (Resend) |
| media-service | 4006 | stateless — upload bytes + sharp image processing |
| chat-service | 4007 | stateless — Claude assistant (holds the LLM key) |
| Postgres | **5433** on the host | one cluster, one database per service |
| Redis | internal | shared rate-limit window |

Postgres binds host port 5433 because many dev machines already run a local Postgres on 5432.

## Seeded accounts (password: `password123`)

> Local development only — the seed refuses to run with `NODE_ENV=production`.
> Production admins come from `npm run create-admin` (see the
> [admin bootstrap](admin/notifications-and-bootstrap.md)). All seeded accounts
> are email-verified (there is no real inbox to confirm from, and job posting
> requires it — #556).

| Role | Email | Notes |
| --- | --- | --- |
| Provider | `nuwan@example.com` | Mechanic, Colombo — has reviews + an inquiry |
| Provider | `kumari@example.com` | Garden designer, Kandy |
| Customer | `dilani@example.com` | Can leave reviews and post jobs |
| Admin | `admin@baas.lk` | Admin dashboard: verifications, suspensions, moderation |

## Verifying your changes

Each service is self-contained — run its checks from its directory:

```bash
cd services/<name>
npm run typecheck && npm run test && npm run build
```

The web app at the repo root has the same scripts plus `npm run lint`. With the
full stack running, `npm run e2e` executes the end-to-end smoke suite. CI runs
typecheck/test/build for the web app and every service on each PR — the same
commands, so green locally means green in CI. See [TESTING.md](TESTING.md) for
the full test strategy.
