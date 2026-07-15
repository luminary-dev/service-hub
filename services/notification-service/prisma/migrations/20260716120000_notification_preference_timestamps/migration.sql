-- #769: NotificationPreference was missed by the #370 @updatedAt pass — a
-- user-toggled table with zero timestamps, so mute/unmute actions were
-- undatable (awkward for support disputes and cache invalidation). Add both
-- createdAt and updatedAt. Idempotent: safe to re-run, and mirrors the pattern
-- used for Report/Inquiry/JobRequest under #370. Existing rows backfill to
-- CURRENT_TIMESTAMP; Prisma manages `updatedAt` on every write after.
ALTER TABLE "NotificationPreference"
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "NotificationPreference"
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
