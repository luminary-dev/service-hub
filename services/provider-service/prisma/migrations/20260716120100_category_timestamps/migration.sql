-- Category timestamps (#769): the admin-editable Category (labels, imageUrl,
-- active, sortOrder) was missed by the #370 @updatedAt pass, leaving category
-- create/edit/mute actions undatable (awkward for support disputes and cache
-- invalidation). Adds createdAt + @updatedAt, matching the pattern used for
-- Report/Inquiry (20260712180000).
--
-- Idempotent: safe to re-run. Existing rows backfill both timestamps to
-- CURRENT_TIMESTAMP; Prisma manages updatedAt on every write after.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
