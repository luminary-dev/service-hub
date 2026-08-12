#!/usr/bin/env bash
# Run ONLY the observability stack: metrics (Prometheus + exporters), logs
# (Loki + Alloy), and traces (Tempo + OTel collector), fronted by Grafana.
#
# These run standalone — Prometheus just reports the app targets as down until
# you also start it (./scripts/run/app.sh or everything.sh). Feature flags
# (Unleash) and error tracking (GlitchTip) live behind their own profiles; use
# ./scripts/run/everything.sh for those.
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_docker

echo "==> Starting observability stack"
dc up -d "${OBSERVABILITY_SERVICES[@]}"

echo
echo "Grafana:     http://localhost:3001   (admin / \${GRAFANA_ADMIN_PASSWORD:-admin})"
echo "Prometheus:  http://localhost:9090"
echo "Loki:        http://localhost:3100"
echo "Tempo:       http://localhost:3200"
