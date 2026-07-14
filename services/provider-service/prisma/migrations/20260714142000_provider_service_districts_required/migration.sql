-- #653: `serviceDistricts` always includes the primary `district`, so an empty
-- array is never valid. The `@default([])` on the column contradicted that
-- invariant — it let a caller that forgot the field persist an empty served set
-- that would then be invisible to every district filter and the job fan-out.
-- Drop the default (both create paths already compute the set via
-- normalizeServiceDistricts, which pins the primary district and 400s on an
-- over-cap union, so it can never be empty) and add a cardinality CHECK as the
-- DB-level backstop. CHECKs aren't modelled by Prisma — see the comment in
-- schema.prisma. Guarded/idempotent; existing rows were backfilled to
-- [district] by 20260714090000, so the CHECK holds for them, and on a fresh DB
-- it applies to an empty table.

ALTER TABLE "Provider" ALTER COLUMN "serviceDistricts" DROP DEFAULT;

ALTER TABLE "Provider" DROP CONSTRAINT IF EXISTS "Provider_serviceDistricts_nonempty_check";
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_serviceDistricts_nonempty_check"
    CHECK (cardinality("serviceDistricts") > 0);
