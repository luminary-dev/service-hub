-- #651: one OPEN report per (target, reporter). The shared fileReport handler
-- already collapses a signed-in user's repeat report via findFirst-then-update,
-- but two concurrent requests could both miss and insert twice. This partial
-- unique index makes the invariant a hard DB guarantee; the handler now catches
-- the resulting P2002 and treats it as idempotent success. Anonymous reports
-- (reporterId IS NULL) and SYSTEM auto-reports (also null reporterId) are
-- intentionally excluded — the gateway rate limiter is the anon backstop
-- (anon-path rate-limit hardening is a separate follow-up). Prisma's DSL can't
-- express a partial/filtered unique index, so it lives here as raw SQL only
-- (see the note on Report in schema.prisma). Idempotent so a re-run is a no-op.

-- Collapse any pre-existing duplicate OPEN reports (same target + reporter) down
-- to the newest one so the unique index can be created even on a DB that raced
-- duplicates in before this constraint existed. These are genuine duplicates the
-- app already merges, so dropping the older copies loses nothing. No-op on a
-- fresh/empty table.
DELETE FROM "Report" r
USING (
    SELECT id, row_number() OVER (
        PARTITION BY "targetType", "targetId", "reporterId"
        ORDER BY "createdAt" DESC, id DESC
    ) AS rn
    FROM "Report"
    WHERE "status" = 'OPEN' AND "reporterId" IS NOT NULL
) dup
WHERE r.id = dup.id AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Report_open_reporter_key"
    ON "Report"("targetType", "targetId", "reporterId")
    WHERE "status" = 'OPEN' AND "reporterId" IS NOT NULL;
