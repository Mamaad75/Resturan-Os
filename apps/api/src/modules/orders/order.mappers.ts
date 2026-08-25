import { Prisma } from '@prisma/client';
import {
  getAllowedTransitions,
  getStatusProgress,
  getTrackingSteps,
  ORDER_STATUS_LABELS_FA,
  OrderStatus,
  type OrderDto,
  type OrderSummaryDto,
  type OrderTrackingDto,
} from '@restaurant-os/types';

export const ORDER_DETAIL_INCLUDE = Prisma.validator<Prisma.OrderInclude>()({
  table: { select: { id: true, number: true, name: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: { modifiers: { orderBy: { createdAt: 'asc' } } },
  },
  payments: { orderBy: { createdAt: 'asc' } },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    include: { changedByUser: { select: { fullName: true } } },
  },
});

export const ORDER_SUMMARY_INCLUDE = Prisma.validator<Prisma.OrderInclude>()({
  table: { select: { id: true, number: true, name: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: { modifiers: { select: { nameFa: true } } },
  },
});

type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;
type OrderSummaryRow = Prisma.OrderGetPayload<{ include: typeof ORDER_SUMMARY_INCLUDE }>;

export function toOrderDto(row: OrderDetailRow): OrderDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    branchId: row.branchId,
    type: row.type,
    status: row.status,
    paymentStatus: row.paymentStatus,
    table: row.table
      ? { id: row.table.id, number: row.table.number, name: row.table.name }
      : null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    pickupAt: row.pickupAt?.toISOString() ?? null,
    notes: row.notes,
    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    taxTotal: row.taxTotal,
    serviceChargeTotal: row.serviceChargeTotal,
    total: row.total,
    paidTotal: row.paidTotal,
    currency: row.currency,
    itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId ?? '',
      productName: item.productName,
      productNameFa: item.productNameFa,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      modifiersTotal: item.modifiersTotal,
      lineTotal: item.lineTotal,
      notes: item.notes,
      modifiers: item.modifiers.map((modifier) => ({
        id: modifier.id,
        modifierOptionId: modifier.modifierOptionId ?? '',
        name: modifier.name,
        nameFa: modifier.nameFa,
        priceDelta: modifier.priceDelta,
      })),
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      provider: payment.provider,
      providerRef: payment.providerRef,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
    statusHistory: row.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedByUserId: entry.changedByUserId,
      changedByName: entry.changedByUser?.fullName ?? null,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
    })),
    allowedTransitions: getAllowedTransitions(row.type, row.status),
    estimatedReadyAt: row.estimatedReadyAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByUserId: row.createdById,
  };
}

export function toOrderSummaryDto(row: OrderSummaryRow): OrderSummaryDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    type: row.type,
    status: row.status,
    paymentStatus: row.paymentStatus,
    table: row.table
      ? { id: row.table.id, number: row.table.number, name: row.table.name }
      : null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    total: row.total,
    itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
    notes: row.notes,
    items: row.items.map((item) => ({
      id: item.id,
      productNameFa: item.productNameFa,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: item.modifiers.map((modifier) => modifier.nameFa),
    })),
    allowedTransitions: getAllowedTransitions(row.type, row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The customer's view of an order.
 *
 * Deliberately narrow: no internal ids, no staff names, no payment references -
 * only what the person who placed the order needs to see.
 */
export function toTrackingDto(
  row: OrderDetailRow,
  restaurantName: string,
  branchName: string,
  branchPhone: string | null,
): OrderTrackingDto {
  const steps = getTrackingSteps(row.type);
  const currentProgress = getStatusProgress(row.status);
  const isCancelled = row.status === OrderStatus.CANCELLED;

  // Match each timeline step to the moment it was actually reached.
  const reachedAt = new Map<OrderStatus, string>();
  for (const entry of row.statusHistory) {
    if (!reachedAt.has(entry.toStatus)) {
      reachedAt.set(entry.toStatus, entry.createdAt.toISOString());
    }
  }

  return {
    orderNumber: row.orderNumber,
    type: row.type,
    status: row.status,
    paymentStatus: row.paymentStatus,
    restaurantName,
    branchName,
    branchPhone,
    tableNumber: row.table?.number ?? null,
    customerName: row.customerName,
    items: row.items.map((item) => ({
      productNameFa: item.productNameFa,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      modifiers: item.modifiers.map((modifier) => modifier.nameFa),
    })),
    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    taxTotal: row.taxTotal,
    serviceChargeTotal: row.serviceChargeTotal,
    total: row.total,
    currency: row.currency,
    estimatedReadyAt: row.estimatedReadyAt?.toISOString() ?? null,
    steps: steps.map((status) => {
      const progress = getStatusProgress(status);
      return {
        status,
        label: ORDER_STATUS_LABELS_FA[status],
        reachedAt: reachedAt.get(status) ?? null,
        isCurrent: !isCancelled && progress === currentProgress,
        isComplete: !isCancelled && progress < currentProgress,
      };
    }),
    createdAt: row.createdAt.toISOString(),
  };
}
