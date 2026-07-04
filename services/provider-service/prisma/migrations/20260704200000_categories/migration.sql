-- CreateTable
CREATE TABLE "Category" (
    "slug" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelSi" TEXT NOT NULL,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("slug")
);

