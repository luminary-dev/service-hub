#!/usr/bin/env bash
# Push each services/<name> directory to its standalone repository in the
# luminary-dev org via git subtree. The monorepo is canonical; the service
# repos are read-only mirrors (deployable/buildable on their own), named
# service-hub-<name> to keep them distinguishable from other apps in the org.
#
# Usage: ./scripts/sync-service-repos.sh [branch]   (default: main)
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${1:-main}"
ORG="luminary-dev"
REPO_PREFIX="service-hub-"
SERVICES=(identity-service provider-service review-service job-service notification-service media-service chat-service api-gateway)

for s in "${SERVICES[@]}"; do
  echo "==> Syncing services/$s -> $ORG/$REPO_PREFIX$s ($BRANCH)"
  git subtree split --prefix="services/$s" -b "split/$s" >/dev/null
  git push "https://github.com/$ORG/$REPO_PREFIX$s.git" "split/$s:$BRANCH"
  git branch -D "split/$s" >/dev/null
done

echo "All service repos synced."
