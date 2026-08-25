import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationChannel,
  NotificationType,
  RealtimeEvent,
  type NotificationDto,
} from '@restaurant-os/types';
import { buildPaginationMeta, paginationArgs } from '../../common/utils/pagination.util';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';

export interface CreateNotificationInput {
  tenantId: string;
  branchId?: string | null;
  userId?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  type: NotificationType;
  channel?: NotificationChannel;
  title: string;
  body: string;
  entityId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateNotificationInput): Promise<NotificationDto> {
    const row = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId ?? null,
        userId: input.userId ?? null,
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        type: input.type,
        channel: input.channel ?? NotificationChannel.IN_APP,
        title: input.title,
        body: input.body,
        entityId: input.entityId ?? input.orderId ?? null,
      },
    });

    const dto = toDto(row);
    // Push it to whoever is connected right now; the row is the durable record.
    this.events.emit(RealtimeEvent.NOTIFICATION_CREATED, {
      tenantId: row.tenantId,
      branchId: row.branchId,
      userId: row.userId,
      orderId: row.orderId,
      notification: dto,
    });
    return dto;
  }

  async createMany(inputs: CreateNotificationInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const result = await this.prisma.notification.createMany({
      data: inputs.map((input) => ({
        tenantId: input.tenantId,
        branchId: input.branchId ?? null,
        userId: input.userId ?? null,
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        type: input.type,
        channel: input.channel ?? NotificationChannel.IN_APP,
        title: input.title,
        body: input.body,
        entityId: input.entityId ?? input.orderId ?? null,
      })),
    });
    return result.count;
  }

  /** Staff inbox for the signed-in user. */
  async listForUser(
    ctx: RequestContext,
    query: { page: number; pageSize: number; unreadOnly?: boolean },
  ) {
    const where = {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { tenantId: ctx.tenantId, userId: ctx.userId, readAt: null },
      }),
    ]);

    return {
      items: rows.map(toDto),
      meta: { ...buildPaginationMeta(query.page, query.pageSize, total), unread },
    };
  }

  /**
   * Notifications attached to one order, for the customer tracking page. The
   * caller has already proved possession of the order's tracking token.
   */
  async listForOrder(tenantId: string, orderId: string): Promise<NotificationDto[]> {
    const rows = await runAsSystem('customer notifications by order token', () =>
      this.prisma.notification.findMany({
        where: { tenantId, orderId, userId: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    return rows.map(toDto);
  }

  async markRead(
    ctx: RequestContext,
    input: { ids?: string[]; all?: boolean },
  ): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        readAt: null,
        ...(input.all ? {} : { id: { in: input.ids ?? [] } }),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Recipients for a branch event: everyone who works the floor there. */
  async staffRecipients(
    tenantId: string,
    branchId: string,
    roles: Array<'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN'>,
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: roles },
        // Unpinned admins (branchId null) see every branch.
        OR: [{ branchId }, { branchId: null }],
      },
      select: { id: true },
      take: 50,
    });
    return users.map((user) => user.id);
  }
}

function toDto(row: {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationType,
    channel: row.channel as NotificationChannel,
    title: row.title,
    body: row.body,
    entityId: row.entityId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
