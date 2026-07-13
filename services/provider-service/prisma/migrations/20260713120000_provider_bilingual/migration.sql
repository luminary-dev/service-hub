-- Bilingual provider content (#515). Optional Sinhala variants of the
-- free-text headline/bio so a provider can present their pitch in Sinhala as
-- well as English; rendering falls back to the English original when a variant
-- is absent. Additive + nullable, so existing rows are untouched. Idempotent
-- (ADD COLUMN / CREATE INDEX IF NOT EXISTS) — safe to re-run.
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "headlineSi" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "bioSi" TEXT;

-- The Sinhala columns join the /api/providers free-text search OR
-- (buildSearchWhere), so back them with the same pg_trgm GIN indexes as
-- headline/bio (migration 20260704210000_search_trgm) to keep those ILIKE
-- predicates index lookups instead of sequential scans.
CREATE INDEX IF NOT EXISTS "Provider_headlineSi_trgm_idx" ON "Provider" USING GIN ("headlineSi" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Provider_bioSi_trgm_idx" ON "Provider" USING GIN ("bioSi" gin_trgm_ops);
