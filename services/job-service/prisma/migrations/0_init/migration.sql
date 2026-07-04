-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "JobRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budget" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobResponse" (
    "id" TEXT NOT NULL,
    "jobRequestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRequest_category_district_status_idx" ON "JobRequest"("category", "district", "status");

-- CreateIndex
CREATE INDEX "JobRequest_customerId_idx" ON "JobRequest"("customerId");

-- CreateIndex
CREATE INDEX "JobResponse_providerId_idx" ON "JobResponse"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "JobResponse_jobRequestId_providerId_key" ON "JobResponse"("jobRequestId", "providerId");

-- AddForeignKey
ALTER TABLE "JobResponse" ADD CONSTRAINT "JobResponse_jobRequestId_fkey" FOREIGN KEY ("jobRequestId") REFERENCES "JobRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

