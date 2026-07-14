-- #648: replace the `NotificationType` native enum with TEXT + a CHECK
-- constraint, mirroring identity-service's `User_role_check` pattern. Native
-- enums are painful to evolve (adding/removing a value needs its own migration
-- and locks), the allowed set already lives in code (lib/events.ts), and a
-- CHECK gives the same integrity with none of the friction. Guarded/idempotent
-- so a re-applied migration on an already-migrated DB is a no-op.

-- Notification.type -> TEXT + CHECK
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_type_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_type_check" CHECK ("type" IN (
    'NEW_INQUIRY',
    'THREAD_REPLY',
    'NEW_REVIEW',
    'REVIEW_RESPONSE',
    'VERIFICATION_APPROVED',
    'VERIFICATION_REJECTED',
    'NEW_JOB_MATCH',
    'JOB_RESPONSE',
    'SAVED_SEARCH_MATCH',
    'REPORT_RESOLVED'
));

-- NotificationPreference.type -> TEXT + CHECK (same allowed set)
ALTER TABLE "NotificationPreference" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "NotificationPreference" DROP CONSTRAINT IF EXISTS "NotificationPreference_type_check";
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_type_check" CHECK ("type" IN (
    'NEW_INQUIRY',
    'THREAD_REPLY',
    'NEW_REVIEW',
    'REVIEW_RESPONSE',
    'VERIFICATION_APPROVED',
    'VERIFICATION_REJECTED',
    'NEW_JOB_MATCH',
    'JOB_RESPONSE',
    'SAVED_SEARCH_MATCH',
    'REPORT_RESOLVED'
));

-- The native enum is now unreferenced; drop it. IF EXISTS keeps the migration
-- idempotent and safe if a prior partial run already removed it.
DROP TYPE IF EXISTS "NotificationType";
