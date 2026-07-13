-- One database per service (db-per-service isolation on a single local cluster).
-- DEV ONLY: everything runs as the postgres superuser here (local data is
-- disposable). Prod bootstraps per-service least-privilege roles instead —
-- see deploy/postgres-init.sh (#387).
CREATE DATABASE identity_db;
CREATE DATABASE provider_db;
CREATE DATABASE review_db;
CREATE DATABASE job_db;
