# Database backup & disaster recovery

## What gets backed up

| Data | Where it lives | Covered by |
| --- | --- | --- |
| identity_db, provider_db, review_db, job_db | compose `postgres` (one cluster) | `scripts/backup-dbs.sh` (logical `pg_dump -Fc` per DB) |
| Uploaded images | `provider_uploads` / `review_uploads` volumes (or Cloudflare R2 when the `R2_*` vars are set) | volume tar (below); R2 is durable managed storage |
| Redis rate-limit windows + session-revocation list | `redis` (prod `redis_data` volume) | deliberately NOT backed up — rate-limit windows are ephemeral, and the revocation list (#374) mirrors identity_db's `sessionVersion` (covered above). The volume keeps it across container recreation (#571); after a total Redis loss the gateway falls back to the identity lookup until versions are re-published on the next bump |

## Policy

- **Cadence**: daily `./scripts/backup-dbs.sh` (cron on the production host once #110 lands). The script targets the prod compose project (`docker-compose.prod.yml`) by default; for a local dev backup run `COMPOSE_FILE=docker-compose.yml ./scripts/backup-dbs.sh`.
- **Retention**: newest 14 snapshots locally (`RETENTION` env overrides); only `YYYYMMDDTHHMMSSZ` snapshot dirs are pruned, so anything else you keep in `BACKUP_DIR` is left alone.
- **Offsite**: copy each snapshot directory to object storage (Cloudflare R2 — same account as uploads). One-liner: `rclone copy backups/<stamp> remote:baas-backups/<stamp>`.
- **Restore drills**: restore the newest snapshot into scratch databases quarterly and row-count the main tables (this exact procedure was executed when the tooling shipped).

## Restore runbook

1. Identify the snapshot: `ls backups/` (UTC timestamps; each contains one `.dump` per database).
2. Restore the affected database(s):
   `./scripts/restore-db.sh provider_db backups/<stamp>/provider_db.dump --yes`
   (`--clean --if-exists` under the hood — the target database's objects are replaced).
3. Restart the owning service so Prisma reconnects cleanly:
   `docker compose restart provider-service`
4. Cross-service consistency: databases are dumped at (nearly) the same instant, but references are plain string IDs — after a partial restore, rows referencing entities created after the snapshot degrade gracefully (that is the S2S design: hydration falls back, existence is checked at write time). Prefer restoring **all four** databases from the **same** snapshot unless you're recovering a single-database fault.
5. Verify: `npm run e2e` against the stack, and spot-check `/providers` + a profile page.

## Upload volumes

Local-disk uploads live in named Docker volumes. Snapshot alongside the DB dumps when running self-hosted:

```bash
docker run --rm -v service-hub_provider_uploads:/data -v "$PWD/backups":/out alpine \
  tar czf /out/<stamp>/provider_uploads.tgz -C /data .
```

(Repeat for `review_uploads`.) When the `R2_*` vars are set, uploads live in Cloudflare R2 (durable managed storage) and need no self-managed backup.
