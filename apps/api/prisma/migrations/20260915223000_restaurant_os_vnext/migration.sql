-- Restaurant OS vNext: Games V2, Inventory, Customer Memberships, Push/PWA and POS terminals.

-- Extend actionable notification types.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WAITER_CALLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVENTORY_LOW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TERMINAL_PAYMENT';

-- Feature switches. All optional modules are off by default except push, so
-- existing restaurants keep their current workflow after deploying this migration.
ALTER TABLE "restaurants"
  ADD COLUMN "inventoryEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "customerMembershipEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "posTerminalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Waiter-call assignment and escalation state.
ALTER TABLE "waiter_calls"
  ADD COLUMN "assignedToId" UUID,
  ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "escalatedAt" TIMESTAMP(3);

CREATE INDEX "waiter_calls_assignedToId_status_idx"
  ON "waiter_calls"("assignedToId", "status");

-- Server-authoritative game sessions (anti-replay / anti-tamper boundary).
CREATE TABLE "game_sessions" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "playerId" UUID NOT NULL,
  "model" VARCHAR(24) NOT NULL,
  "token" VARCHAR(64) NOT NULL,
  "seed" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "score" INTEGER,
  "correct" INTEGER,
  "mistakes" INTEGER,
  "comboMax" INTEGER,
  "metadata" JSONB,
  CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "game_sessions_token_key" ON "game_sessions"("token");
CREATE INDEX "game_sessions_tenantId_startedAt_idx" ON "game_sessions"("tenantId", "startedAt");
CREATE INDEX "game_sessions_playerId_startedAt_idx" ON "game_sessions"("playerId", "startedAt");
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Inventory master data.
CREATE TABLE "inventory_items" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "sku" VARCHAR(64),
  "name" VARCHAR(140) NOT NULL,
  "unit" VARCHAR(24) NOT NULL DEFAULT 'UNIT',
  "unitCost" INTEGER NOT NULL DEFAULT 0,
  "lowStockThreshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "trackStock" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_items_tenantId_sku_key" ON "inventory_items"("tenantId", "sku");
CREATE INDEX "inventory_items_tenantId_isActive_idx" ON "inventory_items"("tenantId", "isActive");
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "warehouses" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "warehouses_branchId_name_key" ON "warehouses"("branchId", "name");
CREATE INDEX "warehouses_tenantId_idx" ON "warehouses"("tenantId");
CREATE INDEX "warehouses_branchId_isActive_idx" ON "warehouses"("branchId", "isActive");
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inventory_stocks" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "warehouseId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_stocks_tenantId_warehouseId_itemId_key"
  ON "inventory_stocks"("tenantId", "warehouseId", "itemId");
CREATE INDEX "inventory_stocks_tenantId_idx" ON "inventory_stocks"("tenantId");
CREATE INDEX "inventory_stocks_itemId_idx" ON "inventory_stocks"("itemId");
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "warehouseId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitCost" INTEGER,
  "orderId" UUID,
  "reference" VARCHAR(120),
  "note" VARCHAR(300),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_movements_tenantId_createdAt_idx" ON "stock_movements"("tenantId", "createdAt");
CREATE INDEX "stock_movements_warehouseId_createdAt_idx" ON "stock_movements"("warehouseId", "createdAt");
CREATE INDEX "stock_movements_itemId_createdAt_idx" ON "stock_movements"("itemId", "createdAt");
CREATE INDEX "stock_movements_orderId_type_idx" ON "stock_movements"("orderId", "type");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "recipe_items" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recipe_items_productId_itemId_key" ON "recipe_items"("productId", "itemId");
CREATE INDEX "recipe_items_tenantId_idx" ON "recipe_items"("tenantId");
CREATE INDEX "recipe_items_itemId_idx" ON "recipe_items"("itemId");
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(140) NOT NULL,
  "phone" VARCHAR(30),
  "email" VARCHAR(160),
  "address" VARCHAR(300),
  "notes" VARCHAR(500),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "suppliers_tenantId_isActive_idx" ON "suppliers"("tenantId", "isActive");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "warehouseId" UUID NOT NULL,
  "supplierId" UUID,
  "number" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  "notes" VARCHAR(500),
  "orderedAt" TIMESTAMP(3),
  "expectedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_orders_tenantId_number_key" ON "purchase_orders"("tenantId", "number");
