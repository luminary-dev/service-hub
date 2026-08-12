#!/usr/bin/env bash
# Seed demo data into a running stack, then rebuild the search index.
#
# Container images run NODE_ENV=production, so the demo seed must be opted into
# explicitly (SEED_DEMO_DATA=true) — migrations auto-apply via each service's
# start:migrate, but seeding does not. This is idempotent: it skips when the
# data already looks present. Pass --force to reseed anyway.
#
# Usage: ./scripts/run/seed.sh [--force]
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_docker

force=false
[ "${1:-}" = "--force" ] && force=true

if ! service_running identity-service; then
  echo "ERROR: services aren't running. Start them first (app.sh / everything.sh)." >&2
  exit 1
fi

# Skip if provider_db already has providers (unless --force).
if ! $force; then
  count=$(docker exec "$(dc ps -q postgres)" \
    psql -U postgres -d provider_db -tAc 'select count(*) from "Provider";' 2>/dev/null | tr -d '[:space:]' || true)
  if [ -n "${count:-}" ] && [ "$count" != "0" ]; then
    echo "==> Already seeded ($count providers). Use --force to reseed."
    exit 0
  fi
fi

for s in "${DB_SEED_SERVICES[@]}"; do
  echo "==> Seeding $s"
  dc exec -e SEED_DEMO_DATA=true -T "$s" npm run db:seed
done

echo "==> Rebuilding the search index (search-service reindex)"
curl -fsS -X POST -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  --max-time 60 http://localhost:4008/internal/search/reindex && echo

echo
echo "Seed complete. Demo accounts use password: password123"
echo "  admin@baas.lk (ADMIN) · support@baas.lk (SUPPORT) · plus demo providers/customers"
