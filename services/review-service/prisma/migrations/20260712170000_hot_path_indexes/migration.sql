-- Missing indexes on hot per-user / admin query columns (#369).
CREATE INDEX IF NOT EXISTS "Review_userId_idx" ON "Review" ("userId");
CREATE INDEX IF NOT EXISTS "Report_createdAt_idx" ON "Report" ("createdAt");
