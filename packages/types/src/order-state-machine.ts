import { OrderStatus, OrderType } from './enums';

/**
 * The single source of truth for order lifecycle transitions.
 *
 * The backend enforces this on every `PATCH /orders/:id/status` call and the
 * frontend uses the very same table to decide which action buttons to render,
 * so the UI can never offer a transition the API would reject.
 *
 * Dine-in:  PENDING -> CONFIRMED -> SENT_TO_KITCHEN -> PREPARING -> READY -> SERVED -> COMPLETED
 * Takeaway: PENDING -> CONFIRMED -> SENT_TO_KITCHEN -> PREPARING -> READY_FOR_PICKUP -> PICKED_UP -> COMPLETED
 */
const SHARED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SENT_TO_KITCHEN, OrderStatus.CANCELLED],
  [OrderStatus.SENT_TO_KITCHEN]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  // Terminal / type-specific states are filled in per order type below.
  [OrderStatus.PREPARING]: [OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.CANCELLED],
  [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.CANCELLED],
  [OrderStatus.SERVED]: [],
  [OrderStatus.PICKED_UP]: [],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

const DINE_IN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  ...SHARED_TRANSITIONS,
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
  [OrderStatus.SERVED]: [OrderStatus.COMPLETED],
};

const TAKEAWAY_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  ...SHARED_TRANSITIONS,
  [OrderStatus.PREPARING]: [
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY_FOR_PICKUP]: [
    OrderStatus.PICKED_UP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PICKED_UP]: [OrderStatus.COMPLETED],
};

export function getTransitionTable(
  orderType: OrderType,
): Record<OrderStatus, OrderStatus[]> {
  // DELIVERY is architecturally reserved; it currently follows the takeaway
  // handoff shape until a dedicated courier lifecycle is introduced.
  return orderType === OrderType.DINE_IN
    ? DINE_IN_TRANSITIONS
    : TAKEAWAY_TRANSITIONS;
}

/** Statuses reachable from `from` for an order of the given type. */
export function getAllowedTransitions(
  orderType: OrderType,
  from: OrderStatus,
): OrderStatus[] {
  return getTransitionTable(orderType)[from] ?? [];
}

export function canTransition(
  orderType: OrderType,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return getAllowedTransitions(orderType, from).includes(to);
}

/** Terminal states never transition again. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/** Statuses the kitchen display system is responsible for. */
export const KITCHEN_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.SENT_TO_KITCHEN,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.READY_FOR_PICKUP,
];

/** Statuses that still occupy a table / count as "live" on the counter. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.SENT_TO_KITCHEN,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.SERVED,
  OrderStatus.PICKED_UP,
];

/**
 * Customer-facing tracking timeline. `READY`/`READY_FOR_PICKUP` and
 * `SERVED`/`PICKED_UP` collapse into a single visual step per order type.
 */
export function getTrackingSteps(orderType: OrderType): OrderStatus[] {
  return orderType === OrderType.DINE_IN
    ? [
        OrderStatus.PENDING,
        OrderStatus.SENT_TO_KITCHEN,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.SERVED,
      ]
    : [
        OrderStatus.PENDING,
        OrderStatus.SENT_TO_KITCHEN,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.PICKED_UP,
      ];
}

/** Rank used to decide how far along the tracking timeline an order is. */
const STATUS_PROGRESS: Record<OrderStatus, number> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.CONFIRMED]: 1,
  [OrderStatus.SENT_TO_KITCHEN]: 2,
  [OrderStatus.PREPARING]: 3,
  [OrderStatus.READY]: 4,
  [OrderStatus.READY_FOR_PICKUP]: 4,
  [OrderStatus.SERVED]: 5,
  [OrderStatus.PICKED_UP]: 5,
  [OrderStatus.COMPLETED]: 6,
  [OrderStatus.CANCELLED]: -1,
};

export function getStatusProgress(status: OrderStatus): number {
  return STATUS_PROGRESS[status] ?? 0;
}
