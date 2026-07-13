-- Admin hot-path indexes for User (#509). The table carried only the @unique on
-- email, so the admin surfaces below fell back to sequential scans as it grows:
--   * GET /api/admin/users lists newest-first (ORDER BY "createdAt" DESC) and
--     the dashboard signups chart range-scans "createdAt" >= now-30d
--     (admin-users.ts / admin.ts).
--   * GET /api/admin/users?q= filters email/name with a case-insensitive
--     `contains` (Prisma mode:"insensitive" → ILIKE '%q%'), which a plain btree
--     cannot serve.
--
-- Hand-written & idempotent (IF NOT EXISTS): migrations here are applied with
-- `prisma migrate deploy`, never generated, and Prisma's schema DSL cannot
-- express CREATE EXTENSION or operator-class (gin_trgm_ops) indexes. Mirrors
-- provider-service's 20260704210000_search_trgm — the trigram GIN sits on the
-- raw column (not lower()), because that is what the planner can use for the
-- ILIKE the `mode:"insensitive" contains` compiles to. Managed Postgres must
-- allow the pg_trgm extension (it is enabled in the compose postgres, which
-- runs as superuser).

-- CreateIndex (newest-first list + signups range scan)
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex (case-insensitive email/name search — ILIKE '%q%')
CREATE INDEX IF NOT EXISTS "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);
