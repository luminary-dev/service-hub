# Deployment

Production runs the same containers as dev, but from **pre-built images** pulled
from GHCR, behind a **Caddy** TLS reverse proxy, on a single Docker host. For the
day-two operational detail (image internals, health checks, resource limits, CI,
backups, monitoring) see [OPERATIONS.md](OPERATIONS.md).

- **Branch model** — work merges to `dev` (integration); releasing is a PR
  `dev → prod`. The push to `prod` is the deploy trigger.
- **CD** — `.github/workflows/deploy.yml` builds and pushes an image per service +
  web to `ghcr.io/luminary-dev/service-hub-<name>` (tagged `prod` and the commit
  SHA), then, if enabled, redeploys the host over SSH with a health gate and
  automatic rollback.
- **Releases** — `.github/workflows/release.yml`: a `v*` git tag publishes
  semver-tagged images and cuts a GitHub Release.
- **Compose** — `docker-compose.prod.yml` (GHCR images, `restart: unless-stopped`,
  required-secret enforcement, internal-only network + Caddy on 80/443).

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

Triggered on **push to `prod`** (and `workflow_dispatch`). Two jobs:

1. **`build-and-push`** — a matrix over web + all eight services. Each is built
   with Buildx (web from the repo root, each service from `services/<name>`) and
   pushed to `ghcr.io/luminary-dev/service-hub-<image>` tagged both `:prod` and
   `:<commit-sha>`, using a per-image GitHub Actions layer cache. This job runs
   unconditionally, so images are always published even before a server exists.

2. **`deploy`** — gated on the repo variable **`DEPLOY_ENABLED == 'true'`** and
   the `production` GitHub Environment; runs under a `deploy-prod` concurrency
   group (no cancel-in-progress) so two deploys never overlap. It:
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
     --wait-timeout 180` blocks until every container with a healthcheck is
     healthy and none has exited. A crash-loop or a failed `prisma migrate
     deploy` fails the deploy instead of silently replacing the running stack;
   - **auto-rolls-back on failure**: rewrites `IMAGE_TAG` back to `PREV_TAG`,
     re-pulls, brings the previous images up, and exits non-zero;
   - **prunes only after a healthy rollout** (`docker image prune -f`), so the
     previous image stays on disk and rollback remains a one-liner.

## Releases (`release.yml`)

Pushing a semver git tag (e.g. `v0.1.0`) runs the Release workflow:

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
  `WEB_ORIGIN`, `DOMAIN`. `docker-compose.prod.yml` guards each with `${VAR:?}`,
  so the stack refuses to start if any is missing.
- **Optional** (features degrade gracefully when unset): `ACME_EMAIL`,
  `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `R2_ENDPOINT`,
  `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` (Google social login #398 — both unset → the
  "Continue with Google" button is hidden, password auth unaffected).

Deploy/SSH secrets: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (a deploy
key), `PROD_APP_DIR` (the checkout path on the host).

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
   Generate the secrets: `openssl rand -base64 32` for `AUTH_SECRET`,
   `INTERNAL_API_SECRET`, and `POSTGRES_PASSWORD`.
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
origin v0.1.0` (fires `release.yml`). After a release, sync the read-only
service mirrors from `prod`:

```bash
npm run sync:repos          # scripts/sync-service-repos.sh
```

This git-subtree-splits each `services/<name>` directory to its standalone
`luminary-dev/service-hub-<name>` mirror (the monorepo stays canonical; the
mirrors are read-only, individually buildable copies). Run it from the
monorepo's `prod` branch so the mirrors reflect production.

## Rollback

- **Automatic** — a failed health-gated rollout rolls itself back to the
  previous image tag (see the CD pipeline); no action needed.
- **Manual, fast** — set `IMAGE_TAG=<previous-sha>` in the host `.env` and
  `docker compose -f docker-compose.prod.yml up -d`. The previous image is still
  on disk (pruning only happens after a healthy deploy).
- **Manual, clean** — revert the `dev → prod` merge; the next push re-deploys the
  prior state.

## Still required before a public launch

- **#147 / #72** — verified email domain + `RESEND_API_KEY`.
- **#113 / #34** — uptime + error monitoring. **#61** — DB backups (`docs/BACKUPS.md`).
- **#62 / #63** — Terms/Privacy pages + PDPA.
