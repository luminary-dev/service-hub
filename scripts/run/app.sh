#!/usr/bin/env bash
# Run the whole APP: all 10 backend services + the web frontend + their infra
# (Postgres, pgbouncer, redis, mailpit). No observability stack — use
# ./scripts/run/everything.sh for that.
#
# On first run (empty DB) this also seeds demo data so the app is usable.
# Pass --no-seed (or SEED=0) for a schema-only stack with no demo data.
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
parse_seed_flag "$@"
require_docker

echo "==> Building + starting infra, backend services and web"
dc up -d --build "${INFRA_SERVICES[@]}" "${BACKEND_SERVICES[@]}" web

maybe_seed

echo
echo "App:      http://localhost:3000"
echo "Gateway:  http://localhost:4000"
echo "Stop:     ./scripts/run/stop.sh"
