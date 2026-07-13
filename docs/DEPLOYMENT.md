# Deployment

Production runs the same containers as dev, but from **pre-built images** pulled
from GHCR, behind a **Caddy** TLS reverse proxy, on a single Docker host. For the
day-two operational detail (image internals, health checks, resource limits, CI,
backups, monitoring) see [OPERATIONS.md](OPERATIONS.md).

- **Branch model** — work merges to `dev` (integration); releasing is a PR
  `dev → prod`. The push to `prod` is the deploy trigger.
- **CD** — `.github/workflows/deploy.yml` builds and pushes an image per service +
  web to `ghcr.io/luminary-dev/service-hub-<name>` (tagged with the commit SHA;
  `:prod` is re-pointed atomically once all nine builds succeed), then, if
  enabled, redeploys the host over SSH with a health gate and automatic rollback.
- **Releases** — `.github/workflows/release.yml`: a `v*` git tag publishes
  semver-tagged images and cuts a GitHub Release. Only tags pointing at commits
  contained in `prod` are released.
- **Compose** — `docker-compose.prod.yml` (GHCR images, `restart: unless-stopped`,
  required-secret enforcement, edge/backend/egress network split with Caddy on
  80/443 as the only published surface — see "Network & datastore isolation").

Status: image publishing works today. The **deploy step and the server itself
are gated on #110** (production host, domain, TLS) — until then the pipeline
builds and publishes images but does not deploy.

## Branch model & rulesets

Two long-lived branches, both protected by strict rulesets:

- **`dev`** — the integration branch. Feature/fix branches open PRs into `dev`.
- **`prod`** — the deploy branch. Releasing is a PR `dev → prod`; the merge (a
  push to `prod`) is what triggers the Deploy workflow.

Both branches require a **PR with review** and demand that **all required CI
checks pass and are up to date** with the branch tip before merge — you cannot
merge a stale PR that never saw the latest commits. CI (`ci.yml`) and the
security scans (`security-scan.yml`) run on pushes and PRs to both `dev` and
`prod`, so `prod` re-validates the exact merge commit before it deploys.

## CD pipeline (`deploy.yml`)

Triggered on **push to `prod`** (and `workflow_dispatch`). Three jobs:

1. **`build-and-push`** — a matrix over web + all eight services. Each is built
   with Buildx (web from the repo root, each service from `services/<name>`) and
   pushed to `ghcr.io/luminary-dev/service-hub-<image>` tagged `:<commit-sha>`,
   using a per-image GitHub Actions layer cache. This job runs unconditionally,
   so images are always published even before a server exists.

