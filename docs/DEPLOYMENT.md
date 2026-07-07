# Deployment

Production runs the same containers as dev, but from **pre-built images** pulled
from GHCR, behind a **Caddy** TLS reverse proxy, on a single Docker host.

- **Branch model** — work merges to `dev`; releasing is a PR `dev → prod`. The
  push to `prod` is the deploy trigger. (See [contributing](https://luminary-dev.gitbook.io/service-hub) / issue #212.)
- **CD** — `.github/workflows/deploy.yml` builds and pushes an image per service +
  web to `ghcr.io/luminary-dev/service-hub-<name>` (tagged `prod` and the commit
  SHA), then, if enabled, redeploys the host over SSH.
- **Compose** — `docker-compose.prod.yml` (images, `restart: unless-stopped`,
  required-secret enforcement, internal-only network + Caddy on 80/443).

Status: image publishing works today. The **deploy step and the server itself
are gated on #110** (production host, domain, TLS) — until then the pipeline
builds and publishes images but does not deploy.

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
4. Log in to GHCR so the host can pull the private images:
   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin
   ```
5. Bring it up, then bootstrap a real admin:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.prod.yml exec identity-service \
     npm run create-admin -- --email you@baas.lk --password '...'
   ```

Each DB service applies its migrations on start; the demo seed refuses to run
under `NODE_ENV=production`.

## Secrets: GitHub is the source of truth

The repo is public, so nothing sensitive lives in the tree. All runtime config
is stored as **GitHub Actions repo secrets**, and the deploy job **renders the
server's `.env` from them on every deploy** (piped over SSH, never logged). So
the manual `.env` in step 3 is only needed for a manual first bring-up before CD
is enabled — once CD runs, it owns the server `.env`.

App secrets (set with `gh secret set <NAME>`):

- Required: `AUTH_SECRET`, `INTERNAL_API_SECRET`, `POSTGRES_PASSWORD`,
  `WEB_ORIGIN`, `DOMAIN`
- Optional: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ACME_EMAIL`,
  `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

Deploy/SSH secrets: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (a deploy
key), `PROD_APP_DIR` (the checkout path on the host).

## Enabling automated deploys

Once the host exists, set the variable **`DEPLOY_ENABLED = true`** (un-gates the
`deploy` job) and the `PROD_SSH_*` secrets above. After that, merging
`dev → prod` builds the images, renders the server `.env` from the secrets, then
`git reset --hard origin/prod && docker compose -f docker-compose.prod.yml pull && up -d`.

## Releasing

```
PR dev → prod  →  CI passes  →  merge  →  images built + host redeployed
```
After a release, sync the read-only service mirrors from `prod`:
`npm run sync:repos`.

## Rollback

- Fast: set `IMAGE_TAG=<previous-sha>` in the host `.env` and
  `docker compose -f docker-compose.prod.yml up -d`.
- Clean: revert the `dev → prod` merge; the next push re-deploys the prior state.

## Still required before a public launch

- **#201** — set `TRUSTED_PROXY_HOPS` on the gateway once that fix lands, so the
  rate limiter reads the real client IP through the Caddy → web → gateway chain
  (otherwise `X-Forwarded-For` is forgeable and brute-force protection is bypassable).
- **#147 / #72** — verified email domain + `RESEND_API_KEY`.
- **#113 / #34** — uptime + error monitoring. **#61** — DB backups (`docs/BACKUPS.md`).
- **#62 / #63** — Terms/Privacy pages + PDPA.
