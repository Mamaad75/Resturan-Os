import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@restaurant-os/types';
import type {
  AccountingSummaryQueryInput,
  CreateExpenseInput,
  ExpenseCategoryInput,
  ExpenseQueryInput,
  QuickPurchaseInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import {
  buildPaginationMeta,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { resolveReportRange } from '../../common/utils/time.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

/**
 * The headings a restaurant actually files its bills under.
 *
 * Seeded on first use rather than at signup, so a tenant that never opens
 * accounting carries no rows it did not ask for.
 */
const DEFAULT_CATEGORIES: Array<{ name: string; icon: string }> = [
  { name: 'اجاره', icon: 'Building2' },
  { name: 'آب', icon: 'Droplets' },
  { name: 'برق', icon: 'Zap' },
  { name: 'گاز', icon: 'Flame' },
  { name: 'اینترنت و تلفن', icon: 'Wifi' },
  { name: 'حقوق و دستمزد', icon: 'Users' },
  { name: 'تعمیر و نگهداری', icon: 'Wrench' },
  { name: 'تجهیزات', icon: 'Package' },
  { name: 'بسته‌بندی و یکبار‌مصرف', icon: 'ShoppingBag' },
  { name: 'تبلیغات', icon: 'Megaphone' },
  { name: 'مالیات و عوارض', icon: 'Landmark' },
  { name: 'حمل و نقل', icon: 'Truck' },
  { name: 'متفرقه', icon: 'MoreHorizontal' },
];

const n = (value: unknown): number => Number(value ?? 0);

/**
 * Money in and money out.
 *
 * Purchases are not duplicated here. A received purchase order already both
 * costs money and raises stock in the inventory domain, so this reads those
 * rows for the cost side rather than keeping a second copy that could drift
 * from the one the warehouse believes.
 */
@Injectable()
export class AccountingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /* ------------------------------------------------------------ categories */

  async categories(ctx: RequestContext) {
    const existing = await this.prisma.expenseCategory.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    if (existing.length > 0) return existing;

    await this.prisma.expenseCategory.createMany({
      data: DEFAULT_CATEGORIES.map((category, index) => ({
        tenantId: ctx.tenantId,
        name: category.name,
        icon: category.icon,
        isSystem: true,
        displayOrder: index,
      })),
      skipDuplicates: true,
    });
    return this.prisma.expenseCategory.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(ctx: RequestContext, input: ExpenseCategoryInput) {
    const clash = await this.prisma.expenseCategory.findFirst({
      where: { tenantId: ctx.tenantId, name: input.name },
    });
    if (clash) {
      throw AppException.validation('دسته‌ای با این نام وجود دارد.', {
        name: ['نام دسته تکراری است.'],
      });
    }
    return this.prisma.expenseCategory.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        icon: input.icon ?? null,
        displayOrder: input.displayOrder ?? 100,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateCategory(
    ctx: RequestContext,
    id: string,
    input: UpdateExpenseCategoryInput,
  ) {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('دسته هزینه');

    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async deleteCategory(ctx: RequestContext, id: string) {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('دسته هزینه');

    // Expenses keep their category for the report's sake, so a category in
    // use is retired rather than deleted.
    const used = await this.prisma.expense.count({
      where: { tenantId: ctx.tenantId, categoryId: id },
    });
    if (used > 0) {
      const row = await this.prisma.expenseCategory.update({
        where: { id },
        data: { isActive: false },
      });
      return { deleted: false, category: row };
    }
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { deleted: true, category: null };
  }

  /* -------------------------------------------------------------- expenses */

  async listExpenses(ctx: RequestContext, query: ExpenseQueryInput) {
    const range = resolveReportRange(query.preset, query.from, query.to);
    const where = {
      tenantId: ctx.tenantId,
      spentAt: { gte: range.from, lt: range.to },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, icon: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { spentAt: 'desc' },
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.expense.count({ where }),
    ]);

    /*
     * No range total here on purpose. The envelope interceptor only carries
     * `data` and `meta`, so an extra field would be silently dropped - and
     * `/accounting/summary` already owns that number.
     */
    return {
      items: rows.map(toExpenseDto),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async createExpense(ctx: RequestContext, input: CreateExpenseInput) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, tenantId: ctx.tenantId },
    });
    if (!category) throw AppException.notFound('دسته هزینه');

    const row = await this.prisma.expense.create({
      data: {
        tenantId: ctx.tenantId,
        categoryId: input.categoryId,
        branchId: input.branchId ?? ctx.branchId ?? null,
        supplierId: input.supplierId ?? null,
        title: input.title,
        amount: input.amount,
        spentAt: input.spentAt ? new Date(input.spentAt) : new Date(),
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        recurrence: input.recurrence,
        nextDueAt: nextOccurrence(
          input.recurrence,
          input.spentAt ? new Date(input.spentAt) : new Date(),
        ),
        createdById: ctx.userId,
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
    return toExpenseDto(row);
  }

  async updateExpense(ctx: RequestContext, id: string, input: UpdateExpenseInput) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('هزینه');

    if (input.categoryId) {
      const category = await this.prisma.expenseCategory.findFirst({
        where: { id: input.categoryId, tenantId: ctx.tenantId },
      });
      if (!category) throw AppException.notFound('دسته هزینه');
    }

    const spentAt = input.spentAt ? new Date(input.spentAt) : existing.spentAt;
    const recurrence = input.recurrence ?? existing.recurrence;

    const row = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.spentAt !== undefined ? { spentAt } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.attachmentUrl !== undefined
          ? { attachmentUrl: input.attachmentUrl }
          : {}),
        ...(input.recurrence !== undefined
          ? { recurrence, nextDueAt: nextOccurrence(recurrence, spentAt) }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
    return toExpenseDto(row);
  }

  async deleteExpense(ctx: RequestContext, id: string) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('هزینه');
    await this.prisma.expense.delete({ where: { id } });
    return { deleted: true };
  }

  /* ------------------------------------------------------------- purchases */

  /**
   * Record a purchase and stock it in one step.
   *
   * Creates the purchase order already received, so the warehouse and the
   * books are written by the same transaction. A line naming an item that
   * does not exist yet creates it - an owner holding a receipt should not
   * have to go and define "شیر" before they can record buying it.
   */
  async quickPurchase(ctx: RequestContext, input: QuickPurchaseInput) {
    const branchId = input.branchId ?? ctx.branchId;
    if (!branchId) {
      throw AppException.validation('شعبه مشخص نیست.');
    }

    /*
     * An owner holding a receipt should not have to go and invent a warehouse
     * first, so the inventory module's own resolver is reused - it creates the
     * branch's default warehouse when there is none.
     */
    const warehouse = input.warehouseId
      ? await this.prisma.warehouse.findFirst({
          where: { id: input.warehouseId, tenantId: ctx.tenantId },
        })
      : await this.inventory.getDefaultWarehouse(ctx.tenantId, branchId);
    if (!warehouse) throw AppException.notFound('انبار');

    const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      // Resolve every line to a real inventory item first, creating the ones
      // that are new, so the rest of the write has nothing left to decide.
      const resolved: Array<{ itemId: string; quantity: number; unitCost: number }> =
        [];
      for (const line of input.lines) {
        let itemId = line.itemId ?? null;
        if (itemId) {
          const owned = await tx.inventoryItem.findFirst({
            where: { id: itemId, tenantId: ctx.tenantId },
            select: { id: true },
          });
          if (!owned) throw AppException.notFound('کالای انبار');
        } else {
          const name = (line.name ?? '').trim();
          if (!name) {
            throw AppException.validation('نام کالا برای ردیف جدید الزامی است.', {
              lines: ['نام کالا را وارد کنید.'],
            });
          }
          const existing = await tx.inventoryItem.findFirst({
            where: { tenantId: ctx.tenantId, name },
            select: { id: true },
          });
          itemId =
            existing?.id ??
            (
              await tx.inventoryItem.create({
                data: {
                  tenantId: ctx.tenantId,
                  name,
                  unit: line.unit ?? 'UNIT',
                  unitCost: line.unitCost,
                },
                select: { id: true },
              })
            ).id;
        }
        resolved.push({
          itemId,
          quantity: line.quantity,
          unitCost: line.unitCost,
        });
      }

      const supplierId = await this.resolveSupplier(tx, ctx.tenantId, input);
      const number =
        input.invoiceNumber?.trim() ||
        `P-${Date.now().toString(36).toUpperCase()}`;

      const order = await tx.purchaseOrder.create({
        data: {
          tenantId: ctx.tenantId,
          branchId,
          warehouseId: warehouse.id,
          supplierId,
          number,
          status: 'RECEIVED',
          notes: input.note ?? null,
          orderedAt: purchasedAt,
          receivedAt: purchasedAt,
          createdById: ctx.userId,
          items: {
            create: resolved.map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              receivedQuantity: line.quantity,
              unitCost: line.unitCost,
            })),
          },
        },
        include: { items: true },
      });

      // Raise the stock and leave the audit trail the warehouse reads.
      for (const line of resolved) {
        await tx.inventoryStock.upsert({
          where: {
            tenantId_warehouseId_itemId: {
              tenantId: ctx.tenantId,
              warehouseId: warehouse.id,
              itemId: line.itemId,
            },
          },
          create: {
            tenantId: ctx.tenantId,
            warehouseId: warehouse.id,
            itemId: line.itemId,
            quantity: line.quantity,
          },
          update: { quantity: { increment: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: ctx.tenantId,
            branchId,
            warehouseId: warehouse.id,
            itemId: line.itemId,
            type: 'PURCHASE',
            quantity: line.quantity,
            unitCost: line.unitCost,
            reference: number,
            note: input.note ?? null,
            createdById: ctx.userId,
          },
        });
        // The latest price paid is the one a cost report should use.
        // `updateMany` so the tenant stays in the filter: a bare id would let
        // one tenant's purchase rewrite another tenant's costs.
        await tx.inventoryItem.updateMany({
          where: { id: line.itemId, tenantId: ctx.tenantId },
          data: { unitCost: line.unitCost },
        });
      }

      const total = resolved.reduce(
        (sum, line) => sum + Math.round(line.quantity * line.unitCost),
        0,
      );
      return {
        id: order.id,
        number,
        total,
        lineCount: resolved.length,
        purchasedAt: purchasedAt.toISOString(),
        warehouseId: warehouse.id,
      };
    });
  }

  private async resolveSupplier(
    tx: { supplier: { findFirst: Function; create: Function } },
    tenantId: string,
    input: QuickPurchaseInput,
  ): Promise<string | null> {
    if (input.supplierId) return input.supplierId;
    const name = input.supplierName?.trim();
    if (!name) return null;
    const existing = await tx.supplier.findFirst({
      where: { tenantId, name },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await tx.supplier.create({
      data: { tenantId, name },
      select: { id: true },
    });
    return created.id;
  }

  /* --------------------------------------------------------------- summary */

  /**
   * Revenue, cost of purchases, expenses and what is left.
   *
   * Revenue counts paid orders rather than placed ones: an unpaid order is not
   * money. Purchases count on the day they were received, which is the day the
   * stock and the obligation both arrived.
   */
  async summary(ctx: RequestContext, query: AccountingSummaryQueryInput) {
    const range = resolveReportRange(query.preset, query.from, query.to);
    const branchFilter = query.branchId ? { branchId: query.branchId } : {};

    const [revenue, expensesByCategory, expenseTotal, purchases] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: {
            tenantId: ctx.tenantId,
            ...branchFilter,
            paymentStatus: PaymentStatus.PAID,
            status: { not: OrderStatus.CANCELLED },
            createdAt: { gte: range.from, lt: range.to },
          },
          _sum: { total: true, deliveryFee: true },
          _count: { _all: true },
        }),
        this.prisma.expense.groupBy({
          by: ['categoryId'],
          where: {
            tenantId: ctx.tenantId,
            ...(query.branchId ? { branchId: query.branchId } : {}),
            spentAt: { gte: range.from, lt: range.to },
          },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            tenantId: ctx.tenantId,
            ...(query.branchId ? { branchId: query.branchId } : {}),
            spentAt: { gte: range.from, lt: range.to },
          },
          _sum: { amount: true },
        }),
        this.prisma.stockMovement.findMany({
          where: {
            tenantId: ctx.tenantId,
            ...branchFilter,
            type: 'PURCHASE',
            createdAt: { gte: range.from, lt: range.to },
          },
          select: { quantity: true, unitCost: true },
        }),
      ]);

    const purchaseTotal = purchases.reduce(
      (sum, row) => sum + Math.round(n(row.quantity) * n(row.unitCost)),
      0,
    );

    const categoryRows = await this.prisma.expenseCategory.findMany({
      where: {
        tenantId: ctx.tenantId,
        id: { in: expensesByCategory.map((row) => row.categoryId) },
      },
      select: { id: true, name: true, icon: true },
    });
    const categoryById = new Map(categoryRows.map((row) => [row.id, row]));

    const revenueTotal = n(revenue._sum.total);
    const expenses = n(expenseTotal._sum.amount);
    const costs = purchaseTotal + expenses;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      revenue: {
        total: revenueTotal,
        orderCount: revenue._count._all,
        deliveryFees: n(revenue._sum.deliveryFee),
      },
      purchases: { total: purchaseTotal, movementCount: purchases.length },
      expenses: {
        total: expenses,
        byCategory: expensesByCategory
          .map((row) => ({
            categoryId: row.categoryId,
            name: categoryById.get(row.categoryId)?.name ?? '—',
            icon: categoryById.get(row.categoryId)?.icon ?? null,
            total: n(row._sum.amount),
          }))
          .sort((a, b) => b.total - a.total),
      },
      costs,
      profit: revenueTotal - costs,
      /*
       * Basis points rather than a float, matching how every other rate in
       * the system is carried. Undefined margin on zero revenue reads as
       * zero rather than as a division by zero.
       */
      marginBps:
        revenueTotal > 0
          ? Math.round(((revenueTotal - costs) / revenueTotal) * 10_000)
          : 0,
    };
  }
}

