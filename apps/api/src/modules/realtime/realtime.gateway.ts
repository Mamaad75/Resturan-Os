import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  permissionsForRole,
  Permission,
  RealtimeEvent,
  RealtimeRoom,
  type NotificationDto,
  type OrderEventPayload,
  type OrderStatusChangedPayload,
  type PaymentUpdatedPayload,
  type TableUpdatedPayload,
} from '@restaurant-os/types';
import type { Server, Socket } from 'socket.io';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import type { AccessTokenPayload } from '../../common/types/request-context';
import {
  DomainEvent,
  type OrderCreatedEvent,
  type OrderItemsAddedEvent,
  type OrderStatusChangedEvent,
  type PaymentRecordedEvent,
  type TableUpdatedEvent,
} from '../../events/domain-events';
import { OrdersService } from '../orders/orders.service';

/**
 * Realtime fan-out.
 *
 * Two kinds of client connect here and they are authorised completely
 * differently:
 *
 *  - Staff present an access token. They join their branch room, and the
 *    kitchen room only if their role actually carries kitchen permissions.
 *  - Customers present an order tracking token. They join exactly one room -
 *    the room for their own order - and can never subscribe to a branch.
 *
 * A socket that presents neither is disconnected immediately.
 */
@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly orders: OrdersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const { token, trackingToken } = readHandshake(client);

    try {
      if (trackingToken) {
        const resolved = await this.orders.resolveTrackingToken(trackingToken);
        if (!resolved) {
          return this.reject(client, 'invalid tracking token');
        }
        await client.join(RealtimeRoom.order(resolved.orderId));
        client.data.scope = 'customer';
        client.data.orderId = resolved.orderId;
        client.emit('connected', { scope: 'customer', orderId: resolved.orderId });
        return;
      }

      if (!token) return this.reject(client, 'missing credentials');

      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.auth.accessSecret,
      });
      const permissions = permissionsForRole(payload.role);

      client.data.scope = 'staff';
      client.data.userId = payload.sub;
      client.data.tenantId = payload.tid;
      client.data.branchId = payload.bid;

      await client.join(RealtimeRoom.user(payload.sub));
      if (payload.bid) {
        // Branch feed requires the ability to read orders at all.
        if (permissions.includes(Permission.ORDER_READ)) {
          await client.join(RealtimeRoom.branch(payload.bid));
        }
        if (permissions.includes(Permission.KITCHEN_READ)) {
          await client.join(RealtimeRoom.kitchen(payload.bid));
        }
      }
      client.emit('connected', { scope: 'staff', branchId: payload.bid });
    } catch (error) {
      this.reject(client, `handshake failed: ${(error as Error).message}`);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`socket ${client.id} disconnected`);
  }

  private reject(client: Socket, reason: string): void {
    this.logger.warn(`Rejecting socket ${client.id}: ${reason}`);
    client.emit('unauthorized', { reason });
    client.disconnect(true);
  }

  /* ------------------------------------------------------------------ */
  /* Domain event -> socket fan-out                                      */
  /* ------------------------------------------------------------------ */

  @OnEvent(DomainEvent.ORDER_CREATED)
  onOrderCreated(event: OrderCreatedEvent): void {
    const payload: OrderEventPayload = {
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      branchId: event.branchId,
      status: event.status,
      total: event.total,
      occurredAt: event.occurredAt.toISOString(),
    };
    this.server?.to(RealtimeRoom.branch(event.branchId)).emit(RealtimeEvent.ORDER_CREATED, payload);
    this.server?.to(RealtimeRoom.kitchen(event.branchId)).emit(RealtimeEvent.ORDER_CREATED, payload);
  }

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED)
  onOrderStatusChanged(event: OrderStatusChangedEvent): void {
    const payload: OrderStatusChangedPayload = {
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      branchId: event.branchId,
      tableId: event.tableId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      changedAt: event.occurredAt.toISOString(),
    };
    this.server
      ?.to(RealtimeRoom.branch(event.branchId))
      .emit(RealtimeEvent.ORDER_STATUS_CHANGED, payload);
    this.server
      ?.to(RealtimeRoom.kitchen(event.branchId))
      .emit(RealtimeEvent.ORDER_STATUS_CHANGED, payload);
    // This is what makes the customer's tracking page move without a refresh.
    this.server
      ?.to(RealtimeRoom.order(event.orderId))
      .emit(RealtimeEvent.ORDER_STATUS_CHANGED, payload);
  }

  @OnEvent(DomainEvent.ORDER_ITEMS_ADDED)
  onOrderItemsAdded(event: OrderItemsAddedEvent): void {
    const payload = {
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      branchId: event.branchId,
      addedCount: event.addedCount,
      total: event.total,
      occurredAt: event.occurredAt.toISOString(),
    };
    this.server?.to(RealtimeRoom.branch(event.branchId)).emit(RealtimeEvent.ORDER_UPDATED, payload);
    this.server?.to(RealtimeRoom.kitchen(event.branchId)).emit(RealtimeEvent.ORDER_UPDATED, payload);
    this.server?.to(RealtimeRoom.order(event.orderId)).emit(RealtimeEvent.ORDER_UPDATED, payload);
  }

  @OnEvent(DomainEvent.PAYMENT_RECORDED)
  onPaymentRecorded(event: PaymentRecordedEvent): void {
    const payload: PaymentUpdatedPayload = {
      orderId: event.orderId,
      paymentId: event.paymentId,
      status: event.status,
      amount: event.amount,
      occurredAt: event.occurredAt.toISOString(),
    };
    this.server
      ?.to(RealtimeRoom.branch(event.branchId))
      .emit(RealtimeEvent.PAYMENT_UPDATED, payload);
    this.server
      ?.to(RealtimeRoom.order(event.orderId))
      .emit(RealtimeEvent.PAYMENT_UPDATED, payload);
  }

  @OnEvent(DomainEvent.TABLE_UPDATED)
  onTableUpdated(event: TableUpdatedEvent): void {
    const payload: TableUpdatedPayload = {
      tableId: event.tableId,
      branchId: event.branchId,
      status: event.status,
      activeOrderId: event.activeOrderId,
      occurredAt: event.occurredAt.toISOString(),
    };
    this.server?.to(RealtimeRoom.branch(event.branchId)).emit(RealtimeEvent.TABLE_UPDATED, payload);
  }

  @OnEvent(RealtimeEvent.NOTIFICATION_CREATED)
  onNotificationCreated(event: {
    userId: string | null;
    orderId: string | null;
    notification: NotificationDto;
  }): void {
    // A notification goes to its owner only: a specific staff member, or the
    // order room the customer is watching.
    if (event.userId) {
      this.server
        ?.to(RealtimeRoom.user(event.userId))
        .emit(RealtimeEvent.NOTIFICATION_CREATED, event.notification);
    } else if (event.orderId) {
      this.server
        ?.to(RealtimeRoom.order(event.orderId))
        .emit(RealtimeEvent.NOTIFICATION_CREATED, event.notification);
    }
  }
}

/** Credentials may arrive in socket.io auth, a query param, or a header. */
function readHandshake(client: Socket): {
  token: string | null;
  trackingToken: string | null;
} {
  const auth = (client.handshake.auth ?? {}) as Record<string, unknown>;
  const query = client.handshake.query ?? {};

  const pickString = (value: unknown): string | null => {
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
  };

  const header = client.handshake.headers.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : null;

  return {
    token: pickString(auth.token) ?? pickString(query.token) ?? bearer,
    trackingToken:
      pickString(auth.trackingToken) ?? pickString(query.trackingToken),
  };
}
