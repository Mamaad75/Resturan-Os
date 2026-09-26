-- CreateEnum
CREATE TYPE "ReferralRewardType" AS ENUM ('PERCENTAGE', 'FIXED', 'FREE_PRODUCT');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('AVAILABLE', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralRole" AS ENUM ('REFERRER', 'FRIEND');

-- CreateTable
CREATE TABLE "referral_programs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "rewardType" "ReferralRewardType" NOT NULL DEFAULT 'PERCENTAGE',
    "rewardValue" INTEGER NOT NULL DEFAULT 1000,
    "rewardProductId" UUID,
    "invitesRequired" INTEGER NOT NULL DEFAULT 1,
    "friendRewardType" "ReferralRewardType",
    "friendRewardValue" INTEGER NOT NULL DEFAULT 0,
    "friendRewardProductId" UUID,
    "rewardValidDays" INTEGER NOT NULL DEFAULT 30,
    "termsFa" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "codeId" UUID NOT NULL,
    "referrerCustomerId" UUID NOT NULL,
    "invitedCustomerId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "role" "ReferralRole" NOT NULL,
    "type" "ReferralRewardType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "productId" UUID,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedOnOrderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_programs_tenantId_key" ON "referral_programs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_customerId_key" ON "referral_codes"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_tenantId_code_key" ON "referral_codes"("tenantId", "code");

-- CreateIndex
CREATE INDEX "referrals_tenantId_referrerCustomerId_idx" ON "referrals"("tenantId", "referrerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_tenantId_invitedCustomerId_key" ON "referrals"("tenantId", "invitedCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_orderId_key" ON "referrals"("orderId");

-- CreateIndex
CREATE INDEX "referral_rewards_tenantId_customerId_status_idx" ON "referral_rewards"("tenantId", "customerId", "status");

-- AddForeignKey
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_rewardProductId_fkey" FOREIGN KEY ("rewardProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_friendRewardProductId_fkey" FOREIGN KEY ("friendRewardProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "referral_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

