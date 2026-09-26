-- CreateTable
CREATE TABLE "checkout_offers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "title" VARCHAR(120),
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "shownCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkout_offers_tenantId_isActive_startsAt_endsAt_idx" ON "checkout_offers"("tenantId", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "checkout_offers_productId_idx" ON "checkout_offers"("productId");

-- AddForeignKey
ALTER TABLE "checkout_offers" ADD CONSTRAINT "checkout_offers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_offers" ADD CONSTRAINT "checkout_offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
