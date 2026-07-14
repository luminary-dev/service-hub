-- #649: enforce the 1–5 rating range at the DB level. The API edge already
-- validates this, but the column had no floor/ceiling, so a bad S2S/backfill
-- write could store an out-of-range rating that skews the provider average.
-- The overall `rating` is required (1–5); each sub-dimension is nullable and,
-- when set, must also be 1–5. CHECKs aren't modelled by Prisma — see the
-- matching comments in schema.prisma. Guarded/idempotent so a re-run is a
-- no-op; on a fresh DB these apply to empty tables and always succeed.

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_rating_check";
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check"
    CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_quality_check";
ALTER TABLE "Review" ADD CONSTRAINT "Review_quality_check"
    CHECK ("quality" IS NULL OR "quality" BETWEEN 1 AND 5);

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_punctuality_check";
ALTER TABLE "Review" ADD CONSTRAINT "Review_punctuality_check"
    CHECK ("punctuality" IS NULL OR "punctuality" BETWEEN 1 AND 5);

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_value_check";
ALTER TABLE "Review" ADD CONSTRAINT "Review_value_check"
    CHECK ("value" IS NULL OR "value" BETWEEN 1 AND 5);

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_communication_check";
ALTER TABLE "Review" ADD CONSTRAINT "Review_communication_check"
    CHECK ("communication" IS NULL OR "communication" BETWEEN 1 AND 5);
