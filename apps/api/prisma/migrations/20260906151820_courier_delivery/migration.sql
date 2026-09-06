-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COURIER';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "courierId" UUID,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryAddress" VARCHAR(400),
ADD COLUMN     "deliveryFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryNotes" VARCHAR(300),
ADD COLUMN     "deliveryZoneId" UUID,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "minOrderTotal" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 45,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_zones_tenantId_idx" ON "delivery_zones"("tenantId");

-- CreateIndex
CREATE INDEX "delivery_zones_branchId_isActive_displayOrder_idx" ON "delivery_zones"("branchId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_branchId_title_key" ON "delivery_zones"("branchId", "title");

-- CreateIndex
CREATE INDEX "orders_courierId_status_idx" ON "orders"("courierId", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
