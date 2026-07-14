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
`caddy:2-alpine` in `docker-compose.prod.yml`) are pinned the same way.

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
  `redis-cli ping`. In prod the web app is probed the same way (its own
  gateway-independent `/healthz` route — `/api/healthz` would be proxied to the
  gateway) and Caddy via its admin API (`http://localhost:2019/config/`, which
  works before DNS/ACME are in place), so the deploy gate covers the public
  site (#385). Prod intervals are 10s with 10 retries, plus a
  `start_period` (30s; **120s for the DB-owning services**, whose boot runs
  `prisma migrate deploy` first) during which failed probes don't count against
  the retry budget — so a slow migration no longer trips the deploy gate into
  rollback (#568). A passing probe ends the grace period early.
- **`depends_on: condition: service_healthy`** — services wait for Postgres /
  media-service, and the gateway waits for all upstreams, so boot order is
  correct.
- **Deploy health-gate** — `up -d --wait` (see DEPLOYMENT.md) turns these
  healthchecks into the deploy's pass/fail signal.

### Resource limits & log rotation (prod)

`docker-compose.prod.yml` caps each container so one misbehaving service can't
exhaust the single VPS:

- **`mem_limit`** per service — e.g. postgres `1g`, web `640m`, media/chat
  `512m`, most services `384m`, redis `256m`, caddy `128m`.
- **Log rotation** (#240) — a shared `json-file` logging config with
  `max-size: 10m` and `max-file: 3` is merged into every service, so a chatty or
  crash-looping container can't fill the disk.

## CI (`ci.yml`)

Runs on push and PR to `dev` and `prod`. Jobs:

- **Fast per-package matrix** — `web` runs `typecheck / lint / test / build`;
  each of the ten services runs `typecheck / test / build`. `fail-fast:
  false`, Node 22, npm cache.
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
a success ping to a heartbeat monitor (a missed ping alerts). Upload volumes
are tarred alongside — or Cloudflare R2 when the `R2_*` vars are set (durable
managed storage, no self-managed backup needed). Restore with
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

**Uptime probing, alerting, and an error-monitoring backend are still
pending** — tracked by **#113 / #34** and listed among the pre-launch
requirements in DEPLOYMENT.md. There is currently no external uptime probe,
metrics/APM, or alerting (the one exception: backup freshness has a
dead-man's-switch heartbeat, see [BACKUPS.md](BACKUPS.md)); log inspection is
manual (`docker compose logs`) until those land.
