import type { OrderStatus, PaymentStatus, TableStatus } from './enums';

/**
 * WebSocket event names. Staff clients join branch-scoped rooms; a customer
 * joins only the room for the single order their tracking token grants.
 */
export const RealtimeEvent = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_UPDATED: 'payment.updated',
  TABLE_UPDATED: 'table.updated',
  NOTIFICATION_CREATED: 'notification.created',
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** Room naming helpers - shared so server and client can never disagree. */
export const RealtimeRoom = {
  branch: (branchId: string) => `branch:${branchId}`,
  kitchen: (branchId: string) => `kitchen:${branchId}`,
  order: (orderId: string) => `order:${orderId}`,
  user: (userId: string) => `user:${userId}`,
} as const;

export interface OrderStatusChangedPayload {
  orderId: string;
  orderNumber: string;
  branchId: string;
  tableId: string | null;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedAt: string;
}

export interface OrderEventPayload {
  orderId: string;
  orderNumber: string;
  branchId: string;
  status: OrderStatus;
  total: number;
  occurredAt: string;
}

export interface PaymentUpdatedPayload {
  orderId: string;
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  occurredAt: string;
}

export interface TableUpdatedPayload {
  tableId: string;
  branchId: string;
  status: TableStatus;
  activeOrderId: string | null;
  occurredAt: string;
}

export interface NotificationCreatedPayload {
  notificationId: string;
  title: string;
  body: string;
  entityId: string | null;
  createdAt: string;
}
