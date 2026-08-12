#!/usr/bin/env bash
# Run ONLY the web frontend (Next.js) — http://localhost:3000
#
# Starts just the `web` container with --no-deps, so the backend is NOT brought
# up. The UI renders, but anything that calls /api/* will fail until a backend
# is running (use ./scripts/run/app.sh for the full app, or start specific
# services with ./scripts/run/backend.sh <service>).
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_docker

echo "==> Building + starting web (frontend only) on :3000"
dc up -d --build --no-deps web

echo
echo "Frontend:  http://localhost:3000"
echo "Note: API-backed pages need a backend — ./scripts/run/app.sh for the full app."
