-- Impersonation attribution on the identity audit trail (#634). When an admin
-- acts from an impersonation session the row's "adminId" is the impersonated
-- TARGET (the effective session identity), which alone misattributes the write.
-- Record the REAL admin (gateway-stamped x-impersonated-by) in a new nullable
-- column; null for ordinary, non-impersonated actions.
--
-- Hand-written & idempotent (IF NOT EXISTS): migrations here are applied with
-- `prisma migrate deploy`, never generated. Additive + nullable, so it is
-- backfill-free and safe to re-run.

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;
