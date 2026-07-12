-- Dedicated provider cover photo (#435), independent of the work gallery.
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "coverPhoto" TEXT;
