CREATE TABLE "ShopNotificationSettings" (
    "shop" TEXT NOT NULL,
    "email" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopNotificationSettings_pkey" PRIMARY KEY ("shop")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_scheduleId_scanId_kind_key" ON "Notification"("scheduleId", "scanId", "kind");
CREATE INDEX "Notification_shop_createdAt_idx" ON "Notification"("shop", "createdAt");
