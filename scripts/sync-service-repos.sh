#!/usr/bin/env bash
# Push each services/<name> directory to its standalone repository in the
# luminary-dev org via git subtree. The monorepo is canonical; the service
# repos are read-only mirrors (deployable/buildable on their own).
#
# Usage: ./scripts/sync-service-repos.sh [branch]   (default: main)
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${1:-main}"
ORG="luminary-dev"
SERVICES=(identity-service provider-service review-service job-service notification-service api-gateway)

for s in "${SERVICES[@]}"; do
  echo "==> Syncing services/$s -> $ORG/$s ($BRANCH)"
  git subtree split --prefix="services/$s" -b "split/$s" >/dev/null
  git push "https://github.com/$ORG/$s.git" "split/$s:$BRANCH"
  git branch -D "split/$s" >/dev/null
done

echo "All service repos synced."
