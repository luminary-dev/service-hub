-- Billing removal (#221 reverted): defer monetization to v0.2. Drop the
-- Transaction ledger and the JobRequest.agreedPrice column added by
-- 20260707130000_billing_transactions. Idempotent (IF EXISTS) so it applies
-- cleanly to databases that never got the billing migration.
DROP TABLE IF EXISTS "Transaction";
ALTER TABLE "JobRequest" DROP COLUMN IF EXISTS "agreedPrice";
