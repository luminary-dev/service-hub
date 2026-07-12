-- Reconcile review Report with provider-service's same-shaped model (#370):
-- add the `source` column with the identical type (TEXT) and default ('USER')
-- as provider-service's 20260707120000_report_source. Idempotent so it is safe
-- to re-run.
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'USER';