CREATE INDEX "purchase_orders_tenantId_status_createdAt_idx" ON "purchase_orders"("tenantId", "status", "createdAt");
CREATE INDEX "purchase_orders_branchId_status_idx" ON "purchase_orders"("branchId", "status");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "purchase_order_items" (
  "id" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unitCost" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_order_items_purchaseOrderId_itemId_key"
  ON "purchase_order_items"("purchaseOrderId", "itemId");
CREATE INDEX "purchase_order_items_itemId_idx" ON "purchase_order_items"("itemId");
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Customer membership/subscription products. Deliberately separate from the
-- platform Tenant Subscription table used for Restaurant OS billing.
CREATE TABLE "customer_membership_plans" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "price" INTEGER NOT NULL DEFAULT 0,
  "durationDays" INTEGER NOT NULL DEFAULT 30,
  "discountBps" INTEGER NOT NULL DEFAULT 0,
  "loyaltyMultiplierBps" INTEGER NOT NULL DEFAULT 10000,
  "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
  "monthlyFreeDrinks" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_membership_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_membership_plans_tenantId_isActive_idx"
  ON "customer_membership_plans"("tenantId", "isActive");
ALTER TABLE "customer_membership_plans" ADD CONSTRAINT "customer_membership_plans_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customer_memberships" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "gifted" BOOLEAN NOT NULL DEFAULT false,
  "grantedByUserId" UUID,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_memberships_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_memberships_tenantId_status_endsAt_idx"
  ON "customer_memberships"("tenantId", "status", "endsAt");
CREATE INDEX "customer_memberships_customerId_status_idx"
  ON "customer_memberships"("customerId", "status");
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "customer_membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "membership_payments" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "method" VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  "status" VARCHAR(20) NOT NULL DEFAULT 'PAID',
  "reference" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "membership_payments_tenantId_createdAt_idx" ON "membership_payments"("tenantId", "createdAt");
CREATE INDEX "membership_payments_membershipId_idx" ON "membership_payments"("membershipId");
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "customer_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "membership_usages" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "benefitType" VARCHAR(40) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "orderId" UUID,
  "note" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_usages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "membership_usages_tenantId_createdAt_idx" ON "membership_usages"("tenantId", "createdAt");
CREATE INDEX "membership_usages_membershipId_benefitType_createdAt_idx"
  ON "membership_usages"("membershipId", "benefitType", "createdAt");
ALTER TABLE "membership_usages" ADD CONSTRAINT "membership_usages_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_usages" ADD CONSTRAINT "membership_usages_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "customer_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OS-level Web Push subscriptions for staff devices.
CREATE TABLE "push_subscriptions" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "endpoint" VARCHAR(1000) NOT NULL,
  "p256dh" VARCHAR(255) NOT NULL,
  "auth" VARCHAR(255) NOT NULL,
  "userAgent" VARCHAR(300),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_subscriptions_tenantId_endpoint_key" ON "push_subscriptions"("tenantId", "endpoint");
CREATE INDEX "push_subscriptions_tenantId_userId_isActive_idx"
  ON "push_subscriptions"("tenantId", "userId", "isActive");
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- POS terminal registration. Card data never enters Restaurant OS; an installed
-- local bridge/provider adapter executes EMV transactions and returns trace/RRN.
CREATE TABLE "pos_terminals" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'LOCAL_BRIDGE',
  "terminalKey" VARCHAR(120),
  "bridgeUrl" VARCHAR(300),
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pos_terminals_tenantId_isActive_idx" ON "pos_terminals"("tenantId", "isActive");
CREATE INDEX "pos_terminals_branchId_isActive_idx" ON "pos_terminals"("branchId", "isActive");
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
