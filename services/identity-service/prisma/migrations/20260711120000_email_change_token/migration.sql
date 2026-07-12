-- Change-email flow (#396): a pending move of a user's address, confirmed via a
-- link sent to the new address. Same hash-only, single-active-token shape as the
-- verification/reset token tables. Guarded so a partial re-apply is a no-op.

CREATE TABLE IF NOT EXISTS "EmailChangeToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailChangeToken_tokenHash_key"
    ON "EmailChangeToken" ("tokenHash");

CREATE INDEX IF NOT EXISTS "EmailChangeToken_userId_idx"
    ON "EmailChangeToken" ("userId");

-- FK guarded so a re-run (e.g. after a partial apply) doesn't error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'EmailChangeToken_userId_fkey'
    ) THEN
        ALTER TABLE "EmailChangeToken"
            ADD CONSTRAINT "EmailChangeToken_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
