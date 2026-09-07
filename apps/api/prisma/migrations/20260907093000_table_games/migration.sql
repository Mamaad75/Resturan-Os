-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoyaltyEntryType" ADD VALUE 'GAME_EARN';
ALTER TYPE "LoyaltyEntryType" ADD VALUE 'GAME_REDEEM';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "gameXp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "rewardCustomerPhone" VARCHAR(20),
ADD COLUMN     "rewardRequestId" UUID;

-- CreateTable
CREATE TABLE "game_programs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER NOT NULL DEFAULT 2,
    "pointsPerWin" INTEGER NOT NULL DEFAULT 10,
    "couponCost" INTEGER NOT NULL DEFAULT 50,
    "couponMaxDiscount" INTEGER NOT NULL DEFAULT 20000,
    "couponMinOrder" INTEGER NOT NULL DEFAULT 100000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "state" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "awardedPoints" INTEGER NOT NULL DEFAULT 0,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_programs_tenantId_key" ON "game_programs"("tenantId");

-- CreateIndex
CREATE INDEX "game_sessions_tenantId_customerId_createdAt_idx" ON "game_sessions"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_tenantId_orderId_kind_key" ON "game_sessions"("tenantId", "orderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_rewardRequestId_key" ON "coupons"("rewardRequestId");

-- AddForeignKey
ALTER TABLE "game_programs" ADD CONSTRAINT "game_programs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
