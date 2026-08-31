-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('CAFE', 'RESTAURANT', 'FAST_FOOD');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SmsKind" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('ALL', 'NEW', 'RETURNING', 'VIP', 'HIGH_VALUE', 'INACTIVE_30', 'INACTIVE_60', 'DINE_IN', 'TAKEAWAY');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "dineInCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstOrderAt" TIMESTAMP(3),
ADD COLUMN     "lastBranchId" UUID,
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "notes" VARCHAR(2000),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "takeawayCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'RESTAURANT',
ADD COLUMN     "marketingOptInEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireCustomerPhone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sms_messages" ADD COLUMN     "campaignId" UUID,
ADD COLUMN     "creditCost" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "customerId" UUID,
ADD COLUMN     "kind" "SmsKind" NOT NULL DEFAULT 'TRANSACTIONAL';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "adminNotes" VARCHAR(2000);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "fullName" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_refresh_tokens" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "adminId" UUID,
    "tenantId" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entityId" UUID,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameFa" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "monthlyPrice" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "maxBranches" INTEGER,
    "maxStaff" INTEGER,
    "maxProducts" INTEGER,
    "maxTables" INTEGER,
    "maxMonthlyOrders" INTEGER,
    "smsAllowance" INTEGER,
    "customThemeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "advancedThemeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "customCssEnabled" BOOLEAN NOT NULL DEFAULT false,
    "crmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "campaignsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "takeawayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dineInEnabled" BOOLEAN NOT NULL DEFAULT true,
    "waiterCallEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reportsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "couponsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "multiBranchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" VARCHAR(300),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "segment" "CustomerSegment" NOT NULL DEFAULT 'ALL',
    "body" VARCHAR(600) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_themes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "preset" VARCHAR(24) NOT NULL DEFAULT 'CLASSIC',
    "published" JSONB,
    "draft" JSONB,
    "customCss" VARCHAR(20000),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_refresh_tokens_tokenHash_key" ON "platform_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "platform_refresh_tokens_adminId_idx" ON "platform_refresh_tokens"("adminId");

-- CreateIndex
CREATE INDEX "platform_refresh_tokens_expiresAt_idx" ON "platform_refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_tenantId_createdAt_idx" ON "platform_audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_adminId_createdAt_idx" ON "platform_audit_logs"("adminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE INDEX "plans_isActive_displayOrder_idx" ON "plans"("isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_expiresAt_idx" ON "subscriptions"("expiresAt");

-- CreateIndex
CREATE INDEX "campaigns_tenantId_createdAt_idx" ON "campaigns"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "menu_themes_restaurantId_key" ON "menu_themes"("restaurantId");

-- CreateIndex
CREATE INDEX "menu_themes_tenantId_idx" ON "menu_themes"("tenantId");

-- CreateIndex
CREATE INDEX "customers_tenantId_lastOrderAt_idx" ON "customers"("tenantId", "lastOrderAt");

-- CreateIndex
CREATE INDEX "customers_tenantId_totalSpent_idx" ON "customers"("tenantId", "totalSpent");

-- CreateIndex
CREATE INDEX "sms_messages_tenantId_kind_createdAt_idx" ON "sms_messages"("tenantId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "sms_messages_campaignId_idx" ON "sms_messages"("campaignId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_lastBranchId_fkey" FOREIGN KEY ("lastBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_refresh_tokens" ADD CONSTRAINT "platform_refresh_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_themes" ADD CONSTRAINT "menu_themes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data backfill.
--
-- Subscription.planId is required, so every tenant that already exists needs a
-- plan and a subscription before the application starts reading them.
-- Without this an existing production tenant would have no subscription row
-- and the plan resolver would have to invent one on every request.
-- ---------------------------------------------------------------------------

INSERT INTO "plans" (
  "id", "key", "name", "nameFa", "description", "monthlyPrice", "isActive",
  "isDefault", "displayOrder",
  "maxBranches", "maxStaff", "maxProducts", "maxTables", "maxMonthlyOrders", "smsAllowance",
  "customThemeEnabled", "advancedThemeEnabled", "customCssEnabled",
  "crmEnabled", "campaignsEnabled", "takeawayEnabled", "dineInEnabled",
  "waiterCallEnabled", "reportsEnabled", "couponsEnabled", "multiBranchEnabled",
  "createdAt", "updatedAt"
) VALUES
  (
    '00000000-0000-4000-8000-000000000001', 'basic', 'Basic', 'پایه',
    'منوی دیجیتال، سفارش‌گیری و صندوق برای یک شعبه.',
    490000, true, true, 1,
    1, 5, 60, 20, 1000, 0,
    false, false, false,
    false, false, true, true, true, true, true, false,
    NOW(), NOW()
  ),
  (
    '00000000-0000-4000-8000-000000000002', 'pro', 'Pro', 'حرفه‌ای',
    'سفارشی‌سازی ظاهر منو، باشگاه مشتریان و گزارش‌های کامل.',
    990000, true, false, 2,
    3, 20, 300, 80, 8000, 500,
    true, false, false,
    true, true, true, true, true, true, true, true,
    NOW(), NOW()
  ),
  (
    '00000000-0000-4000-8000-000000000003', 'business', 'Business', 'کسب‌وکار',
    'سفارشی‌سازی پیشرفته با CSS اختصاصی و بدون سقف شعبه.',
    1990000, true, false, 3,
    NULL, NULL, NULL, NULL, NULL, 5000,
    true, true, true,
    true, true, true, true, true, true, true, true,
    NOW(), NOW()
  )
ON CONFLICT ("key") DO NOTHING;

-- Existing tenants keep working: an active, open-ended subscription on the
-- plan whose limits are widest, so nothing they already built starts failing a
-- limit check the moment this deploys. The platform can downgrade them
-- deliberately afterwards.
INSERT INTO "subscriptions" ("id", "tenantId", "planId", "status", "startedAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  t."id",
  '00000000-0000-4000-8000-000000000003',
  'ACTIVE',
  t."createdAt",
  NOW(),
  NOW()
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."tenantId" = t."id");

-- Carry each restaurant's current template into the new theme row so the menu
-- renders exactly as it does today.
INSERT INTO "menu_themes" ("id", "tenantId", "restaurantId", "preset", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."tenantId", r."id", r."menuTemplate", NOW(), NOW()
FROM "restaurants" r
WHERE NOT EXISTS (SELECT 1 FROM "menu_themes" m WHERE m."restaurantId" = r."id");
