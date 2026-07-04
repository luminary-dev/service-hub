-- DropIndex
DROP INDEX "Provider_bio_trgm_idx";

-- DropIndex
DROP INDEX "Provider_city_trgm_idx";

-- DropIndex
DROP INDEX "Provider_contactName_trgm_idx";

-- DropIndex
DROP INDEX "Provider_headline_trgm_idx";

-- DropIndex
DROP INDEX "Service_title_trgm_idx";

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "customerLastReadAt" TIMESTAMP(3),
ADD COLUMN     "providerLastReadAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "InquiryMessage" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InquiryMessage_inquiryId_createdAt_idx" ON "InquiryMessage"("inquiryId", "createdAt");

-- AddForeignKey
ALTER TABLE "InquiryMessage" ADD CONSTRAINT "InquiryMessage_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
