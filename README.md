# Baas.lk

A service marketplace for Sri Lanka connecting customers with local professionals — mechanics, electricians, plumbers, garden designers and more. "Baas" (බාස්) is the Sinhala word for a skilled tradesman. Professionals build a public profile with work photos, social links, contact numbers and rates; customers browse, filter by district/category, send inquiries, leave reviews, and post job requests that matching professionals respond to. No payments happen on the platform — customers deal with professionals directly.

The customer-facing UI is bilingual — an EN/සිං toggle in the navbar switches between English and Sinhala (cookie-based, translations in `src/lib/i18n.ts`).

## Architecture

Microservices behind an API gateway; the Next.js app is a pure frontend. Full details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Team documentation (onboarding, workflow, operations) lives in [luminary-dev/service-hub-docs](https://github.com/luminary-dev/service-hub-docs).

```
browser ── same-origin /api/* ──> Next.js web (:3000)
                                   │  rewrites /api/* ──> api-gateway (:4000)
                                   gateway routes to:
                                   ├── identity-service     (:4001)  users, auth, favorites
                                   ├── provider-service     (:4002)  profiles, services, photos, inquiries
                                   ├── review-service       (:4003)  reviews + review photos
                                   ├── job-service          (:4004)  job request board
                                   └── notification-service (:4005)  email (Resend)
```

- Each service owns its own Postgres database; cross-service data flows over internal HTTP with a shared secret.
- The gateway verifies the JWT session cookie, enforces CSRF + rate limits, and forwards identity headers.
- This repo is the **canonical monorepo**. Every service under `services/` is also mirrored to its own repo in the `luminary-dev` org (`npm run sync:repos`), where it builds, tests and deploys standalone.

**Stack** — Next.js 16 (App Router) + React 19 + Tailwind CSS 4 on the frontend; Hono + Prisma 7 (Postgres) + zod per service; JWT sessions in httpOnly cookies (`jose` + `bcryptjs`).

## Getting started

Prereqs: Node 22+, Docker.

```bash
npm run setup      # install all packages, create .env files, start Postgres, push schemas, seed
npm run dev:all    # run all six services + the web app (Ctrl-C stops everything)
```

Open http://localhost:3000.

Or run the entire stack in containers:

```bash
docker compose up --build
```

Postgres listens on host port **5433** (5432 is often taken by a local install). Verify everything with the end-to-end smoke suite while the stack is running:

```bash
npm run e2e
```

### Seeded accounts (password: `password123`)

> Demo accounts are for **local development only** — the seed refuses to run
> with `NODE_ENV=production`. Bootstrap a real admin with
> `npm run create-admin` in `services/identity-service` (takes
> `--email`/`--password` flags or `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars).

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
- With a free account: leave star-rated reviews (with photos), save favorites, post job requests

**Professionals** (account required)
- 4-step registration: account → profile → contact & socials → services & rates
- Dashboard: stats, edit profile & availability, manage services, upload photos, manage inquiries
- Job board: open jobs matching their category & district, one response per job
- Identity verification (NIC/business docs) reviewed by admins for a verified badge

## Project layout

```
src/                     Next.js app (pages, components, i18n) — no database access
services/
  api-gateway/           public entry: routing, session verify, CSRF, rate limits
  identity-service/      users, sessions, tokens, favorites        (identity_db)
  provider-service/      providers, services, photos, inquiries    (provider_db)
  review-service/        reviews, review photos                    (review_db)
  job-service/           job requests + responses                  (job_db)
  notification-service/  email templates + Resend delivery         (stateless)
scripts/                 setup, dev-all, e2e-smoke, sync-service-repos
docs/ARCHITECTURE.md     service contracts, conventions, env vars
docker-compose.yml       Postgres + all services + web
```

Each service is self-contained (own `package.json`, lockfile, Prisma schema, Dockerfile, CI workflow, tests): `npm run typecheck && npm test && npm run build` works in any of them in isolation.

## Production notes

- Set a strong shared `AUTH_SECRET` (identity signs; gateway + web verify) and a strong `INTERNAL_API_SECRET` (all services + gateway); never expose service ports publicly — only the gateway.
- Uploads use Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set; otherwise local disk served via the gateway (`/api/files/*`) — fine for a single node, use the Blob path when scaling out.
- **Email (password reset & verification) is NOT delivering to real users yet** — it needs a verified sending domain + `RESEND_API_KEY` on notification-service. See [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md).
- Rate limits are in-memory per gateway instance; move to Redis if you run multiple gateways.
