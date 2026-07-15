-- Search index consistency (#752): delete tombstones + a sweep-generation
-- column, replacing the unbounded NOT IN (…) prune and the re-insert race.
-- Hand-written and idempotent-safe (IF NOT EXISTS throughout) per the repo's
-- migration conventions.

-- Sweep generation stamp: each reindex sweep writes its unique id onto every
-- row it upserts, then prunes only rows it did not touch that also predate the
-- sweep (updatedAt < sweepStartedAt). A provider registered mid-sweep carries a
-- fresh updatedAt and survives, and the prune no longer builds a NOT IN (…) of
-- every seen id (Postgres caps bind params at 65,535, so the old form hard-
-- failed past ~65k providers).
ALTER TABLE "ProviderIndex" ADD COLUMN IF NOT EXISTS "sweepId" TEXT;
CREATE INDEX IF NOT EXISTS "ProviderIndex_sweepId_idx" ON "ProviderIndex"("sweepId");

-- Delete tombstone: the DELETE handler records when a provider left the index
-- so a stale full-document push (built before the delete, delivered after it)
-- cannot resurrect an erased/suspended provider. The daily sweep purges
-- tombstones once they predate it.
CREATE TABLE IF NOT EXISTS "ProviderTombstone" (
    "providerId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTombstone_pkey" PRIMARY KEY ("providerId")
);
CREATE INDEX IF NOT EXISTS "ProviderTombstone_deletedAt_idx" ON "ProviderTombstone"("deletedAt");
