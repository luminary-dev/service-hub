#!/usr/bin/env bash
# Logical backup of every service database (#61). Dumps run through the
# compose postgres container, so the host needs no Postgres tooling.
#
#   ./scripts/backup-dbs.sh                 # dumps to ./backups/<UTC timestamp>/
#   BACKUP_DIR=/mnt/backups RETENTION=30 ./scripts/backup-dbs.sh
#
# Retention prunes to the newest $RETENTION snapshot directories locally and
# $REMOTE_RETENTION offsite. When the four BACKUP_R2_* vars are set (#389),
# each snapshot is shipped to Cloudflare R2 via a dockerized rclone — see
# docs/BACKUPS.md for the nightly cron + .backup.env setup.
set -euo pipefail
cd "$(dirname "$0")/.."

# The prod stack runs under docker-compose.prod.yml (compose project
# service-hub-prod); a bare `docker compose` would resolve the default
# docker-compose.yml project and find no postgres on the prod host, so the
# backup would silently fail (#384). Default to the prod file (override
# COMPOSE_FILE=docker-compose.yml for a local dev backup).
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${RETENTION:-14}"
DATABASES=(identity_db provider_db review_db job_db notification_db)

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

for db in "${DATABASES[@]}"; do
  echo "==> Dumping $db"
  "${COMPOSE[@]}" exec -T postgres pg_dump -U postgres --format=custom "$db" > "$DEST/$db.dump"
  size=$(wc -c < "$DEST/$db.dump" | tr -d ' ')
  if [ "$size" -lt 1024 ]; then
    echo "ERROR: $db dump is suspiciously small ($size bytes)" >&2
    exit 1
  fi
done

# Offsite copy (#389): ship the snapshot to R2 through a dockerized rclone (the
# host needs no extra tooling) and prune remote snapshots beyond
# $REMOTE_RETENTION. Use a DEDICATED backups bucket + API token, not the
# media-service R2_* credentials — least privilege (docs/BACKUPS.md).
REMOTE_RETENTION="${REMOTE_RETENTION:-30}"
if [ -n "${BACKUP_R2_ENDPOINT:-}" ] && [ -n "${BACKUP_R2_BUCKET:-}" ] &&
   [ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ] && [ -n "${BACKUP_R2_SECRET_ACCESS_KEY:-}" ]; then
  rclone_r2() {
    docker run --rm -v "$(cd "$DEST" && pwd)":/snapshot:ro \
      -e RCLONE_CONFIG_R2_TYPE=s3 \
      -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
      -e RCLONE_CONFIG_R2_ENDPOINT="$BACKUP_R2_ENDPOINT" \
      -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID" \
      -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY" \
      rclone/rclone:1 "$@"
  }
  echo "==> Uploading $STAMP to R2 bucket $BACKUP_R2_BUCKET"
  rclone_r2 copy /snapshot "R2:$BACKUP_R2_BUCKET/$STAMP"
  # Same timestamp-only match as the local prune below, so nothing else kept in
  # the bucket is ever counted or deleted.
  rclone_r2 lsf "R2:$BACKUP_R2_BUCKET" --dirs-only |
    { grep -E '^[0-9]{8}T[0-9]{6}Z/$' || true; } | sort -r |
    tail -n "+$((REMOTE_RETENTION + 1))" | while read -r old; do
      echo "==> Pruning remote ${old%/}"
      rclone_r2 purge "R2:$BACKUP_R2_BUCKET/${old%/}"
    done
else
  echo "WARN: BACKUP_R2_* not set — snapshot NOT copied offsite (docs/BACKUPS.md)." >&2
fi

# Prune old snapshots beyond the retention count (newest first survive). Match
# ONLY our timestamp dirs (YYYYMMDDTHHMMSSZ) so a stray subdirectory in
# BACKUP_DIR is never counted toward retention or deleted (#384).
if [ -d "$BACKUP_DIR" ]; then
  ls -1d "$BACKUP_DIR"/[0-9]*T[0-9]*Z/ 2>/dev/null | sort -r | tail -n "+$((RETENTION + 1))" | while read -r old; do
    echo "==> Pruning $old"
    rm -rf "$old"
  done
fi

echo "Backup complete: $DEST"
ls -lh "$DEST"
