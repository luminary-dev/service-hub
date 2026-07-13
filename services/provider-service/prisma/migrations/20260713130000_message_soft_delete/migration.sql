-- Moderation soft delete for inquiry thread messages (#376): set by admin
-- takedown of a reported message, cleared by restore. Idempotent.
ALTER TABLE "InquiryMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
