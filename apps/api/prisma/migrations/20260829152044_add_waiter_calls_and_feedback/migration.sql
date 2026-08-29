-- CreateEnum
CREATE TYPE "WaiterCallReason" AS ENUM ('ASSISTANCE', 'BILL', 'SUPPLIES');

-- CreateEnum
CREATE TYPE "WaiterCallStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "waiter_calls" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "reason" "WaiterCallReason" NOT NULL DEFAULT 'ASSISTANCE',
    "status" "WaiterCallStatus" NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(200),
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiter_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_feedback" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "customerPhone" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waiter_calls_tenantId_idx" ON "waiter_calls"("tenantId");

-- CreateIndex
CREATE INDEX "waiter_calls_branchId_status_idx" ON "waiter_calls"("branchId", "status");

-- CreateIndex
CREATE INDEX "waiter_calls_tableId_status_idx" ON "waiter_calls"("tableId", "status");

-- CreateIndex
CREATE INDEX "order_feedback_tenantId_createdAt_idx" ON "order_feedback"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "order_feedback_branchId_rating_idx" ON "order_feedback"("branchId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "order_feedback_orderId_key" ON "order_feedback"("orderId");

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_feedback" ADD CONSTRAINT "order_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_feedback" ADD CONSTRAINT "order_feedback_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_feedback" ADD CONSTRAINT "order_feedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
