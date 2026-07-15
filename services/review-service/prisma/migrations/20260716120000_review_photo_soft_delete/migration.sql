-- Moderation soft delete for review photos (#756): admin takedown of a
-- reported review photo becomes a reversible SOFT delete instead of an
-- irreversible hard delete + file removal, matching every other moderated
-- content type (Review.deletedAt, provider-service's WorkPhoto.deletedAt).
-- Nullable so every existing photo stays live (no backfill). Idempotent so a
-- re-applied migration on an already-migrated DB is a no-op.
ALTER TABLE "ReviewPhoto" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
