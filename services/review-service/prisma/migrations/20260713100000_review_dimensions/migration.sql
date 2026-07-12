-- Optional per-dimension sub-ratings (#528): quality, punctuality, value and
-- communication, each an optional 1–5 alongside the authoritative overall
-- `rating`. Nullable so every existing review stays valid (no backfill) and a
-- reviewer can leave any dimension blank. Idempotent so a re-applied migration
-- on an already-migrated DB is a no-op.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "quality" INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "punctuality" INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "value" INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "communication" INTEGER;
