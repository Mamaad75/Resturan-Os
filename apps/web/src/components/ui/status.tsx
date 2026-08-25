import {
  ORDER_STATUS_LABELS_FA,
  ORDER_TYPE_LABELS_FA,
  OrderStatus,
  OrderType,
  PAYMENT_METHOD_LABELS_FA,
  PAYMENT_STATUS_LABELS_FA,
  PaymentMethod,
  PaymentStatus,
  TABLE_STATUS_LABELS_FA,
  TableStatus,
  USER_ROLE_LABELS_FA,
  UserRole,
} from '@restaurant-os/types';
import { Badge, type BadgeTone } from './badge';

const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  [OrderStatus.PENDING]: 'caution',
  [OrderStatus.CONFIRMED]: 'info',
  [OrderStatus.SENT_TO_KITCHEN]: 'info',
  [OrderStatus.PREPARING]: 'gold',
  [OrderStatus.READY]: 'positive',
  [OrderStatus.READY_FOR_PICKUP]: 'positive',
  [OrderStatus.SERVED]: 'neutral',
  [OrderStatus.PICKED_UP]: 'neutral',
  [OrderStatus.COMPLETED]: 'neutral',
  [OrderStatus.CANCELLED]: 'critical',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_STATUS_TONE[status]} dot>
      {ORDER_STATUS_LABELS_FA[status]}
    </Badge>
  );
}

const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  [PaymentStatus.PENDING]: 'caution',
  [PaymentStatus.AUTHORIZED]: 'info',
  [PaymentStatus.PAID]: 'positive',
  [PaymentStatus.FAILED]: 'critical',
  [PaymentStatus.REFUNDED]: 'neutral',
  [PaymentStatus.CANCELLED]: 'neutral',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_STATUS_TONE[status]}>
      {PAYMENT_STATUS_LABELS_FA[status]}
    </Badge>
  );
}

const TABLE_STATUS_TONE: Record<TableStatus, BadgeTone> = {
  [TableStatus.AVAILABLE]: 'positive',
  [TableStatus.OCCUPIED]: 'gold',
  [TableStatus.WAITING_PAYMENT]: 'caution',
  [TableStatus.RESERVED]: 'info',
  [TableStatus.DISABLED]: 'neutral',
};

export function TableStatusBadge({ status }: { status: TableStatus }) {
  return <Badge tone={TABLE_STATUS_TONE[status]}>{TABLE_STATUS_LABELS_FA[status]}</Badge>;
}

export function OrderTypeBadge({ type }: { type: OrderType }) {
  return (
    <Badge tone={type === OrderType.DINE_IN ? 'info' : 'gold'}>
      {ORDER_TYPE_LABELS_FA[type]}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge tone={role === UserRole.OWNER ? 'gold' : 'neutral'}>
      {USER_ROLE_LABELS_FA[role]}
    </Badge>
  );
}

export function PaymentMethodLabel({ method }: { method: PaymentMethod }) {
  return <span>{PAYMENT_METHOD_LABELS_FA[method]}</span>;
}

export { TABLE_STATUS_TONE, ORDER_STATUS_TONE };