/** The day a repeating cost next falls due. */
export function nextOccurrence(
  recurrence: string,
  from: Date,
): Date | null {
  const next = new Date(from.getTime());
  switch (recurrence) {
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      return next;
    case 'MONTHLY':
      return addMonthsClamped(next, 1);
    case 'QUARTERLY':
      return addMonthsClamped(next, 3);
    case 'YEARLY':
      return addMonthsClamped(next, 12);
    default:
      return null;
  }
}

/** 31 January + one month is the end of February, never 3 March. */
function addMonthsClamped(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

interface ExpenseRow {
  id: string;
  title: string;
  amount: number;
  spentAt: Date;
  method: string;
  reference: string | null;
  note: string | null;
  attachmentUrl: string | null;
  recurrence: string;
  nextDueAt: Date | null;
  branchId: string | null;
  category?: { id: string; name: string; icon: string | null } | null;
  supplier?: { id: string; name: string } | null;
}

function toExpenseDto(row: ExpenseRow) {
  return {
    id: row.id,
    title: row.title,
    amount: row.amount,
    spentAt: row.spentAt.toISOString(),
    method: row.method,
    reference: row.reference,
    note: row.note,
    attachmentUrl: row.attachmentUrl,
    recurrence: row.recurrence,
    nextDueAt: row.nextDueAt?.toISOString() ?? null,
    branchId: row.branchId,
    category: row.category ?? null,
    supplier: row.supplier ?? null,
  };
}
