import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  TableStatus,
} from '@restaurant-os/types';

/**
 * Internal domain events.
 *
 * Order handling emits these; the realtime gateway, the notification service
 * and the SMS outbox subscribe. Keeping them decoupled means a failing SMS
 * provider can never roll back or block an order transaction.
 */
export const DomainEvent = {
  ORDER_CREATED: 'domain.order.created',
  ORDER_STATUS_CHANGED: 'domain.order.status_changed',
  ORDER_ITEMS_ADDED: 'domain.order.items_added',
  PAYMENT_RECORDED: 'domain.payment.recorded',
  PAYMENT_REFUNDED: 'domain.payment.refunded',
  TABLE_UPDATED: 'domain.table.updated',
} as const;

export interface OrderCreatedEvent {
  tenantId: string;
  branchId: string;
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  tableId: string | null;
  tableNumber: number | null;
  customerId: string | null;
  customerPhone: string | null;
  customerName: string | null;
  restaurantName: string;
  occurredAt: Date;
}

export interface OrderStatusChangedEvent {
  tenantId: string;
  branchId: string;
  orderId: string;
  orderNumber: string;
  type: OrderType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  tableId: string | null;
  customerId: string | null;
  customerPhone: string | null;
  restaurantName: string;
  trackingToken: string;
  total: number;
  /** Whether the branch has SMS notifications switched on. */
  smsEnabled: boolean;
  actorUserId: string | null;
  occurredAt: Date;
}

export interface OrderItemsAddedEvent {
  tenantId: string;
  branchId: string;
  orderId: string;
  orderNumber: string;
  addedCount: number;
  total: number;
  occurredAt: Date;
}

export interface PaymentRecordedEvent {
  tenantId: string;
  branchId: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  paidTotal: number;
  orderTotal: number;
  customerId: string | null;
  occurredAt: Date;
}

export interface TableUpdatedEvent {
  tenantId: string;
  branchId: string;
  tableId: string;
  status: TableStatus;
  activeOrderId: string | null;
  occurredAt: Date;
}
