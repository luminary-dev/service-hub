-- AlterTable
ALTER TABLE "JobRequest" ADD COLUMN     "agreedPrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "jobRequestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "commissionRate" DECIMAL(4,3) NOT NULL DEFAULT 0.10,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_jobRequestId_idx" ON "Transaction"("jobRequestId");

-- CreateIndex
CREATE INDEX "Transaction_providerId_idx" ON "Transaction"("providerId");
