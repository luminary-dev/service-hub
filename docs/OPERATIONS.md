# Operations

The day-two runbook: how the containers are built, how they behave at runtime,
what CI enforces, and how to run and observe the stack. For the deploy pipeline
itself (branch model, CD, secrets, rollback) see [DEPLOYMENT.md](DEPLOYMENT.md);
for disaster recovery see [BACKUPS.md](BACKUPS.md).

## Container images

Every image is a **multi-stage build** (#237): a full-toolchain `build` stage
compiles/builds, then a slim `runtime` stage ships only production dependencies
plus the build output.

- **Web** (`/Dockerfile`) — `build` runs `next build` with `output:
  "standalone"` (set in `next.config.ts`); `runtime` ships that self-contained
  bundle — **no `npm ci`, no prod `node_modules`** — copying `.next/standalone`
  (Next's traced `server.js` + only the deps it actually imports) plus
  `.next/static` and `public` alongside it, and runs **`node server.js`**
  (standalone reads `PORT`/`HOSTNAME` from the env). This shrinks the image
  from ~1GB (`next start` over full prod deps) to ~340MB. `/api/*` → gateway
  proxying happens at request time (`src/proxy.ts` reads `GATEWAY_URL` from the
  environment), so no build-time gateway URL is baked in and one image promotes
  across environments. The `.next` tree is chowned to `node` so the non-root
  runtime can write its cache under `.next/cache`.
- **Services** (`services/*/Dockerfile`) — `build` compiles TypeScript with
  `tsc`; `runtime` installs prod-only deps and copies `dist`.
- **DB-owning services** (identity, provider, review, job, notification,
  search, trust-safety) additionally keep the
  Prisma schema + migrations and the `prisma` CLI (a prod dependency) in the
  runtime stage, and start with **`start:migrate`** (`prisma migrate deploy &&
  node dist/index.js`). `npm ci --omit=dev`'s `postinstall` runs `prisma
  generate`, so the client is built against the runtime `node_modules`.

Every image runs as the **non-root `node` user** (`USER node`).

**Base images are pinned by digest** (#238): each `FROM` carries a
`# dependabot: <tag>` comment plus the readable tag before the `@sha256:` digest,
so a build is reproducible and Dependabot can bump the tag comment and digest
together. Compose base images (`postgis/postgis:16-3.5-alpine`, `redis:7-alpine`,
`edoburu/pgbouncer` (#674), `caddy:2-alpine`, and the observability pair
`prom/prometheus` + `grafana/grafana` (#668) in `docker-compose.prod.yml`) are pinned the *same way* by hand,
but **Dependabot can't bump them** — its `docker` ecosystem only parses `FROM`
in Dockerfiles, never `image:` refs in compose files. A scheduled
[`compose-image-digests`](../.github/workflows/compose-image-digests.yml)
workflow (#664) diffs those pinned compose digests against the live upstream
tags weekly and opens a tracking issue on drift, so a base-layer CVE fix still
surfaces as work instead of persisting silently.

**Dependabot** (`.github/dependabot.yml`) tracks three ecosystems weekly, for
`/` and `/services/*`:

- **npm** — routine minor/patch grouped (dev deps; prod minor/patch); security
  fixes always open as individual PRs. eslint major is pinned back until
  `eslint-config-next` supports eslint 10 (PR #103).
- **github-actions** — keeps workflow action versions patched. Every external
  `uses:` is **pinned to a full commit SHA** (#386) with the readable tag kept as
  a trailing comment (`uses: actions/checkout@<sha> # v7`), so a hijacked tag
  can't run with our `packages: write` / `contents: write` scopes or deploy
  secrets; Dependabot bumps the SHA and the comment together. (`actionlint.yml`'s
  `docker://rhysd/actionlint` is pinned by **image digest** with the tag as the
  readable label, #573.)
- **docker** — bumps the pinned base-image digests **in the Dockerfiles** (the
  root web image at `/` and every `services/*` image) so base-layer CVEs surface
  as PRs instead of silently persisting. It does **not** see the `image:` refs in
  the compose files — the postgis/redis/pgbouncer/caddy digests in
  `docker-compose.prod.yml` are watched by the separate `compose-image-digests`
  workflow instead (#664; it auto-discovers every `image: …@sha256:` ref, so a
  newly pinned compose image is covered without editing the workflow).

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
  (`wget -qO- http://localhost:$PORT/healthz`); Postgres uses `pg_isready -h
  127.0.0.1` — probed over **TCP**, not the local socket, so it can't report
  healthy during the image's socket-only multi-DB init window and release
  dependents before their `prisma migrate deploy` can actually connect (#686);
  Redis `redis-cli ping`. In prod the web app is probed the same way (its own
  gateway-independent `/healthz` route — `/api/healthz` would be proxied to the
  gateway) and Caddy via its admin API (`http://localhost:2019/config/`, which
  works before DNS/ACME are in place), so the deploy gate covers the public
  site (#385). Prod intervals are 10s with 10 retries, plus a
  `start_period` (30s; **120s for the DB-owning services**, whose boot runs
  `prisma migrate deploy` first) during which failed probes don't count against
  the retry budget — so a slow migration no longer trips the deploy gate into
  rollback (#568). A passing probe ends the grace period early.
- **`depends_on: condition: service_healthy`** — the DB services wait for both
  Postgres *and* PgBouncer, and the gateway waits for all upstreams, so boot
  order is correct. PgBouncer itself waits for Postgres and is probed with
  `pg_isready -h 127.0.0.1 -p 6432`.
- **Deploy health-gate** — `up -d --wait` (see DEPLOYMENT.md) turns these
  healthchecks into the deploy's pass/fail signal.

### Connection pooling (PgBouncer)

A **PgBouncer** transaction pooler (#674, `edoburu/pgbouncer`, port **6432**)
sits between the DB-owning services and Postgres in both compose files. Each
service runs its own Prisma connection pool and is replicated, so
`pool_size × replicas × services` scales past Postgres's `max_connections`
(default 100) and exhausts it; PgBouncer multiplexes those clients onto a small
shared set of server connections (`pool_mode = transaction`,
`default_pool_size = 10` — see `deploy/pgbouncer/pgbouncer.ini`).

The Prisma split is the load-bearing detail:

- **Runtime queries** go through the pooler. Each service's `DATABASE_URL`
  points at `pgbouncer:6432/<db>?pgbouncer=true`; the runtime driver adapter
  (`src/db.ts`, `PrismaPg`) reads it directly. `?pgbouncer=true` is a no-op for
  the pg driver adapter (which already uses only unnamed prepared statements,
  safe under transaction pooling) but is kept for intent/forward-compat.
- **Migrations** must NOT go through a transaction pooler — `prisma migrate
  deploy` (run by `start:migrate` on boot) needs session-scoped state (advisory
  locks, prepared statements). So each service also gets a `DIRECT_URL` pointing
  straight at `postgres:5432/<db>`, and `prisma.config.ts` — the only URL the
  Prisma **CLI** reads — is set to `process.env.DIRECT_URL ?? process.env.DATABASE_URL`.
  (Prisma 7 removed the datasource `directUrl` field from `schema.prisma`; the
  CLI URL now lives in `prisma.config.ts`, which is exactly where we branch it.)
  With no pooler present — host `dev:all` / CI — `DIRECT_URL` is unset and both
  paths fall back to `DATABASE_URL`, so nothing changes there.

PgBouncer authenticates clients from a `userlist.txt` the image entrypoint
generates from the `DATABASE_URL(S)` env, with `auth_type = scram-sha-256`. In
prod that lists all seven per-service roles, and the `[databases]` wildcard
carries no forced `user=`, so a service can still only ever connect as its own
least-privilege role to its own database — the #387 isolation is preserved
through the pooler.

### Resource limits & log rotation (prod)

`docker-compose.prod.yml` caps each container so one misbehaving service can't
exhaust the single VPS:

- **`mem_limit`** per service — e.g. postgres `1g`, web `640m`, media/chat
  `512m`, most services `384m`, redis `256m`, pgbouncer/caddy `128m`.
- **Log rotation** (#240) — a shared `json-file` logging config with
  `max-size: 10m` and `max-file: 3` is merged into every service, so a chatty or
  crash-looping container can't fill the disk.

## CI (`ci.yml`)

Runs on push and PR to `dev` and `prod`. Jobs:

- **Fast per-package matrix** — `web` runs `typecheck / lint / test / build`;
  each of the ten services runs `typecheck / test / build`. `fail-fast:
  false`, Node 24, npm cache.
- **`coverage`** (#262) — per package (web + 10 services), runs `npm run coverage`
  (vitest v8 provider) and uploads the HTML/JSON report as an artifact plus a
  step-summary table. Thresholds are a **deliberately low ratchet floor
  (currently 5% lines/functions/branches/statements)** that passes today; the
  job only fails if coverage regresses below the floor. Raise the floors as the
  suites grow.
- **`e2e` compose-smoke** (#241) — **PRs only** (booting the full stack is
  heavy). Pre-builds the eleven compose images with `docker/bake-action` reusing
  deploy.yml's per-image GHA layer cache (read-only — no `cache-to`, so a
  feature branch can't write the shared cache; #573), boots the stack with
  `docker compose up -d --no-build --wait`, waits for web on :3000, **seeds
  with `SEED_DEMO_DATA=true`** (the prod images run `NODE_ENV=production`,
  where the seed otherwise refuses), then runs `scripts/e2e-smoke.sh` and the
  **backup → restore-verify path** (#389: `backup-dbs.sh` dumps the seeded DBs,
  `verify-backup.sh` restores them into a scratch container and row-counts the
  main tables). Dumps logs on failure and always tears down with `down -v`.
- **`prod-compose`** (#512) — validates `docker-compose.prod.yml` (the file that
  actually ships) with `docker compose -f docker-compose.prod.yml config -q`.
  The dev/e2e jobs only ever exercise `docker-compose.yml`, so the prod file used
  to be parsed for the first time during the live SSH deploy — a syntax error,
  bad anchor, broken `${VAR:?}`, wrong image name, or malformed
  `healthcheck`/`mem_limit` would surface only then. `config` fully
  parses/interpolates without pulling images or starting containers, so it's a
  fast gate; the job supplies **dummy** values for the required `${VAR:?}` secrets
  (`AUTH_SECRET`, `INTERNAL_API_SECRET`, `POSTGRES_PASSWORD`, the seven
  per-service `*_DB_PASSWORD`s, `REDIS_PASSWORD`, `WEB_ORIGIN`, `DOMAIN`) so
  interpolation succeeds — `ACME_EMAIL` is left unset to exercise its
  `admin@${DOMAIN}` compose default (#387) — and fails loudly if the file is
  invalid. The job also runs **`caddy validate`** over `deploy/Caddyfile`
  (same digest-pinned image), so a Caddyfile that would crash-loop the only
  public entrypoint fails CI instead of the live deploy.

A `concurrency` group (`${{ github.workflow }}-${{ github.ref }}`,
`cancel-in-progress: true`) cancels superseded runs when a PR is pushed again,
and every job has a `timeout-minutes` cap (15 for the matrix legs, 30 for the
`e2e` compose job, 5 for `prod-compose`) so a hung run can't burn the 6-hour
default.

**Check-name convention.** Every check across the CI and security-scan
workflows follows one format: a **per-package** check is `<package> / <task>`
(e.g. `web / typecheck`, `api-gateway / build`, `web / coverage`,
`media-service / npm-audit`, `web / trivy-image`); a **repo-wide** check is a
single lowercase-kebab name with no slash (`e2e`, `compose-config`, `trivy-fs`,
`actionlint`). The per-package matrix produces 34 legs
(`<package> / {typecheck,(lint,)test,build}`), and **all 34 are required status
checks in both the `dev` and `prod` rulesets** — including the six
`search-service` / `trust-safety-service` legs. Keep those exact names stable,
and if you rename one, update the ruleset's required-checks list in the same
change.

See [TESTING.md](TESTING.md) for the test layers behind these jobs.

## Security scanning (`security-scan.yml`)

Runs on push + PR to `dev`/`prod`, plus a weekly Monday 06:00 UTC schedule (to
catch newly-disclosed advisories on unchanged deps) and `workflow_dispatch`:

Trivy runs via the SHA-pinned `aquasecurity/trivy-action` (#386) — the Trivy CLI
version is pinned by the action tag instead of the previous `curl … main |
sh` install (a moving upstream branch).

- **Trivy filesystem scan** — `trivy fs` over the lockfiles
  (CRITICAL/HIGH/MEDIUM). **Report-only**: uploads SARIF to the Security tab,
  never fails the build.
- **Trivy image scan** (#238) — builds each of the eleven images in its matrix
  (web + the 10 services) and scans the
  base-image / OS packages (`vuln-type: os`). **Gating**: fails the build on
  fixable HIGH/CRITICAL OS vulns (`severity: HIGH,CRITICAL`, `ignore-unfixed`,
  `exit-code: 1`); SARIF still uploads so all findings surface.
- **npm audit** — `npm audit --omit=dev --audit-level=critical` per package.
  **Gates on CRITICAL** (#386): a critical production-dependency advisory fails
  the build. `npm audit` still prints the full report, so HIGH/moderate/low
  advisories stay visible in the log without blocking.
- **gitleaks** (#669) — secret scanning over the **full git history**.
  Trivy/`npm audit` cover dependency + OS CVEs but never scan the tree for
  **committed secrets**, and the repo is public, so a leaked `AUTH_SECRET` /
  `INTERNAL_API_SECRET` / DB password would be game-over. **Gating**: `gitleaks
  git … --exit-code=1` fails the build on any finding. We invoke the **OSS
  `gitleaks` binary directly** via its official image
  (`docker://ghcr.io/gitleaks/gitleaks`, pinned by digest like actionlint's
  `docker://` image) — **not** `gitleaks/gitleaks-action`, which gates
  org-owned repos behind a paid `GITLEAKS_LICENSE` (free only for personal
  accounts); the binary itself is MIT with no such gate, so no license secret
  is needed. Rules come from gitleaks' default set plus a small repo allowlist
  in [`.gitleaks.toml`](../.gitleaks.toml) for the intentional dummy fixtures
  (`.env*.example`, the dev `docker-compose*.yml`, and placeholders like
  `dev-only-secret` / `password123`).

Like CI, this workflow uses the same `concurrency` group to cancel superseded
runs, and each job has a `timeout-minutes` cap (10 for the `trivy` fs scan, 30
for the `trivy-image` build+scan, 15 for `npm-audit`, 10 for `gitleaks`).

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

## OpenSSF Scorecard (`scorecard.yml`)

Where Trivy / `npm audit` / gitleaks scan the *contents* (deps, OS packages,
secrets), **Scorecard** grades the repo's supply-chain *practices* and posts
the results to the Security tab. It runs the standard published
`ossf/scorecard-action` (#669, SHA-pinned) on a **weekly** schedule (Mondays
07:20 UTC), on every **push to the default branch (`dev`)**, on
`branch_protection_rule` changes, and via `workflow_dispatch` — **not on PRs**,
because publishing needs the default-branch OIDC identity.

It checks things the repo already does well and flags regressions: are actions
**SHA-pinned** (cf. #573/#386), is **branch protection** on, is **Dependabot**
configured, are workflow **token permissions** least-privilege, etc. Top-level
`permissions: read-all`; the analysis job elevates only `security-events: write`
(SARIF upload) and `id-token: write` (`publish_results: true` posts the score to
the public OpenSSF dashboard and enables a README badge later). 15-minute
`timeout-minutes` cap and the shared `concurrency` cancel group. Results are
**report-only** — a low sub-score never fails a build.

## actionlint (`actionlint.yml`)

Lints the workflow YAML itself with actionlint (bad `runs-on`, malformed
`${{ }}` expressions, deprecated syntax, broken `needs:`/`if:` refs). It runs
on push + PR to `dev`/`prod` **only when a `.github/workflows/**` file changes**
(so it never touches unrelated PRs), plus `workflow_dispatch`, pinned to the
`rhysd/actionlint:1.7.12` image **by digest** (#573; the mutable Docker Hub tag
alone could be repointed by the publisher). Least-privilege `permissions` (`contents:
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

- **New issue** → added to the board with Status=Backlog and the **Service
  field resolved from the issue's `service:` label** (matched to the board
  option by name at runtime, #388 — no label or no matching option leaves the
  field unset with a logged warning). Adding is idempotent (an issue appears
  once).
- **New PR** → **assigned to its author**. If it resolves an issue in **this
  repo** (a `Closes #n` link; cross-repo references are skipped), the author is
  mirrored onto that issue as an assignee, so the issue's board card reflects
  who's working it and the PR links under the issue. A PR that resolves no
  issue gets **no card** — fine for trivial chores, but substantive work should
  have an issue first. Fork PRs are skipped with a logged notice (their
  `GITHUB_TOKEN` is read-only) — assign those manually; other assignment
  failures surface as workflow warnings instead of being swallowed.

GitHub's **built-in "auto-add" workflow must stay OFF** so this workflow is the
single sync path.

## Search index maintenance (search & discovery RFC)

search-service's `search_db` is a **derived, rebuildable index** over provider
data. Writes keep it fresh in seconds (provider-service pushes full documents,
review-service pushes rating aggregates — both fire-and-forget), and a
**reindex sweep** self-heals anything a dropped push missed (bounded
staleness ≤ the sweep interval):

```bash
# Run daily from ops cron on the prod host (ports aren't published, so exec
# into the container; wget is busybox's, present in the image):
docker compose -f docker-compose.prod.yml exec -T search-service \
  wget -qO- --header "x-internal-secret: $INTERNAL_API_SECRET" \
  --post-data= http://localhost:4008/internal/search/reindex
# → { "indexed": n, "skipped": 0, "deleted": m }

# Drift metric — compare `indexed` against provider-service's non-suspended
# count; a growing gap between sweeps means pushes are being dropped:
docker compose -f docker-compose.prod.yml exec -T search-service \
  wget -qO- --header "x-internal-secret: $INTERNAL_API_SECRET" \
  http://localhost:4008/internal/search/stats
```

The sweep fails loudly (502, `{ "error": "Reindex failed" }`) when
provider-service or review-service is unreachable — an outage is never
mistaken for an empty source, so it can't wipe the index. After a database
restore, run the sweep immediately (see [BACKUPS.md](BACKUPS.md) — `search_db`
itself is deliberately not backed up). On a fresh dev stack the index starts
empty until the first reindex (`scripts/e2e-smoke.sh` runs one).

## Backups

Database and upload backup/restore procedures live in
[BACKUPS.md](BACKUPS.md): a nightly cron on the prod host (#389, installed once
with `sudo ./scripts/install-backup-cron.sh`) runs `scripts/backup-cron.sh` —
logical `pg_dump -Fc` per database (`scripts/backup-dbs.sh`; 14 local / 30
offsite snapshot retention), an offsite copy to a dedicated R2 bucket, a
restore-verification into a scratch Postgres (`scripts/verify-backup.sh`), and
a success ping to a heartbeat monitor (a missed ping alerts). Uploaded images
are covered too (#663): in **local-disk media mode** the `provider_uploads` /
`review_uploads` volumes are tarred into the same snapshot and shipped/pruned
offsite with the dumps; when the media **`R2_*`** vars are set the images live
in Cloudflare R2 (durable managed storage) and the tar is skipped. The script
reads the live mode from the running media-service container and logs which
applies; a scheduled run that finds **neither** fails loudly. Restore with
`scripts/restore-db.sh`. Redis is intentionally **not** backed up: rate-limit
windows are ephemeral by design, and the session-revocation list (#374) is a
mirror of identity_db's `sessionVersion` (which is backed up) — but it *is*
persisted across container recreation via the prod `redis_data` volume (#571).

## Secret rotation

Rotating `AUTH_SECRET`, `INTERNAL_API_SECRET`, the Postgres password or any
third-party key (blast radius, the update-secret → redeploy → verify procedure
and rollback) is documented in [SECRET_ROTATION.md](SECRET_ROTATION.md).

## Local development

One-time setup, then run the whole stack on the host:

```bash
npm run setup       # scripts/setup.sh — installs all packages, writes .env files
                    # from the examples, starts Postgres, migrates + seeds the 6
                    # stateful DBs (search's derived index is migrated, not seeded)
npm run dev:all     # scripts/dev-all.sh — Postgres (docker) + all 10 services + web
```

`dev:all` runs Postgres in Docker and the ten services + web as host
processes, prefixing each stream with its name; Ctrl-C stops everything. It
exports a shared `AUTH_SECRET` (so web and identity agree) and picks
`ANTHROPIC_API_KEY` from the shell or root `.env` (empty → the chat assistant
just returns 503).

Neither script populates `search_db` — it's derived, not seeded, and
search-service isn't running yet when `setup.sh` seeds the other six. Once
`dev:all` is up, rebuild it once from the seeded providers (in another
terminal) or the provider browse/search page has nothing to show:

```bash
curl -sS -X POST -H "x-internal-secret: ${INTERNAL_API_SECRET:-dev-internal-secret}" \
  http://localhost:4008/internal/search/reindex
```

To run everything in containers instead (closest to prod):

```bash
docker compose up -d --build      # dev compose: builds locally, all services + web
# the container images run NODE_ENV=production, so seed the 6 data services
# explicitly (setup.sh seeds for you on the host path; the container path does not):
for s in identity-service provider-service review-service job-service notification-service trust-safety-service; do
  docker compose exec -e SEED_DEMO_DATA=true "$s" npm run db:seed
done

# search_db is a derived index (see "Search index maintenance" below) — it's
# migrated, not seeded, so it starts empty until rebuilt from the providers
# you just seeded. Skipping this leaves the web app's provider browse/search
# page empty even though provider-service has data:
curl -sS -X POST -H "x-internal-secret: ${INTERNAL_API_SECRET:-dev-internal-secret}" \
  http://localhost:4008/internal/search/reindex

npm run e2e                       # scripts/e2e-smoke.sh against the running stack
```

During that seed, `.env not found. Continuing without it.` (containers read
config from Compose, not a `.env` file) and `job-service: no seed data` (the job
board is intentionally empty — jobs are customer-created) are both expected.

**Local data is disposable.** We do not preserve or migrate data between runs —
the seeds are dummy data only. When a run's state gets in the way, reset to a
clean, seeded stack with `scripts/dev-reset.sh`, which tears everything down
**including volumes** (`docker compose down -v`), rebuilds (`up -d --build`),
reseeds the stateful databases, and rebuilds the derived search index via the
reindex sweep:

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
| notification-service | 4005 | DB-owning — in-app + email (Resend) |
| media-service | 4006 | uploads (local disk or R2) |
| chat-service | 4007 | holds the Anthropic key |
| search-service | 4008 | DB-owning — derived search index (PostGIS) |
| trust-safety-service | 4009 | DB-owning — unified reports + audit (dark launch) |
| postgres | 5432 (host **5433**) | remapped so it won't clash with a local Postgres |
| redis | 6379 | rate-limit windows + session-revocation list + email queue |
| prometheus | 9090 | scrapes every service's `/metrics` (loopback-only host port) |
| grafana | 3000 (host **3001**) | dashboards; loopback-only (3000 is the web app) |
| loki | 3100 | log store; loopback-only host port |
| alloy | 12345 | log shipper UI; loopback-only host port |

In the **dev compose stack** every published port except web's `3000` is bound
to **127.0.0.1** (#387): on shared wifi nobody else can reach Postgres (its dev
password is well-known) or hit a service directly with the dev internal secret
and forged `x-user-*` headers. Web stays LAN-reachable for phone testing — it
proxies `/api/*` to the gateway server-side, so that path suffices.

In prod, service and datastore ports are **not** published — only Caddy binds
80/443 on the host, and the compose networks are split edge/backend/egress
(#387: Caddy reaches only web; gateway/provider/review/job/search/trust-safety
+ postgres + redis have no internet route; Redis requires AUTH and each DB service connects as its
own least-privilege role — see
[DEPLOYMENT.md](DEPLOYMENT.md#network--datastore-isolation-387)).

## Monitoring & alerting

**Structured logging exists today.** Every service (gateway included) keeps an
identical `src/lib/logging.ts` that emits **one JSON line per event** to stdout
(`{ level, time, service, msg, ...fields }`). Request logging emits one line per
request with `method / path / status / durationMs` and a `requestId`; the
gateway generates the id and propagates it upstream as `x-request-id`, so a
single request can be traced across services. Container stdout is captured by
the json-file driver (rotated, see above).

**Every error path is captured structured** (#34): startup/shutdown lines in
`src/index.ts` go through the logger, each app's Hono `onError` logs
`unhandled error` with the `requestId` and the flattened error
(`err.name/message/stack`) before returning the standard
`{ "error": "Internal server error" }` 500, and
`installProcessErrorHandlers(log)` (called first thing in every
`src/index.ts`) hooks `uncaughtException` / `unhandledRejection` — errors
outside any request log one structured line, then the process exits 1 (Node's
default is already a crash; `restart: unless-stopped` brings the container
back). A future error-monitoring backend (Sentry, GlitchTip, …) can hook into
these two choke points — `onError` and `installProcessErrorHandlers` — without
touching call sites.

**Reading logs.** Everything is on container stdout, one JSON object per line:

```bash
docker compose logs -f api-gateway            # follow one service
docker compose logs --since 1h identity-service provider-service
# errors only:
docker compose logs --no-log-prefix api-gateway | jq -c 'select(.level == "error")'
# trace one request across services (grab requestId from any line):
docker compose logs --no-log-prefix | grep '"requestId":"<id>"'
```

**A self-hosted metrics stack now ships with the compose stack** — see
[Observability](#observability) below. **Uptime probing, alerting, and an
error-monitoring backend are still pending** — tracked by **#113 / #34** and
listed among the pre-launch requirements in DEPLOYMENT.md. There is still no
external uptime probe or alerting on top of the metrics (the one exception:
backup freshness has a dead-man's-switch heartbeat, see
[BACKUPS.md](BACKUPS.md)); log inspection is manual (`docker compose logs`)
until those land.

## Observability

**Metrics foundation (#668).** Every backend service (gateway included) exposes
Prometheus metrics at `GET /metrics` on its own port via an identical
`src/lib/metrics.ts` (the canonical-copy convention, enforced by
`src/lib/shared-copies.test.ts`). It serves:

- **`http_request_duration_seconds`** — a request-latency histogram, and
  **`http_requests_total`** — a request counter, both labelled
  `method` / `route` / `status`. `route` is the matched Hono route *pattern*
  (e.g. `/api/admin/users/:id`), never the raw path, so ids don't explode
  cardinality. `/metrics` and `/healthz` are excluded so the rate reflects real
  traffic.
- **Node/process defaults** (`collectDefaultMetrics`): event-loop lag, heap, GC,
  fds, cpu. Every series carries a `service="<name>"` label stamped by
  `initMetrics()` (called once in each `src/index.ts`).

`/metrics` is deliberately **not** behind the internal secret — Prometheus
scrapes it directly — and that is safe because the service ports are never
public (loopback-bound in dev, `backend`-only network in prod).

**Log aggregation (#668).** Every service already emits **one JSON line per
event** to stdout (`{ level, time, service, msg, requestId, … }` — see each
service's `src/lib/logging.ts`). The stack now ships those into Loki so they're
searchable in Grafana and one request can be traced across all ten services by
its `requestId`. No app code changed — this is purely the collect/store/query
plumbing.

**The stack.** `docker-compose.yml` and `docker-compose.prod.yml` add these
services:

- **Prometheus** — scrapes all ten services every 15s
  (`deploy/observability/prometheus.yml`). Prod pins the image by digest (#238)
  and caps TSDB retention at 15d.
- **Loki** — the log store. Single-binary, filesystem-backed (config at
  `deploy/observability/loki/loki-config.yaml`, TSDB + schema v13, 7d
  retention). Prod pins the image by digest.
- **Grafana Alloy** — the log shipper (config at
  `deploy/observability/alloy/config.alloy`). It discovers every container via
  the Docker daemon socket (mounted **read-only**), tails stdout, parses the
  JSON, and pushes to Loki. `service` and `level` become stream labels;
  `requestId` is stored as **structured metadata** (a label would explode
  cardinality). We use Alloy rather than Promtail because Promtail reached
  end-of-life in early 2026; Alloy is Grafana's supported successor and ships to
  Loki with the same model. Prod pins the image by digest.
- **Grafana** — auto-provisions **Prometheus + Loki** datasources and starter
  dashboards from `deploy/observability/grafana/`: **RED** (request rate / error
  rate / p50-p95-p99 latency, templated by service) and **Logs** (log volume by
  level + a live log panel, filterable by service, level, and requestId).

Loki and Alloy need **no new secret**.

**Reaching Grafana.**

- *Dev*: `docker compose up -d prometheus grafana loki alloy` (Grafana already
  depends on Loki), then <http://localhost:3001> (user `admin`, password
  `GRAFANA_ADMIN_PASSWORD`, default `admin`). Prometheus is at
  <http://localhost:9090>, Loki's API at <http://localhost:3100>, Alloy's UI at
  <http://localhost:12345>. Every host port is loopback-bound (#387).
- *Prod*: none of it is a public surface — all live on the `backend` network and
  publish **loopback-only** host ports (no Caddy route). Reach Grafana through
  an SSH tunnel: `ssh -L 3001:127.0.0.1:3001 <server>`, then
  <http://localhost:3001>. `GRAFANA_ADMIN_PASSWORD` is a **required** secret
  (the stack refuses to start without it); see `.env.prod.example`.

**Querying logs / tracing a request.** In Grafana, open **Explore** (or the
**Logs** dashboard) and pick the **Loki** datasource. LogQL examples:

- All errors across the platform: `{level="error"}`
- One service's logs: `{service="provider-service"}`
- **Trace one request across every service** — copy its `requestId` (the
  gateway generates it and propagates it as `x-request-id`, so the same id
  follows a request everywhere) and query:
  `{service=~".+"} | requestId=` *(paste the id)*. The Logs dashboard exposes a
  **Request ID** textbox that does exactly this. Because `requestId` is
  structured metadata, this stays fast without inflating stream cardinality.

**Planned follow-ups (still open on #668).** With metrics (Prometheus) and logs
(Loki) in place, the remaining two legs are **distributed tracing** (OTel/Tempo)
and an **error-capture backend** (Sentry/GlitchTip — the **#34** fold-in). Both
are deferred to follow-up PRs; the structured JSON logs and the `onError` /
`installProcessErrorHandlers` choke points described under
[Monitoring & alerting](#monitoring--alerting) are the hooks those will build
on.

## Feature flags (#675)

Dark-launches and gradual rollouts (routing to trust-safety, gating Tamil,
tuning search ranking, …) are runtime-controlled instead of hardcoded
conditionals. We self-host **Unleash** (Apache-2.0) with its **own** Postgres —
a separate container/volume/role, never the app cluster.

**Why Unleash (over GrowthBook).** We evaluate flags **server-side** in Next
server components. Unleash's Frontend API does full strategy evaluation
(on/off, gradual-rollout stickiness, constraints) *inside the Unleash server*
and returns just the enabled toggles, so `src/lib/flags.ts` stays a thin,
bounded `fetch` with **no SDK dependency** and no client-side bundle. GrowthBook
leans on an in-process SDK that pulls the full flag/experiment definition set
and evaluates locally — heavier for our SSR-only, one-flag-today need. Unleash
also self-hosts as a single container + Postgres, which drops cleanly into the
existing compose/loopback/digest-pin patterns.

**The graceful-default contract.** `src/lib/flags.ts` exposes
`isFlagEnabled(name, fallback, ctx?)`. It **degrades gracefully** and must never
block or error a render:

- `UNLEASH_URL` / `UNLEASH_FRONTEND_TOKEN` **unset** (dev, CI, local, and prod
  before you provision a token) → it's a pure **no-op**: no network call, returns
  `fallback`. The app behaves exactly as it does today.
- Service wired but unreachable / slow / bad response → bounded single fetch
  (1.5s timeout), returns `fallback`. Result is cached ~30s per context.
- Service reachable → a flag is **on iff it exists AND is enabled** in the
  environment its token targets. The Frontend API returns only *enabled*
  toggles, so a flag you have **not created** in Unleash reads as **off**.
- `fallback` **must equal today's behavior** for the conditional you gate, so
  the unset/unreachable path is indistinguishable from the flag's current state.

> **Provisioning order (important).** Because an un-created flag reads as off,
> always **create + enable your flags in the Unleash admin UI first**, and only
> then set `UNLEASH_FRONTEND_TOKEN` on the web app. The token is the activation
> switch — until it's set, the app stays on coded defaults and nothing flips.

**Defining a flag.**

1. Open the admin UI (loopback — see below), log in.
2. Create a flag (type *Release*) with the exact name your code passes to
   `isFlagEnabled` (e.g. `chat-assistant`). Set its state per environment
   (`development` locally, `production` in prod). For a gradual rollout, use a
   *Gradual rollout* strategy with a stickiness field (`userId`) and pass a
   matching `ctx` from the caller.
3. Create a **Frontend API token** scoped to the right project/environment
   (format `<project>:<environment>.<secret>`), and set it as
   `UNLEASH_FRONTEND_TOKEN` on the web app.

**Demo flag shipped:** `chat-assistant` gates whether the customer-facing chat
assistant renders (`src/app/layout.tsx`), fallback **`true`** = today's behavior.
An operator can dark-launch it off from the admin UI with no redeploy.

**Reaching the admin UI.**

- *Dev*: it's behind the `flags` compose profile so a plain `docker compose up`
  (and CI e2e) skip it. Start it with
  `docker compose --profile flags up -d unleash`, then <http://localhost:4242>
  (default login `admin` / `unleash4all`). Both host ports are loopback-bound
  (#387). To try a flag locally: **create a Frontend API token** in that admin
  UI (Settings → API access), create + enable your flag, then run the web app
  with `UNLEASH_URL=http://localhost:4242/api` and `UNLEASH_FRONTEND_TOKEN=<that
  token>`. No token literal is committed (the repo is public, #675) — if you'd
  rather have Unleash pre-seed the token instead of creating it in the UI, put
  `UNLEASH_FRONTEND_TOKEN=<project>:development.<any-secret>` in the root `.env`
  **before** `docker compose --profile flags up` (compose passes it to Unleash's
  `INIT_FRONTEND_API_TOKENS`) and reuse the same value for the web app.
- *Prod*: internal-only — Unleash lives on the `backend` network with **no Caddy
  route** and a **loopback** host port. Reach it via an SSH tunnel:
  `ssh -L 4242:127.0.0.1:4242 <server>`, then <http://localhost:4242>.
  `UNLEASH_DB_PASSWORD` is a **required** secret (the flag stack refuses to start
  without it, like `GRAFANA_ADMIN_PASSWORD`); `UNLEASH_FRONTEND_TOKEN` is
  **optional** (the activation switch). Both are in `.env.prod.example` and
  rendered by `deploy.yml`. Images are digest-pinned (#238).
