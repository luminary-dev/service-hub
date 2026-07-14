#!/usr/bin/env bash
# Local dev reset — for localhost ONLY. Tears the stack down INCLUDING its
# volumes (wipes Postgres + upload volumes), rebuilds, and reseeds demo data.
# We don't preserve local data between runs: migrations rebuild the schema on
# a fresh DB every time and this reseeds the dummy accounts.
#
# Never run this against anything you want to keep.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Tearing down (removing volumes)…"
docker compose down -v --remove-orphans

echo "==> Building + starting a fresh stack…"
docker compose up -d --build --wait

echo "==> Seeding demo data (SEED_DEMO_DATA=true; prod images refuse otherwise)…"
for s in identity-service provider-service review-service job-service notification-service trust-safety-service; do
  docker compose exec -T -e SEED_DEMO_DATA=true "$s" npm run db:seed || echo "warn: seed $s failed"
done

# The search index is derived, not seeded — rebuild it from the freshly
# seeded providers so /api/search/* answers immediately (4008 is loopback-bound).
echo "==> Reindexing search (derived from the seeded providers)…"
curl -sS -X POST -H "x-internal-secret: ${INTERNAL_API_SECRET:-dev-internal-secret}" \
  http://localhost:4008/internal/search/reindex >/dev/null || echo "warn: search reindex failed"

echo
echo "Fresh stack is up and seeded."
echo "  Web:   http://localhost:3000"
echo "  Admin: admin@baas.lk / password123  (+ demo providers/customers, same password)"
echo "  Promote a user to SUPPORT for the limited admin tier via a DB update if needed."
