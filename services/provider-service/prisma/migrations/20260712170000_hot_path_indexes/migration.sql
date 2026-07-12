-- Missing indexes on hot per-user / admin query columns (#369). Names match
-- Prisma's @@index convention so `migrate dev` sees no drift.
CREATE INDEX IF NOT EXISTS "Inquiry_providerId_createdAt_idx" ON "Inquiry" ("providerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Inquiry_userId_idx" ON "Inquiry" ("userId");
CREATE INDEX IF NOT EXISTS "Report_createdAt_idx" ON "Report" ("createdAt");
CREATE INDEX IF NOT EXISTS "Provider_verificationStatus_idx" ON "Provider" ("verificationStatus");
