#!/usr/bin/env bash
# Run the full stack in dev mode: Postgres (docker) + all six services + web.
# Ctrl-C stops everything.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d postgres

# The web app must verify sessions with the same secret identity-service signs
# with (services read their .env files, created from the examples by setup.sh).
# Process env beats .env/.env.local in Next, so exporting here keeps the stack
# consistent even if the root .env carries a different (production) secret.
export AUTH_SECRET="${AUTH_SECRET:-dev-only-secret}"
export GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000}"

SERVICES=(identity-service provider-service review-service job-service notification-service api-gateway)

pids=()
cleanup() {
  trap - INT TERM
  echo
  echo "==> Stopping services"
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

for s in "${SERVICES[@]}"; do
  (cd "services/$s" && npm run dev 2>&1 | sed "s/^/[$s] /") &
  pids+=($!)
done

# Web last, in the foreground stream too.
(npm run dev 2>&1 | sed "s/^/[web] /") &
pids+=($!)

wait
