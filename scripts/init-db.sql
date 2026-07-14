-- One database per service (db-per-service isolation on a single local cluster).
-- DEV ONLY: everything runs as the postgres superuser here (local data is
-- disposable). Prod bootstraps per-service least-privilege roles instead —
-- see deploy/postgres-init.sh (#387).
CREATE DATABASE identity_db;
CREATE DATABASE provider_db;
CREATE DATABASE review_db;
CREATE DATABASE job_db;
CREATE DATABASE search_db;

-- PostGIS for the search index (search & discovery RFC). Not a trusted
-- extension, so it is created here at superuser bootstrap; search-service's
-- own migration repeats CREATE EXTENSION IF NOT EXISTS as a no-op. Requires
-- the postgis/postgis compose image (plain postgres:16-alpine lacks the
-- extension packages).
\connect search_db
CREATE EXTENSION IF NOT EXISTS postgis;
