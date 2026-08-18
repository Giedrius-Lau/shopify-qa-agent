CREATE TABLE "ShopPlan" (
    "shop" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "planHandle" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopPlan_pkey" PRIMARY KEY ("shop")
);
