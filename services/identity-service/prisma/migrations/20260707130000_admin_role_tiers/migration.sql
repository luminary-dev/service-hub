-- Tiered admin roles (#226). `role` was, and remains, a plain TEXT column
-- (there is no Postgres enum type to ALTER TYPE ... ADD VALUE against) —
-- this adds a CHECK constraint documenting and enforcing the full set of
-- valid values now that ADMIN is joined by SUPPORT (read access + report
-- resolve/dismiss) and SUPERADMIN (full access; ADMIN remains a
-- full-access alias for backward compatibility). Existing rows are only
-- ever CUSTOMER, PROVIDER, or ADMIN, so this is safe to add without a
-- backfill.
-- AlterTable
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPPORT', 'SUPERADMIN'));
