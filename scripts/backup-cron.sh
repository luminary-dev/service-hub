#!/usr/bin/env bash
# Nightly backup entrypoint (#389) — the target of the cron entry written by
# install-backup-cron.sh. Loads the host-local .backup.env (offsite credentials
# + heartbeat URL), then chains: dump all 6 service DBs (search_db excluded — a
# derived, rebuildable index) + offsite copy + retention
# (backup-dbs.sh) → restore-verify tonight's snapshot (verify-backup.sh) →
# success ping. Any failure pings <url>/fail instead and exits non-zero, so a
# dead-man's-switch monitor on BACKUP_HEARTBEAT_URL alerts on a missed or
# failed backup. Full runbook: docs/BACKUPS.md.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

# healthchecks.io-style heartbeat: bare URL on success, <url>/fail on failure.
ping_heartbeat() {
  [ -n "${BACKUP_HEARTBEAT_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${BACKUP_HEARTBEAT_URL%/}${1:-}" || true
}
trap 'ping_heartbeat /fail' ERR

# Host-local config, never committed (.backup.env is gitignored; a template is
# seeded by install-backup-cron.sh). Plain KEY=value lines, shell-sourced.
if [ -f .backup.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.backup.env
  set +a
fi

# The scheduled path exists to guarantee an OFFSITE copy — refuse to run as a
# local-only backup, which would silently satisfy the schedule while leaving
# the data on the same host it is protecting against.
if [ -z "${BACKUP_R2_ENDPOINT:-}" ] || [ -z "${BACKUP_R2_BUCKET:-}" ] ||
   [ -z "${BACKUP_R2_ACCESS_KEY_ID:-}" ] || [ -z "${BACKUP_R2_SECRET_ACCESS_KEY:-}" ]; then
  echo "ERROR: BACKUP_R2_* not configured in .backup.env — refusing a scheduled" >&2
  echo "backup without an offsite copy. See docs/BACKUPS.md." >&2
  ping_heartbeat /fail
  exit 1
fi

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) nightly backup starting ==="
# Guarantee upload coverage on the scheduled path too (#663): fail the run (→
# heartbeat /fail alert) if media ends up with neither R2 nor a volume tar,
# mirroring the offsite-copy refusal above. backup-dbs.sh reads the real media
# storage mode from the running media-service container.
export REQUIRE_MEDIA_COVERAGE=1
./scripts/backup-dbs.sh
./scripts/verify-backup.sh
ping_heartbeat
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) nightly backup OK ==="
