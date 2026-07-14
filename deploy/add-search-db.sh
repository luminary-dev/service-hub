#!/usr/bin/env bash
# One-time bootstrap of search_db on an EXISTING prod Postgres volume (search &
# discovery RFC). A data directory that predates search-service never re-runs
# deploy/postgres-init.sh (initdb scripts run once, on an empty volume), so
# this script converges a live cluster to the same state a fresh one gets:
#
#   - a `search` LOGIN role owning its own `search_db`, CONNECT revoked from
#     PUBLIC (the #387 least-privilege model, same as the other services);
#   - the PostGIS extension created inside search_db AS SUPERUSER — PostGIS is
#     not a trusted extension, so the owning role cannot create it itself;
#     search-service's first migration repeats CREATE EXTENSION IF NOT EXISTS
#     as a no-op once this has run.
#
# PREREQUISITE: the postgres container must already be running the
# postgis/postgis:16-3.5-alpine image (the compose change in this repo) —
# plain postgres:16-alpine lacks the extension packages and the CREATE
# EXTENSION below fails. Same PG16 data-dir format, so the image swap itself
# is just a container recreate against the same pgdata volume.
#
# IDEMPOTENT and non-disruptive: safe to re-run (re-running re-applies
# ownership/grants and resets the password — which is also how you ROTATE it,
# see docs/SECRET_ROTATION.md). Run it against the RUNNING old stack BEFORE
# deploying the compose change that starts search-service, so the service's
# first boot finds its database, role and extension in place (rollout order:
# docs/DEPLOYMENT.md).
#
#   SEARCH_DB_PASSWORD=… ./deploy/add-search-db.sh
#
# The password is read from this shell's environment first (use the exact
# value set as the GitHub secret; it lands in a DATABASE_URL, so generate it
# URL-safe: `openssl rand -hex 32`). If unset, it is read from the postgres
# container's environment (present once the compose change is deployed).
set -euo pipefail
cd "$(dirname "$0")/.."

# Target the prod compose project by default (see backup-dbs.sh / #384);
# override COMPOSE_FILE=docker-compose.yml to exercise it against a dev stack.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

ROLE=search
DB=search_db
PASSWORD="${SEARCH_DB_PASSWORD:-}"
if [ -z "$PASSWORD" ]; then
  PASSWORD=$("${COMPOSE[@]}" exec -T postgres printenv SEARCH_DB_PASSWORD 2>/dev/null || true)
fi
if [ -z "$PASSWORD" ]; then
  echo "ERROR: no password for role '$ROLE' — export SEARCH_DB_PASSWORD (or deploy the compose file that passes it to postgres) and re-run." >&2
  exit 1
fi

echo "==> $DB: ensuring role '$ROLE', database, ownership and connect grants"
# The password travels via the container environment and psql's \getenv —
# never on a command line (host or container ps). :"var" / :'var' are
# psql-quoted identifiers/literals, safe for any generated value. CREATE
# DATABASE cannot run inside a DO block/transaction, so it uses \gexec too.
"${COMPOSE[@]}" exec -T -e ROLE_PASSWORD="$PASSWORD" postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres -v role="$ROLE" -v db="$DB" <<'SQL'
\getenv password ROLE_PASSWORD
SELECT format('CREATE ROLE %I LOGIN', :'role')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
ALTER ROLE :"role" LOGIN PASSWORD :'password';
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
ALTER DATABASE :"db" OWNER TO :"role";
REVOKE CONNECT ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"role";
SQL

echo "==> $DB: ensuring the PostGIS extension (superuser — not a trusted extension)"
"${COMPOSE[@]}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"

echo "Done. search_db exists, owned by the least-privilege 'search' role, with PostGIS ready."
echo "Deploy the compose change that starts search-service whenever ready."
