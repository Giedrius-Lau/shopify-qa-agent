CREATE TABLE "ShopMember" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopMember_shop_identity_key" ON "ShopMember"("shop", "identity");
CREATE INDEX "ShopMember_shop_createdAt_idx" ON "ShopMember"("shop", "createdAt");
