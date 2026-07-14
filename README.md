# Baas.lk

A service marketplace for Sri Lanka connecting customers with local professionals — mechanics, electricians, plumbers, garden designers and more. "Baas" (බාස්) is the Sinhala word for a skilled tradesman. Professionals build a public profile with work photos, social links, contact numbers and rates; customers browse, filter by district/category, send inquiries, leave reviews, and post job requests that matching professionals respond to. No payments happen on the platform — customers deal with professionals directly.

The customer-facing UI is bilingual — an EN/සිං toggle in the navbar switches between English and Sinhala (cookie-based, translations in `src/lib/i18n.ts`).

## Architecture

The marketplace is built as **ten Hono services — an API gateway fronting nine backend microservices — with a Next.js 16 web app as a pure frontend**, all backed by Postgres and Redis. The web app never touches a database — it rewrites `/api/*` to the gateway, which verifies the JWT session cookie, enforces CSRF + rate limits, and fans requests out to the backend services over internal HTTP secured by a shared secret. The seven data-owning services (identity, provider, review, job, notification, search, trust-safety) each own their own Postgres database, and Redis backs the gateway's distributed rate limiter and the notification email queue. Full details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Narrative team documentation (onboarding, workflow, operations) is published to GitBook directly from this repo's [docs/](docs/) tree (Git Sync via `.gitbook.yaml` + `docs/SUMMARY.md`).

```
browser ── same-origin /api/* ──> Next.js web (:3000)
                                   │  rewrites /api/* ──> api-gateway (:4000)
                                   gateway routes to:
                                   ├── identity-service     (:4001)  users, auth, favorites
                                   ├── provider-service     (:4002)  profiles, services, photos, inquiries
                                   ├── review-service       (:4003)  reviews + review photos
                                   ├── job-service          (:4004)  job request board
                                   ├── notification-service (:4005)  in-app + email notifications
                                   ├── media-service        (:4006)  image processing + file storage
                                   ├── chat-service         (:4007)  Claude assistant (holds the LLM key)
                                   ├── search-service       (:4008)  provider search + geo discovery index
                                   └── trust-safety-service (:4009)  unified reports + audit store (dark launch)
                                   gateway ── rate limits ──> Redis (:6379)
```

- The seven data-owning services (identity, provider, review, job, notification, search, trust-safety) each own a Postgres database; media and chat are stateless. search_db is a derived, rebuildable index (PostGIS) over provider data. Cross-service data flows over internal HTTP with a shared secret.
- The gateway verifies the JWT session cookie, enforces CSRF + distributed (Redis-backed) rate limits, and forwards identity headers.
- This repo is the **canonical monorepo**. Every service under `services/` is also mirrored to its own repo in the `luminary-dev` org (`npm run sync:repos`), where it builds, tests and deploys standalone.

**Stack** — Next.js 16 (App Router) + React 19 + Tailwind CSS 4 on the frontend; Hono + Prisma 7 (Postgres) + zod per service; Redis for rate limiting; JWT sessions in httpOnly cookies (`jose` + `bcryptjs`).

## Getting started

Prereqs: Node 22+, Docker.

```bash
npm run setup      # scripts/setup.sh — install all packages, create .env files, start Postgres, run migrations, seed
npm run dev:all    # scripts/dev-all.sh — run the gateway + all nine backend services + the web app (Ctrl-C stops everything)
```

Open http://localhost:3000. In a separate terminal, once the stack is up,
rebuild the search index from the providers `setup.sh` just seeded — it's a
derived index (migrated, not seeded), so it starts empty and the provider
browse/search page has nothing to show until this runs once:

```bash
curl -sS -X POST -H "x-internal-secret: ${INTERNAL_API_SECRET:-dev-internal-secret}" \
  http://localhost:4008/internal/search/reindex
```

Or run the entire stack (Postgres, Redis, all services, web) in containers:

```bash
docker compose up -d --build

# The container images run as NODE_ENV=production, so the demo seed is an
# explicit opt-in (unlike `npm run setup` above, which seeds for you). Seed the
# six stateful services once the stack is up (search_db is a derived index —
# migrated, not seeded):
for s in identity-service provider-service review-service job-service notification-service trust-safety-service; do
  docker compose exec -e SEED_DEMO_DATA=true "$s" npm run db:seed
done

# search_db is a derived index — migrated, not seeded — so it starts empty.
# Rebuild it from the providers you just seeded, or the web app's provider
# browse/search page will show nothing:
curl -sS -X POST -H "x-internal-secret: ${INTERNAL_API_SECRET:-dev-internal-secret}" \
  http://localhost:4008/internal/search/reindex
```

Two lines you'll see during that seed are expected, not errors: each service
prints `.env not found. Continuing without it.` (containers read their config
from Compose, not a `.env` file), and `job-service` prints `no seed data` — the
job board starts empty by design (jobs are customer-created at runtime).

Ports: web `:3000`, gateway `:4000`, backend services `:4001`–`:4009`. Postgres
listens on host port **5433** (5432 is often taken by a local install); Redis is
internal to the compose network. Verify everything with the end-to-end smoke
suite while the stack is running:

```bash
npm run e2e         # scripts/e2e-smoke.sh — needs a running, seeded stack
```

**Local data is disposable.** We don't preserve or migrate data between runs —
the seeds are dummy data only. To get back to a clean, seeded stack, run
`scripts/dev-reset.sh`, which tears everything down **including volumes**
(`docker compose down -v`), rebuilds (`up -d --build`), and reseeds.

### Seeded accounts (password: `password123`)

