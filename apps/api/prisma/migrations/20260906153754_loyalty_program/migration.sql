-- CreateEnum
CREATE TYPE "LoyaltyEntryType" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE', 'REVERSAL');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "loyaltyDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyPointsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pointsPerThousand" INTEGER NOT NULL DEFAULT 1,
    "tomanPerPoint" INTEGER NOT NULL DEFAULT 1000,
    "minRedeemPoints" INTEGER NOT NULL DEFAULT 50,
    "maxRedeemBps" INTEGER NOT NULL DEFAULT 5000,
    "welcomePoints" INTEGER NOT NULL DEFAULT 0,
    "expiryDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "type" "LoyaltyEntryType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" VARCHAR(300),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_programs_tenantId_key" ON "loyalty_programs"("tenantId");

-- CreateIndex
CREATE INDEX "loyalty_entries_tenantId_customerId_createdAt_idx" ON "loyalty_entries"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_entries_tenantId_createdAt_idx" ON "loyalty_entries"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "customers_tenantId_loyaltyPoints_idx" ON "customers"("tenantId", "loyaltyPoints");

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
