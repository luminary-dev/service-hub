#!/usr/bin/env bash
# One-time (re-runnable) backfill of the unified trust-safety store
# (docs/rfcs/trust-safety-service.md §4.2): copies every Report and
# AdminAuditLog row from the three source databases (provider_db, review_db,
# job_db) into trust_safety_db, preserving ids verbatim and stamping the
# derived ownerService / service origin column.
#
# IDEMPOTENT and safe to re-run — that IS the delta pass (RFC §8 phase 4):
#   - Report upserts ON CONFLICT (id), guarded by updatedAt, so a re-run picks
#     up rows resolved in the old services during the cutover window without
#     clobbering newer trust-safety state;
#   - AdminAuditLog is append-only: ON CONFLICT (id) DO NOTHING.
#
# Follows the deploy/migrate-db-roles.sh conventions (#612/#387): runs through
# the compose postgres container as the SUPERUSER (the one role that may read
# all four databases — the per-service roles can't, by design), so the host
# needs no Postgres tooling. trust_safety_db's schema must already exist
# (trust-safety-service applies its migrations on boot via start:migrate).
#
#   ./scripts/migrate-trust-safety-backfill.sh           # backfill + parity report
#   ./scripts/migrate-trust-safety-backfill.sh --check   # parity check only (no writes)
#
# Local/dev test drive: COMPOSE_FILE=docker-compose.yml (and optionally
# COMPOSE_PROJECT_NAME=...) against a dev stack — or point PSQL_DIRECT at any
# Postgres to bypass compose entirely (host psql required), e.g.
#   PSQL_DIRECT=postgresql://postgres:postgres@localhost:5433 \
#     ./scripts/migrate-trust-safety-backfill.sh --check
#
# The script fails loudly if the pre-insert distinct-id check ever detects the
# same Report/AdminAuditLog id in two source databases (cuid() collisions —
# expected: never), and the --check mode exits non-zero if any source row is
# missing from (or newer than) the destination — the parity gate that blocks
# the cleanup phase (RFC §8 phase 5).
set -euo pipefail
cd "$(dirname "$0")/.."

# Target the prod compose project by default (see backup-dbs.sh / #384);
# override COMPOSE_FILE=docker-compose.yml to run against a dev stack.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")
DEST_DB=trust_safety_db

CHECK_ONLY=false
if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY=true
fi

# owner tag ("provider" | "review" | "job") → source database.
OWNERS=(provider review job)
src_db() { echo "$1_db"; }

psql_in() { # psql_in <db> [args...]
  local db="$1"
  shift
  if [ -n "${PSQL_DIRECT:-}" ]; then
    psql -v ON_ERROR_STOP=1 "$PSQL_DIRECT/$db" "$@"
  else
    "${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"
  fi
}

REPORT_COLS='"id","targetType","targetId","reporterId","reason","details","status","source","createdAt","updatedAt","resolvedBy","resolvedAt"'
AUDIT_COLS='"id","adminId","action","targetType","targetId","reason","createdAt"'

# ---------------------------------------------------------------------------
# 0) Cross-source id-collision pre-check (RFC §4.2). All three services
#    generate cuid() PKs, globally unique in practice; ids are preserved
#    verbatim, so the same id in two sources would silently merge two
#    different reports. Expected result: no output.
# ---------------------------------------------------------------------------
echo "==> Checking for cross-source id collisions"
for table in Report AdminAuditLog; do
  dupes=$(
    for owner in "${OWNERS[@]}"; do
      psql_in "$(src_db "$owner")" -Atc "SELECT id FROM \"$table\""
    done | sort | uniq -d
  )
  if [ -n "$dupes" ]; then
    echo "ERROR: duplicate $table id(s) across source databases — refusing to backfill:" >&2
    echo "$dupes" >&2
    exit 1
  fi
done
echo "    no collisions."

