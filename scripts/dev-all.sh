#!/usr/bin/env bash
# Run the full stack in dev mode: Postgres (docker) + all eight services + web.
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

# chat-service needs the Claude key. Pick it up from the shell or the gitignored
# root .env so the secret isn't duplicated into a service .env. Empty is fine —
# the assistant just returns 503 (disabled) in dev.
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f .env ]; then
  ANTHROPIC_API_KEY="$(grep -E '^ANTHROPIC_API_KEY=' .env | tail -1 | cut -d= -f2-)"
fi
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

SERVICES=(identity-service provider-service review-service job-service notification-service media-service chat-service api-gateway)

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
