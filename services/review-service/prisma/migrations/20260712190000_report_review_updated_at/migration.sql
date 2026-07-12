-- Last-transition timestamps (#370). Idempotent: matches the @updatedAt fields
-- added to the Report and Review models. Existing rows backfill to
-- CURRENT_TIMESTAMP; Prisma manages the value on every write after.
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
