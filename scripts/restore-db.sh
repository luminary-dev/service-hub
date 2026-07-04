#!/usr/bin/env bash
# Restore ONE service database from a logical dump made by backup-dbs.sh.
# Destructive: --clean drops and recreates the objects in the target database.
#
#   ./scripts/restore-db.sh identity_db backups/<stamp>/identity_db.dump --yes
#
# Full runbook (ordering, verification, service restarts): docs/BACKUPS.md.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${1:-}"
DUMP="${2:-}"
CONFIRM="${3:-}"

if [ -z "$DB" ] || [ -z "$DUMP" ]; then
  echo "Usage: $0 <identity_db|provider_db|review_db|job_db> <dump file> --yes" >&2
  exit 1
fi
if [ ! -f "$DUMP" ]; then
  echo "ERROR: dump file not found: $DUMP" >&2
  exit 1
fi
if [ "$CONFIRM" != "--yes" ]; then
  echo "Refusing to run without --yes: this REPLACES the contents of $DB." >&2
  exit 1
fi

echo "==> Restoring $DB from $DUMP"
docker compose exec -T postgres pg_restore -U postgres --clean --if-exists \
  --dbname "$DB" < "$DUMP"
echo "Restore complete. Restart the owning service so Prisma reconnects cleanly:"
echo "  docker compose restart ${DB%_db}-service"
