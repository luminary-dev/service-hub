-- Replace the single-column providerId index with a composite that matches the
-- provider-profile review query (filter providerId, order by createdAt/id).
-- DropIndex
DROP INDEX "Review_providerId_idx";

-- CreateIndex
CREATE INDEX "Review_providerId_createdAt_id_idx" ON "Review"("providerId", "createdAt", "id");
