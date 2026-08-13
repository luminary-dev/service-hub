#!/usr/bin/env bash
# Run EVERYTHING: the full app + the complete observability suite + every
# optional profile — tracing (Tempo/OTel), flags (Unleash) and errors
# (GlitchTip). This is the whole docker-compose.yml.
#
# On first run (empty DB) this also seeds demo data.
# Pass --no-seed (or SEED=0) for a schema-only stack with no demo data.
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
parse_seed_flag "$@"
require_docker

echo "==> Building + starting the entire stack (all profiles)"
dc "${ALL_PROFILES[@]}" up -d --build

maybe_seed

echo
echo "App:         http://localhost:3000        Gateway:     http://localhost:4000"
echo "Grafana:     http://localhost:3001        Prometheus:  http://localhost:9090"
echo "Loki:        http://localhost:3100        Tempo:       http://localhost:3200"
echo "Unleash:     http://localhost:4242        GlitchTip:   http://localhost:8000"
echo "Mailpit:     http://localhost:8025"
echo "Stop:        ./scripts/run/stop.sh"
