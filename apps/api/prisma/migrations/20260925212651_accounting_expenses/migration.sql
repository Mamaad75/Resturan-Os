-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseRecurrence" AS ENUM ('ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(40),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "categoryId" UUID NOT NULL,
    "supplierId" UUID,
    "title" VARCHAR(160) NOT NULL,
    "amount" INTEGER NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "method" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" VARCHAR(80),
    "note" VARCHAR(500),
    "attachmentUrl" VARCHAR(500),
    "recurrence" "ExpenseRecurrence" NOT NULL DEFAULT 'ONCE',
    "nextDueAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_categories_tenantId_isActive_displayOrder_idx" ON "expense_categories"("tenantId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenantId_name_key" ON "expense_categories"("tenantId", "name");

-- CreateIndex
CREATE INDEX "expenses_tenantId_spentAt_idx" ON "expenses"("tenantId", "spentAt");

-- CreateIndex
CREATE INDEX "expenses_tenantId_categoryId_spentAt_idx" ON "expenses"("tenantId", "categoryId", "spentAt");

-- CreateIndex
CREATE INDEX "expenses_branchId_spentAt_idx" ON "expenses"("branchId", "spentAt");

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
