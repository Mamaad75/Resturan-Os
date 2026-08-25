import {
  ACTIVE_ORDER_STATUSES,
  canTransition,
  getAllowedTransitions,
  getStatusProgress,
  getTrackingSteps,
  isTerminalStatus,
  KITCHEN_ACTIVE_STATUSES,
  OrderStatus,
  OrderType,
} from '@restaurant-os/types';

/**
 * The transition table is the contract between the API, the POS and the KDS.
 * If it drifts, invalid buttons appear in the UI and orders get stuck.
 */
describe('order state machine', () => {
  describe('dine-in lifecycle', () => {
    it('walks the full happy path', () => {
      const path: OrderStatus[] = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.SENT_TO_KITCHEN,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.SERVED,
        OrderStatus.COMPLETED,
      ];
      for (let i = 0; i < path.length - 1; i += 1) {
        expect(canTransition(OrderType.DINE_IN, path[i], path[i + 1])).toBe(true);
      }
    });

    it('rejects skipping the kitchen entirely', () => {
      expect(
        canTransition(OrderType.DINE_IN, OrderStatus.PENDING, OrderStatus.COMPLETED),
      ).toBe(false);
      expect(
        canTransition(
          OrderType.DINE_IN,
          OrderStatus.SENT_TO_KITCHEN,
          OrderStatus.COMPLETED,
        ),
      ).toBe(false);
    });

    it('rejects moving backwards', () => {
      expect(
        canTransition(OrderType.DINE_IN, OrderStatus.READY, OrderStatus.PREPARING),
      ).toBe(false);
    });

    it('does not offer the takeaway pickup states', () => {
      expect(
        canTransition(
          OrderType.DINE_IN,
          OrderStatus.PREPARING,
          OrderStatus.READY_FOR_PICKUP,
        ),
      ).toBe(false);
    });
  });

  describe('takeaway lifecycle', () => {
    it('walks the pickup path', () => {
      const path: OrderStatus[] = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.SENT_TO_KITCHEN,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.PICKED_UP,
        OrderStatus.COMPLETED,
      ];
      for (let i = 0; i < path.length - 1; i += 1) {
        expect(canTransition(OrderType.TAKEAWAY, path[i], path[i + 1])).toBe(true);
      }
    });

    it('does not offer the dine-in served state', () => {
      expect(
        canTransition(OrderType.TAKEAWAY, OrderStatus.PREPARING, OrderStatus.READY),
      ).toBe(false);
    });
  });

  describe('cancellation', () => {
    const cancellable = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.SENT_TO_KITCHEN,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ];

    it.each(cancellable)('allows cancelling from %s', (status) => {
      expect(canTransition(OrderType.DINE_IN, status, OrderStatus.CANCELLED)).toBe(true);
    });

    it('cannot cancel a served or completed order', () => {
      expect(
        canTransition(OrderType.DINE_IN, OrderStatus.SERVED, OrderStatus.CANCELLED),
      ).toBe(false);
      expect(
        canTransition(OrderType.DINE_IN, OrderStatus.COMPLETED, OrderStatus.CANCELLED),
      ).toBe(false);
    });
  });

  describe('terminal states', () => {
    it('has no way out of COMPLETED or CANCELLED', () => {
      expect(getAllowedTransitions(OrderType.DINE_IN, OrderStatus.COMPLETED)).toEqual([]);
      expect(getAllowedTransitions(OrderType.DINE_IN, OrderStatus.CANCELLED)).toEqual([]);
      expect(isTerminalStatus(OrderStatus.COMPLETED)).toBe(true);
      expect(isTerminalStatus(OrderStatus.CANCELLED)).toBe(true);
      expect(isTerminalStatus(OrderStatus.READY)).toBe(false);
    });

    it('excludes terminal states from the active set', () => {
      expect(ACTIVE_ORDER_STATUSES).not.toContain(OrderStatus.COMPLETED);
      expect(ACTIVE_ORDER_STATUSES).not.toContain(OrderStatus.CANCELLED);
    });
  });

  describe('kitchen scope', () => {
    it('only claims statuses the kitchen can actually act on', () => {
      expect(KITCHEN_ACTIVE_STATUSES).toEqual([
        OrderStatus.SENT_TO_KITCHEN,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.READY_FOR_PICKUP,
      ]);
      expect(KITCHEN_ACTIVE_STATUSES).not.toContain(OrderStatus.PENDING);
    });
  });

  describe('customer tracking timeline', () => {
    it('collapses the type-specific states into five steps', () => {
      expect(getTrackingSteps(OrderType.DINE_IN)).toHaveLength(5);
      expect(getTrackingSteps(OrderType.TAKEAWAY)).toHaveLength(5);
      expect(getTrackingSteps(OrderType.DINE_IN)).toContain(OrderStatus.SERVED);
      expect(getTrackingSteps(OrderType.TAKEAWAY)).toContain(OrderStatus.PICKED_UP);
    });

    it('ranks progress so equivalent states line up across order types', () => {
      expect(getStatusProgress(OrderStatus.READY)).toBe(
        getStatusProgress(OrderStatus.READY_FOR_PICKUP),
      );
      expect(getStatusProgress(OrderStatus.SERVED)).toBe(
        getStatusProgress(OrderStatus.PICKED_UP),
      );
      expect(getStatusProgress(OrderStatus.PREPARING)).toBeGreaterThan(
        getStatusProgress(OrderStatus.PENDING),
      );
      // Cancelled sits outside the forward timeline entirely.
      expect(getStatusProgress(OrderStatus.CANCELLED)).toBeLessThan(0);
    });
  });
});
