# Secret rotation

The operator runbook for rotating the platform's secrets — routinely, or in a
hurry after a suspected exposure. It builds on the deploy model in
[DEPLOYMENT.md](DEPLOYMENT.md) (read the *"Secrets: GitHub is the source of
truth"* section first) and the runtime detail in [OPERATIONS.md](OPERATIONS.md).

## How secrets reach the running stack

There is **one** source of truth: **GitHub Actions repo secrets**. The repo is
public, so nothing sensitive lives in the tree. On every deploy, the `deploy`
job in `.github/workflows/deploy.yml`:

1. renders `$PROD_APP_DIR/.env` on the server **from the GitHub secrets**, piped
   over the encrypted SSH channel (never printed to the log). Values are
   double-quoted and escaped for Compose's dotenv parser, so a rotated secret
   containing `$`, `#`, quotes, or whitespace lands verbatim (#572) — no
   charset restrictions on new values;
2. `git reset --hard origin/prod`, `docker compose -f docker-compose.prod.yml
   pull`, then a **health-gated** `up -d --wait` that recreates any container
   whose environment changed;
3. **auto-rolls back on failure** — but only the `IMAGE_TAG`, *not* the `.env`
   values (see [Recovering from a bad rotation](#recovering-from-a-bad-rotation)).

So the rotation shape is always the same: **update the GitHub secret →
redeploy so `.env` re-renders → verify.** You do not SSH in to hand-edit `.env`
under normal circumstances; the next deploy would overwrite it anyway.

### The standard rotation procedure

Unless a per-secret section below says otherwise, every rotation is:

```bash
# 1. Set the new value as a GitHub Actions repo secret (source of truth).
#    Generate app secrets with: openssl rand -base64 32
gh secret set <NAME>          # paste/pipe the new value; never commit it

# 2. Redeploy so the deploy job re-renders $APP_DIR/.env from the secrets and
#    recreates the affected containers (health-gated, with auto image rollback).
gh workflow run deploy.yml --ref prod
```

`workflow_dispatch` on the `prod` branch runs the exact same build + deploy path
as a `dev → prod` merge — no code change is needed to pick up a new secret. Watch
the run to green (`gh run watch`), then run the [verification](#verification)
steps. Because the deploy is gated on the repo variable `DEPLOY_ENABLED == 'true'`
and the `production` environment, dispatching before the server exists (#110)
only republishes images.

> **Prefer a maintenance window** for `AUTH_SECRET`, `INTERNAL_API_SECRET`,
> `POSTGRES_PASSWORD`, the per-service `*_DB_PASSWORD`s and `REDIS_PASSWORD`.
> Each briefly disrupts either sessions or in-flight S2S / DB / Redis
> connections while containers recreate. The optional third-party keys are
> low-risk and can rotate any time.

---

## AUTH_SECRET

**What it protects.** The HMAC key (HS256) that signs and verifies the
`sh_session` JWT (and the short-lived `impersonation_session` token).
`identity-service` is the only signer; the **api-gateway** and the **web** app
verify. All three read the same `AUTH_SECRET` from `.env`.

**Blast radius.** There is a single active key — no key-id / multi-key
verification list. Rotating it **immediately invalidates every existing
session**: all issued JWTs fail verification, so **every user is logged out** and
must sign in again (7-day tokens are cut short). No data is lost; it is a
sign-in-again event, not an outage. Any active admin impersonation ends too.

**Rotation.** Standard procedure above (`gh secret set AUTH_SECRET` →
`gh workflow run deploy.yml --ref prod`). The gateway, web and identity
containers recreate with the new key together. There is **no zero-session-loss
window** — this is an inherent hard cutover (see
[Hardening opportunities](#hardening-opportunities)). Schedule it for a low-traffic
window and expect a wave of re-logins.

**When to rotate.** Routinely every 6–12 months; **immediately** if the value
may have leaked (exposed `.env`, compromised CI, or a laptop/screenshot). Forcing
a global logout is exactly the desired effect after a suspected token-forgery
risk.

## INTERNAL_API_SECRET

**What it protects.** The shared secret that makes service-to-service (S2S)
trust work. The gateway (and any service calling a peer) stamps it as the
`x-internal-secret` header; every service validates it with a constant-time
compare before trusting the forwarded `x-user-*` identity headers. It is read by
**all eight services and the web app** (web reaches identity directly for the
session-revocation check). See [AUTHZ.md](AUTHZ.md).

**Blast radius.** There is **one** accepted value per service — the code holds a
single `INTERNAL_SECRET` and compares against it; there is **no dual-secret
acceptance window.** If the containers ever hold *different* values, the S2S
calls between the mismatched pair are rejected with **403 Forbidden**, which
surfaces as failed page loads / write gates. It must therefore change
**atomically across the whole stack.**

**Rotation.** The standard procedure already does this atomically enough: the
deploy re-renders one `.env` and `up -d --wait` recreates **all** consuming
containers in the same rollout. During the seconds while containers cycle, some
cross-service calls may 403 until every container is back — the health-gate holds
the deploy open until the stack is healthy, and read paths degrade gracefully.
Do it in a maintenance window and **verify the S2S smoke** afterward.

Do **not** try to stage this by editing only some services — a partial rollout
is the one way to get a persistent 403 storm. One secret, one deploy, whole stack.

**When to rotate.** Routinely every 6–12 months; **immediately** on suspected
exposure — a leaked internal secret lets anyone who can reach a service port
forge identity headers (mitigated today because no service port is published,
but rotate anyway).

## POSTGRES_PASSWORD

**What it protects.** The `postgres` superuser password. Since the
per-service DB roles landed (#387) it no longer appears in any `DATABASE_URL`
— the four DB-owning services connect as their own roles (below). The
superuser remains for cluster administration and the backup tooling
(`scripts/backup-dbs.sh` execs `pg_dump -U postgres` over the container's
local socket, which trusts local connections, so backups don't even read the
password — but keep the secret and the in-DB password in sync anyway).

**Critical caveat — the env var alone will NOT change the password.** Postgres
only reads `POSTGRES_PASSWORD` when it **initializes an empty data directory**.
On an existing `pgdata` volume it is ignored. You must change the password
**inside Postgres** and the secret **together**:

```bash
# On the prod host, change the actual role password in the running database:
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -c "ALTER USER postgres WITH PASSWORD '<NEW_PASSWORD>';"

# Then make GitHub match and redeploy so .env re-renders:
gh secret set POSTGRES_PASSWORD        # the same <NEW_PASSWORD>
gh workflow run deploy.yml --ref prod
```

**Blast radius.** Small since #387: no service `DATABASE_URL` carries it, and
backups connect over the container's local socket. A stale value mostly means
a wrong credential lying in `.env`. No schema or data change.

**When to rotate.** Routinely once a year, or immediately if the DB credential
may be exposed. Coordinate with [BACKUPS.md](BACKUPS.md) — take a fresh
`pg_dump` before rotating.

## Per-service DB passwords (`IDENTITY_DB_PASSWORD` … `TRUST_SAFETY_DB_PASSWORD`, #387)

**What they protect.** Each DB-owning service connects as its own
least-privilege role (`identity` / `provider` / `review` / `job` / `trust_safety`), whose
password is interpolated into that service's `DATABASE_URL` and passed to the
`postgres` container for bootstrap/migration tooling.

**Same caveat as `POSTGRES_PASSWORD`**: the in-DB password and the secret must
change together, and the values are **URL-interpolated** — generate them with
`openssl rand -hex 32` (URL-safe), not base64. The simplest in-DB step is to
re-run the idempotent role script with the new value(s) exported — it
`ALTER ROLE … PASSWORD`s each role it touches:

```bash
# On the prod host (only the vars you're rotating need to be exported):
IDENTITY_DB_PASSWORD='<NEW>' PROVIDER_DB_PASSWORD='<OLD>' \
REVIEW_DB_PASSWORD='<OLD>' JOB_DB_PASSWORD='<OLD>' \
TRUST_SAFETY_DB_PASSWORD='<OLD>' ./deploy/migrate-db-roles.sh

gh secret set IDENTITY_DB_PASSWORD     # the same <NEW> value
gh workflow run deploy.yml --ref prod  # re-renders DATABASE_URL, recreates the service
```

**Blast radius.** Only the owning service reconnects; its peers are untouched.

## REDIS_PASSWORD (#387)

**What it protects.** Redis AUTH (`requirepass`) over the gateway's rate-limit
windows and the session-revocation list (#374). Consumed by the `redis`
container (command flag + healthcheck) and by the gateway's and identity's
`REDIS_URL`s.

**Rotation.** Standard procedure — unlike Postgres, the value lives only in
the container config, so the redeploy's container recreation applies it
everywhere at once (`gh secret set REDIS_PASSWORD` with a URL-safe
`openssl rand -hex 32` value → `gh workflow run deploy.yml --ref prod`).
Recreating the `redis` container keeps `/data` (the `redis_data` volume), so
the revocation list survives. During the seconds the consumers cycle, rate
limiting falls back to per-instance in-memory and revocation checks fall back
to the identity lookup — both by design.

## Third-party API keys (optional secrets)

These are credentials for external providers. The platform **degrades
gracefully** when they are unset, so the blast radius of a rotation is limited to
that one feature, and rotation never risks the core stack. Rotate the credential
**at the provider first**, then run the standard procedure (`gh secret set …` →
`gh workflow run deploy.yml --ref prod`).

| Secret | Consumed by | What breaks / degrades |
| --- | --- | --- |
| `RESEND_API_KEY` | notification-service | Transactional email. Unset/invalid → emails only log to the console; verification/notification mail stops sending. See [EMAIL_SETUP.md](EMAIL_SETUP.md). |
| `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` | media-service | Uploads to Cloudflare R2. Rotate the pair together in the R2 dashboard, then here. A stale key breaks upload/serve while local-disk fallback only applies when **all four** `R2_*` are unset. See [BACKUPS.md](BACKUPS.md) / [OPERATIONS.md](OPERATIONS.md). |
| `ANTHROPIC_API_KEY` | chat-service | The AI chat assistant. Unset/invalid → the assistant returns 503; nothing else is affected. |
| `GOOGLE_CLIENT_SECRET` / `FACEBOOK_CLIENT_SECRET` | identity-service | Social login (#398). Rotate in the Google Cloud / Meta console, then here. Unset → the corresponding button is disabled; password auth is unaffected. |

`WEB_ORIGIN`, `DOMAIN`, `ACME_EMAIL`, `EMAIL_FROM`, the `R2_ENDPOINT`/`R2_BUCKET`
names and the OAuth **client IDs** are configuration, not secrets — change them
the same way, but they carry no exposure risk.

## Deploy / SSH secrets

`PROD_SSH_KEY` (the deploy key), `PROD_SSH_HOST`, `PROD_SSH_USER`,
`PROD_APP_DIR` and `PROD_SSH_KNOWN_HOSTS` (the pinned host key, #388)
authenticate the CD job to the prod host. To rotate `PROD_SSH_KEY`:
generate a new keypair, add the **public** key to the host's
`~/.ssh/authorized_keys` for `PROD_SSH_USER`, `gh secret set PROD_SSH_KEY` with
the new **private** key, run a deploy to confirm it connects, then remove the old
public key from the host. These do not touch the app `.env`, so no session or
S2S impact.

`PROD_SSH_KNOWN_HOSTS` must be refreshed whenever the host is rebuilt, its IP
changes, or its SSH host keys are regenerated — the deploy fails closed on a
mismatch (that failure is the pin doing its job; investigate before updating).
Re-capture with `ssh-keyscan -t ed25519 "$PROD_SSH_HOST" | gh secret set
PROD_SSH_KNOWN_HOSTS`, verifying the fingerprint out-of-band (e.g.
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VPS console).

---

## Verification

After any rotation, confirm the deploy went green and the stack is healthy:

1. **Deploy status** — `gh run watch` (or the Actions tab): the `deploy` job
   must succeed. A failure means the health-gate tripped and the image (not the
   secrets) rolled back — see below.
2. **Container health** — on the host,
   `docker compose -f docker-compose.prod.yml ps` shows every service
   `healthy` (each backs its `/healthz` probe; DB services also run `SELECT 1`).
3. **Login test** (esp. after `AUTH_SECRET`) — sign in on the live site; you
   should get a fresh `sh_session` and a working authenticated page.
4. **S2S smoke** (esp. after `INTERNAL_API_SECRET`) — load a page that fans out
   across services (e.g. the provider directory → gateway → provider/review, or
   the admin dashboard). No `403 Forbidden` in
   `docker compose -f docker-compose.prod.yml logs api-gateway`.
5. **DB connectivity** (after `POSTGRES_PASSWORD` or a `*_DB_PASSWORD`) — the
   four DB services stay `healthy`; no `authentication failed` lines in their
   logs. After `REDIS_PASSWORD`: no `NOAUTH`/`WRONGPASS` lines from the
   gateway or identity.
6. **Feature check** (after a third-party key) — send a test email / do an
   upload / open the chat assistant as appropriate.

### Recovering from a bad rotation

The CD auto-rollback reverts **only `IMAGE_TAG`, not the `.env` values** — it
re-renders the *same* (now-broken) secrets on the previous image. So a bad secret
is **not** self-healing. To recover:

- **Preferred** — fix the value in GitHub (`gh secret set <NAME>` with the
  correct/known-good value) and `gh workflow run deploy.yml --ref prod` again.
- **Fast, manual** — SSH to the host and correct the offending line in
  `$APP_DIR/.env`, then `docker compose -f docker-compose.prod.yml up -d --wait`.
  Remember the **next** deploy re-renders `.env` from GitHub, so you must still
  fix the GitHub secret to make it stick.
- For `POSTGRES_PASSWORD` and the `*_DB_PASSWORD`s specifically, a broken
  rotation usually means the in-DB password and the secret disagree — re-run
  the `ALTER USER` / `deploy/migrate-db-roles.sh` step and the secret update
  so they match, then redeploy.

---

## Cadence

- **Routine** — rotate `AUTH_SECRET`, `INTERNAL_API_SECRET`,
  `POSTGRES_PASSWORD`, the `*_DB_PASSWORD`s and `REDIS_PASSWORD` on a 6–12
  month schedule (whichever the team adopts); rotate third-party keys on the
  provider's own recommended cadence.
- **Incident response** — on any suspected exposure (leaked `.env`, compromised
  CI run, lost laptop, key committed by mistake), rotate the affected secret
  **immediately** and, if the exposure scope is unclear, rotate the whole core
  set. Rotating `AUTH_SECRET` doubles as a global force-logout; rotating
  `INTERNAL_API_SECRET` closes any forged-identity risk. Follow the
  responsible-disclosure / incident steps in
  [SECURITY.md](../SECURITY.md) and take a DB backup first
  ([BACKUPS.md](BACKUPS.md)).

## Hardening opportunities

Today's model is correct but has two sharp edges worth tracking as follow-ups:

- **No dual-secret window for `INTERNAL_API_SECRET`.** Because each service
  accepts exactly one value, rotation depends on a tight coordinated redeploy
  rather than a graceful overlap. Accepting a *previous* secret for a short
  window (verify against current **or** previous) would make S2S rotation truly
  zero-403.
- **No key-id on the session JWT.** `AUTH_SECRET` rotation is an unavoidable
  global logout. Verifying against a small ordered list of keys (current +
  previous, selected by a `kid` header) would let sessions survive a rotation.
- **Auto-rollback doesn't revert `.env`.** A bad secret needs a manual re-fix
  (above). Snapshotting the previous `.env` alongside `PREV_TAG` and restoring
  both on failure would close this.
