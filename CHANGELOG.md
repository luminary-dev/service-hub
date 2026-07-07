# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases follow the `dev → prod` flow (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)):
changes land on `dev`, and a `dev → prod` PR cuts a release. Tag a release and
move entries from **Unreleased** into a versioned section as part of that PR.

## [Unreleased]

_Nothing yet._

## [0.1.0] - 2026-07-07

First tagged release — the initial Baas.lk services marketplace for Sri Lanka.

### Added

- **Microservice architecture** — a Next.js 16 (App Router) + React 19
  frontend behind an API gateway that fronts seven Hono + Prisma services, each
  owning its own Postgres database, with cross-service data flowing over
  internal HTTP secured by a shared secret. This repo is the canonical
  monorepo; every service is also mirrored to its own `luminary-dev/*` repo.
- **Identity & auth** (identity-service) — registration (customer / provider),
  login, JWT sessions in httpOnly cookies (`jose`), password reset and email
  verification flows, session revocation (`sessionVersion`), per-account
  lockout after repeated failed logins, favorites, and account deletion.
- **Provider profiles & search** (provider-service) — provider profiles with
  services & LKR rates, work-photo galleries, keyword / category / district
  search (pg_trgm, bilingual category matching), sorting and pagination,
  inquiries, availability windows, and a managed category list.
- **Reviews** (review-service) — star-rated reviews with photos, rating
  aggregation, and account review history.
- **Jobs** (job-service) — customer job requests and a provider job board with
  one response per job.
- **Inquiries & chat assistant** — inquiry message threads, plus a streaming
  Claude marketplace assistant (chat-service, holds the LLM key) with
  `search_providers` / `create_inquiry` tools.
- **Media & storage** (media-service) — image processing with sharp (re-encode,
  EXIF strip), served from Cloudflare R2 when configured, otherwise local disk.
- **Admin moderation** — identity-verification (NIC / business doc) review,
  provider suspension, and an abuse-report queue across providers, photos and
  reviews.
- **API gateway** — public entry point handling session verification, CSRF,
  streaming proxy routing, and Redis-backed distributed rate limiting with a
  per-instance in-memory fallback (see [docs/RATE_LIMITING.md](docs/RATE_LIMITING.md)).
- **Bilingual UI** — English / Sinhala (සිං) toggle, cookie-based, with a
  blueprint-themed design system and light / dark modes
  (see [docs/DESIGN.md](docs/DESIGN.md)).
- **Deployment** — Docker Compose for local dev; production runs pre-built GHCR
  images behind a Caddy TLS reverse proxy, released via a `dev → prod` merge
  (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

[Unreleased]: https://github.com/luminary-dev/service-hub/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/luminary-dev/service-hub/releases/tag/v0.1.0
