import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVE_ORDER_STATUSES,
  NotificationType,
  RealtimeEvent,
  WAITER_CALL_REASON_LABELS_FA,
  WaiterCallStatus,
  toPersianDigits,
  type FeedbackSummary,
  type OrderFeedbackDto,
  type WaiterCallDto,
} from '@restaurant-os/types';
import type {
  CreateFeedbackInput,
  CreateWaiterCallInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import { minutesBetween } from '../../common/utils/time.util';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { NotificationsService } from '../notifications/notifications.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

@Injectable()
export class GuestService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Waiter calls                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * A guest calls for service from their table.
   *
   * Anonymous by design - the QR code is the only credential. An existing open
   * call is returned rather than duplicated, so hammering the button does not
   * flood the counter.
   */
  async callWaiter(slug: string, input: CreateWaiterCallInput) {
    const resolved = await this.restaurants.findPublicBySlug(slug);

    return runAsSystem('guest waiter call', async () => {
      const table = await this.prisma.restaurantTable.findFirst({
        where: {
          id: input.tableId,
          tenantId: resolved.tenantId,
          branchId: resolved.branchId,
        },
        select: { id: true, number: true, name: true },
      });
      if (!table) throw AppException.notFound('میز');

      // Collapse repeat taps into the one call the floor already sees.
      const existing = await this.prisma.waiterCall.findFirst({
        where: {
          tenantId: resolved.tenantId,
          tableId: table.id,
          status: { in: [WaiterCallStatus.OPEN, WaiterCallStatus.ACKNOWLEDGED] },
          reason: input.reason,
        },
      });
      if (existing) {
        return { callId: existing.id, alreadyOpen: true, tableNumber: table.number };
      }

      const call = await this.prisma.waiterCall.create({
        data: {
          tenantId: resolved.tenantId,
          branchId: resolved.branchId,
          tableId: table.id,
          reason: input.reason,
          note: input.note ?? null,
        },
      });

      const label = WAITER_CALL_REASON_LABELS_FA[input.reason];
      const title = `میز ${toPersianDigits(table.number)}: ${label}`;

      // Push to whoever is on the floor right now...
      this.events.emit(RealtimeEvent.WAITER_CALLED, {
        tenantId: resolved.tenantId,
        branchId: resolved.branchId,
        callId: call.id,
        tableId: table.id,
        tableNumber: table.number,
        reason: input.reason,
        note: call.note,
        createdAt: call.createdAt.toISOString(),
      });

      // ...and leave a durable record for anyone who was not looking.
      const recipients = await this.notifications.staffRecipients(
        resolved.tenantId,
        resolved.branchId,
        ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'],
      );
      await this.notifications.createMany(
        recipients.map((userId) => ({
          tenantId: resolved.tenantId,
          branchId: resolved.branchId,
          userId,
          type: NotificationType.SYSTEM,
          title,
          body: call.note ?? label,
          entityId: call.id,
        })),
      );

      return { callId: call.id, alreadyOpen: false, tableNumber: table.number };
    });
  }

  /** Open calls for the counter, oldest first. */
  async listOpenCalls(
    ctx: RequestContext,
    branchId?: string,
  ): Promise<WaiterCallDto[]> {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const rows = await this.prisma.waiterCall.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: resolvedBranchId,
        status: { in: [WaiterCallStatus.OPEN, WaiterCallStatus.ACKNOWLEDGED] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        table: { select: { number: true, name: true } },
      },
    });

    const now = new Date();
    return rows.map((row) => ({
      id: row.id,
      tableId: row.tableId,
      tableNumber: row.table.number,
      tableName: row.table.name,
      reason: row.reason,
      status: row.status,
      note: row.note,
      acknowledgedByName: null,
      createdAt: row.createdAt.toISOString(),
      waitingMinutes: minutesBetween(row.createdAt, now),
    }));
  }

  async updateCall(
    ctx: RequestContext,
    id: string,
    status: 'ACKNOWLEDGED' | 'RESOLVED',
  ) {
    const call = await this.prisma.waiterCall.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!call) throw AppException.notFound('درخواست');

    const updated = await this.prisma.waiterCall.update({
      where: { id, tenantId: ctx.tenantId },
      data: {
        status,
        ...(status === WaiterCallStatus.ACKNOWLEDGED
          ? { acknowledgedById: ctx.userId, acknowledgedAt: new Date() }
          : { resolvedAt: new Date() }),
      },
    });

    this.events.emit(RealtimeEvent.WAITER_CALL_RESOLVED, {
      tenantId: ctx.tenantId,
      branchId: call.branchId,
      callId: id,
      status,
    });
    return { id: updated.id, status: updated.status };
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Rating submitted from the tracking page.
   *
   * The tracking token is the credential, and the unique index on orderId
   * means a guest can rate their order exactly once.
   */
  async submitFeedback(trackingToken: string, input: CreateFeedbackInput) {
    return runAsSystem('guest feedback by tracking token', async () => {
      const order = await this.prisma.order.findUnique({
        where: { trackingToken },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          status: true,
          customerPhone: true,
          feedback: { select: { id: true } },
        },
      });
      if (!order) throw AppException.notFound('سفارش');

      if (order.feedback) {
        throw AppException.conflict('برای این سفارش قبلاً نظر ثبت شده است.');
      }
      // Rating a meal that has not been served yet is meaningless.
      if (ACTIVE_ORDER_STATUSES.includes(order.status) && order.status !== 'SERVED' && order.status !== 'PICKED_UP') {
        throw AppException.conflict(
          'پس از تحویل سفارش می‌توانید نظر خود را ثبت کنید.',
        );
      }

      const created = await this.prisma.orderFeedback.create({
        data: {
          tenantId: order.tenantId,
          branchId: order.branchId,
          orderId: order.id,
          rating: input.rating,
          comment: input.comment ?? null,
          customerPhone: order.customerPhone,
        },
      });

      return { id: created.id, rating: created.rating };
    });
  }

  /** Ratings overview for the admin, plus the most recent comments. */
  async feedbackSummary(
    ctx: RequestContext,
    branchId?: string,
  ): Promise<FeedbackSummary> {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const where = { tenantId: ctx.tenantId, branchId: resolvedBranchId };

    const [aggregate, grouped, recent] = await Promise.all([
      this.prisma.orderFeedback.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.orderFeedback.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
      this.prisma.orderFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { order: { select: { orderNumber: true } } },
      }),
    ]);

    const counts = new Map(grouped.map((row) => [row.rating, row._count._all]));

    return {
      averageRating: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
      totalCount: aggregate._count._all,
      distribution: [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: counts.get(rating) ?? 0,
      })),
      recent: recent.map(
        (row): OrderFeedbackDto => ({
          id: row.id,
          orderId: row.orderId,
          orderNumber: row.order.orderNumber,
          rating: row.rating,
          comment: row.comment,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
    };
  }
}
