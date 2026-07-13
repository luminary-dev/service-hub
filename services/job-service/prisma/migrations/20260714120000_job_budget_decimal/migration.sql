-- Money as DECIMAL (#371). JobRequest.budget was INTEGER rupees while
-- provider-service stored Service.price as DOUBLE PRECISION — the services
-- disagreed on money representation. Both now use DECIMAL(12,2) holding whole
-- LKR rupees (validators enforce integers at the API edge; two decimal places
-- keep the column future-proof). INTEGER → NUMERIC is a lossless cast, and
-- NULL budgets stay NULL. Idempotent: re-running the cast on an
-- already-DECIMAL column is a no-op rewrite.
ALTER TABLE "JobRequest"
  ALTER COLUMN "budget" TYPE DECIMAL(12,2) USING "budget"::numeric;
