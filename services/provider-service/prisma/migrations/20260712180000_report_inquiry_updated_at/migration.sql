-- Last-transition timestamps (#370). Idempotent: safe to re-run and matches
-- the @updatedAt fields added to the Report and Inquiry models. Existing rows
-- backfill to CURRENT_TIMESTAMP; Prisma manages the value on every write after.
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
