-- Mobile push notifications (#798): FCM device-token registry. One row per
-- device install; `token` is unique across ALL users so a re-registration
-- moves the token to the current signed-in account (a device can change
-- users). `platform` is a plain string guarded by a CHECK constraint (the
-- #648 pattern — Prisma doesn't diff CHECKs, so it is hand-written here and
-- mirrored by the zod enum at the API edge). Guarded DDL so a re-applied
-- migration on an already-migrated DB is a no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: upsert-by-token + the UNREGISTERED prune
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_key"
    ON "DeviceToken"("token");

-- CreateIndex: the per-user token lookup on event fan-out + erase
CREATE INDEX IF NOT EXISTS "DeviceToken_userId_idx"
    ON "DeviceToken"("userId");

-- CheckConstraint (guarded via duplicate_object — ADD CONSTRAINT has no
-- IF NOT EXISTS)
DO $$ BEGIN
    ALTER TABLE "DeviceToken"
        ADD CONSTRAINT "DeviceToken_platform_check"
        CHECK ("platform" IN ('android', 'ios'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
