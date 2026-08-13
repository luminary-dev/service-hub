#!/usr/bin/env bash
# Run ONE backend service (plus the Postgres/pgbouncer/redis it needs).
#
# Usage:
#   ./scripts/run/backend.sh provider          # short name
#   ./scripts/run/backend.sh provider-service  # full name
#   ./scripts/run/backend.sh api-gateway
#   ./scripts/run/backend.sh                    # lists the valid names
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

usage() {
  echo "Usage: $0 <service>"
  echo "Services:"
  for s in "${BACKEND_SERVICES[@]}"; do echo "  - ${s%-service}"; done
  exit "${1:-1}"
}

[ $# -ge 1 ] || usage 1
arg="$1"

# Normalize: "provider" -> "provider-service"; "api-gateway" stays as-is.
if [ "$arg" = "api-gateway" ] || [ "$arg" = "gateway" ]; then
  svc="api-gateway"
else
  svc="${arg%-service}-service"
fi

# Validate against the known set.
found=false
for s in "${BACKEND_SERVICES[@]}"; do [ "$s" = "$svc" ] && found=true; done
$found || { echo "ERROR: unknown service '$arg'" >&2; usage 1; }

require_docker

echo "==> Ensuring infra (postgres, pgbouncer, redis) is up"
dc up -d "${INFRA_SERVICES[@]}"

echo "==> Building + starting $svc"
dc up -d --build "$svc"

port=$(dc port "$svc" 4000 2>/dev/null | sed -E 's/.*://') || true
echo
echo "$svc is up${port:+ (http://localhost:$port)}."
echo "Reminder: only the gateway (:4000) is meant to be hit directly; other"
echo "services trust the gateway's internal headers. Run more with this script,"
echo "or the whole app with ./scripts/run/app.sh."