2. **`tag-prod`** — re-points every image's `:prod` tag at the new
   `:<commit-sha>` in one post-matrix job (`docker buildx imagetools create`, a
   registry-side manifest copy). It only runs when **all nine** matrix builds
   succeeded, so a partial matrix failure can never leave `:prod` as a
   mixed-version set (#573) — previously each leg moved its own `:prod` tag as
   it finished.

3. **`deploy`** — gated on the repo variable **`DEPLOY_ENABLED == 'true'`** and
   the `production` GitHub Environment; runs under a `deploy-prod` concurrency
   group (no cancel-in-progress) so two deploys never overlap. It:
   - **connects with a pinned host key** (#388): the server's public host
     key(s) live in the `PROD_SSH_KNOWN_HOSTS` secret, written to a
     `known_hosts` file used with `StrictHostKeyChecking=yes`. The runner
     starts with an empty `known_hosts` every run, so anything weaker would
     trust whichever host answered and hand it the rendered `.env`; a key
     mismatch (or an unset secret) fails the deploy before any secret leaves
     the runner;
   - reads the currently-deployed `IMAGE_TAG` from the server's `.env`
     (`PREV_TAG`) **before** overwriting it, so a bad rollout can be reverted;
   - **renders `$APP_DIR/.env` from GitHub secrets**, piped over the encrypted
     SSH channel (never printed to the log), and pins `IMAGE_TAG=<this sha>`.
     Values are written double-quoted with Compose-dotenv escaping (`\`→`\\`,
     `"`→`\"`, `$`→`$$`, newlines→`\n`), so secrets containing `$`, `#`,
     quotes, or whitespace survive Compose's `.env` parsing verbatim — rotate
     to any `openssl rand` output without worrying about the charset (#572);
   - `git fetch origin prod && git reset --hard origin/prod`, then
     `docker compose -f docker-compose.prod.yml pull`;
   - **health-gates the rollout**: `up -d --remove-orphans --wait
     --wait-timeout 300` blocks until every container with a healthcheck is
     healthy and none has exited. Every container has one — including `web`
     (the app's `/healthz` route) and `caddy` (its admin API), so the gate
     covers the user-facing site (#385). A crash-loop or a failed `prisma
     migrate deploy` fails the deploy instead of silently replacing the
     running stack. The 300s wait covers the DB services' 120s healthcheck
     `start_period` (migration allowance, #568) plus the retry budget;
   - **auto-rolls-back on failure**: rewrites `IMAGE_TAG` back to `PREV_TAG`
     **and restores the previously-deployed `docker-compose.prod.yml` +
     `deploy/`** (recorded as the git SHA before the `reset --hard`) — if the
     compose change itself broke the rollout, re-running the new file against
     the old images would fail identically (#385). It then re-pulls, brings
     the previous state up, and exits non-zero; a rollback that still comes up
     unhealthy is reported loudly (`ROLLBACK FAILED`) in the job log instead
     of being swallowed;
   - **prunes only after a healthy rollout** (#567): removes every
     `ghcr.io/luminary-dev/service-hub-*:<sha>` tag **except the tag just
     deployed and its predecessor** (kept on disk so rollback needs no
     re-pull), then `docker image prune -f` clears the now-dangling layers.
     Tagged images are never "dangling", so without the explicit `rmi` pass
     each deploy's nine `:<sha>` images accumulated on the VPS forever.

## Releases (`release.yml`)

Pushing a semver git tag (e.g. `v0.1.0`) runs the Release workflow:

- **guards branch containment first** (#569): a `guard` job fails the run
  unless the tagged commit is contained in `prod` (`git merge-base
  --is-ancestor`), so a tag on a feature-branch or local commit cannot publish
  images or write the shared build cache — the release-side counterpart of
  `deploy.yml`'s prod-branch ref guard (#383);
- publishes a versioned image per service + web to GHCR, tagged `:<tag>` and
  `:latest` (in addition to the `:prod` / `:<sha>` tags `deploy.yml` pushes),
  reusing the same per-image layer cache;
- cuts a **GitHub Release** with auto-generated notes (`gh release create <tag>
  --generate-notes --verify-tag`).

This gives a durable, human-readable release marker and lets any running
container be mapped back to a released version.

## Secrets: GitHub is the source of truth

The repo is public, so nothing sensitive lives in the tree. All runtime config
is stored as **GitHub Actions repo secrets**, and the deploy job **renders the
server's `.env` from them on every deploy** (piped over SSH, never logged). So
the manual `.env` used for a first bring-up is only needed before CD is enabled;
once CD runs, it owns the server `.env`.

App secrets (set with `gh secret set <NAME>`):

- **Required**: `AUTH_SECRET`, `INTERNAL_API_SECRET`, `POSTGRES_PASSWORD`,
  `IDENTITY_DB_PASSWORD`, `PROVIDER_DB_PASSWORD`, `REVIEW_DB_PASSWORD`,
  `JOB_DB_PASSWORD`, `NOTIFICATION_DB_PASSWORD`, `REDIS_PASSWORD` (#387 —
  per-service DB roles + Redis
  AUTH; **URL-interpolated**, so generate them with `openssl rand -hex 32`,
  not base64), `WEB_ORIGIN`, `DOMAIN`. `docker-compose.prod.yml` guards each
  with `${VAR:?}`, so the stack refuses to start if any is missing.
- **Optional** (features degrade gracefully when unset): `ACME_EMAIL` (unset →
  defaults to `admin@${DOMAIN}`; an empty Caddyfile `email` argument would
  fail config load and crash-loop the only public entrypoint, #387),
  `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `R2_ENDPOINT`,
  `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` (Google social login #398 — both unset → the
  "Continue with Google" button is hidden, password auth unaffected).

Deploy/SSH secrets: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (a deploy
key), `PROD_APP_DIR` (the checkout path on the host), and
`PROD_SSH_KNOWN_HOSTS` — the host's public key(s) in `known_hosts` format,
pinned by the deploy with `StrictHostKeyChecking=yes` (the job refuses to
connect while it's unset). Capture it over a trusted network path and verify
the fingerprint out-of-band (e.g. on the VPS console with
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) before setting it:

```bash
ssh-keyscan -t ed25519 "$PROD_SSH_HOST" | gh secret set PROD_SSH_KNOWN_HOSTS
```

Repo variable: `DEPLOY_ENABLED` (`true` un-gates the `deploy` job).

See [`.env.prod.example`](../.env.prod.example) for the full annotated list of
runtime variables and how each degrades when unset.

## One-time server setup (#110)

1. A Linux host with Docker + Compose v2. Open ports 80 and 443.
2. Point the domain's DNS **A record** at the host (Caddy needs this to issue TLS).
3. Clone the repo and check out `prod`:
   ```bash
   git clone https://github.com/luminary-dev/service-hub.git && cd service-hub
   git checkout prod
   cp .env.prod.example .env      # then fill in — see the file for each var
   ```
   Generate the secrets: `openssl rand -base64 32` for `AUTH_SECRET` and
   `INTERNAL_API_SECRET`; `openssl rand -hex 32` for `POSTGRES_PASSWORD`, the
   five per-service `*_DB_PASSWORD`s and `REDIS_PASSWORD` (these are
   interpolated into connection URLs, so they must stay URL-safe — hex is).
4. Log in to GHCR so the host can pull the images:
   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin
   ```
5. Bring it up, then bootstrap a real admin:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.prod.yml exec identity-service \
     npm run create-admin -- --email you@baas.lk --password '...'
   ```

Migrations **auto-apply on start**: each DB-owning service runs `start:migrate`
(`prisma migrate deploy && node dist/index.js`) as its container command, so a
fresh database is brought to the current schema before the service accepts
traffic. The demo seed **refuses to run under `NODE_ENV=production`** (which the
prod images set) unless you explicitly override with `SEED_DEMO_DATA=true` —
production should never carry demo data.

Once the host exists, set `DEPLOY_ENABLED = true` and the `PROD_SSH_*` secrets;
from then on merging `dev → prod` builds the images and redeploys the host
automatically (see the CD pipeline above).

## Container runtime hardening (#526)

Every container in `docker-compose.prod.yml` runs with defense-in-depth defaults,
merged in via the `x-hardening` YAML anchor:

- **`security_opt: [no-new-privileges:true]`** — a process can never gain
  privileges (e.g. through a setuid binary) after it starts.
- **`cap_drop: [ALL]`** — every Linux capability is stripped. The Node services
  bind ports >1024 as the non-root `node` user and need none. Three infra
  containers add back the minimum their entrypoints require:
  - **postgres** — `CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID` (its entrypoint
    starts as root to prepare the data/socket dirs, then drops to `postgres`).
  - **caddy** — `NET_BIND_SERVICE` to bind the privileged ports 80/443 (its
    binary carries this as a file capability, so without it Caddy won't even
    exec under `cap_drop: ALL`).
  - **redis** boots fine with all capabilities dropped.

A **read-only root filesystem** (`read_only: true`) is set only where every
writable path is known and backed by a tmpfs or volume:

| Service | `read_only` | Writable backing |
| --- | --- | --- |
| api-gateway, notification-service, chat-service | yes | tmpfs `/tmp` (stateless; state lives in Redis / upstream APIs) |
| web | yes | tmpfs `/tmp` + `/app/.next/cache` (Next's standalone server writes only its response cache) |
| identity/provider/review/job-service | no | run `prisma migrate deploy` on boot; the migration engine's temp behaviour under a read-only rootfs is unverified against a live DB (see the `# TODO read_only` notes) |
| media-service | no | local-disk fallback writes the `category`/`user` namespaces under `/app/data` on the rootfs (only `provider`/`review` have volumes) |
| postgres, redis, caddy | no | write their own data/cert state |

The read-only choices were validated by booting the pinned base images with
`cap_drop: ALL` + `read_only` + the tmpfs mounts; the `# TODO read_only` blocks
mark services to revisit once their writable paths can be confirmed on a live
stack.

## Network & datastore isolation (#387)

The prod compose stack replaces the flat default network with three networks,
and gives every datastore its own credentials, so one compromised container no
longer means the whole stack:

- **Network split** —
  - `edge`: Caddy ↔ web only. The public entry has no route to the gateway,
    the services, or the datastores.
  - `backend` (`internal: true`): all eight services + postgres + redis. web
    straddles `edge` + `backend` (Caddy reaches it; it reaches the gateway /
    chat / identity). Containers on **only** `backend` (gateway,
    provider/review/job, postgres, redis) have **no route to the internet**.
  - `egress`: a plain bridge granting outbound internet to the four services
    that call external APIs — identity (OAuth token exchange), notification
    (Resend), media (R2), chat (Anthropic). It publishes no ports.
- **Per-service DB roles** — each DB service connects as its own LOGIN role
  (`identity` / `provider` / `review` / `job`) that **owns only its own
  database**; `CONNECT` is revoked from `PUBLIC` on all four, so no service
  role can even open a connection to a peer's database. As the database owner
  each role still runs `prisma migrate deploy` (DDL in `public`, which
  Postgres 15+ hands to `pg_database_owner`) — including the migrations that
  `CREATE EXTENSION pg_trgm` (trusted on PG 13+, so no superuser needed). The
  `postgres` superuser remains for cluster admin and backups only and no
  longer appears in any `DATABASE_URL`.
  - **Fresh volume**: `deploy/postgres-init.sh` (mounted into
    `/docker-entrypoint-initdb.d/`) creates the roles + databases on initdb.
  - **Existing volume**: initdb scripts never re-run, so run
    **`deploy/migrate-db-roles.sh` once** — it creates the roles, transfers
    database + object ownership, and applies the grants. It is idempotent,
    and the superuser keeps access throughout, so the safe rollout order is:
    set the new GitHub secrets → run the script against the **running old
    stack** (exporting the five `*_DB_PASSWORD`s in the shell) → merge/deploy
    the compose change. The same script is the live-prod pre-step for the
    stateful notification-service release: it also creates `notification_db`
    (idempotently) on a cluster that predates it, so set the
    `NOTIFICATION_DB_PASSWORD` secret and run it once **before** deploying
    that release. Running it after a failed boot works too — the DB
    services just crash-loop until the roles exist.
- **Redis AUTH** — `requirepass` from `REDIS_PASSWORD`; the gateway and
  identity carry it in `REDIS_URL` (`redis://default:<password>@redis:6379` —
  `default` is the ACL user `requirepass` sets the password for).
  Unauthenticated, any container on the network could `FLUSHALL` the
  rate-limit windows and the session-revocation list (#374).
- **ACME safe-by-default** — `ACME_EMAIL` unset/empty now defaults to
  `admin@${DOMAIN}` in the compose file: the Caddyfile's global `email` option
  takes the value verbatim and an empty argument fails config load, which
  would crash-loop the only public entrypoint. CI validates the Caddyfile
  (`caddy validate`) in the `compose-config` job.

## Edge access logs (#527)

`deploy/Caddyfile`'s `{$DOMAIN}` site block emits per-request access logs as JSON
to **stdout** (`log { output stdout; format json }`). Caddy writes none by
default; sending them to stdout lands them in the container's `json-file` log
driver, which is already size-capped and rotated (`max-size: 10m`, `max-file: 3`)
in `docker-compose.prod.yml`. Tail them with
`docker compose -f docker-compose.prod.yml logs -f caddy`.

## Releasing

```
PR dev → prod  →  CI + security scans pass  →  merge  →  images built + host redeployed (health-gated)
```

To cut a versioned release, tag a `prod` commit: `git tag v0.1.0 && git push
origin v0.1.0` (fires `release.yml`; its guard job rejects tags on commits not
contained in `prod`). After a release, sync the read-only service mirrors from
`prod`:

```bash
npm run sync:repos          # scripts/sync-service-repos.sh
```

This git-subtree-splits each `services/<name>` directory to its standalone
`luminary-dev/service-hub-<name>` mirror (the monorepo stays canonical; the
mirrors are read-only, individually buildable copies). Run it from the
monorepo's `prod` branch so the mirrors reflect production.

## Rollback

- **Automatic** — a failed health-gated rollout rolls itself back to the
  previous image tag **and** the previously-deployed compose/`deploy/` config
  (see the CD pipeline); no action needed unless the job log says `ROLLBACK
  FAILED`, in which case the stack may be down — SSH in and recover manually
  (the two manual paths below).
- **Manual, fast** — set `IMAGE_TAG=<previous-sha>` in the host `.env` and
  `docker compose -f docker-compose.prod.yml up -d`. The previous deploy's
  images are still on disk (post-deploy pruning keeps the current and previous
  `:<sha>` tags; anything older is removed and would be re-pulled).
- **Manual, clean** — revert the `dev → prod` merge; the next push re-deploys the
  prior state.

## Still required before a public launch

- **#147 / #72** — verified email domain + `RESEND_API_KEY`.
- **#113 / #34** — uptime + error monitoring. **#61 / #389** — DB backups: the
  tooling + nightly automation ship in the repo; run
  `sudo ./scripts/install-backup-cron.sh` on the host once and fill in
  `.backup.env` (`docs/BACKUPS.md`).
- **#62 / #63** — Terms/Privacy pages + PDPA.
