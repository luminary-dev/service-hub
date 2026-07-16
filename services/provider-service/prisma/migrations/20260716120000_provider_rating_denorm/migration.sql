-- Denormalized rating aggregates on Provider (#748). The public directory is
-- the hottest read path; caching the average + count here lets browse
-- filter/sort/count DB-side instead of fanning a per-request rating aggregation
-- out to review-service. Kept fresh by review-service's write-back to
-- PUT /internal/providers/:id/rating and self-healed by the daily backfill.
--
-- Idempotent: safe to re-run. Existing rows default to 0/0 (no reviews) and are
-- reconciled to their real aggregates by POST /internal/providers/rating/backfill
-- at deploy time (see docs/OPERATIONS.md).
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- Support the DB-side "rating"/"reviews" sorts and the ratingMin filter.
CREATE INDEX IF NOT EXISTS "Provider_ratingAvg_idx" ON "Provider"("ratingAvg");
CREATE INDEX IF NOT EXISTS "Provider_ratingCount_idx" ON "Provider"("ratingCount");
