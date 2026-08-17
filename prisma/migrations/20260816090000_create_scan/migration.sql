CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "liveUrl" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "viewports" TEXT NOT NULL,
    "resultJson" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Scan_shop_createdAt_idx" ON "Scan"("shop", "createdAt");
