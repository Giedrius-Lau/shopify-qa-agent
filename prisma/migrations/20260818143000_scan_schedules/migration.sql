CREATE TABLE "ScanSchedule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configurationJson" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "hourUtc" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastScanId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScanSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScanSchedule_shop_createdAt_idx" ON "ScanSchedule"("shop", "createdAt");
CREATE INDEX "ScanSchedule_enabled_nextRunAt_idx" ON "ScanSchedule"("enabled", "nextRunAt");
