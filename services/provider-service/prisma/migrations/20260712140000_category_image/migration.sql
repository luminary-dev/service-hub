-- Category cover image (#436): admin-uploadable per-trade cover, used as the
-- provider-card fallback. Nullable; existing rows get NULL until seeded/uploaded.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
