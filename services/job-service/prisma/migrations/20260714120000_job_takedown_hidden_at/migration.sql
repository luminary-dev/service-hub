-- Admin takedown flag for job posts (#376): set when a full admin hides a
-- reported job, cleared on unhide. Hidden jobs disappear from the provider
-- board and stop accepting responses. Idempotent. (The Report/AdminAuditLog
-- tables this feature also relies on shipped in
-- 20260713150000_reports_audit_log, #375.)
ALTER TABLE "JobRequest" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
