-- User updatedAt (#769): the most-mutated table lacked an update timestamp.
-- Idempotent-safe ADD COLUMN with DEFAULT now() so existing rows backfill to a
-- sensible value; Prisma's @updatedAt maintains it in the app layer thereafter.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();
