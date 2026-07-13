-- Suspension origin (#550). `suspended` is a single flag shared by ADMIN
-- moderation and the self-service downgrade (#403), so a suspended provider
-- could self-lift an admin suspension via leave-provider → complete-provider
-- (the reactivate path cleared `suspended` unconditionally). `adminSuspended`
-- marks a suspension as admin-owned; only the admin unsuspend action clears
-- it. Idempotent (ADD COLUMN IF NOT EXISTS) — safe to re-run.
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "adminSuspended" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the moderation audit trail (#227): a suspended provider whose
-- most recent admin suspend/unsuspend action is "suspend" is under an active
-- ADMIN suspension; any other suspended row is a self-deactivation (#403) and
-- stays self-reactivatable.
UPDATE "Provider" p
SET "adminSuspended" = true
WHERE p."suspended" = true
  AND (
    SELECT a."action" FROM "AdminAuditLog" a
    WHERE a."targetType" = 'PROVIDER'
      AND a."targetId" = p."id"
      AND a."action" IN ('suspend', 'unsuspend')
    ORDER BY a."createdAt" DESC
    LIMIT 1
  ) = 'suspend';
