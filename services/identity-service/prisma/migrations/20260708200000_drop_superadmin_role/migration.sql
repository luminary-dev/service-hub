-- Remove SUPERADMIN from the role CHECK set (unused; ADMIN is the full-access role).
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_role_check";
-- Backfill any legacy SUPERADMIN rows to ADMIN BEFORE adding the tightened
-- constraint (#367). Without this, an existing SUPERADMIN row makes ADD
-- CONSTRAINT fail, aborting `prisma migrate deploy` so identity-service never
-- boots. SUPERADMIN was only ever a transient full-access alias for ADMIN, so
-- collapsing it into ADMIN preserves access. No-op on the common path (no
-- SUPERADMIN rows exist), so it is safe everywhere.
UPDATE "User" SET "role" = 'ADMIN' WHERE "role" = 'SUPERADMIN';
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPPORT'));
