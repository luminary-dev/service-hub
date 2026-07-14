-- Money as DECIMAL (#371). Service.price was DOUBLE PRECISION — a binary
-- float invites rounding drift in the price filter/sort and disagreed with
-- job-service's rupee budget. DECIMAL(12,2) stores whole LKR rupees exactly
-- (validators enforce integers at the API edge; two decimal places keep the
-- column future-proof). ROUND collapses any float artifact an existing row
-- may carry. Idempotent: re-running the cast on an already-DECIMAL column is
-- a no-op rewrite.
ALTER TABLE "Service"
  ALTER COLUMN "price" TYPE DECIMAL(12,2) USING ROUND("price"::numeric, 2);
