-- Admin job list (#521). The list orders by createdAt desc with an optional
-- bare status filter and no category/district — the existing
-- [category, district, status] index can't serve a status-only predicate or a
-- plain createdAt ordering (category is leftmost), so the query full-scans +
-- sorts. Add a lone createdAt index for the unfiltered ordering and a
-- [status, createdAt] composite for the status-filtered variant (equality on
-- status, then an ordered scan on createdAt). Idempotent.
CREATE INDEX IF NOT EXISTS "JobRequest_createdAt_idx" ON "JobRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "JobRequest_status_createdAt_idx" ON "JobRequest"("status", "createdAt");
