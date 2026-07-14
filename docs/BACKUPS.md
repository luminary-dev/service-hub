# Database backup & disaster recovery

## What gets backed up

| Data | Where it lives | Covered by |
| --- | --- | --- |
| identity_db, provider_db, review_db, job_db, notification_db, trust_safety_db | compose `postgres` (one cluster) | `scripts/backup-dbs.sh` (logical `pg_dump -Fc` per DB) |
| search_db | compose `postgres` (same cluster) | deliberately NOT backed up — it is a **derived, rebuildable search index** (search & discovery RFC): after any restore, repopulate it with search-service's `POST /internal/search/reindex` (with the internal secret) instead of restoring a dump |
| Uploaded images | `provider_uploads` / `review_uploads` volumes (or Cloudflare R2 when the `R2_*` vars are set) | **automatic** (#663): in local-disk mode `scripts/backup-dbs.sh` tars both volumes into the snapshot and ships them offsite with the dumps; when R2 is configured the tar is skipped (R2 is durable managed storage). See [Upload volumes](#upload-volumes) |
| Redis rate-limit windows + session-revocation list | `redis` (prod `redis_data` volume) | deliberately NOT backed up — rate-limit windows are ephemeral, and the revocation list (#374) mirrors identity_db's `sessionVersion` (covered above). The volume keeps it across container recreation (#571); after a total Redis loss the gateway falls back to the identity lookup until versions are re-published on the next bump |

## Policy

- **Cadence**: nightly at 02:17 UTC on the prod host. `/etc/cron.d/service-hub-backup` (installed once with `sudo ./scripts/install-backup-cron.sh`, #389) runs `scripts/backup-cron.sh`: dump → offsite copy → restore-verify → heartbeat ping. The backup script targets the prod compose project (`docker-compose.prod.yml`) by default; for a local dev backup run `COMPOSE_FILE=docker-compose.yml ./scripts/backup-dbs.sh`.
- **Retention**: newest 14 snapshots locally, newest 30 offsite (`RETENTION` / `REMOTE_RETENTION` env override); only `YYYYMMDDTHHMMSSZ` snapshot dirs are pruned, so anything else you keep in `BACKUP_DIR` or the bucket is left alone.
- **Offsite**: `backup-dbs.sh` ships every snapshot to a **dedicated** Cloudflare R2 bucket through a dockerized rclone when the `BACKUP_R2_*` vars are set — and the scheduled path (`backup-cron.sh`) refuses to run without them, so the schedule can't silently degrade to local-only. Use a separate bucket + API token from the media uploads' `R2_*` credentials (least privilege: the token is scoped to the backups bucket only).
- **Uploaded images** (#663): in **local-disk media mode** `backup-dbs.sh` tars the `provider_uploads` / `review_uploads` volumes into the same snapshot dir as the dumps (through a throwaway `alpine` container mounting each volume read-only), so the offsite copy + retention ship and prune them with everything else; when the media **`R2_*`** vars are set the images already live in Cloudflare R2 (durable managed storage) and the tar is skipped. The mode + volume names are read from the **running media-service container** (the media `R2_*` creds are not in `.backup.env`), and each run logs which path applied. If a run ends with **no** media coverage — neither R2 nor a successful tar — it warns loudly, and the scheduled path (`backup-cron.sh`, which sets `REQUIRE_MEDIA_COVERAGE=1`) **fails the run** so the heartbeat's `/fail` alert fires, mirroring the offsite-copy refusal.
- **Restore verification**: every nightly run restores the fresh snapshot into a scratch Postgres container and row-counts each service's main table (`scripts/verify-backup.sh` — fails loudly on a missing/corrupt dump or an empty `User` table; `notification_db`'s `Notification` and `trust_safety_db`'s `Report` counts may legitimately be zero, so only identity's zero-rows case is fatal). It also validates any upload-volume tar in the snapshot is a readable gzip archive (absent tars are fine — R2 mode or none configured). CI's `e2e` job exercises the same backup → restore-verify path on every PR. Still walk the full runbook below as a quarterly drill.
- **Alerting**: a dead-man's-switch. `backup-cron.sh` pings `BACKUP_HEARTBEAT_URL` only after backup + offsite + verification all succeed (`<url>/fail` on failure — healthchecks.io semantics). Point it at a heartbeat monitor with a ~26 h grace period so a missed or failed nightly raises an alert instead of being discovered mid-disaster.

## Nightly automation setup (one-time per host)

1. `sudo ./scripts/install-backup-cron.sh` — writes `/etc/cron.d/service-hub-backup` (default `17 2 * * *` UTC; override with `sudo CRON_SCHEDULE="45 3 * * *" ./scripts/install-backup-cron.sh`) running as the checkout's owner, and seeds a `.backup.env` template (mode 0600, gitignored).
2. Fill in `$APP_DIR/.backup.env`:

   | Var | Required | Meaning |
   | --- | --- | --- |
   | `BACKUP_R2_ENDPOINT` | yes | `https://<account-id>.r2.cloudflarestorage.com` |
   | `BACKUP_R2_BUCKET` | yes | dedicated backups bucket, e.g. `baas-backups` |
   | `BACKUP_R2_ACCESS_KEY_ID` / `BACKUP_R2_SECRET_ACCESS_KEY` | yes | S3 credentials for an R2 API token scoped to that bucket only |
   | `BACKUP_HEARTBEAT_URL` | recommended | heartbeat check URL (pinged on success; `<url>/fail` on failure) |
   | `BACKUP_DIR` / `RETENTION` / `REMOTE_RETENTION` | no | defaults `./backups` / `14` / `30` |

   These stay host-local: they are **not** GitHub secrets and are **not** part of the CD-rendered `.env` (deploy.yml). The deploy's `git reset --hard origin/prod` keeps the scripts themselves current, so the cron entry and `.backup.env` are the only per-host state.
3. Smoke-test the full chain once by hand: `./scripts/backup-cron.sh` (as the deploy user), then confirm the snapshot in the bucket and the heartbeat monitor's ping.

Each nightly run appends a few KB to `backups/backup.log`; truncate it whenever it bothers you.

## Restore runbook

1. Identify the snapshot: `ls backups/` (UTC timestamps; each contains one `.dump` per database). If the host itself is gone, pull it from the offsite bucket first (any S3 tool works — e.g. `rclone copy R2:<bucket>/<stamp> backups/<stamp>` with the `.backup.env` credentials).
2. Restore the affected database(s):
   `./scripts/restore-db.sh provider_db backups/<stamp>/provider_db.dump --yes`
   (`--clean --if-exists` under the hood — the target database's objects are replaced). Per-service DB roles (#387): all dump/restore tooling keeps running as the `postgres` **superuser** (which bypasses the per-database `REVOKE CONNECT`), but on prod the script also passes `--no-owner --role=<service role>`, so every restored object ends up owned by the owning service's role — works for pre-#387 superuser-owned dumps too. On a dev stack (no such role) it falls back to a plain superuser restore.
3. Restart the owning service so Prisma reconnects cleanly:
   `docker compose -f docker-compose.prod.yml restart provider-service`
   (on prod the stack runs under `docker-compose.prod.yml` — a bare `docker compose` resolves the default dev file and finds nothing; for a local dev restore use `docker compose restart provider-service`).
4. Cross-service consistency: databases are dumped at (nearly) the same instant, but references are plain string IDs — after a partial restore, rows referencing entities created after the snapshot degrade gracefully (that is the S2S design: hydration falls back, existence is checked at write time). Prefer restoring **all six** databases from the **same** snapshot unless you're recovering a single-database fault.
5. Rebuild the search index (it is derived, not restored — see the table above). On prod the service ports aren't published, so run it inside the container:
   `docker compose -f docker-compose.prod.yml exec search-service wget -qO- --header "x-internal-secret: $INTERNAL_API_SECRET" --post-data= http://localhost:4008/internal/search/reindex`
   (dev: `curl -X POST -H "x-internal-secret: dev-internal-secret" localhost:4008/internal/search/reindex`). Otherwise `/api/search/*` serves pre-restore data until the next scheduled sweep.
6. Verify: `npm run e2e` against the stack, and spot-check `/providers` + a profile page.

## Upload volumes

Local-disk uploads live in named Docker volumes prefixed by the compose project — prod runs as project `service-hub-prod` (`docker-compose.prod.yml`), so the volumes are `service-hub-prod_provider_uploads` / `service-hub-prod_review_uploads` (dev: `service-hub_…`).

**These are backed up automatically (#663)** — you no longer tar them by hand. When media is in local-disk mode, `backup-dbs.sh` resolves the compose project from the running media-service container (so no name is hardcoded), tars each volume into the snapshot dir via a throwaway `alpine` container, and the existing offsite copy + retention carry them along with the DB dumps. When the media `R2_*` vars are set the images are in Cloudflare R2 (durable managed storage) and the tar is skipped. A run that would leave uploads with no coverage warns loudly, and the scheduled path fails (see the **Uploaded images** bullet under [Policy](#policy)).

**Restoring uploads** (local-disk mode): pull the snapshot (offsite if the host is gone), then untar each volume back through a throwaway container — the media-service in the target stack must be stopped or restarted afterwards so it re-reads the disk:

```bash
docker run --rm -v service-hub-prod_provider_uploads:/data \
  -v "$PWD/backups/<stamp>":/in alpine \
  sh -c 'cd /data && tar xzf /in/provider_uploads.tgz'
# repeat for review_uploads, then:
docker compose -f docker-compose.prod.yml restart media-service
```
