#!/usr/bin/env bash
# Logical backup of every service database (#61). Dumps run through the
# compose postgres container, so the host needs no Postgres tooling.
#
#   ./scripts/backup-dbs.sh                 # dumps to ./backups/<UTC timestamp>/
#   BACKUP_DIR=/mnt/backups RETENTION=30 ./scripts/backup-dbs.sh
#
# Retention prunes to the newest $RETENTION snapshot directories. Ship the
# snapshot directory offsite (rclone/aws s3 sync) once an object-storage
# bucket exists — see docs/BACKUPS.md.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${RETENTION:-14}"
DATABASES=(identity_db provider_db review_db job_db)

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

for db in "${DATABASES[@]}"; do
  echo "==> Dumping $db"
  docker compose exec -T postgres pg_dump -U postgres --format=custom "$db" > "$DEST/$db.dump"
  size=$(wc -c < "$DEST/$db.dump" | tr -d ' ')
  if [ "$size" -lt 1024 ]; then
    echo "ERROR: $db dump is suspiciously small ($size bytes)" >&2
    exit 1
  fi
done

# Prune old snapshots beyond the retention count (newest first survive).
if [ -d "$BACKUP_DIR" ]; then
  ls -1d "$BACKUP_DIR"/*/ 2>/dev/null | sort -r | tail -n "+$((RETENTION + 1))" | while read -r old; do
    echo "==> Pruning $old"
    rm -rf "$old"
  done
fi

echo "Backup complete: $DEST"
ls -lh "$DEST"
