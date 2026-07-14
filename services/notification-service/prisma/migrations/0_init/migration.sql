-- Stateful notification-service (RFC: stateful-notification-service):
-- per-user in-app notifications + sparse channel-preference overrides.
-- Guarded DDL so a re-applied migration on an already-migrated DB is a no-op.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum (CREATE TYPE has no IF NOT EXISTS — guard via duplicate_object)
DO $$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM (
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
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "link" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the list page (newest first per user)
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
    ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex: the unread-count badge
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx"
    ON "Notification"("userId", "readAt");

-- CreateIndex: one override row per (user, type)
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_type_key"
    ON "NotificationPreference"("userId", "type");
