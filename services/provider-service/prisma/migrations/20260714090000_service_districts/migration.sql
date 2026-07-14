-- Multi-district service area (#502). Providers can serve several adjacent
-- districts; `serviceDistricts` is the full served set (always including the
-- primary `district`, which stays the home base). Backfill existing rows to
-- [district] so every provider keeps exactly their current visibility.
-- Idempotent (ADD COLUMN IF NOT EXISTS, cardinality-guarded UPDATE,
-- CREATE INDEX IF NOT EXISTS) — safe to re-run.
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "serviceDistricts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Provider" SET "serviceDistricts" = ARRAY["district"] WHERE cardinality("serviceDistricts") = 0;

-- Browse filtering and job matching are membership tests (`district = ANY`),
-- so back the array with a GIN index. Name matches Prisma's @@index convention
-- so `migrate dev` sees no drift.
CREATE INDEX IF NOT EXISTS "Provider_serviceDistricts_idx" ON "Provider" USING GIN ("serviceDistricts" array_ops);
