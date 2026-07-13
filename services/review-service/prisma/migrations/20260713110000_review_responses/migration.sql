-- Provider responses to reviews (#395): one per review (reviewId unique),
-- written by the reviewed profile's owner. Cascades with the review so a
-- hard-deleted review (account erasure) takes its response with it. Guarded
-- DDL so a re-applied migration on an already-migrated DB is a no-op.
CREATE TABLE IF NOT EXISTS "ReviewResponse" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReviewResponse_reviewId_key" ON "ReviewResponse"("reviewId");

ALTER TABLE "ReviewResponse" DROP CONSTRAINT IF EXISTS "ReviewResponse_reviewId_fkey";
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
