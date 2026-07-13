#!/usr/bin/env bash
# One-time (idempotent, re-runnable) setup of the nightly backup schedule on
# the prod host (#389): writes /etc/cron.d/service-hub-backup pointing at
# backup-cron.sh in this checkout, and seeds a .backup.env template (0600) for
# the offsite credentials + heartbeat URL. The scripts themselves stay current
# via the deploy's `git reset --hard origin/prod`, so the cron entry and
# .backup.env are the only per-host state. Full setup guide: docs/BACKUPS.md.
#
#   sudo ./scripts/install-backup-cron.sh                        # 02:17 UTC daily
#   sudo CRON_SCHEDULE="45 3 * * *" ./scripts/install-backup-cron.sh
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo — writing /etc/cron.d needs root." >&2
  exit 1
fi

# Run the nightly job as the checkout's owner (the deploy user, which is in the
# docker group) rather than root.
RUN_AS="${RUN_AS:-$(stat -c %U "$APP_DIR" 2>/dev/null || stat -f %Su "$APP_DIR")}"
CRON_SCHEDULE="${CRON_SCHEDULE:-17 2 * * *}"

if [ ! -f .backup.env ]; then
  cat > .backup.env <<'EOF'
# Nightly backup config (#389) — host-local, never committed (docs/BACKUPS.md).
# Offsite copy: S3 credentials for a DEDICATED R2 bucket + API token scoped to
# it. Do NOT reuse the media-service R2_* credentials.
BACKUP_R2_ENDPOINT=
BACKUP_R2_BUCKET=
BACKUP_R2_ACCESS_KEY_ID=
BACKUP_R2_SECRET_ACCESS_KEY=
# Dead-man's-switch (recommended): pinged after a successful backup+verify,
# <url>/fail on failure — a heartbeat monitor (e.g. healthchecks.io) alerts
# when the nightly ping goes missing.
BACKUP_HEARTBEAT_URL=
# Optional overrides (defaults shown):
#BACKUP_DIR=./backups
#RETENTION=14
#REMOTE_RETENTION=30
EOF
  chown "$RUN_AS" .backup.env
  chmod 600 .backup.env
  echo "Seeded $APP_DIR/.backup.env — fill in the BACKUP_R2_* values."
fi

# The cron redirection target must exist before the first run.
mkdir -p "$APP_DIR/backups"
chown "$RUN_AS" "$APP_DIR/backups"

cat > /etc/cron.d/service-hub-backup <<EOF
# Nightly service-hub DB backup (#389) — written by scripts/install-backup-cron.sh.
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
$CRON_SCHEDULE $RUN_AS cd $APP_DIR && ./scripts/backup-cron.sh >> $APP_DIR/backups/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/service-hub-backup

echo "Installed /etc/cron.d/service-hub-backup: '$CRON_SCHEDULE' as $RUN_AS in $APP_DIR."
echo "Smoke-test the full chain now with: sudo -u $RUN_AS ./scripts/backup-cron.sh"
