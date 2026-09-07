-- AlterTable: per-restaurant online payment routing
ALTER TABLE "restaurants"
  ADD COLUMN "onlinePaymentMode" VARCHAR(12) NOT NULL DEFAULT 'OFF',
  ADD COLUMN "ownPaymentProvider" VARCHAR(40),
  ADD COLUMN "ownPaymentCredentials" JSONB,
  ADD COLUMN "ownPaymentSandbox" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: platform gateway config (single row)
CREATE TABLE "platform_payment_config" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL DEFAULT '',
    "credentials" JSONB,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionBps" INTEGER NOT NULL DEFAULT 400,
    "settleMinHours" INTEGER NOT NULL DEFAULT 1,
    "settleMaxHours" INTEGER NOT NULL DEFAULT 48,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_payment_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable: platform SMS config (single row)
CREATE TABLE "platform_sms_config" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'console',
    "apiKey" VARCHAR(200),
    "sender" VARCHAR(40),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_sms_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable: settlement ledger for platform-gateway payments
CREATE TABLE "platform_settlements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "settlementRef" VARCHAR(120),
    "note" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_settlements_paymentId_key" ON "platform_settlements"("paymentId");
CREATE INDEX "platform_settlements_tenantId_status_idx" ON "platform_settlements"("tenantId", "status");
CREATE INDEX "platform_settlements_status_eligibleAt_idx" ON "platform_settlements"("status", "eligibleAt");

-- AddForeignKey
ALTER TABLE "platform_settlements" ADD CONSTRAINT "platform_settlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_settlements" ADD CONSTRAINT "platform_settlements_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
