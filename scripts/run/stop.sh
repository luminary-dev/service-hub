#!/usr/bin/env bash
# Stop the stack. Data in the Postgres volume is kept by default.
#
# Usage:
#   ./scripts/run/stop.sh            # stop + remove all containers (keep data)
#   ./scripts/run/stop.sh --wipe     # also delete volumes (fresh DB next time)
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_docker

# Include every profile so nothing is left running.
if [ "${1:-}" = "--wipe" ]; then
  echo "==> Stopping everything and DELETING volumes (data will be lost)"
  dc "${ALL_PROFILES[@]}" down --volumes
else
  echo "==> Stopping everything (data preserved)"
  dc "${ALL_PROFILES[@]}" down
fi
