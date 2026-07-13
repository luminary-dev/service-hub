#!/bin/sh
# Least-privilege database bootstrap for the PRODUCTION stack (#387).
#
# Mounted into /docker-entrypoint-initdb.d/, so it runs ONCE, when the postgres
# container initialises an EMPTY data directory. It creates one LOGIN role per
# service database and makes it the database's owner:
#
#   - the owner can run `prisma migrate deploy` (DDL in the `public` schema —
#     owned by pg_database_owner on Postgres 15+) and everything the service
#     needs, but has no privileges on any OTHER database;
#   - CONNECT is revoked from PUBLIC, so no service role can even open a
#     connection to a peer's database. The superuser (backups, migrations
#     tooling) bypasses this, as superusers do.
#
# The dev stack keeps scripts/init-db.sql (plain CREATE DATABASE, superuser
# URLs) — local data is disposable and dev has no per-service secrets.
#
# An EXISTING prod data directory never re-runs initdb: migrate it once with
# deploy/migrate-db-roles.sh (same roles, same grants, idempotent) instead.
#
# The *_DB_PASSWORD env vars are passed by docker-compose.prod.yml. They end up
# inside DATABASE_URLs, so generate them URL-safe: `openssl rand -hex 32`.
set -eu

create_service_db() {
	role="$1"
	db="$2"
	password="$3"
	if [ -z "$password" ]; then
		echo "ERROR: no password provided for role '$role' — refusing to create it." >&2
		exit 1
	fi
	# :'var' / :"var" are psql-quoted literals/identifiers — safe against
	# quoting issues in generated passwords.
	psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
		-v role="$role" -v db="$db" -v password="$password" <<-'SQL'
		CREATE ROLE :"role" LOGIN PASSWORD :'password';
		CREATE DATABASE :"db" OWNER :"role";
		REVOKE CONNECT ON DATABASE :"db" FROM PUBLIC;
		GRANT CONNECT ON DATABASE :"db" TO :"role";
	SQL
}

create_service_db identity identity_db "${IDENTITY_DB_PASSWORD:-}"
create_service_db provider provider_db "${PROVIDER_DB_PASSWORD:-}"
create_service_db review review_db "${REVIEW_DB_PASSWORD:-}"
create_service_db job job_db "${JOB_DB_PASSWORD:-}"
create_service_db notification notification_db "${NOTIFICATION_DB_PASSWORD:-}"

echo "Per-service databases and roles created (identity, provider, review, job, notification)."
