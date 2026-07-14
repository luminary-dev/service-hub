#!/usr/bin/env bash
# One-time migration of an EXISTING prod Postgres volume to per-service DB
# roles (#387). A data directory that predates deploy/postgres-init.sh was
# initialised with every database owned by the `postgres` superuser — initdb
# scripts never re-run, so this script converges a live cluster to the same
# state postgres-init.sh gives a fresh one:
#
#   - one LOGIN role per service (identity / provider / review / job /
#     notification);
#   - each role owns its own database and every object in it (tables,
#     sequences, views, enum types — all that Prisma migrations create);
#   - CONNECT revoked from PUBLIC, granted only to the owning role.
#
# IDEMPOTENT and non-disruptive: safe to re-run (re-running only re-applies
# ownership and resets the passwords — which is also how you ROTATE them, see
# docs/SECRET_ROTATION.md), and the superuser keeps full access throughout, so
# the pre-#387 stack (superuser DATABASE_URLs) keeps working after it runs.
# That makes the rollout order safe: run this against the RUNNING old stack
# first, then deploy the compose change that switches the DATABASE_URLs.
#
#   IDENTITY_DB_PASSWORD=… PROVIDER_DB_PASSWORD=… REVIEW_DB_PASSWORD=… \
#   JOB_DB_PASSWORD=… NOTIFICATION_DB_PASSWORD=… ./deploy/migrate-db-roles.sh
#
# notification_db (RFC stateful-notification-service) may not exist yet on a
# cluster that predates the stateful notification-service — it is created here
# (idempotently) before its role/ownership migration, so this script remains
# the single live-prod pre-step for the release that ships the service.
#
# Passwords are read from this shell's environment first (use the exact values
# set as GitHub secrets; they land in DATABASE_URLs, so generate them URL-safe:
# `openssl rand -hex 32`). If unset, they are read from the postgres
# container's environment (present once the #387 compose file is deployed).
set -euo pipefail
cd "$(dirname "$0")/.."

# Target the prod compose project by default (see backup-dbs.sh / #384);
# override COMPOSE_FILE=docker-compose.yml to exercise it against a dev stack.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

migrate() {
  local role="$1" db="$2" password="$3"

  local var
  var="$(echo "$role" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"
  if [ -z "$password" ]; then
    password=$("${COMPOSE[@]}" exec -T postgres printenv "$var" 2>/dev/null || true)
  fi
  if [ -z "$password" ]; then
    echo "ERROR: no password for role '$role' — export $var (or deploy the compose file that passes it to postgres) and re-run." >&2
    exit 1
  fi

  echo "==> $db: ensuring role '$role', ownership, and connect grants"
  # The password travels via the container environment and psql's \getenv —
  # never on a command line (host or container ps). :"var" / :'var' are
  # psql-quoted identifiers/literals, safe for any generated value.
  "${COMPOSE[@]}" exec -T -e ROLE_PASSWORD="$password" postgres \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres -v role="$role" -v db="$db" <<'SQL'
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

  # Hand the role every object the superuser created inside its database.
  # (`REASSIGN OWNED BY postgres` is rejected for the bootstrap superuser, so
  # enumerate per object class; the public schema itself is owned by
  # pg_database_owner on Postgres 15+, which now resolves to the role.)
  "${COMPOSE[@]}" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U postgres -d "$db" -v role="$role" <<'SQL'
SELECT format('ALTER TABLE public.%I OWNER TO %I', tablename, :'role')
  FROM pg_tables WHERE schemaname = 'public' \gexec
SELECT format('ALTER SEQUENCE public.%I OWNER TO %I', sequencename, :'role')
  FROM pg_sequences WHERE schemaname = 'public' \gexec
SELECT format('ALTER VIEW public.%I OWNER TO %I', viewname, :'role')
  FROM pg_views WHERE schemaname = 'public' \gexec
SELECT format('ALTER TYPE public.%I OWNER TO %I', t.typname, :'role')
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype = 'e' \gexec
SQL
}

migrate identity identity_db "${IDENTITY_DB_PASSWORD:-}"
migrate provider provider_db "${PROVIDER_DB_PASSWORD:-}"
migrate review review_db "${REVIEW_DB_PASSWORD:-}"
migrate job job_db "${JOB_DB_PASSWORD:-}"
migrate notification notification_db "${NOTIFICATION_DB_PASSWORD:-}"

echo "Done. Each service database is now owned by its own least-privilege role."
echo "The superuser URLs keep working, so deploy the #387 compose change whenever ready."
