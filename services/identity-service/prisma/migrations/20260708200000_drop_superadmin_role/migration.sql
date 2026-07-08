-- Remove SUPERADMIN from the role CHECK set (unused; ADMIN is the full-access role).
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_role_check";
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPPORT'));
