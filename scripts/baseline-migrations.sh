#!/usr/bin/env bash
# One-time helper for dev databases that predate Prisma migrations (they were
# created with `prisma db push`): marks the 0_init baseline as already applied
# so `prisma migrate deploy` stops failing with P3005. Fresh databases don't
# need this — `npm run setup` / the containers apply the baseline normally.
#
# Usage: ./scripts/baseline-migrations.sh   (Postgres from docker compose, host port 5433)
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5433}"
SERVICES=(identity-service provider-service review-service job-service)

for s in "${SERVICES[@]}"; do
  db="${s%-service}_db"
  echo "==> Baselining $s ($db)"
  (cd "services/$s" && DATABASE_URL="postgresql://postgres:postgres@$HOST:$PORT/$db" \
    npx prisma migrate resolve --applied 0_init) || true
done

echo "Done. 'prisma migrate deploy' is now a no-op until the next real migration."
