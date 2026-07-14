-- Search index bootstrap (search & discovery RFC phase 2). Hand-written:
-- Prisma's DSL cannot express CREATE EXTENSION, GENERATED columns, tsvector
-- columns, operator-class (gin_trgm_ops) indexes, or GiST geography indexes.
-- Idempotent-safe throughout (IF NOT EXISTS / OR REPLACE) per the repo's
-- migration conventions.

-- PostGIS is NOT a trusted extension: creating it needs superuser. In dev the
-- service connects as the postgres superuser so this line works standalone; in
-- prod the extension is bootstrapped by deploy/postgres-init.sh (fresh volume)
-- or deploy/add-search-db.sh (existing volume) and this is a no-op NOTICE —
-- IF NOT EXISTS short-circuits before any privilege check.
CREATE EXTENSION IF NOT EXISTS postgis;
-- pg_trgm IS trusted (PG13+), so the owning role can create it itself.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- array_to_string is only STABLE, but GENERATED columns and expression indexes
-- require IMMUTABLE expressions. For text[] the join genuinely is immutable, so
-- wrap it. (Referenced by the tsv_en generated column below — do not drop.)
CREATE OR REPLACE FUNCTION provider_index_text_join(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string($1, ' ') $$;

-- One row per publicly visible provider (suspended/erased rows are deleted,
-- not flagged). Columns mirror everything provider-service's buildBrowseWhere
-- touches, plus geo + denormalized rating aggregates. No contact PII.
CREATE TABLE IF NOT EXISTS "ProviderIndex" (
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "headlineSi" TEXT,
    "bioSi" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "serviceDistricts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "serviceTitles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "servicePrices" DECIMAL(12,2)[] NOT NULL DEFAULT ARRAY[]::DECIMAL(12,2)[],
    "minPrice" DECIMAL(12,2),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "awayUntil" TIMESTAMP(3),
    "verificationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "experience" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ratingAvg" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- Geo (§3.2): a real WGS84 point generated from the mirrored pin pair —
    -- ST_DWithin radius filters and KNN (<->) ordering are both GiST-backed.
    -- Unpinned providers carry NULL and are simply absent from radius results.
    "location" geography(Point, 4326) GENERATED ALWAYS AS (
        CASE
            WHEN "latitude" IS NOT NULL AND "longitude" IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
            ELSE NULL
        END
    ) STORED,

    -- Multilingual FTS (§6), per-column not per-schema. English gets the
    -- 'english' config (stemming + ranking); Sinhala gets 'simple' (Postgres
    -- has no Sinhala stemmer — whitespace/punctuation tokenization is
    -- correct-enough, and the trigram indexes below keep substring matching).
    "tsv_en" tsvector GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce("headline", '') || ' ' || coalesce("bio", '') || ' ' ||
            coalesce("city", '') || ' ' || coalesce("contactName", '') || ' ' ||
            coalesce(provider_index_text_join("serviceTitles"), '')
        )
    ) STORED,
    "tsv_si" tsvector GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce("headlineSi", '') || ' ' || coalesce("bioSi", '')
        )
    ) STORED,

    CONSTRAINT "ProviderIndex_pkey" PRIMARY KEY ("providerId")
);

-- Straight filters (mirrors provider-service's browse indexes).
CREATE INDEX IF NOT EXISTS "ProviderIndex_category_district_idx" ON "ProviderIndex"("category", "district");
CREATE INDEX IF NOT EXISTS "ProviderIndex_district_idx" ON "ProviderIndex"("district");
CREATE INDEX IF NOT EXISTS "ProviderIndex_serviceDistricts_idx" ON "ProviderIndex" USING GIN ("serviceDistricts");
CREATE INDEX IF NOT EXISTS "ProviderIndex_createdAt_idx" ON "ProviderIndex"("createdAt");
CREATE INDEX IF NOT EXISTS "ProviderIndex_ratingAvg_idx" ON "ProviderIndex"("ratingAvg");

-- FTS.
CREATE INDEX IF NOT EXISTS "ProviderIndex_tsv_en_idx" ON "ProviderIndex" USING GIN ("tsv_en");
CREATE INDEX IF NOT EXISTS "ProviderIndex_tsv_si_idx" ON "ProviderIndex" USING GIN ("tsv_si");

-- Geo: GiST backs both ST_DWithin and KNN (<->) nearest-first ordering.
CREATE INDEX IF NOT EXISTS "ProviderIndex_location_idx" ON "ProviderIndex" USING GIST ("location");

-- Trigram fallback arm (today's ILIKE-substring behavior is preserved as an OR
-- alongside the tsvector match, so partial words keep working). Same column
-- set as provider-service's 20260704210000_search_trgm + the SI variants.
CREATE INDEX IF NOT EXISTS "ProviderIndex_headline_trgm_idx" ON "ProviderIndex" USING GIN ("headline" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ProviderIndex_bio_trgm_idx" ON "ProviderIndex" USING GIN ("bio" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ProviderIndex_headlineSi_trgm_idx" ON "ProviderIndex" USING GIN ("headlineSi" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ProviderIndex_bioSi_trgm_idx" ON "ProviderIndex" USING GIN ("bioSi" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ProviderIndex_city_trgm_idx" ON "ProviderIndex" USING GIN ("city" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ProviderIndex_contactName_trgm_idx" ON "ProviderIndex" USING GIN ("contactName" gin_trgm_ops);
