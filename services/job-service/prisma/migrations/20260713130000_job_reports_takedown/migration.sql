-- Job abuse reports + admin takedown (#376). Idempotent-safe: guarded
-- CREATEs and ADD COLUMN IF NOT EXISTS.

-- Admin takedown flag: set when a full admin hides a reported job, cleared on
-- unhide. Hidden jobs disappear from the provider board and stop accepting
-- responses.
ALTER TABLE "JobRequest" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);

-- Reports on job posts — same shape as provider-service/review-service's
-- Report tables (each content-owning service keeps reports on its own
-- content).
CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Report_status_idx" ON "Report"("status");
CREATE INDEX IF NOT EXISTS "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "Report_createdAt_idx" ON "Report"("createdAt");

-- Moderation audit trail — one row per admin action taken through this
-- service (job hide/unhide, report resolve/dismiss). Same shape as
-- provider-service/review-service's AdminAuditLog.
CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditLog_adminId_idx" ON "AdminAuditLog"("adminId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
