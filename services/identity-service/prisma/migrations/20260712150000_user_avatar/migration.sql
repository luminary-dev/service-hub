-- User profile photo (#434): nullable avatar URL, source of truth across roles.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
