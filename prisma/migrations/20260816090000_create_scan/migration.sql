CREATE TABLE "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "liveUrl" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "viewports" TEXT NOT NULL,
    "resultJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "Scan_shop_createdAt_idx" ON "Scan"("shop", "createdAt");
