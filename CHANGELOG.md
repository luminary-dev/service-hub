# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases follow the `dev → prod` flow (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)):
changes land on `dev`, and a `dev → prod` PR cuts a release. Tag a release and
move entries from **Unreleased** into a versioned section as part of that PR.

## [Unreleased]

Hardening, operations and admin work on top of the initial release, plus the
move to Cloudflare R2 for storage and the UI 2.0 redesign.

### Added

- **Admin suite** — two-tier admin roles (**SUPPORT** read + report
  resolve/dismiss; **ADMIN** full access) gating privileged actions end-to-end
  (web + backend), an append-only audit log of every admin action, user
  impersonation for support, bulk actions, user management, job management,
  quality-score views, on-demand auto-flagging of low-quality / heavily-reported
  providers, content restore, and in-app notification badges for new
  verification requests and reports (see [docs/ADMIN.md](docs/ADMIN.md)).
- **Cloudflare R2 storage** — media-service stores processed images in R2
  (S3-compatible, private bucket) when the `R2_*` vars are set, falling back to
  local disk in development.
- **UI 2.0 redesign** — a refreshed, blueprint-themed design system across the
  web app with light / dark modes (see [docs/DESIGN.md](docs/DESIGN.md)).
- **CI coverage + e2e jobs** — per-package coverage collection with a low
  ratchet-floor threshold (#262) and a compose-stack e2e smoke job that boots
  the whole stack on pull requests (#241).
- **Deploy health-gate + rollback** — the deploy workflow gates on health
  checks and rolls back on failure, and releases are tagged as part of the
  `dev → prod` flow.
- **Project docs & governance** — `LICENSE`, a `SECURITY.md` disclosure
  policy, a pull-request template, and the `docs/` technical reference
  (architecture, authz, admin, security, design, deployment, operations,
  backups, rate limiting, testing).

### Changed

- **Dropped Vercel Blob** — all file storage now goes through media-service
  (R2 or local disk); the Vercel Blob dependency and code path were removed.
- **Production Docker & ops** — multi-stage, non-root service images with
  pinned base images (tracked by a Docker Dependabot config), graceful
  shutdown on `SIGTERM`, and production resource limits + log rotation in the
  compose file.
- **Branch model** — moved to a `dev → prod` release flow; CI now runs on both
  `dev` and `prod`.

### Fixed

- **Data integrity** — registration maps the Prisma `P2002` unique-violation to
  a clean "email already registered" error, inquiry creation runs in a single
  transaction, batch endpoints enforce input caps, the review table gained a
  covering index, and the provider directory query is now bounded.
- **DB-readiness `/healthz`** — service health checks now verify database
  connectivity instead of always returning ok, so the deploy health-gate and
  compose `--wait` reflect real readiness.

### Security

- **Constant-time S2S secret comparison** — the internal shared-secret check is
  now timing-safe.
- **HSTS** — the gateway sets `Strict-Transport-Security` in production.
- **Chat-service hardening** — the assistant endpoint now requires an
  authenticated session, is rate-limited, and caps request body size.
- **Password policy** — registration and reset enforce a minimum-strength
  password policy.
- **Web session verification** — the web app pins JWT verification to `HS256`
  and honours session revocation (`sessionVersion`), so revoked sessions stop
  working immediately.

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
