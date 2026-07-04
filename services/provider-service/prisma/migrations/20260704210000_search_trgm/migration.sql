-- Listing search at scale (#127): the /api/providers free-text search stays a
-- Prisma insensitive `contains` (ILIKE '%q%'), and pg_trgm trigram GIN indexes
-- make those predicates index lookups instead of sequential scans. Trigram
-- indexes also serve similarity() should we want typo tolerance later; a
-- tsvector/websearch_to_tsquery upgrade (stemming + relevance ranking) can be
-- layered on top without touching this migration.
--
-- Hand-written: Prisma's schema DSL cannot express CREATE EXTENSION or
-- operator-class (gin_trgm_ops) indexes. Managed Postgres must have
-- the pg_trgm extension allowed (it is in the compose postgres, which runs as
-- superuser).

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex (the columns searched by GET /api/providers)
CREATE INDEX "Provider_headline_trgm_idx" ON "Provider" USING GIN ("headline" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Provider_bio_trgm_idx" ON "Provider" USING GIN ("bio" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Provider_city_trgm_idx" ON "Provider" USING GIN ("city" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Provider_contactName_trgm_idx" ON "Provider" USING GIN ("contactName" gin_trgm_ops);

-- CreateIndex (services.title participates in the same search OR)
CREATE INDEX "Service_title_trgm_idx" ON "Service" USING GIN ("title" gin_trgm_ops);
