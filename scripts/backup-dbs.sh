#!/usr/bin/env bash
# Logical backup of every service database (#61) plus a Redis RDB snapshot
# (#757). Dumps run through the compose postgres/redis containers, so the host
# needs no Postgres/Redis tooling.
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
# search_db is deliberately EXCLUDED: it is a derived, rebuildable search
# index (search & discovery RFC) — after any restore, repopulate it with
# search-service's POST /internal/search/reindex instead (docs/BACKUPS.md).
DATABASES=(identity_db provider_db review_db job_db notification_db trust_safety_db)

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

# Count is derived from the array above so it can never drift out of sync with
# the actual set (currently 6; search_db excluded by design — see above).
echo "==> Backing up ${#DATABASES[@]} databases to $DEST (search_db excluded)"

for db in "${DATABASES[@]}"; do
  echo "==> Dumping $db"
  "${COMPOSE[@]}" exec -T postgres pg_dump -U postgres --format=custom "$db" > "$DEST/$db.dump"
  size=$(wc -c < "$DEST/$db.dump" | tr -d ' ')
  if [ "$size" -lt 1024 ]; then
    echo "ERROR: $db dump is suspiciously small ($size bytes)" >&2
    exit 1
  fi
done

# Redis snapshot (#757). The app Redis holds the session-revocation list (#374)
# and the durable notification email queue — losing it makes revoked sessions
# valid again (a security regression) and drops queued emails. RDB+AOF on the
# redis_data volume survive container recreation, but a lost volume or a dead
# host needs the OFFSITE copy too, so capture a point-in-time RDB alongside the
# DB dumps (shipped offsite + pruned with everything else below). `redis-cli
# --rdb -` streams a fresh dump to stdout; prod auth comes from the container's
# REDISCLI_AUTH env (absent in dev, where Redis has no password). Progress text
# goes to stderr, so stdout is the pure RDB stream.
echo "==> Dumping redis (RDB snapshot)"
if "${COMPOSE[@]}" exec -T redis redis-cli --no-auth-warning --rdb - > "$DEST/redis.rdb" 2>/dev/null; then
  size=$(wc -c < "$DEST/redis.rdb" | tr -d ' ')
  # A valid RDB begins with the "REDIS" magic + a version and is never tiny; a
  # near-empty file means the stream failed and produced nothing.
  if [ "$size" -lt 40 ]; then
    echo "ERROR: redis.rdb is suspiciously small ($size bytes) — dump produced nothing" >&2
    rm -f "$DEST/redis.rdb"
    exit 1
  fi
  echo "    redis -> redis.rdb ($size bytes)"
else
  echo "ERROR: redis RDB dump failed" >&2
  rm -f "$DEST/redis.rdb" 2>/dev/null || true
  exit 1
fi

# Media uploads (#663). Local-disk media lives in the provider_uploads /
# review_uploads volumes; R2-backed media is durable managed storage and needs
# no self-managed backup. We read the ACTUAL storage mode + volume names from
# the running media-service container, NOT from this script's environment: the
# media R2_* creds live in the CD-rendered server .env, which the backup context
# deliberately does not source (.backup.env only carries the dedicated
# BACKUP_R2_* offsite creds). Any tar lands in $DEST alongside the dumps, so the
# offsite copy + retention below ship and prune it with everything else.
UPLOAD_VOLUMES=(provider_uploads review_uploads)
media_covered=0
media_cid="$("${COMPOSE[@]}" ps -q media-service 2>/dev/null | head -n1 || true)"
if [ -z "$media_cid" ]; then
  echo "WARN: media-service not running under $COMPOSE_FILE — cannot determine" >&2
  echo "media storage mode; upload volumes NOT backed up this run." >&2
else
  # R2 is enabled only when all four vars are non-empty (mirrors media-service's
  # r2Enabled()); compose always SETS them (empty when unset), so test the value.
  r2_all_set=1
  for v in R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    if [ -z "$(docker exec "$media_cid" printenv "$v" 2>/dev/null || true)" ]; then
      r2_all_set=0
      break
    fi
  done
  if [ "$r2_all_set" -eq 1 ]; then
    echo "==> Media storage: Cloudflare R2 (durable managed storage) — upload-volume tar skipped"
    media_covered=1
  else
    echo "==> Media storage: local disk — tarring upload volumes into $STAMP"
    # Volumes are namespaced by the compose project. Resolve the project from the
    # running media-service container's label rather than hardcoding
    # service-hub-prod, so any `name:`/COMPOSE_PROJECT_NAME override is honoured
    # (cf. the #384/#570 project-resolution fixes).
    project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$media_cid" 2>/dev/null || true)"
    if [ -z "$project" ]; then
      echo "WARN: could not resolve compose project name — upload volumes NOT backed up." >&2
    else
      tarred=0
      for vol in "${UPLOAD_VOLUMES[@]}"; do
        full="${project}_${vol}"
        if ! docker volume inspect "$full" >/dev/null 2>&1; then
          echo "WARN: volume $full not found — skipping (media misconfigured?)." >&2
          continue
        fi
        echo "==> Tarring $full"
        # `if` around docker run keeps a tar failure from tripping `set -e` and
        # aborting before the DB dumps' offsite copy below — DR must not regress.
        if docker run --rm -v "$full":/data:ro -v "$(cd "$DEST" && pwd)":/out \
             alpine tar czf "/out/$vol.tgz" -C /data . ; then
          size=$(wc -c < "$DEST/$vol.tgz" | tr -d ' ')
          # A tar of an even-empty volume is a valid non-trivial gzip stream
          # (>20 bytes); 0 bytes means tar produced nothing → treat as failure.
          if [ "$size" -lt 20 ]; then
            echo "ERROR: $vol.tgz is empty ($size bytes) — tar produced nothing" >&2
            rm -f "$DEST/$vol.tgz"
          else
            echo "    $full -> $vol.tgz ($size bytes)"
            tarred=$((tarred + 1))
          fi
        else
          echo "ERROR: tar of $full failed" >&2
          rm -f "$DEST/$vol.tgz" 2>/dev/null || true
        fi
      done
      [ "$tarred" -eq "${#UPLOAD_VOLUMES[@]}" ] && media_covered=1
    fi
  fi
fi

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

# Media coverage gate (#663). By now the DB dumps are safely written, shipped
# offsite and pruned, so failing here never risks the DB backup. If uploads
# ended up with NO coverage — neither R2 nor a successful volume tar — warn
# loudly; and when REQUIRE_MEDIA_COVERAGE=1 (set by the scheduled backup-cron.sh
# path) fail the run so the heartbeat's /fail alert fires, mirroring the
# offsite-copy refusal. A manual/dev run only warns.
if [ "$media_covered" -ne 1 ]; then
  echo "WARN: media uploads have NO backup coverage this run (no R2, no volume tar) — see docs/BACKUPS.md." >&2
  if [ "${REQUIRE_MEDIA_COVERAGE:-0}" = "1" ]; then
    echo "ERROR: REQUIRE_MEDIA_COVERAGE=1 and media is uncovered — failing the backup." >&2
    exit 1
  fi
fi

echo "Backup complete: $DEST"
ls -lh "$DEST"
