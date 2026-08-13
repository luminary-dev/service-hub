#!/usr/bin/env bash
# Shared helpers for the scripts/run/* launchers. Source this, don't run it.
#
# Everything here drives the Docker Compose stack (docker-compose.yml at the
# repo root). We deliberately use Docker rather than the host `dev-all.sh`
# path: containers are owned by the Docker daemon, so they survive the shell
# that started them (and, in agent/CI contexts, background-task reaping).
set -euo pipefail

# Repo root, regardless of where the script was invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# --- Secrets (dev-only defaults; real values come from the environment) -------
# The web image reads AUTH_SECRET at request time and its `next build` guard
# needs *a* value; identity signs sessions with the same secret. Keep them
# aligned so the gateway can verify what identity issues.
export AUTH_SECRET="${AUTH_SECRET:-dev-only-secret}"
export INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-dev-internal-secret}"

# --- Apple Silicon / arm64 Postgres fix ---------------------------------------
# The pinned Postgres image (postgis/postgis:16-3.5-alpine) ships no arm64
# manifest, so `docker compose up postgres` fails on Apple Silicon with
# "no matching manifest for linux/arm64/v8". scripts/run/compose.arm64.yml
# pins just that one service to linux/amd64 (Rosetta emulation); we layer it
# in only when the host is arm64, leaving every other image native.
COMPOSE_FILES=(-f docker-compose.yml)
if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ]; then
  COMPOSE_FILES+=(-f scripts/run/compose.arm64.yml)
fi

# --- Service groups (keep in sync with docker-compose.yml) ---------------------
INFRA_SERVICES=(postgres pgbouncer redis mailpit)
BACKEND_SERVICES=(identity-service provider-service review-service job-service \
  notification-service media-service chat-service search-service \
  trust-safety-service api-gateway)
# The 6 stateful services that carry seed data (search rebuilds from a reindex).
DB_SEED_SERVICES=(identity-service provider-service review-service job-service \
  notification-service trust-safety-service)
# Metrics + logs + traces monitoring stack (no profile flags needed: naming a
# profiled service on `up` enables its profile). Feature flags (unleash) and
# error tracking (glitchtip) are their own concerns — use `everything.sh`.
OBSERVABILITY_SERVICES=(prometheus grafana loki alloy node-exporter \
  postgres-exporter redis-exporter docker-socket-proxy tempo otel-collector)

# All profiles, for the "everything" launcher.
ALL_PROFILES=(--profile tracing --profile flags --profile errors)

# --- Wrapper: always call compose through this -------------------------------
dc() { docker compose "${COMPOSE_FILES[@]}" "$@"; }

# Fail early with a friendly message if Docker isn't running.
require_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker isn't running. Start Docker Desktop and retry." >&2
    exit 1
  fi
}

# True when Compose already has a running container for the named service.
service_running() {
  [ -n "$(dc ps -q "$1" 2>/dev/null)" ]
}

# --- First-run seeding toggle -------------------------------------------------
# app.sh / everything.sh seed demo data on first run by default. Disable with
# the `--no-seed` flag or `SEED=0` (schema-only stack — migrations still apply).
SEED="${SEED:-1}"

# Scan a launcher's args for the seed flags. Call as: parse_seed_flag "$@"
parse_seed_flag() {
  for a in "$@"; do
    case "$a" in
      --no-seed) SEED=0 ;;
      --seed)    SEED=1 ;;
    esac
  done
}

# Seed the running stack unless seeding is disabled. Never fails the launch —
# a seed error (e.g. services still booting) is a warning, not fatal.
maybe_seed() {
  if [ "$SEED" = "0" ]; then
    echo "==> Skipping seed (--no-seed / SEED=0) — schema only."
    echo "    Seed later with: ./scripts/run/seed.sh"
    return 0
  fi
  echo "==> Seeding demo data if the DB is empty"
  "$(dirname "${BASH_SOURCE[0]}")/seed.sh" || {
    echo "WARN: seeding failed — services may still be starting. Retry with:" >&2
    echo "      ./scripts/run/seed.sh" >&2
  }
}
