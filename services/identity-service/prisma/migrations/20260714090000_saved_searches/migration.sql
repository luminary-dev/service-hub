-- Saved searches (#516): named snapshots of the /providers browse filters
-- (query/category/district) per user, matched against newly published
-- providers for new-match alert emails. lastNotifiedAt bounds alerts to one
-- per search per cooldown window.
CREATE TABLE IF NOT EXISTS "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT,
    "category" TEXT,
    "district" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SavedSearch_userId_idx" ON "SavedSearch" ("userId");

-- Candidate lookup scans by the new provider's category/district.
CREATE INDEX IF NOT EXISTS "SavedSearch_category_district_idx"
    ON "SavedSearch" ("category", "district");

-- FK guarded so a re-run (e.g. after a partial apply) doesn't error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SavedSearch_userId_fkey'
    ) THEN
        ALTER TABLE "SavedSearch"
            ADD CONSTRAINT "SavedSearch_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
