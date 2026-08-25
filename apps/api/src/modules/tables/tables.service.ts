import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVE_ORDER_STATUSES,
  AuditAction,
  TableStatus,
  type TableDto,
} from '@restaurant-os/types';
import type {
  CreateTableInput,
  UpdateTableInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { DomainEvent, type TableUpdatedEvent } from '../../events/domain-events';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

@Injectable()
export class TablesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly restaurants: RestaurantsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(ctx: RequestContext, branchId?: string): Promise<TableDto[]> {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const restaurant = await this.restaurants.getRestaurantEntity(ctx.tenantId);

    const tables = await this.prisma.restaurantTable.findMany({
      where: { tenantId: ctx.tenantId, branchId: resolvedBranchId },
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: { status: { in: ACTIVE_ORDER_STATUSES } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
            _count: { select: { items: true } },
          },
        },
      },
    });

    return tables.map((table) => {
      const active = table.orders[0];
      return {
        id: table.id,
        branchId: table.branchId,
        number: table.number,
        name: table.name,
        capacity: table.capacity,
        status: table.status,
        zone: table.zone,
        activeOrder: active
          ? {
              id: active.id,
              orderNumber: active.orderNumber,
              status: active.status,
              total: active.total,
              itemCount: active._count.items,
              openedAt: active.createdAt.toISOString(),
            }
          : null,
        qrUrl: `${this.config.appUrl.replace(/\/$/, '')}/r/${restaurant.slug}/t/${table.number}`,
      };
    });
  }

  async create(ctx: RequestContext, input: CreateTableInput, branchId?: string) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const clash = await this.prisma.restaurantTable.findFirst({
      where: { tenantId: ctx.tenantId, branchId: resolvedBranchId, number: input.number },
      select: { id: true },
    });
    if (clash) throw AppException.conflict(`میز شماره ${input.number} از قبل وجود دارد.`);

    const created = await this.prisma.restaurantTable.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: resolvedBranchId,
        number: input.number,
        name: input.name ?? null,
        capacity: input.capacity,
        zone: input.zone ?? null,
      },
    });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'RestaurantTable',
      entityId: created.id,
      metadata: { number: created.number },
    });
    return created;
  }

  /** Creates a whole floor plan in one call, skipping numbers already taken. */
  async bulkCreate(
    ctx: RequestContext,
    input: { from: number; to: number; capacity: number; zone?: string | null },
    branchId?: string,
  ) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const existing = await this.prisma.restaurantTable.findMany({
      where: { tenantId: ctx.tenantId, branchId: resolvedBranchId },
      select: { number: true },
    });
    const taken = new Set(existing.map((t) => t.number));

    const rows = [];
    for (let number = input.from; number <= input.to; number += 1) {
      if (taken.has(number)) continue;
      rows.push({
        tenantId: ctx.tenantId,
        branchId: resolvedBranchId,
        number,
        capacity: input.capacity,
        zone: input.zone ?? null,
      });
    }
    if (rows.length > 0) {
      await this.prisma.restaurantTable.createMany({ data: rows });
    }
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'RestaurantTable',
      metadata: { created: rows.length, from: input.from, to: input.to },
    });
    return { created: rows.length, skipped: input.to - input.from + 1 - rows.length };
  }

  async update(ctx: RequestContext, id: string, input: UpdateTableInput) {
    const table = await this.getOwned(ctx, id);

    if (input.number != null && input.number !== table.number) {
      const clash = await this.prisma.restaurantTable.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: table.branchId,
          number: input.number,
          id: { not: id },
        },
        select: { id: true },
      });
      if (clash) throw AppException.conflict(`میز شماره ${input.number} از قبل وجود دارد.`);
    }

    // Freeing a table by hand must also drop the pointer to its old order.
    const clearingActiveOrder =
      input.status === TableStatus.AVAILABLE || input.status === TableStatus.DISABLED;

    const updated = await this.prisma.restaurantTable.update({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.zone !== undefined ? { zone: input.zone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(clearingActiveOrder ? { activeOrderId: null } : {}),
      },
    });

    this.emitTableUpdated(updated);
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'RestaurantTable',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return updated;
  }

  async remove(ctx: RequestContext, id: string) {
    const table = await this.getOwned(ctx, id);
    if (table.status === TableStatus.OCCUPIED) {
      throw AppException.conflict('میز اشغال است و قابل حذف نیست.');
    }
    await this.prisma.restaurantTable.delete({ where: { id, tenantId: ctx.tenantId } });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.DELETE,
      entity: 'RestaurantTable',
      entityId: id,
      metadata: { number: table.number },
    });
    return { deleted: true };
  }

  /**
   * Releases a table once its order is finished. Called from the order state
   * machine rather than by the UI, so a table can never be left stuck occupied
   * after an order completes.
   */
  async releaseIfFree(tenantId: string, tableId: string): Promise<void> {
    const stillOpen = await this.prisma.order.count({
      where: { tenantId, tableId, status: { in: ACTIVE_ORDER_STATUSES } },
    });
    if (stillOpen > 0) return;

    const updated = await this.prisma.restaurantTable.update({
      where: { id: tableId, tenantId },
      data: { status: TableStatus.AVAILABLE, activeOrderId: null },
    });
    this.emitTableUpdated(updated);
  }

  /** Marks a table occupied and points it at the order that just opened. */
  async occupy(tenantId: string, tableId: string, orderId: string): Promise<void> {
    const updated = await this.prisma.restaurantTable.update({
      where: { id: tableId, tenantId },
      data: { status: TableStatus.OCCUPIED, activeOrderId: orderId },
    });
    this.emitTableUpdated(updated);
  }

  /** Order is served and the bill is out: the counter is waiting on payment. */
  async markWaitingPayment(tenantId: string, tableId: string): Promise<void> {
    const updated = await this.prisma.restaurantTable.update({
      where: { id: tableId, tenantId },
      data: { status: TableStatus.WAITING_PAYMENT },
    });
    this.emitTableUpdated(updated);
  }

  private emitTableUpdated(table: {
    id: string;
    tenantId: string;
    branchId: string;
    status: string;
    activeOrderId: string | null;
  }): void {
    const payload: TableUpdatedEvent = {
      tenantId: table.tenantId,
      branchId: table.branchId,
      tableId: table.id,
      status: table.status as TableUpdatedEvent['status'],
      activeOrderId: table.activeOrderId,
      occurredAt: new Date(),
    };
    this.events.emit(DomainEvent.TABLE_UPDATED, payload);
  }

  private async getOwned(ctx: RequestContext, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!table) throw AppException.notFound('میز');
    if (ctx.branchId && table.branchId !== ctx.branchId) {
      throw AppException.forbidden('این میز متعلق به شعبه شما نیست.');
    }
    return table;
  }
}
