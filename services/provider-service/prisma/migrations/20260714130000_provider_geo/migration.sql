-- Geo capture (#48, search & discovery RFC phase 1). Optional map-pin
-- coordinates for a provider's base location, captured via the web's Leaflet
-- picker. Nullable on purpose: an unpinned provider keeps full district-based
-- visibility and is simply absent from future radius results — district
-- centroids are never substituted as fake coordinates. Plain DOUBLE PRECISION
-- for now; the RFC's search index (phase 2, PostGIS) derives a geography
-- column from these. Idempotent (ADD COLUMN IF NOT EXISTS) — safe to re-run.
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
