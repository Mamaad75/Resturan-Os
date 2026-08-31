import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVE_ORDER_STATUSES,
  ApiErrorCode,
  AuditAction,
  canTransition,
  getAllowedTransitions,
  KITCHEN_ACTIVE_STATUSES,
  ORDER_STATUS_LABELS_FA,
  OrderStatus,
  OrderType,
  PaymentStatus,
  ServiceMode,
  TableStatus,
  type OrderDto,
  type OrderSummaryDto,
  type OrderTrackingDto,
} from '@restaurant-os/types';
import type {
  AddOrderItemsInput,
  CreatePublicOrderInput,
  CreateStaffOrderInput,
  OrderQueryInput,
  UpdateOrderInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import { computeOrderTotals } from '../../common/utils/money.util';
import { buildPaginationMeta, paginationArgs } from '../../common/utils/pagination.util';
import { generateOpaqueToken } from '../../common/utils/token.util';
import type { RequestContext } from '../../common/types/request-context';
import {
  DomainEvent,
  type OrderCreatedEvent,
  type OrderItemsAddedEvent,
  type OrderStatusChangedEvent,
} from '../../events/domain-events';
import {
  PRISMA,
  type PrismaService,
  type PrismaTransaction,
} from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { TablesService } from '../tables/tables.service';
import {
  ORDER_DETAIL_INCLUDE,
  ORDER_SUMMARY_INCLUDE,
  toOrderDto,
  toOrderSummaryDto,
  toTrackingDto,
} from './order.mappers';
import { CouponsService } from '../coupons/coupons.service';
import { OrderPricingService, type ResolvedLine } from './order-pricing.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly tables: TablesService,
    private readonly pricing: OrderPricingService,
    private readonly coupons: CouponsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly plans: PlansService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Creation                                                            */
  /* ------------------------------------------------------------------ */

  /** Order placed by a customer from a QR menu. No account required. */
  async createPublicOrder(
    slug: string,
    input: CreatePublicOrderInput,
  ): Promise<{ order: OrderDto; trackingToken: string }> {
    const resolved = await this.restaurants.findPublicBySlug(slug);
    const settings = resolved.publicRestaurant.settings;

    if (!settings.serviceModes.includes(input.type as unknown as ServiceMode)) {
      throw new AppException(
        ApiErrorCode.SERVICE_MODE_DISABLED,
        'این نوع سفارش در حال حاضر فعال نیست.',
        409,
      );
    }
    if (!resolved.publicRestaurant.branch.isOpen) {
      throw new AppException(
        ApiErrorCode.SERVICE_MODE_DISABLED,
        'رستوران در حال حاضر بسته است.',
        409,
      );
    }

    await this.assertCanAcceptOrders(resolved.tenantId);

    // The customer is anonymous, so this whole path runs as a system scope
    // with the tenant pinned from the slug lookup.
    return runAsSystem('public order creation', () =>
      this.createOrder({
        tenantId: resolved.tenantId,
        branchId: resolved.branchId,
        input: { ...input, discountAmount: 0, sendToKitchen: false, couponCode: input.couponCode },
        actor: 'customer',
        actorUserId: null,
      }),
    );
  }

  /** Order entered by staff at the counter or by a waiter at the table. */
  async createStaffOrder(
    ctx: RequestContext,
    input: CreateStaffOrderInput,
    branchId?: string,
  ): Promise<{ order: OrderDto; trackingToken: string }> {
    await this.assertCanAcceptOrders(ctx.tenantId);

    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const result = await this.createOrder({
      tenantId: ctx.tenantId,
      branchId: resolvedBranchId,
      input,
      actor: 'staff',
      actorUserId: ctx.userId,
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'Order',
      entityId: result.order.id,
      metadata: {
        orderNumber: result.order.orderNumber,
        total: result.order.total,
        type: result.order.type,
      },
    });
    return result;
  }

  /**
   * Gates every order, whoever placed it.
   *
   * Both the subscription check and the monthly cap live here rather than in a
   * guard, because the public path is anonymous - there is no session for a
   * guard to read a tenant from, and that is exactly the path a lapsed tenant's
   * customers would still be scanning QR codes on.
   */
  private async assertCanAcceptOrders(tenantId: string): Promise<void> {
    const { writable, status } = await this.plans.entitlements(tenantId);
    if (!writable) {
      throw new AppException(
        ApiErrorCode.SUBSCRIPTION_INACTIVE,
        status === 'SUSPENDED'
          ? 'ثبت سفارش برای این مجموعه موقتاً غیرفعال است.'
          : 'این مجموعه در حال حاضر سفارش نمی‌پذیرد.',
        402,
      );
    }
    await this.plans.requireCapacity(tenantId, 'maxMonthlyOrders');
  }

  private async createOrder(args: {
    tenantId: string;
    branchId: string;
    input: CreatePublicOrderInput & {
      discountAmount?: number;
      sendToKitchen?: boolean;
      couponCode?: string | null;
    };
    actor: 'customer' | 'staff';
    actorUserId: string | null;
  }): Promise<{ order: OrderDto; trackingToken: string }> {
    const { tenantId, branchId, input, actor, actorUserId } = args;

    const restaurant = await this.restaurants.getRestaurantEntity(tenantId);
    const menuId = await this.restaurants.getOrCreateMenuId(tenantId, branchId);

    /*
     * Everything below happens in one transaction: validate the table, price
     * the lines from the live menu, allocate the order number, write the
     * order, its items, its modifiers and its status history, and seat the
     * table. Either all of it lands or none of it does - there is no state in
     * which an order exists without its items or a table is marked occupied by
     * an order that was never written.
     */
    const created = await this.prisma.$transaction(async (tx) => {
      let tableRow: { id: string; number: number; status: string } | null = null;
      if (input.type === OrderType.DINE_IN) {
        const table = await tx.restaurantTable.findFirst({
          where: { id: input.tableId!, tenantId, branchId },
          select: { id: true, number: true, status: true },
        });
        if (!table) throw AppException.notFound('میز');
        if (table.status === TableStatus.DISABLED) {
          throw new AppException(
            ApiErrorCode.TABLE_UNAVAILABLE,
            'این میز در حال حاضر غیرفعال است.',
            409,
          );
        }
        tableRow = table;
      }

      const lines = await this.pricing.resolveLines(tx, tenantId, menuId, input.items);

      /*
       * Coupons are evaluated inside the transaction on purpose: the usage
       * count checked here is the same row incremented on redemption below, so
       * two customers racing for the last redemption cannot both win.
       */
      // Reuse the pricing service's own line totals rather than re-deriving
      // them, so the coupon sees exactly the subtotal the order will carry.
      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      let couponDiscount = 0;
      let appliedCouponId: string | null = null;

      if (input.couponCode) {
        const evaluation = await this.coupons.evaluate(
          tx,
          tenantId,
          input.couponCode,
          subtotal,
          input.customerPhone ?? null,
        );
        if (!evaluation.valid) {
          throw AppException.validation(evaluation.reason ?? 'کد تخفیف معتبر نیست.', {
            couponCode: [evaluation.reason ?? 'کد تخفیف معتبر نیست.'],
          });
        }
        couponDiscount = evaluation.discount;
        appliedCouponId = evaluation.couponId;
      }

      const totals = computeOrderTotals(lines, {
        discountAmount: (input.discountAmount ?? 0) + couponDiscount,
        taxEnabled: restaurant.taxEnabled,
        taxRateBps: restaurant.taxRateBps,
        serviceChargeEnabled: restaurant.serviceChargeEnabled,
        serviceChargeBps: restaurant.serviceChargeBps,
      });

      const orderNumber = await nextOrderNumber(tx, branchId);
      const trackingToken = generateOpaqueToken(24);

      // Prep estimate is the slowest item on the ticket, never less than the
      // restaurant's configured floor.
      const slowestItem = Math.max(
        0,
        ...lines.map((line) => line.preparationMinutes ?? 0),
      );
      const prepMinutes = Math.max(slowestItem, restaurant.estimatedPrepMinutes);
      const now = new Date();

      // A customer order on an auto-confirm restaurant walks straight through
      // to the kitchen; otherwise it waits for the counter to accept it.
      const autoAdvance = input.sendToKitchen || restaurant.autoConfirmOrders;
      const finalStatus = autoAdvance
        ? OrderStatus.SENT_TO_KITCHEN
        : OrderStatus.PENDING;

      const customer = input.customerPhone
        ? await upsertCustomer(tx, tenantId, input.customerPhone, input.customerName)
        : null;

      const order = await tx.order.create({
        data: {
          tenantId,
          branchId,
          tableId: tableRow?.id ?? null,
          customerId: customer?.id ?? null,
          createdById: actorUserId,
          orderNumber,
          trackingToken,
          type: input.type,
          status: finalStatus,
          paymentStatus: PaymentStatus.PENDING,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          pickupAt: input.pickupAt ? new Date(input.pickupAt) : null,
          notes: input.notes ?? null,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          serviceChargeTotal: totals.serviceChargeTotal,
          total: totals.total,
          currency: restaurant.currency,
          estimatedReadyAt: new Date(now.getTime() + prepMinutes * 60_000),
          items: {
            create: lines.map((line) => ({
              tenantId,
              productId: line.productId,
              productName: line.productName,
              productNameFa: line.productNameFa,
              imageUrl: line.imageUrl,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              modifiersTotal: line.modifiersTotal,
              lineTotal: line.lineTotal,
              notes: line.notes,
              modifiers: {
                create: line.modifiers.map((modifier) => ({
                  tenantId,
                  modifierOptionId: modifier.modifierOptionId,
                  name: modifier.name,
                  nameFa: modifier.nameFa,
                  priceDelta: modifier.priceDelta,
                })),
              },
            })),
          },
          statusHistory: {
            create: buildInitialHistory(tenantId, finalStatus, actor, actorUserId),
          },
        },
        include: ORDER_DETAIL_INCLUDE,
      });

      if (appliedCouponId) {
        await this.coupons.redeem(tx, {
          tenantId,
          couponId: appliedCouponId,
          orderId: order.id,
          customerId: customer?.id ?? null,
          customerPhone: input.customerPhone ?? null,
          amount: couponDiscount,
        });
      }

      if (tableRow) {
        await tx.restaurantTable.update({
          where: { id: tableRow.id, tenantId },
          data: { status: TableStatus.OCCUPIED, activeOrderId: order.id },
        });
      }

      if (customer) {
        await tx.customer.update({
          where: { id: customer.id, tenantId },
          data: { ordersCount: { increment: 1 }, lastOrderAt: now },
        });
      }

      return { order, restaurantName: restaurant.name, tableNumber: tableRow?.number ?? null };
    });

    const dto = toOrderDto(created.order);

    // Events are emitted after the transaction commits, so no subscriber can
    // ever observe an order that later rolls back.
    const event: OrderCreatedEvent = {
      tenantId,
      branchId,
      orderId: created.order.id,
      orderNumber: created.order.orderNumber,
      trackingToken: created.order.trackingToken,
      type: created.order.type,
      status: created.order.status,
      total: created.order.total,
      tableId: created.order.tableId,
      tableNumber: created.tableNumber,
      customerId: created.order.customerId,
      customerPhone: created.order.customerPhone,
      customerName: created.order.customerName,
      restaurantName: created.restaurantName,
      occurredAt: new Date(),
    };
    this.events.emit(DomainEvent.ORDER_CREATED, event);

    // The initial auto-advance is itself a status change worth notifying on.
    if (created.order.status !== OrderStatus.PENDING) {
      this.emitStatusChanged({
        tenantId,
        branchId,
        order: created.order,
        fromStatus: OrderStatus.PENDING,
        toStatus: created.order.status,
        restaurantName: created.restaurantName,
        actorUserId,
      });
    }

    return { order: dto, trackingToken: created.order.trackingToken };
  }

  /* ------------------------------------------------------------------ */
  /* Mutation                                                            */
  /* ------------------------------------------------------------------ */

  /** Appends items to an order that is still open (a table adding a round). */
  async addItems(
    ctx: RequestContext,
    orderId: string,
    input: AddOrderItemsInput,
  ): Promise<OrderDto> {
    const existing = await this.getOwnedOrder(ctx, orderId);
    if (!ACTIVE_ORDER_STATUSES.includes(existing.status)) {
      throw AppException.invalidOrderState(
        'به سفارشی که بسته شده است نمی‌توان آیتم اضافه کرد.',
      );
    }
    if (existing.paymentStatus === PaymentStatus.PAID) {
      throw new AppException(
        ApiErrorCode.ORDER_ALREADY_PAID,
        'این سفارش تسویه شده است و قابل تغییر نیست.',
        409,
      );
    }

    const restaurant = await this.restaurants.getRestaurantEntity(ctx.tenantId);
    const menuId = await this.restaurants.getOrCreateMenuId(
      ctx.tenantId,
      existing.branchId,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const lines = await this.pricing.resolveLines(
        tx,
        ctx.tenantId,
        menuId,
        input.items,
      );

      for (const line of lines) {
        await tx.orderItem.create({
          data: {
            tenantId: ctx.tenantId,
            orderId,
            productId: line.productId,
            productName: line.productName,
            productNameFa: line.productNameFa,
            imageUrl: line.imageUrl,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            modifiersTotal: line.modifiersTotal,
            lineTotal: line.lineTotal,
            notes: line.notes,
            modifiers: {
              create: line.modifiers.map((modifier) => ({
                tenantId: ctx.tenantId,
                modifierOptionId: modifier.modifierOptionId,
                name: modifier.name,
                nameFa: modifier.nameFa,
                priceDelta: modifier.priceDelta,
              })),
            },
          },
        });
      }

      return recalculateTotals(tx, ctx.tenantId, orderId, restaurant);
    });

    const event: OrderItemsAddedEvent = {
      tenantId: ctx.tenantId,
      branchId: existing.branchId,
      orderId,
      orderNumber: updated.orderNumber,
      addedCount: input.items.length,
      total: updated.total,
      occurredAt: new Date(),
    };
    this.events.emit(DomainEvent.ORDER_ITEMS_ADDED, event);

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'Order',
      entityId: orderId,
      metadata: { addedItems: input.items.length, newTotal: updated.total },
    });
    return toOrderDto(updated);
  }

  /**
   * The only path that changes an order's status.
   *
   * The transition table in `@restaurant-os/types` is authoritative: an
   * invalid jump is rejected with ORDER_INVALID_STATE, never silently applied.
   */
  async updateStatus(
    ctx: RequestContext,
    orderId: string,
    toStatus: OrderStatus,
    note?: string | null,
  ): Promise<OrderDto> {
    const existing = await this.getOwnedOrder(ctx, orderId);
    const fromStatus = existing.status;

    if (fromStatus === toStatus) {
      return this.get(ctx, orderId);
    }

    if (!canTransition(existing.type, fromStatus, toStatus)) {
      const allowed = getAllowedTransitions(existing.type, fromStatus)
        .map((status) => ORDER_STATUS_LABELS_FA[status])
        .join('، ');
      throw AppException.invalidOrderState(
        allowed
          ? `تغییر وضعیت از «${ORDER_STATUS_LABELS_FA[fromStatus]}» به «${ORDER_STATUS_LABELS_FA[toStatus]}» مجاز نیست. وضعیت‌های مجاز: ${allowed}`
          : `سفارش در وضعیت «${ORDER_STATUS_LABELS_FA[fromStatus]}» است و قابل تغییر نیست.`,
      );
    }

    // Completing an order that has not been paid for would silently lose money.
    if (
      toStatus === OrderStatus.COMPLETED &&
      existing.paymentStatus !== PaymentStatus.PAID
    ) {
      throw AppException.invalidOrderState(
        'برای تکمیل سفارش، ابتدا باید پرداخت ثبت شود.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: {
          tenantId: ctx.tenantId,
          orderId,
          fromStatus,
          toStatus,
          changedByUserId: ctx.userId,
          actor: 'staff',
          note: note ?? null,
        },
      });

      return tx.order.update({
        where: { id: orderId, tenantId: ctx.tenantId },
        data: {
          status: toStatus,
          ...(toStatus === OrderStatus.COMPLETED ? { completedAt: now } : {}),
          ...(toStatus === OrderStatus.CANCELLED ? { cancelledAt: now } : {}),
        },
        include: ORDER_DETAIL_INCLUDE,
      });
    });

    await this.applyTableSideEffects(ctx.tenantId, updated, toStatus);

    const restaurant = await this.restaurants.getRestaurantEntity(ctx.tenantId);
    this.emitStatusChanged({
      tenantId: ctx.tenantId,
      branchId: updated.branchId,
      order: updated,
      fromStatus,
      toStatus,
      restaurantName: restaurant.name,
      actorUserId: ctx.userId,
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.STATUS_CHANGE,
      entity: 'Order',
      entityId: orderId,
      metadata: { orderNumber: updated.orderNumber, fromStatus, toStatus, note },
    });

    return toOrderDto(updated);
  }

  async updateDetails(
    ctx: RequestContext,
    orderId: string,
    input: UpdateOrderInput,
  ): Promise<OrderDto> {
    const existing = await this.getOwnedOrder(ctx, orderId);
    if (existing.paymentStatus === PaymentStatus.PAID) {
      throw new AppException(
        ApiErrorCode.ORDER_ALREADY_PAID,
        'این سفارش تسویه شده است و قابل تغییر نیست.',
        409,
      );
    }

    const restaurant = await this.restaurants.getRestaurantEntity(ctx.tenantId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId, tenantId: ctx.tenantId },
        data: {
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.customerName !== undefined
            ? { customerName: input.customerName }
            : {}),
          ...(input.customerPhone !== undefined
            ? { customerPhone: input.customerPhone }
            : {}),
          ...(input.discountAmount !== undefined
            ? { discountTotal: input.discountAmount }
            : {}),
        },
      });
      // A changed discount has to flow through tax and service charge too.
      return recalculateTotals(tx, ctx.tenantId, orderId, restaurant, input.discountAmount);
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'Order',
      entityId: orderId,
      metadata: { fields: Object.keys(input) },
    });
    return toOrderDto(updated);
  }

  /* ------------------------------------------------------------------ */
  /* Queries                                                             */
  /* ------------------------------------------------------------------ */

  async list(ctx: RequestContext, query: OrderQueryInput, branchId?: string) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);

    const where = {
      tenantId: ctx.tenantId,
      branchId: resolvedBranchId,
      ...(query.activeOnly ? { status: { in: ACTIVE_ORDER_STATUSES } } : {}),
      ...(query.status?.length
        ? { status: { in: query.status as OrderStatus[] } }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.tableId ? { tableId: query.tableId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search } },
              { customerName: { contains: query.search, mode: 'insensitive' as const } },
              { customerPhone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: ORDER_SUMMARY_INCLUDE,
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map(toOrderSummaryDto),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async get(ctx: RequestContext, orderId: string): Promise<OrderDto> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!row) throw AppException.notFound('سفارش');
    if (ctx.branchId && row.branchId !== ctx.branchId) {
      throw AppException.forbidden('این سفارش متعلق به شعبه شما نیست.');
    }
    return toOrderDto(row);
  }

  /** Tickets the kitchen display is responsible for, oldest first. */
  async kitchenQueue(
    ctx: RequestContext,
    branchId?: string,
  ): Promise<OrderSummaryDto[]> {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const rows = await this.prisma.order.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: resolvedBranchId,
        status: { in: KITCHEN_ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
      include: ORDER_SUMMARY_INCLUDE,
    });
    return rows.map(toOrderSummaryDto);
  }

  /**
   * Customer tracking. The unguessable token is the entire authorisation
   * check: it grants access to exactly one order and nothing else.
   */
  async track(trackingToken: string): Promise<OrderTrackingDto> {
    const row = await runAsSystem('customer order tracking by token', () =>
      this.prisma.order.findUnique({
        where: { trackingToken },
        include: {
          ...ORDER_DETAIL_INCLUDE,
          branch: {
            select: { name: true, phone: true, restaurant: { select: { name: true } } },
          },
        },
      }),
    );
    if (!row) throw AppException.notFound('سفارش');

    return toTrackingDto(
      row,
      row.branch.restaurant.name,
      row.branch.name,
      row.branch.phone,
    );
  }

  /** Resolves the order id behind a tracking token, for the websocket room. */
  async resolveTrackingToken(
    trackingToken: string,
  ): Promise<{ orderId: string; tenantId: string } | null> {
    const row = await runAsSystem('resolve tracking token for realtime', () =>
      this.prisma.order.findUnique({
        where: { trackingToken },
        select: { id: true, tenantId: true },
      }),
    );
    return row ? { orderId: row.id, tenantId: row.tenantId } : null;
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private async getOwnedOrder(ctx: RequestContext, orderId: string) {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      select: {
        id: true,
        branchId: true,
        status: true,
        type: true,
        paymentStatus: true,
        tableId: true,
      },
    });
    if (!row) throw AppException.notFound('سفارش');
    if (ctx.branchId && row.branchId !== ctx.branchId) {
      throw AppException.forbidden('این سفارش متعلق به شعبه شما نیست.');
    }
    return row;
  }

  /** Keeps table state in step with the order lifecycle. */
  private async applyTableSideEffects(
    tenantId: string,
    order: { id: string; tableId: string | null; paymentStatus: PaymentStatus },
    toStatus: OrderStatus,
  ): Promise<void> {
    if (!order.tableId) return;

    if (toStatus === OrderStatus.COMPLETED || toStatus === OrderStatus.CANCELLED) {
      await this.tables.releaseIfFree(tenantId, order.tableId);
      return;
    }
    if (
      toStatus === OrderStatus.SERVED &&
      order.paymentStatus !== PaymentStatus.PAID
    ) {
      await this.tables.markWaitingPayment(tenantId, order.tableId);
    }
  }

  private emitStatusChanged(args: {
    tenantId: string;
    branchId: string;
    order: {
      id: string;
      orderNumber: string;
      type: OrderType;
      tableId: string | null;
      customerId: string | null;
      customerPhone: string | null;
      trackingToken: string;
      total: number;
    };
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    restaurantName: string;
    actorUserId: string | null;
  }): void {
    void this.buildAndEmitStatusEvent(args);
  }

  private async buildAndEmitStatusEvent(args: {
    tenantId: string;
    branchId: string;
    order: {
      id: string;
      orderNumber: string;
      type: OrderType;
      tableId: string | null;
      customerId: string | null;
      customerPhone: string | null;
      trackingToken: string;
      total: number;
    };
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    restaurantName: string;
    actorUserId: string | null;
  }): Promise<void> {
    try {
      const restaurant = await this.restaurants.getRestaurantEntity(args.tenantId);
      const event: OrderStatusChangedEvent = {
        tenantId: args.tenantId,
        branchId: args.branchId,
        orderId: args.order.id,
        orderNumber: args.order.orderNumber,
        type: args.order.type,
        fromStatus: args.fromStatus,
        toStatus: args.toStatus,
        tableId: args.order.tableId,
        customerId: args.order.customerId,
        customerPhone: args.order.customerPhone,
        restaurantName: args.restaurantName,
        trackingToken: args.order.trackingToken,
        total: args.order.total,
        smsEnabled: restaurant.smsNotificationsEnabled,
        actorUserId: args.actorUserId,
        occurredAt: new Date(),
      };
      this.events.emit(DomainEvent.ORDER_STATUS_CHANGED, event);
    } catch (error) {
      this.logger.error(
        `Failed to emit status change for order ${args.order.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

/* -------------------------------------------------------------------- */
/* Transaction helpers                                                   */
/* -------------------------------------------------------------------- */

/**
 * Allocates the next order number for a branch.
 *
 * `UPDATE ... RETURNING` takes a row lock, so two customers submitting at the
 * same instant can never receive the same number.
 */
async function nextOrderNumber(
  tx: PrismaTransaction,
  branchId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ orderSequence: number }>>`
    UPDATE "branches"
       SET "orderSequence" = "orderSequence" + 1, "updatedAt" = NOW()
     WHERE "id" = ${branchId}::uuid
     RETURNING "orderSequence"
  `;
  if (!rows.length) throw AppException.notFound('شعبه');
  return String(rows[0].orderSequence);
}

function buildInitialHistory(
  tenantId: string,
  finalStatus: OrderStatus,
  actor: 'customer' | 'staff',
  actorUserId: string | null,
) {
  const entries: Array<{
    tenantId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actor: string;
    changedByUserId: string | null;
  }> = [
    {
      tenantId,
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      actor,
      changedByUserId: actorUserId,
    },
  ];

  // Record each intermediate hop so the tracking timeline stays truthful.
  if (finalStatus !== OrderStatus.PENDING) {
    entries.push({
      tenantId,
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      actor: 'system',
      changedByUserId: actorUserId,
    });
    entries.push({
      tenantId,
      fromStatus: OrderStatus.CONFIRMED,
      toStatus: OrderStatus.SENT_TO_KITCHEN,
      actor: 'system',
      changedByUserId: actorUserId,
    });
  }
  return entries;
}

async function upsertCustomer(
  tx: PrismaTransaction,
  tenantId: string,
  phone: string,
  name?: string | null,
) {
  return tx.customer.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: { tenantId, phone, name: name ?? null },
    update: name ? { name } : {},
    select: { id: true },
  });
}

/** Recomputes every derived amount on an order from its current items. */
async function recalculateTotals(
  tx: PrismaTransaction,
  tenantId: string,
  orderId: string,
  restaurant: {
    taxEnabled: boolean;
    taxRateBps: number;
    serviceChargeEnabled: boolean;
    serviceChargeBps: number;
  },
  discountOverride?: number,
) {
  const items = await tx.orderItem.findMany({
    where: { tenantId, orderId },
    select: { quantity: true, unitPrice: true, modifiersTotal: true },
  });
  const current = await tx.order.findFirstOrThrow({
    where: { id: orderId, tenantId },
    select: { discountTotal: true },
  });

  const totals = computeOrderTotals(items, {
    discountAmount: discountOverride ?? current.discountTotal,
    taxEnabled: restaurant.taxEnabled,
    taxRateBps: restaurant.taxRateBps,
    serviceChargeEnabled: restaurant.serviceChargeEnabled,
    serviceChargeBps: restaurant.serviceChargeBps,
  });

  return tx.order.update({
    where: { id: orderId, tenantId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      serviceChargeTotal: totals.serviceChargeTotal,
      total: totals.total,
    },
    include: ORDER_DETAIL_INCLUDE,
  });
}
