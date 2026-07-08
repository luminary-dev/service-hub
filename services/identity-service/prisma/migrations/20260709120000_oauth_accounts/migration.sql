-- Social login (#398): allow password-less accounts + linked OAuth identities.

-- An OAuth-created user has no password until they set one via the reset flow.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Linked social identities. One row per (provider, providerAccountId).
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key"
    ON "Account" ("provider", "providerAccountId");

CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account" ("userId");

-- FK guarded so a re-run (e.g. after a partial apply) doesn't error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Account_userId_fkey'
    ) THEN
        ALTER TABLE "Account"
            ADD CONSTRAINT "Account_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
