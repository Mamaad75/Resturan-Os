-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingMethod" AS ENUM ('CARD_TO_CARD', 'GATEWAY', 'MANUAL');

-- CreateTable
CREATE TABLE "platform_bank_accounts" (
    "id" UUID NOT NULL,
    "bankName" VARCHAR(60) NOT NULL,
    "holderName" VARCHAR(80) NOT NULL,
    "cardNumber" VARCHAR(24) NOT NULL,
    "iban" VARCHAR(34),
    "note" VARCHAR(300),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "method" "BillingMethod" NOT NULL DEFAULT 'CARD_TO_CARD',
    "bankAccountId" UUID,
    "payerName" VARCHAR(80),
    "referenceCode" VARCHAR(60),
    "paidAt" TIMESTAMP(3),
    "receiptUrl" VARCHAR(500),
    "note" VARCHAR(500),
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_bank_accounts_isActive_displayOrder_idx" ON "platform_bank_accounts"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "subscription_invoices_tenantId_createdAt_idx" ON "subscription_invoices"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_invoices_status_createdAt_idx" ON "subscription_invoices"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "platform_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
