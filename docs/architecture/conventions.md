# Shared conventions (all services)


- **Stack**: TypeScript (CommonJS, `module: NodeNext`), Hono ^4 +
  `@hono/node-server`, Prisma 7 + `@prisma/adapter-pg`, zod, vitest. Layout:
  `src/index.ts` (serve, reads `PORT`), `src/app.ts` (exports the Hono app for
  tests), `src/db.ts`, `src/routes/*.ts`, `src/lib/*.ts`,
  `prisma/schema.prisma`, `prisma/seed.js`, `prisma.config.ts`, `Dockerfile`,
  `.env.example`, `README.md`. Scripts: `dev` (tsx watch), `build`, `start`,
  `start:migrate` (`prisma migrate deploy && node dist/index.js`), `typecheck`,
  `test`, `db:migrate`, `db:migrate:dev`, `db:push`, `db:seed`, `postinstall`
  (prisma generate). Schema changes ship as committed migrations under
  `prisma/migrations/` (baseline `0_init`); dev DBs created before the baseline
  run `scripts/baseline-migrations.sh` once. Reference scaffold:
  `services/identity-service/`.
- **Migration hygiene** (hand-written migrations, applied on start via
  `prisma migrate deploy`):
  - **Never edit or rename a migration that has already been applied.** Prisma
    records each migration's checksum; any change to an applied migration (SQL
    or directory name) is detected as drift and the service refuses to boot.
    Fixes and follow-ups always land as a **new** migration.
  - **Unique, correctly-ordered timestamps.** Each new migration directory is
    `YYYYMMDDHHMMSS_snake_summary` with a timestamp strictly greater than every
    existing one in that service (list the dirs and pick past the max). Migrations
    apply in lexical order, so duplicate or out-of-order timestamps make the
    apply order ambiguous.
  - **Idempotent DDL.** Guard every statement so a re-run is a no-op:
    `ADD COLUMN IF NOT EXISTS`, `DROP … IF EXISTS`, `CREATE INDEX IF NOT EXISTS`,
    guarded `CREATE`. New columns that must be `NOT NULL` carry a `DEFAULT` so
    existing rows backfill.
  - **Known, accepted offenders** (predate this convention; **not** editable
    without checksum drift, so left as-is): provider-service has four migrations
    sharing the timestamp `20260707120000` (`admin_audit_log`,
    `report_resolution_audit`, `report_source`, `verification_rejection_reason`)
    and review-service has two (`admin_audit_log`, `report_resolution_audit`);
    review-service's `20260708100000_review_provider_created_index` uses a bare
    `DROP INDEX` (no `IF EXISTS`) and several early provider-service migrations
    (`inquiry_messaging`, `reports`, `admin_audit_log`, …) use bare
    `CREATE INDEX` (no `IF NOT EXISTS`). These already applied cleanly on every
    environment; new migrations must not repeat the pattern.
- **Logging**: structured JSON on stdout, one line per event —
  `{ level, time, service, msg, ...fields }` via the canonical
  `src/lib/logging.ts` (identical copy in every service incl. the gateway; each
  service instantiates it in `src/lib/log.ts`). The request middleware logs one
  line per request (`requestId`, `method`, `path`, `status`, `durationMs`);
  `/healthz` polling is never logged. The gateway generates `x-request-id`
  (client-sent values are stripped — it's on the trusted `GATEWAY_HEADERS`
  list) and propagates it upstream so one id follows a request across services.
  Errors go through `log.error(msg, { context, err })` — no bare
  `console.error` or `console.log` (startup/shutdown lines in `src/index.ts`
  included; the one deliberate exception is notification-service's dev-only
  email dump when `RESEND_API_KEY` is unset, which is meant for human eyes).
  Errors outside a request are the last-resort hooks' job: every
  `src/index.ts` calls `installProcessErrorHandlers(log)` (from the same
  canonical `logging.ts`), which logs `uncaughtException` /
  `unhandledRejection` as one structured line and then exits 1 — Node's
  fail-fast default, but with a parseable line first. An error-monitoring
  backend can later hook `onError` + these handlers without touching call
  sites.
- **Error shape**: `{ "error": string }`. Success shapes match the monolith.
- **Health**: `GET /healthz`. The **seven DB services** (identity, provider,
  review, job, notification, search, trust-safety) run it as a **readiness probe** — `SELECT 1` raced
  against a 2s timeout, returning `503 { ok: false, service, db: "down" }` if
  Postgres is unreachable so the orchestrator can depool the instance; success
  is `200 { ok: true, service }`. gateway, chat and media return the static
  `200 { ok: true, service }`. Used by compose healthchecks and the E2E
  script.
- **Internal auth**: every request from the gateway or another service carries
  `x-internal-secret: $INTERNAL_API_SECRET`. A middleware
  (`requireInternalSecret`) rejects any request without the correct secret with
  `403 { error: "Forbidden" }`. The comparison is **constant-time**
  (`node:crypto` `timingSafeEqual`) so response timing can't leak the secret's
  length/prefix. Services are never exposed publicly; only the gateway is.
- **User identity**: the gateway verifies the `sh_session` JWT and forwards
  `x-user-id`, `x-user-role`, `x-user-name` (URI-encoded). Services read these
  via a shared `getAuth(c)` helper → `{ userId, role, name } | null`. Services
  still enforce their own authz (401/403/404).
- **Context headers** (set by the gateway): `x-locale` (`en` | `si`, from the
  `lang` cookie, default `en`) and `x-origin` (public web origin — a configured
  `WEB_ORIGIN` is authoritative and wins over client forwarding headers;
  `x-forwarded-proto`/`x-forwarded-host` fallback applies only in dev).
- **S2S calls**: `fetch` with a 5s `AbortSignal.timeout` (15s for
  multipart/FormData uploads) and the `x-internal-secret` header. A **single bounded retry (with jitter)** is made
  on idempotent reads only (GET/HEAD); non-idempotent methods never retry. Read
  hydration degrades gracefully (missing names → `"Unknown"`); write-path
  dependency failures return `502 { error: "Upstream service unavailable" }`.
- **JWT session**: cookie `sh_session`, HS256 via `jose`, secret `AUTH_SECRET`,
  payload `{ userId, role, name, sv, avatar? }` (`avatar` is the profile-photo
  URL, carried so the top-nav renders it without a `/me` fetch; re-minted on
  avatar change — #434), 7-day expiry, `httpOnly`,
  `sameSite=lax`, `secure` in production, `path=/`. Signed ONLY by
  identity-service; verified by the gateway and by the web app (page gating).
  Mobile/API clients (#797) carry the same JWT as an `Authorization: Bearer`
  access token instead (15-minute expiry, from `POST /api/auth/token`, renewed
  via the rotating refresh token at `POST /api/auth/refresh`); the gateway
  checks it only when no valid session cookie is present.
- **Session revocation**: `sv` is `User.sessionVersion` at mint time. Identity
  bumps the version on password change/reset, `POST /api/auth/logout-all`, and
  admin force-logout / lock / role change; the gateway rejects tokens minted
  before the current version. It resolves the current version from a shared
  Redis revocation list first (`revocation:<userId>`, published best-effort on
  every bump — authoritative, survives an identity outage, #374), falling back
  to `GET identity /internal/users/:id/session-version` (cached 60s per user,
  fail-open on identity outage) when Redis has no entry. Tokens minted before
  this scheme count as version 0. The web app's page-gating verifier is a soft
  check — every data/state request goes through the gateway, the enforcement
  point. See [AUTHZ.md](../AUTHZ.md#session-revocation-374).