# ---------------------------------------------------------------------------
# 1) Copy + upsert, per source database. The COPY runs in the source, streams
#    through the host pipe into a TEMP staging table in the destination
#    session (multiple -c flags share one session, so the temp table
#    survives), then upserts with the RFC's updatedAt guard.
# ---------------------------------------------------------------------------
backfill_owner() {
  local owner="$1" db
  db="$(src_db "$owner")"

  echo "==> $db → $DEST_DB: Report (upsert by id, updatedAt-guarded)"
  psql_in "$db" -c "COPY (SELECT $REPORT_COLS FROM \"Report\") TO STDOUT (FORMAT csv)" |
    psql_in "$DEST_DB" \
      -c "CREATE TEMP TABLE staging_report (
            \"id\" TEXT PRIMARY KEY, \"targetType\" TEXT NOT NULL, \"targetId\" TEXT NOT NULL,
            \"reporterId\" TEXT, \"reason\" TEXT NOT NULL, \"details\" TEXT,
            \"status\" TEXT NOT NULL, \"source\" TEXT NOT NULL,
            \"createdAt\" TIMESTAMP(3) NOT NULL, \"updatedAt\" TIMESTAMP(3) NOT NULL,
            \"resolvedBy\" TEXT, \"resolvedAt\" TIMESTAMP(3))" \
      -c "\\copy staging_report ($REPORT_COLS) FROM STDIN (FORMAT csv)" \
      -c "INSERT INTO \"Report\"
            ($REPORT_COLS, \"ownerService\")
          SELECT $REPORT_COLS, '$owner' FROM staging_report
          ON CONFLICT (\"id\") DO UPDATE SET
            \"status\"     = excluded.\"status\",
            \"reason\"     = excluded.\"reason\",
            \"details\"    = excluded.\"details\",
            \"resolvedBy\" = excluded.\"resolvedBy\",
            \"resolvedAt\" = excluded.\"resolvedAt\",
            \"updatedAt\"  = excluded.\"updatedAt\"
          WHERE excluded.\"updatedAt\" > \"Report\".\"updatedAt\""

  echo "==> $db → $DEST_DB: AdminAuditLog (append-only, ON CONFLICT DO NOTHING)"
  psql_in "$db" -c "COPY (SELECT $AUDIT_COLS FROM \"AdminAuditLog\") TO STDOUT (FORMAT csv)" |
    psql_in "$DEST_DB" \
      -c "CREATE TEMP TABLE staging_audit (
            \"id\" TEXT PRIMARY KEY, \"adminId\" TEXT NOT NULL, \"action\" TEXT NOT NULL,
            \"targetType\" TEXT NOT NULL, \"targetId\" TEXT NOT NULL,
            \"reason\" TEXT, \"createdAt\" TIMESTAMP(3) NOT NULL)" \
      -c "\\copy staging_audit ($AUDIT_COLS) FROM STDIN (FORMAT csv)" \
      -c "INSERT INTO \"AdminAuditLog\"
            ($AUDIT_COLS, \"service\")
          SELECT $AUDIT_COLS, '$owner' FROM staging_audit
          ON CONFLICT (\"id\") DO NOTHING"
}

if [ "$CHECK_ONLY" = false ]; then
  for owner in "${OWNERS[@]}"; do
    backfill_owner "$owner"
  done
fi

# ---------------------------------------------------------------------------
# 2) Parity verification (always runs; the whole job in --check mode).
#    Precise per-row checks — source ids streamed into a dest temp table and
#    anti-joined — rather than bare counts, because after the cutover the
#    destination legitimately holds MORE rows (new reports) than the sources.
#      missing = source rows absent from the destination        → FAIL
#      stale   = dest Report rows older than their source twin   → FAIL
#    Plus an informational per-targetType count table per source.
# ---------------------------------------------------------------------------
echo
echo "==> Parity check (source → $DEST_DB)"
FAILED=0
for owner in "${OWNERS[@]}"; do
  db="$(src_db "$owner")"

  report_diff=$(
    psql_in "$db" -c "COPY (SELECT \"id\",\"updatedAt\" FROM \"Report\") TO STDOUT (FORMAT csv)" |
      psql_in "$DEST_DB" -At \
        -c "CREATE TEMP TABLE parity_report (\"id\" TEXT PRIMARY KEY, \"updatedAt\" TIMESTAMP(3) NOT NULL)" \
        -c "\\copy parity_report FROM STDIN (FORMAT csv)" \
        -c "SELECT
              count(*) FILTER (WHERE r.\"id\" IS NULL),
              count(*) FILTER (WHERE r.\"updatedAt\" < p.\"updatedAt\")
            FROM parity_report p LEFT JOIN \"Report\" r ON r.\"id\" = p.\"id\"" |
      tail -1
  )
  report_missing="${report_diff%%|*}"
  report_stale="${report_diff##*|}"

  audit_missing=$(
    psql_in "$db" -c "COPY (SELECT \"id\" FROM \"AdminAuditLog\") TO STDOUT (FORMAT csv)" |
      psql_in "$DEST_DB" -At \
        -c "CREATE TEMP TABLE parity_audit (\"id\" TEXT PRIMARY KEY)" \
        -c "\\copy parity_audit FROM STDIN (FORMAT csv)" \
        -c "SELECT count(*) FROM parity_audit p
            LEFT JOIN \"AdminAuditLog\" a ON a.\"id\" = p.\"id\"
            WHERE a.\"id\" IS NULL" |
      tail -1
  )

  src_reports=$(psql_in "$db" -Atc 'SELECT count(*) FROM "Report"')
  dest_reports=$(psql_in "$DEST_DB" -Atc "SELECT count(*) FROM \"Report\" WHERE \"ownerService\" = '$owner'")
  src_audit=$(psql_in "$db" -Atc 'SELECT count(*) FROM "AdminAuditLog"')
  dest_audit=$(psql_in "$DEST_DB" -Atc "SELECT count(*) FROM \"AdminAuditLog\" WHERE \"service\" = '$owner'")
  src_max=$(psql_in "$db" -Atc "SELECT coalesce(max(\"updatedAt\")::text, '-') FROM \"Report\"")
  dest_max=$(psql_in "$DEST_DB" -Atc "SELECT coalesce(max(\"updatedAt\")::text, '-') FROM \"Report\" WHERE \"ownerService\" = '$owner'")

  echo "    $db:"
  echo "      Report        src=$src_reports dest=$dest_reports missing=$report_missing stale=$report_stale"
  echo "      max(updatedAt) src=$src_max dest=$dest_max"
  echo "      AdminAuditLog src=$src_audit dest=$dest_audit missing=$audit_missing"
  psql_in "$db" -Atc 'SELECT "targetType" || '"'"'='"'"' || count(*) FROM "Report" GROUP BY "targetType" ORDER BY "targetType"' |
    sed 's/^/      by targetType (src): /'

  if [ "$report_missing" != "0" ] || [ "$report_stale" != "0" ] || [ "$audit_missing" != "0" ]; then
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "ERROR: parity check failed — see missing/stale counts above." >&2
  exit 1
fi
echo "Parity OK."
