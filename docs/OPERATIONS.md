# Operations

The day-two runbook: how the containers are built, how they behave at runtime,
what CI enforces, and how to run and observe the stack. For the deploy pipeline
itself (branch model, CD, secrets, rollback) see [DEPLOYMENT.md](DEPLOYMENT.md);
for disaster recovery see [BACKUPS.md](BACKUPS.md).

## Container images

Every image is a **multi-stage build** (#237): a full-toolchain `build` stage
compiles/builds, then a slim `runtime` stage ships only production dependencies
plus the build output.

- **Web** (`/Dockerfile`) — `build` runs `next build`; `runtime` installs
  `npm ci --omit=dev`, copies `.next` + `public` + `next.config.ts`, and runs
  `next start`. `/api/*` → gateway proxying happens at request time
  (`src/proxy.ts` reads `GATEWAY_URL` from the environment), so no build-time
  gateway URL is baked in and one image promotes across environments. The
  `.next` tree is chowned to `node` so the non-root runtime can write its cache.
- **Services** (`services/*/Dockerfile`) — `build` compiles TypeScript with
  `tsc`; `runtime` installs prod-only deps and copies `dist`.
- **DB-owning services** (identity, provider, review, job) additionally keep the
  Prisma schema + migrations and the `prisma` CLI (a prod dependency) in the
  runtime stage, and start with **`start:migrate`** (`prisma migrate deploy &&
  node dist/index.js`). `npm ci --omit=dev`'s `postinstall` runs `prisma
  generate`, so the client is built against the runtime `node_modules`.

Every image runs as the **non-root `node` user** (`USER node`).

**Base images are pinned by digest** (#238): each `FROM` carries a
`# dependabot: <tag>` comment plus the readable tag before the `@sha256:` digest,
so a build is reproducible and Dependabot can bump the tag comment and digest
together. Compose base images (`postgres:16-alpine`, `redis:7-alpine`,
`caddy:2-alpine` in `docker-compose.prod.yml`) are pinned the same way.

**Dependabot** (`.github/dependabot.yml`) tracks three ecosystems weekly, for
`/` and `/services/*`:

- **npm** — routine minor/patch grouped (dev deps; prod minor/patch); security
  fixes always open as individual PRs. eslint major is pinned back until
  `eslint-config-next` supports eslint 10 (PR #103).
- **github-actions** — keeps workflow action versions patched.
- **docker** — bumps the pinned base-image digests so base-layer CVEs surface as
  PRs instead of silently persisting.

## Runtime behavior

### Graceful shutdown

Every service registers **`SIGTERM` and `SIGINT`** handlers (`src/index.ts`).
On signal it stops accepting new connections, drains in-flight requests
(`server.close`), then releases resources before `process.exit(0)`:

- DB-owning services `await db.$disconnect()` (Prisma);
- the api-gateway `await closeRedis()` (shared rate-limit connection);
- stateless services just drain and exit.

A 10-second `forced` timer (`unref`'d) guarantees exit even if draining stalls,
so the orchestrator's SIGKILL is never what stops the process.

### Health checks

Every service exposes **`GET /healthz`** as a real readiness probe. On DB-owning
services it runs `SELECT 1` with a 2-second timeout and returns **503** if
Postgres is unreachable — so a service whose DB connection has died is depooled
/ restarted rather than kept serving. `/healthz` is deliberately **never
logged** (compose polls it frequently; the lines would be pure noise).

These endpoints back the layered gates:

- **Compose healthchecks** — every service uses the shared node healthcheck
  (`wget -qO- http://localhost:$PORT/healthz`); Postgres uses `pg_isready`, Redis
  `redis-cli ping`. Prod intervals are 10s with 10 retries.
- **`depends_on: condition: service_healthy`** — services wait for Postgres /
  media-service, and the gateway waits for all upstreams, so boot order is
  correct.
- **Deploy health-gate** — `up -d --wait` (see DEPLOYMENT.md) turns these
  healthchecks into the deploy's pass/fail signal.

### Resource limits & log rotation (prod)

`docker-compose.prod.yml` caps each container so one misbehaving service can't
exhaust the single VPS:

- **`mem_limit`** per service — e.g. postgres `1g`, web `640m`, media/chat
  `512m`, most services `384m`, notification/redis `256m`, caddy `128m`.
- **Log rotation** (#240) — a shared `json-file` logging config with
  `max-size: 10m` and `max-file: 3` is merged into every service, so a chatty or
  crash-looping container can't fill the disk.

## CI (`ci.yml`)

Runs on push and PR to `dev` and `prod`. Jobs:

- **Fast per-package matrix** — `web` runs `typecheck / lint / test / build`;
  each of the eight services runs `typecheck / test / build`. `fail-fast:
  false`, Node 22, npm cache.
- **`coverage`** (#262) — per package (web + 8 services), runs `npm run coverage`
  (vitest v8 provider) and uploads the HTML/JSON report as an artifact plus a
  step-summary table. Thresholds are a **deliberately low ratchet floor
  (currently 5% lines/functions/branches/statements)** that passes today; the
  job only fails if coverage regresses below the floor. Raise the floors as the
  suites grow.
- **`e2e` compose-smoke** (#241) — **PRs only** (booting the full stack is
  heavy). Boots the whole stack with `docker compose up -d --build --wait`, waits
  for web on :3000, **seeds with `SEED_DEMO_DATA=true`** (the prod images run
  `NODE_ENV=production`, where the seed otherwise refuses), then runs
  `scripts/e2e-smoke.sh`. Dumps logs on failure and always tears down with
  `down -v`.

A `concurrency` group (`${{ github.workflow }}-${{ github.ref }}`,
`cancel-in-progress: true`) cancels superseded runs when a PR is pushed again,
and every job has a `timeout-minutes` cap (15 for the matrix legs, 30 for the
`e2e` compose job) so a hung run can't burn the 6-hour default.

See [TESTING.md](TESTING.md) for the test layers behind these jobs.

## Security scanning (`security-scan.yml`)

Runs on push + PR to `dev`/`prod`, plus a weekly Monday 06:00 UTC schedule (to
catch newly-disclosed advisories on unchanged deps) and `workflow_dispatch`:

- **Trivy filesystem scan** — `trivy fs` over the lockfiles
  (CRITICAL/HIGH/MEDIUM). **Report-only**: uploads SARIF to the Security tab,
  never fails the build.
- **Trivy image scan** (#238) — builds each of the nine images and scans the
  base-image / OS packages (`--pkg-types os`). **Gating**: fails the build on
  fixable HIGH/CRITICAL OS vulns (`--severity HIGH,CRITICAL --ignore-unfixed
  --exit-code 1`); SARIF still uploads so all findings surface.
- **npm audit** — `npm audit --omit=dev --audit-level=high` per package.
  **Informational** (`continue-on-error`): surfaces advisories without blocking.

Like CI, this workflow uses the same `concurrency` group to cancel superseded
runs, and each job has a `timeout-minutes` cap (10 for the `trivy` fs scan, 30
for the `trivy-image` build+scan, 15 for `npm-audit`).

All Trivy SARIF is uploaded via `github/codeql-action/upload-sarif` to the
GitHub Security tab.

## CodeQL (code-scanning default setup)

First-party static analysis of our own source (as opposed to the dependency /
OS-package scans above) is provided by **GitHub's code-scanning default setup**
— it is *not* a workflow in this repo. Default setup runs a GitHub-managed
CodeQL analysis over `javascript-typescript` (plus `actions`) on push/PR, with
the `default` query suite, and uploads results to the Security tab. Because it
is enabled, an advanced-config CodeQL workflow **cannot** be added — GitHub
rejects those SARIF uploads ("CodeQL analyses from advanced configurations
cannot be processed when the default setup is enabled").

To adjust it, use the repo's **Settings → Code security → Code scanning →
default setup** (e.g. upgrade the query suite from `default` to `extended`);
there is no file to edit here. The `github/codeql-action/upload-sarif` used in
`security-scan.yml` is unrelated — it is only the transport for Trivy's SARIF.

## actionlint (`actionlint.yml`)

Lints the workflow YAML itself with actionlint (bad `runs-on`, malformed
`${{ }}` expressions, deprecated syntax, broken `needs:`/`if:` refs). It runs
on push + PR to `dev`/`prod` **only when a `.github/workflows/**` file changes**
(so it never touches unrelated PRs), plus `workflow_dispatch`, pinned to the
`rhysd/actionlint:1.7.12` image. Least-privilege `permissions` (`contents:
read`), a 10-minute `timeout-minutes` cap, and the shared `concurrency` cancel
group. The bundled shellcheck integration is disabled for now (`-shellcheck=`)
because today's workflows trip only benign SC2016/SC2034 false-positives.

Like other new check contexts it is **not** a required check in the `dev`/`prod`
rulesets yet, so a red run can't block a merge until it's explicitly promoted.

See [CI_ADDITIONS.md](CI_ADDITIONS.md) for the menu of further checks we can add
on top of the ones above.

## Project board

Work is tracked on the org-wide Service Hub board
(https://github.com/orgs/luminary-dev/projects/1), synced by
`.github/workflows/add-to-project.yml`. The board tracks **issues only** — one
card per work item; pull requests are **not** separate cards.

- **New issue** → added to the board (Status=Backlog, Service field set for this
  repo) and **assigned to its opener**, so the card shows who owns it. Adding is
  idempotent (an issue appears once).
- **New PR** → **assigned to its author**. If it resolves an issue (a `Closes #n`
  link), the author is mirrored onto that issue as an assignee, so the issue's
  board card reflects who's working it and the PR links under the issue. A PR
  that resolves no issue gets **no card** — fine for trivial chores, but
  substantive work should have an issue first.

GitHub's **built-in "auto-add" workflow must stay OFF** so this workflow is the
single sync path.

## Backups

Database and upload backup/restore procedures live in
[BACKUPS.md](BACKUPS.md): logical `pg_dump -Fc` per database via
`scripts/backup-dbs.sh` (daily cron on the prod host, 14-snapshot retention),
upload volumes tarred alongside — or Cloudflare R2 when the `R2_*` vars are set
(durable managed storage, no self-managed backup needed). Restore with
`scripts/restore-db.sh`. Redis rate-limit windows are intentionally **not**
backed up (ephemeral by design).

## Local development

One-time setup, then run the whole stack on the host:

```bash
npm run setup       # scripts/setup.sh — installs all packages, writes .env files
                    # from the examples, starts Postgres, migrates + seeds the 4 DBs
npm run dev:all     # scripts/dev-all.sh — Postgres (docker) + all 8 services + web
```

`dev:all` runs Postgres in Docker and the eight services + web as host
processes, prefixing each stream with its name; Ctrl-C stops everything. It
exports a shared `AUTH_SECRET` (so web and identity agree) and picks
`ANTHROPIC_API_KEY` from the shell or root `.env` (empty → the chat assistant
just returns 503).

To run everything in containers instead (closest to prod):

```bash
docker compose up -d --build      # dev compose: builds locally, all services + web
# the container images run NODE_ENV=production, so seed the 4 data services
# explicitly (setup.sh seeds for you on the host path; the container path does not):
for s in identity-service provider-service review-service job-service; do
  docker compose exec -e SEED_DEMO_DATA=true "$s" npm run db:seed
done
npm run e2e                       # scripts/e2e-smoke.sh against the running stack
```

During that seed, `.env not found. Continuing without it.` (containers read
config from Compose, not a `.env` file) and `job-service: no seed data` (the job
board is intentionally empty — jobs are customer-created) are both expected.

**Local data is disposable.** We do not preserve or migrate data between runs —
the seeds are dummy data only. When a run's state gets in the way, reset to a
clean, seeded stack with `scripts/dev-reset.sh`, which tears everything down
**including volumes** (`docker compose down -v`), rebuilds (`up -d --build`), and
reseeds the four databases:

```bash
./scripts/dev-reset.sh            # down -v → up -d --build → reseed
```

Seed demo data (`admin@baas.lk` etc., password `password123`) is created
automatically by `setup.sh` on the host path. Under the prod/container images
(`NODE_ENV=production`) the seed refuses unless `SEED_DEMO_DATA=true` is set, so
the container path seeds via the explicit per-service loop above (the same
opt-in the CI e2e job uses). `scripts/baseline-migrations.sh` is a one-time helper for
older dev DBs created with `prisma db push` (marks the `0_init` baseline applied
so `migrate deploy` stops erroring with P3005); fresh DBs never need it.

### Port map

| Component | Port | Notes |
| --- | --- | --- |
| web (Next.js) | 3000 | only public surface behind Caddy in prod |
| api-gateway | 4000 | edge of the service mesh; `/api/*` target |
| identity-service | 4001 | DB-owning |
| provider-service | 4002 | DB-owning |
| review-service | 4003 | DB-owning |
| job-service | 4004 | DB-owning |
| notification-service | 4005 | email (Resend) |
| media-service | 4006 | uploads (local disk or R2) |
| chat-service | 4007 | holds the Anthropic key |
| postgres | 5432 (host **5433**) | remapped so it won't clash with a local Postgres |
| redis | 6379 | shared rate-limit windows |

In prod, service and datastore ports are **not** published — only Caddy binds
80/443 on the host; everything else talks over the internal compose network.

## Monitoring & alerting

**Structured logging exists today.** Every service (gateway included) keeps an
identical `src/lib/logging.ts` that emits **one JSON line per event** to stdout
(`{ level, time, service, msg, ...fields }`). Request logging emits one line per
request with `method / path / status / durationMs` and a `requestId`; the
gateway generates the id and propagates it upstream as `x-request-id`, so a
single request can be traced across services. Container stdout is captured by
the json-file driver (rotated, see above).

**Uptime and error monitoring are still pending** — tracked by **#113 / #34** and
listed among the pre-launch requirements in DEPLOYMENT.md. There is currently no
external uptime probe, metrics/APM, or alerting; log inspection is manual
(`docker compose logs`) until those land.
