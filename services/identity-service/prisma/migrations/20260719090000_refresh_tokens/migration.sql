-- Mobile API-client refresh tokens (#797): opaque tokens (hash-only storage,
-- same discipline as the reset/verification tokens) exchanged at
-- /api/auth/refresh for short-lived Bearer access JWTs. Rotation marks the
-- spent row (revokedAt) and issues a replacement; sessionVersion snapshots
-- User.sessionVersion at mint so the existing revocation paths (password
-- change/reset, logout-all, admin force-logout) outdate outstanding tokens.
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "deviceName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key"
    ON "RefreshToken" ("tokenHash");

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken" ("userId");

-- FK guarded so a re-run (e.g. after a partial apply) doesn't error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_userId_fkey'
    ) THEN
        ALTER TABLE "RefreshToken"
            ADD CONSTRAINT "RefreshToken_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
