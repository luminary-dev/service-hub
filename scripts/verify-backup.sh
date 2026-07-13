#!/usr/bin/env bash
# Restore-verify a snapshot made by backup-dbs.sh (#389): restore every dump
# into a throwaway Postgres container and row-count each service's main table,
# so a corrupt or empty backup fails loudly tonight instead of being discovered
# during a real disaster. Runs nightly via backup-cron.sh and in CI's e2e job.
#
#   ./scripts/verify-backup.sh                    # newest snapshot in ./backups
#   ./scripts/verify-backup.sh backups/<stamp>    # a specific snapshot
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
SNAPSHOT="${1:-}"
if [ -z "$SNAPSHOT" ]; then
  SNAPSHOT=$(ls -1d "$BACKUP_DIR"/[0-9]*T[0-9]*Z 2>/dev/null | sort | tail -1 || true)
fi
if [ -z "$SNAPSHOT" ] || [ ! -d "$SNAPSHOT" ]; then
  echo "ERROR: no snapshot to verify (looked in $BACKUP_DIR)" >&2
  exit 1
fi
echo "==> Verifying $SNAPSHOT"

# Scratch cluster on the same major as prod's postgres; discarded on exit.
SCRATCH_IMAGE="${SCRATCH_IMAGE:-postgres:16-alpine}"
NAME="backup-verify-$$"
docker run --rm -d --name "$NAME" -e POSTGRES_PASSWORD=verify "$SCRATCH_IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

# The image's init starts a temporary server before the real one, so require a
# few consecutive ready probes rather than trusting the first.
ready=0
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then
    ready=$((ready + 1))
    [ "$ready" -ge 3 ] && break
  else
    ready=0
  fi
  sleep 1
done
if [ "$ready" -lt 3 ]; then
  echo "ERROR: scratch postgres never became ready" >&2
  exit 1
fi

# db → its main table (Prisma model names; no @@map, so quoted PascalCase).
for pair in identity_db:User provider_db:Provider review_db:Review job_db:JobRequest; do
  db="${pair%%:*}"
  table="${pair#*:}"
  dump="$SNAPSHOT/$db.dump"
  if [ ! -f "$dump" ]; then
    echo "ERROR: snapshot is missing $dump" >&2
    exit 1
  fi
  docker exec "$NAME" createdb -U postgres "$db"
  # --no-owner/--no-acl: prod dumps carry per-service role ownership (#387);
  # those roles don't exist in this scratch cluster, and pg_restore exits
  # non-zero on the failed ALTER ... OWNER statements. Ownership is irrelevant
  # to row-counting, so restore everything as the scratch superuser.
  docker exec -i "$NAME" pg_restore -U postgres --no-owner --no-acl --dbname "$db" < "$dump"
  count=$(docker exec "$NAME" psql -U postgres -d "$db" -Atc "SELECT count(*) FROM \"$table\";")
  echo "    $db: \"$table\" has $count rows"
  # An empty User table means the dump captured nothing real — prod always has
  # at least the admin account (the other tables may legitimately be empty).
  if [ "$db" = identity_db ] && [ "$count" -eq 0 ]; then
    echo "ERROR: restored identity_db has 0 users — the backup looks empty." >&2
    exit 1
  fi
done

echo "Restore verification OK: $SNAPSHOT"
