#!/usr/bin/env bash
# Run the whole APP: all 10 backend services + the web frontend + their infra
# (Postgres, pgbouncer, redis, mailpit). No observability stack — use
# ./scripts/run/everything.sh for that.
#
# On first run (empty DB) this also seeds demo data so the app is usable.
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_docker

echo "==> Building + starting infra, backend services and web"
dc up -d --build "${INFRA_SERVICES[@]}" "${BACKEND_SERVICES[@]}" web

echo "==> Seeding demo data if the DB is empty"
"$(dirname "${BASH_SOURCE[0]}")/seed.sh" || {
  echo "WARN: seeding failed — services may still be starting. Retry with:" >&2
  echo "      ./scripts/run/seed.sh" >&2
}

echo
echo "App:      http://localhost:3000"
echo "Gateway:  http://localhost:4000"
echo "Stop:     ./scripts/run/stop.sh"
