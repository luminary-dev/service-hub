#!/usr/bin/env bash
# One-time local setup: install every package, create .env files from the
# examples, start Postgres, apply migrations and seed demo data.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICES=(identity-service provider-service review-service job-service notification-service media-service chat-service search-service trust-safety-service api-gateway)
DB_SERVICES=(identity-service provider-service review-service job-service notification-service trust-safety-service)

echo "==> Installing web app dependencies"
npm install

for s in "${SERVICES[@]}"; do
  echo "==> Installing services/$s dependencies"
  (cd "services/$s" && npm install)
done

echo "==> Creating .env files from examples (kept if already present)"
[ -f .env ] || cp .env.example .env 2>/dev/null || true
for s in "${SERVICES[@]}"; do
  [ -f "services/$s/.env" ] || cp "services/$s/.env.example" "services/$s/.env"
done

echo "==> Starting Postgres"
docker compose up -d postgres
# Probe over TCP (-h 127.0.0.1), not the local socket: the postgres image's
# multi-DB init runs on a temporary socket-only server, so a socket probe can
# report ready before the real TCP listener is up — and the db:migrate below
# connects over TCP, so it would then fail with P1001 (#686).
until docker compose exec -T postgres pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; do
  sleep 1
done

for s in "${DB_SERVICES[@]}"; do
  echo "==> Pushing schema + seeding services/$s"
  (cd "services/$s" && npm run db:migrate && npm run db:seed)
done

# search-service owns a derived index, not seed data: migrate only. Its
# search_db (+ the PostGIS extension) is created by scripts/init-db.sql on a
# FRESH postgres volume — if this fails on a pre-existing dev volume, run
# ./scripts/dev-reset.sh (local data is disposable). Populate the index from
# the seeded providers afterwards via the reindex sweep (needs the stack up):
#   curl -X POST -H "x-internal-secret: dev-internal-secret" localhost:4008/internal/search/reindex
echo "==> Migrating services/search-service (derived index — no seed)"
(cd "services/search-service" && npm run db:migrate)

echo
echo "Setup complete. Start everything with: ./scripts/dev-all.sh"
echo "Demo accounts use password: password123 (admin@baas.lk is the admin)."
