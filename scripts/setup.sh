#!/usr/bin/env bash
# One-time local setup: install every package, create .env files from the
# examples, start Postgres, push schemas and seed demo data.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICES=(identity-service provider-service review-service job-service notification-service api-gateway)
DB_SERVICES=(identity-service provider-service review-service job-service)

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
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

for s in "${DB_SERVICES[@]}"; do
  echo "==> Pushing schema + seeding services/$s"
  (cd "services/$s" && npm run db:push && npm run db:seed)
done

echo
echo "Setup complete. Start everything with: ./scripts/dev-all.sh"
echo "Demo accounts use password: password123 (admin@baas.lk is the admin)."
