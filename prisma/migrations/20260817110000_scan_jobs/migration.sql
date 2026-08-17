ALTER TABLE "Scan"
ADD COLUMN "jobPayload" TEXT,
ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "progressMessage" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Scan_status_createdAt_idx" ON "Scan"("status", "createdAt");