> Demo accounts are for **local development only** — the seed refuses to run
> with `NODE_ENV=production` unless you explicitly set `SEED_DEMO_DATA=true`
> (the production compose images run as `NODE_ENV=production`, so seeding there
> is a deliberate opt-in). Bootstrap a real admin with `npm run create-admin`
> in `services/identity-service` (takes `--email`/`--password` flags or
> `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars).

| Role | Email | Notes |
| --- | --- | --- |
| Provider | `nuwan@example.com` | Mechanic, Colombo — has reviews + an inquiry |
| Provider | `kumari@example.com` | Garden designer, Kandy |
| Customer | `dilani@example.com` | Can leave reviews and post jobs |
| Admin | `admin@baas.lk` | Admin dashboard: verifications, suspensions, moderation |

## Features

**Customers** (account optional)
- Browse/search professionals by keyword, category and district, with sorting and pagination
- View profiles: bio, services & rates (LKR), work-photo gallery with lightbox, social links, reviews
- Send inquiries without an account; call/WhatsApp directly
- Ask the built-in Claude marketplace assistant to find providers and start inquiries in chat
- With a free account: leave star-rated reviews (with photos), save favorites, post job requests

**Professionals** (account required)
- 4-step registration: account → profile → contact & socials → services & rates
- Dashboard: stats, edit profile & availability, manage services, upload photos, manage inquiries
- Job board: open jobs matching their category & district, one response per job
- Identity verification (NIC/business docs) reviewed by admins for a verified badge

**Admins** (tiered roles)
- Admin panel with two role tiers (**SUPPORT** read + report resolve/dismiss; **ADMIN** full access) gating what each admin can do, enforced in the web app and the backend services
- Moderation: identity-verification review, provider suspension, and an abuse-report queue across providers, photos and reviews
- User & job management, bulk actions, quality-score views, on-demand auto-flagging, content restore, and in-app notification badges
- Every privileged action is written to an audit log; admins can impersonate users for support (see [docs/ADMIN.md](docs/ADMIN.md) and [docs/AUTHZ.md](docs/AUTHZ.md))

**Platform**
- Bilingual EN/සිං UI (cookie-based toggle) with light/dark themes (see [docs/DESIGN.md](docs/DESIGN.md))
- Image uploads processed with sharp (re-encode + EXIF strip) and served from Cloudflare R2, or local disk in dev

## Project layout

```
src/                     Next.js app (pages, components, i18n) — no database access
services/
  api-gateway/           public entry: routing, session verify, CSRF, rate limits
  identity-service/      users, sessions, tokens, favorites        (identity_db)
  provider-service/      providers, services, photos, inquiries    (provider_db)
  review-service/        reviews, review photos                    (review_db)
  job-service/           job requests + responses                  (job_db)
  notification-service/  in-app notifications + email (Resend)     (notification_db)
  media-service/         image processing (sharp) + file storage   (R2 / local disk)
  chat-service/          Claude marketplace assistant (holds LLM key) (stateless)
  search-service/        provider search + geo discovery (PostGIS)  (search_db)
  trust-safety-service/  unified reports + moderation audit (dark)  (trust_safety_db)
scripts/                 setup, dev-all, e2e-smoke, sync-service-repos
docs/ARCHITECTURE.md     service contracts, conventions, env vars
docker-compose.yml       Postgres + all services + web
```

Each service is self-contained (own `package.json`, lockfile, Prisma schema, Dockerfile, CI workflow, tests): `npm run typecheck && npm test && npm run build` works in any of them in isolation.

## Production notes

- Set a strong shared `AUTH_SECRET` (identity signs; gateway + web verify) and a strong `INTERNAL_API_SECRET` (all services + gateway); never expose service ports publicly — only the gateway. Secrets live in the environment, never in the repo (see [SECURITY.md](SECURITY.md)).
- Uploads use Cloudflare R2 (S3-compatible, private bucket) when the four `R2_*` vars are set; otherwise local disk served via the gateway (`/api/files/*`) — fine for a single node, use R2 when scaling out.
- Rate limits are Redis-backed and shared across gateway instances (`REDIS_URL`), with a per-instance in-memory fallback when Redis is unavailable (see [docs/RATE_LIMITING.md](docs/RATE_LIMITING.md)).
- **Email (password reset & verification) is NOT delivering to real users yet** — it needs a verified sending domain + `RESEND_API_KEY` on notification-service. See [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md).
- Releases follow a `dev → prod` branch model: changes land on `dev`, and a `dev → prod` PR cuts a tagged release; production runs pre-built GHCR images (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md)).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first change — it covers local
setup, the branch/PR workflow, Conventional Commits, and the merge rules. The full
engineering contract (for humans and AI assistants alike) is in [CLAUDE.md](CLAUDE.md).

## Documentation

The monorepo `docs/` folder is the canonical technical + process reference — the team's GitBook space is published directly from it (Git Sync via `.gitbook.yaml` + `docs/SUMMARY.md`), so there is no separate docs repo.

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — service contracts, conventions, env vars, data flow
- [docs/FEATURES.md](docs/FEATURES.md) — product feature reference, per surface
- [docs/AUTHZ.md](docs/AUTHZ.md) — authentication, sessions and the role/permission model
- [docs/ADMIN.md](docs/ADMIN.md) — admin panel: tiered roles, audit log, moderation, impersonation
- [SECURITY.md](SECURITY.md) — security model, secrets, and service hardening
- [docs/RATE_LIMITING.md](docs/RATE_LIMITING.md) — the Redis-backed distributed rate limiter
- [docs/DESIGN.md](docs/DESIGN.md) — the design system, theming and i18n
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — the `dev → prod` release flow and production topology
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — running, monitoring and troubleshooting the stack
- [docs/BACKUPS.md](docs/BACKUPS.md) — database backup and restore
- [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md) — configuring Resend for real email delivery
- [docs/TESTING.md](docs/TESTING.md) — the test layers, CI matrix, coverage and known gaps
