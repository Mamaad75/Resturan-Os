import { Inject, Injectable } from '@nestjs/common';
import { NotificationType } from '@restaurant-os/types';
import type {
  CreateInventoryItemInput,
  CreateWarehouseInput,
  PurchaseOrderInput,
  ReceivePurchaseOrderInput,
  RecipeInput,
  StockAdjustmentInput,
  StockTransferInput,
  SupplierInput,
  UpdateInventoryItemInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService, type PrismaTransaction } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

function n(value: unknown): number {
  return Number(value ?? 0);
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async assertEnabled(tenantId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId },
      select: { inventoryEnabled: true },
    });
    if (!restaurant?.inventoryEnabled) {
      throw AppException.forbidden('انبارداری برای این مجموعه فعال نشده است. از تنظیمات فعالش کنید.');
    }
  }

  private async resolveBranch(ctx: Pick<RequestContext, 'tenantId' | 'branchId'>, requested?: string) {
    const id = requested ?? ctx.branchId;
    const branch = id
      ? await this.prisma.branch.findFirst({ where: { id, tenantId: ctx.tenantId, isActive: true } })
      : await this.prisma.branch.findFirst({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!branch) throw AppException.notFound('شعبه');
    return branch;
  }

  async getDefaultWarehouse(tenantId: string, branchId: string) {
    let warehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, branchId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!warehouse) {
      warehouse = await this.prisma.warehouse.create({
        data: { tenantId, branchId, name: 'انبار اصلی', isDefault: true },
      });
    }
    return warehouse;
  }

  async summary(ctx: RequestContext, branchId?: string) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, branchId);
    const warehouse = await this.getDefaultWarehouse(ctx.tenantId, branch.id);
    const rows = await this.prisma.inventoryItem.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      include: { stocks: { where: { warehouseId: warehouse.id } } },
      orderBy: { name: 'asc' },
    });
    const items = rows.map((item) => {
      const quantity = n(item.stocks[0]?.quantity);
      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        unitCost: item.unitCost,
        quantity,
        lowStockThreshold: n(item.lowStockThreshold),
        low: item.trackStock && quantity <= n(item.lowStockThreshold),
        stockValue: Math.round(quantity * item.unitCost),
      };
    });
    return {
      branch: { id: branch.id, name: branch.name },
      warehouse: { id: warehouse.id, name: warehouse.name },
      totalItems: items.length,
      lowStockCount: items.filter((x) => x.low).length,
      stockValue: items.reduce((sum, x) => sum + x.stockValue, 0),
      lowStockItems: items.filter((x) => x.low).slice(0, 20),
    };
  }

  async listItems(ctx: RequestContext, branchId?: string, warehouseId?: string) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, branchId);
    const warehouse = warehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId: ctx.tenantId, branchId: branch.id } })
      : await this.getDefaultWarehouse(ctx.tenantId, branch.id);
    if (!warehouse) throw AppException.notFound('انبار');
    const rows = await this.prisma.inventoryItem.findMany({
      where: { tenantId: ctx.tenantId },
      include: { stocks: { where: { warehouseId: warehouse.id } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map((item) => {
      const quantity = n(item.stocks[0]?.quantity);
      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        unitCost: item.unitCost,
        lowStockThreshold: n(item.lowStockThreshold),
        trackStock: item.trackStock,
        isActive: item.isActive,
        quantity,
        low: item.trackStock && quantity <= n(item.lowStockThreshold),
        stockValue: Math.round(quantity * item.unitCost),
        warehouseId: warehouse.id,
      };
    });
  }

  async createItem(ctx: RequestContext, input: CreateInventoryItemInput) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, input.branchId);
    const warehouse = input.warehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, tenantId: ctx.tenantId, branchId: branch.id } })
      : await this.getDefaultWarehouse(ctx.tenantId, branch.id);
    if (!warehouse) throw AppException.notFound('انبار');

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          tenantId: ctx.tenantId,
          sku: input.sku ?? null,
          name: input.name,
          unit: input.unit,
          unitCost: input.unitCost,
          lowStockThreshold: input.lowStockThreshold,
          trackStock: input.trackStock,
        },
      });
      await tx.inventoryStock.create({
        data: { tenantId: ctx.tenantId, warehouseId: warehouse.id, itemId: created.id, quantity: input.initialQuantity },
      });
      if (input.initialQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: branch.id,
            warehouseId: warehouse.id,
            itemId: created.id,
            type: 'OPENING_BALANCE',
            quantity: input.initialQuantity,
            unitCost: input.unitCost,
            createdById: ctx.userId,
          },
        });
      }
      return created;
    });
    await this.notifyLowStock(ctx.tenantId, branch.id, warehouse.id, [item.id]);
    return item;
  }

  async updateItem(ctx: RequestContext, id: string, input: UpdateInventoryItemInput) {
    await this.assertEnabled(ctx.tenantId);
    const exists = await this.prisma.inventoryItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!exists) throw AppException.notFound('کالای انبار');
    return this.prisma.inventoryItem.update({ where: { id, tenantId: ctx.tenantId }, data: input });
  }

  async warehouses(ctx: RequestContext, branchId?: string) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, branchId);
    await this.getDefaultWarehouse(ctx.tenantId, branch.id);
    return this.prisma.warehouse.findMany({ where: { tenantId: ctx.tenantId, branchId: branch.id }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  async createWarehouse(ctx: RequestContext, input: CreateWarehouseInput) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, input.branchId);
    if (input.isDefault) {
      await this.prisma.warehouse.updateMany({ where: { tenantId: ctx.tenantId, branchId: branch.id }, data: { isDefault: false } });
    }
    return this.prisma.warehouse.create({ data: { tenantId: ctx.tenantId, branchId: branch.id, name: input.name, isDefault: input.isDefault } });
  }

  async adjust(ctx: RequestContext, input: StockAdjustmentInput) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, input.branchId);
    const warehouse = input.warehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, tenantId: ctx.tenantId, branchId: branch.id } })
      : await this.getDefaultWarehouse(ctx.tenantId, branch.id);
    if (!warehouse) throw AppException.notFound('انبار');
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: input.itemId, tenantId: ctx.tenantId } });
    if (!item) throw AppException.notFound('کالای انبار');

    const result = await this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.upsert({
        where: { tenantId_warehouseId_itemId: { tenantId: ctx.tenantId, warehouseId: warehouse.id, itemId: item.id } },
        create: { tenantId: ctx.tenantId, warehouseId: warehouse.id, itemId: item.id, quantity: 0 },
        update: {},
      });
      const next = n(stock.quantity) + input.quantityDelta;
      if (next < 0) throw AppException.validation('موجودی نمی‌تواند منفی شود.');
      const updated = await tx.inventoryStock.update({ where: { id: stock.id, tenantId: ctx.tenantId }, data: { quantity: next } });
      await tx.stockMovement.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: branch.id,
          warehouseId: warehouse.id,
          itemId: item.id,
          type: input.reason,
          quantity: input.quantityDelta,
          unitCost: input.unitCost ?? item.unitCost,
          note: input.note ?? null,
          createdById: ctx.userId,
        },
      });
      if (input.unitCost !== undefined) {
        await tx.inventoryItem.update({ where: { id: item.id, tenantId: ctx.tenantId }, data: { unitCost: input.unitCost } });
      }
      return { itemId: item.id, quantity: n(updated.quantity) };
    });
    await this.notifyLowStock(ctx.tenantId, branch.id, warehouse.id, [item.id]);
    return result;
  }

  async transfer(ctx: RequestContext, input: StockTransferInput) {
    await this.assertEnabled(ctx.tenantId);
    if (input.fromWarehouseId === input.toWarehouseId) throw AppException.validation('مبدأ و مقصد نمی‌توانند یکسان باشند.');
    const [from, to, item] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: input.fromWarehouseId, tenantId: ctx.tenantId } }),
      this.prisma.warehouse.findFirst({ where: { id: input.toWarehouseId, tenantId: ctx.tenantId } }),
      this.prisma.inventoryItem.findFirst({ where: { id: input.itemId, tenantId: ctx.tenantId } }),
    ]);
    if (!from || !to) throw AppException.notFound('انبار');
    if (!item) throw AppException.notFound('کالای انبار');

    await this.prisma.$transaction(async (tx) => {
      const source = await tx.inventoryStock.upsert({
        where: { tenantId_warehouseId_itemId: { tenantId: ctx.tenantId, warehouseId: from.id, itemId: item.id } },
        create: { tenantId: ctx.tenantId, warehouseId: from.id, itemId: item.id, quantity: 0 }, update: {},
      });
      if (n(source.quantity) < input.quantity) throw AppException.validation('موجودی انبار مبدأ کافی نیست.');
      await tx.inventoryStock.update({ where: { id: source.id, tenantId: ctx.tenantId }, data: { quantity: { decrement: input.quantity } } });
      await tx.inventoryStock.upsert({
        where: { tenantId_warehouseId_itemId: { tenantId: ctx.tenantId, warehouseId: to.id, itemId: item.id } },
        create: { tenantId: ctx.tenantId, warehouseId: to.id, itemId: item.id, quantity: input.quantity },
        update: { quantity: { increment: input.quantity } },
      });
      const base = { tenantId: ctx.tenantId, itemId: item.id, unitCost: item.unitCost, note: input.note ?? null, createdById: ctx.userId };
      await tx.stockMovement.create({ data: { ...base, branchId: from.branchId, warehouseId: from.id, type: 'TRANSFER_OUT', quantity: -input.quantity, reference: to.id } });
      await tx.stockMovement.create({ data: { ...base, branchId: to.branchId, warehouseId: to.id, type: 'TRANSFER_IN', quantity: input.quantity, reference: from.id } });
    });
    await this.notifyLowStock(ctx.tenantId, from.branchId, from.id, [item.id]);
    return { transferred: true };
  }

  async movements(ctx: RequestContext, branchId?: string, itemId?: string) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, branchId);
    const rows = await this.prisma.stockMovement.findMany({
      where: { tenantId: ctx.tenantId, branchId: branch.id, ...(itemId ? { itemId } : {}) },
      include: { item: { select: { name: true, unit: true } }, warehouse: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({ ...r, quantity: n(r.quantity) }));
  }

  async getRecipe(ctx: RequestContext, productId: string) {
    await this.assertEnabled(ctx.tenantId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId } });
    if (!product) throw AppException.notFound('محصول');
    const rows = await this.prisma.recipeItem.findMany({
      where: { tenantId: ctx.tenantId, productId },
      include: { item: { select: { id: true, name: true, unit: true, unitCost: true } } },
      orderBy: { item: { name: 'asc' } },
    });
    return rows.map((r) => ({ id: r.id, itemId: r.itemId, quantity: n(r.quantity), item: r.item }));
  }

  async setRecipe(ctx: RequestContext, productId: string, input: RecipeInput) {
    await this.assertEnabled(ctx.tenantId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId } });
    if (!product) throw AppException.notFound('محصول');
    const uniqueIds = [...new Set(input.items.map((x) => x.itemId))];
    const count = await this.prisma.inventoryItem.count({ where: { tenantId: ctx.tenantId, id: { in: uniqueIds }, isActive: true } });
    if (count !== uniqueIds.length) throw AppException.validation('یک یا چند ماده اولیه معتبر نیست.');
    await this.prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { tenantId: ctx.tenantId, productId } });
      if (input.items.length) {
        await tx.recipeItem.createMany({ data: input.items.map((x) => ({ tenantId: ctx.tenantId, productId, itemId: x.itemId, quantity: x.quantity })) });
      }
    });
    return this.getRecipe(ctx, productId);
  }

  async suppliers(ctx: RequestContext) {
    await this.assertEnabled(ctx.tenantId);
    return this.prisma.supplier.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  async createSupplier(ctx: RequestContext, input: SupplierInput) {
    await this.assertEnabled(ctx.tenantId);
    return this.prisma.supplier.create({ data: { tenantId: ctx.tenantId, ...input } });
  }

  async updateSupplier(ctx: RequestContext, id: string, input: Partial<SupplierInput> & { isActive?: boolean }) {
    await this.assertEnabled(ctx.tenantId);
    const row = await this.prisma.supplier.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!row) throw AppException.notFound('تأمین‌کننده');
    return this.prisma.supplier.update({ where: { id, tenantId: ctx.tenantId }, data: input });
  }

  async purchaseOrders(ctx: RequestContext, branchId?: string) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, branchId);
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { tenantId: ctx.tenantId, branchId: branch.id },
      include: { supplier: true, warehouse: { select: { id: true, name: true } }, items: { include: { item: { select: { id: true, name: true, unit: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return rows.map((po) => ({ ...po, items: po.items.map((line) => ({ ...line, quantity: n(line.quantity), receivedQuantity: n(line.receivedQuantity) })) }));
  }

  async createPurchaseOrder(ctx: RequestContext, input: PurchaseOrderInput) {
    await this.assertEnabled(ctx.tenantId);
    const branch = await this.resolveBranch(ctx, input.branchId);
    const warehouse = input.warehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, tenantId: ctx.tenantId, branchId: branch.id } })
      : await this.getDefaultWarehouse(ctx.tenantId, branch.id);
    if (!warehouse) throw AppException.notFound('انبار');
    if (input.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, tenantId: ctx.tenantId, isActive: true } });
      if (!supplier) throw AppException.notFound('تأمین‌کننده');
    }
    const ids = [...new Set(input.items.map((x) => x.itemId))];
    const count = await this.prisma.inventoryItem.count({ where: { tenantId: ctx.tenantId, id: { in: ids }, isActive: true } });
    if (count !== ids.length) throw AppException.validation('یک یا چند قلم سفارش خرید معتبر نیست.');
    const number = `PO-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: branch.id,
        warehouseId: warehouse.id,
        supplierId: input.supplierId ?? null,
        number,
        status: 'ORDERED',
        notes: input.notes ?? null,
        expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
        orderedAt: new Date(),
        createdById: ctx.userId,
        items: { create: input.items.map((x) => ({ itemId: x.itemId, quantity: x.quantity, unitCost: x.unitCost })) },
      },
      include: { items: true, supplier: true, warehouse: true },
    });
  }

  async receivePurchaseOrder(ctx: RequestContext, id: string, input: ReceivePurchaseOrderInput) {
    await this.assertEnabled(ctx.tenantId);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { items: true },
    });
    if (!po) throw AppException.notFound('سفارش خرید');
    if (['RECEIVED', 'CANCELLED'].includes(po.status)) throw AppException.conflict('این سفارش خرید قابل دریافت نیست.');

    const requested = new Map(input.items.map((x) => [x.itemId, x]));
    await this.prisma.$transaction(async (tx) => {
      for (const line of po.items) {
        const incoming = requested.get(line.itemId);
        if (!incoming) continue;
        const remaining = n(line.quantity) - n(line.receivedQuantity);
        if (incoming.quantity > remaining + 0.0001) throw AppException.validation('مقدار دریافتی از مقدار باقیمانده بیشتر است.');
        const unitCost = incoming.unitCost ?? line.unitCost;
        await tx.inventoryStock.upsert({
          where: { tenantId_warehouseId_itemId: { tenantId: ctx.tenantId, warehouseId: po.warehouseId, itemId: line.itemId } },
          create: { tenantId: ctx.tenantId, warehouseId: po.warehouseId, itemId: line.itemId, quantity: incoming.quantity },
          update: { quantity: { increment: incoming.quantity } },
        });
        await tx.purchaseOrderItem.update({ where: { id: line.id }, data: { receivedQuantity: { increment: incoming.quantity }, unitCost } });
        await tx.inventoryItem.update({ where: { id: line.itemId, tenantId: ctx.tenantId }, data: { unitCost } });
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: po.branchId,
            warehouseId: po.warehouseId,
            itemId: line.itemId,
            type: 'PURCHASE_RECEIPT',
            quantity: incoming.quantity,
            unitCost,
            reference: po.number,
            note: input.note ?? null,
            createdById: ctx.userId,
          },
        });
      }
      const lines = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const allDone = lines.every((line) => n(line.receivedQuantity) >= n(line.quantity) - 0.0001);
      await tx.purchaseOrder.update({ where: { id: po.id, tenantId: ctx.tenantId }, data: { status: allDone ? 'RECEIVED' : 'PARTIAL', ...(allDone ? { receivedAt: new Date() } : {}) } });
    });
    return this.purchaseOrders(ctx, po.branchId).then((rows) => rows.find((x) => x.id === id));
  }

  /** Deduct recipe quantities once when an order first reaches the kitchen. */
  async consumeOrder(tenantId: string, branchId: string, orderId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({ where: { tenantId }, select: { inventoryEnabled: true } });
    if (!restaurant?.inventoryEnabled) return;
    const already = await this.prisma.stockMovement.findFirst({ where: { tenantId, orderId, type: 'ORDER_CONSUMPTION' }, select: { id: true } });
    if (already) return;
    const warehouse = await this.getDefaultWarehouse(tenantId, branchId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, branchId },
      include: { items: { select: { productId: true, quantity: true } } },
    });
    if (!order) return;
    const productIds = [...new Set(order.items.map((x) => x.productId).filter((x): x is string => !!x))];
    if (!productIds.length) return;
    const recipes = await this.prisma.recipeItem.findMany({ where: { tenantId, productId: { in: productIds } } });
    if (!recipes.length) return;
    const qtyByProduct = new Map<string, number>();
    for (const line of order.items) if (line.productId) qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.quantity);
    const useByItem = new Map<string, number>();
    for (const recipe of recipes) {
      const quantity = n(recipe.quantity) * (qtyByProduct.get(recipe.productId) ?? 0);
      useByItem.set(recipe.itemId, (useByItem.get(recipe.itemId) ?? 0) + quantity);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [itemId, used] of useByItem) {
        if (used <= 0) continue;
        await tx.inventoryStock.upsert({
          where: { tenantId_warehouseId_itemId: { tenantId, warehouseId: warehouse.id, itemId } },
          create: { tenantId, warehouseId: warehouse.id, itemId, quantity: -used },
          update: { quantity: { decrement: used } },
        });
        await tx.stockMovement.create({
          data: { tenantId, branchId, warehouseId: warehouse.id, itemId, type: 'ORDER_CONSUMPTION', quantity: -used, orderId, reference: order.orderNumber },
        });
      }
    });
    await this.notifyLowStock(tenantId, branchId, warehouse.id, [...useByItem.keys()]);
  }

  /** Reverse the exact material movements if a consumed order is cancelled. */
  async rollbackOrder(tenantId: string, branchId: string, orderId: string) {
    const consumed = await this.prisma.stockMovement.findMany({ where: { tenantId, orderId, type: 'ORDER_CONSUMPTION' } });
    if (!consumed.length) return;
    const rolledBack = await this.prisma.stockMovement.findFirst({ where: { tenantId, orderId, type: 'ORDER_ROLLBACK' }, select: { id: true } });
    if (rolledBack) return;
    await this.prisma.$transaction(async (tx) => {
      for (const movement of consumed) {
        const quantity = Math.abs(n(movement.quantity));
        await tx.inventoryStock.upsert({
          where: { tenantId_warehouseId_itemId: { tenantId, warehouseId: movement.warehouseId, itemId: movement.itemId } },
          create: { tenantId, warehouseId: movement.warehouseId, itemId: movement.itemId, quantity },
          update: { quantity: { increment: quantity } },
        });
        await tx.stockMovement.create({
          data: { tenantId, branchId, warehouseId: movement.warehouseId, itemId: movement.itemId, type: 'ORDER_ROLLBACK', quantity, orderId, reference: movement.reference, note: 'برگشت خودکار به علت لغو سفارش' },
        });
      }
    });
  }

  private async notifyLowStock(tenantId: string, branchId: string, warehouseId: string, itemIds: string[]) {
    if (!itemIds.length) return;
    const rows = await this.prisma.inventoryItem.findMany({
      where: { tenantId, id: { in: itemIds }, isActive: true, trackStock: true },
      include: { stocks: { where: { warehouseId } } },
    });
    const low = rows.filter((item) => n(item.stocks[0]?.quantity) <= n(item.lowStockThreshold));
    if (!low.length) return;
    const recipients = await this.notifications.staffRecipients(tenantId, branchId, ['OWNER', 'MANAGER']);
    for (const item of low) {
      const quantity = n(item.stocks[0]?.quantity);
      // Avoid a notification storm: at most one low-stock alert per item/hour.
      const recent = await this.prisma.notification.findFirst({
        where: { tenantId, branchId, entityId: item.id, type: NotificationType.INVENTORY_LOW, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
        select: { id: true },
      });
      if (recent) continue;
      await this.notifications.createMany(recipients.map((userId) => ({
        tenantId,
        branchId,
        userId,
        type: NotificationType.INVENTORY_LOW,
        title: `موجودی «${item.name}» کم است`,
        body: `موجودی فعلی: ${quantity.toLocaleString('fa-IR')} ${item.unit}`,
        entityId: item.id,
      })));
    }
  }
}
