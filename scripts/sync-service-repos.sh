#!/usr/bin/env bash
# Push each services/<name> directory to its standalone repository in the
# luminary-dev org via git subtree. The monorepo is canonical; the service
# repos are read-only mirrors (deployable/buildable on their own), named
# service-hub-<name> to keep them distinguishable from other apps in the org.
#
# Run this from the monorepo's `prod` branch after a release, so the mirrors
# reflect production. The [branch] arg is the MIRROR repo's target branch
# (the mirrors keep their own `main`), not a monorepo branch.
#
# Usage: ./scripts/sync-service-repos.sh [mirror-branch]   (default: main)
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${1:-main}"
ORG="luminary-dev"
REPO_PREFIX="service-hub-"
SERVICES=(identity-service provider-service review-service job-service notification-service media-service chat-service search-service trust-safety-service api-gateway)

for s in "${SERVICES[@]}"; do
  echo "==> Syncing services/$s -> $ORG/$REPO_PREFIX$s ($BRANCH)"
  git subtree split --prefix="services/$s" -b "split/$s" >/dev/null
  git push "https://github.com/$ORG/$REPO_PREFIX$s.git" "split/$s:$BRANCH"
  git branch -D "split/$s" >/dev/null
done

# The Flutter app lives at the top-level mobile/ (not services/ — it isn't a
# backend service), mirrored to service-hub-mobile-app under the same
# read-only contract.
echo "==> Syncing mobile -> $ORG/${REPO_PREFIX}mobile-app ($BRANCH)"
git subtree split --prefix="mobile" -b "split/mobile-app" >/dev/null
git push "https://github.com/$ORG/${REPO_PREFIX}mobile-app.git" "split/mobile-app:$BRANCH"
git branch -D "split/mobile-app" >/dev/null

echo "All service repos synced."
