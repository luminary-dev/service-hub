-- Last-transition timestamp (#370). Idempotent: matches the @updatedAt field
-- added to the JobRequest model. Existing rows backfill to CURRENT_TIMESTAMP;
-- Prisma manages the value on every write after.
ALTER TABLE "JobRequest" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
