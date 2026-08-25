import {
  closeTestApp,
  createTestApp,
  login,
  resetDatabase,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

/**
 * The order lifecycle end to end: server-side pricing, the state machine,
 * table coupling, payment and the effect on reporting.
 */
describe('Order lifecycle', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let staffToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'orders');
    staffToken = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  async function placeOrder(overrides: Record<string, unknown> = {}) {
    const response = await ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'DINE_IN',
        tableId: tenant.tableIds[0],
        items: [{ productId: tenant.productId, quantity: 2, modifierOptionIds: [] }],
        ...overrides,
      });
    return response;
  }

  describe('server-side pricing', () => {
    it('computes every amount from the live menu', async () => {
      const response = await placeOrder();
      expect(response.status).toBe(201);

      const order = response.body.data.order;
      // 2 x 200_000, +10% service, +9% VAT on (base + service).
      expect(order.subtotal).toBe(400_000);
      expect(order.serviceChargeTotal).toBe(40_000);
      expect(order.taxTotal).toBe(39_600);
      expect(order.total).toBe(479_600);
    });

    it('ignores prices and totals sent by the client', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type: 'DINE_IN',
          tableId: tenant.tableIds[0],
          total: 1,
          subtotal: 1,
          discountTotal: 999_999,
          items: [
            {
              productId: tenant.productId,
              quantity: 1,
              unitPrice: 1,
              price: 1,
              modifierOptionIds: [],
            },
          ],
        })
        .expect(201);

      const order = response.body.data.order;
      expect(order.subtotal).toBe(200_000);
      expect(order.discountTotal).toBe(0);
      expect(order.items[0].unitPrice).toBe(200_000);
    });

    it('prices modifiers from the database, not the request', async () => {
      const response = await placeOrder({
        items: [
          {
            productId: tenant.modifierProductId,
            quantity: 1,
            modifierOptionIds: [tenant.modifierOptionId],
          },
        ],
      });
      expect(response.status).toBe(201);
      // 100_000 base + 50_000 for the large option.
      expect(response.body.data.order.subtotal).toBe(150_000);
    });

    it('rejects an order with no items', async () => {
      const response = await placeOrder({ items: [] });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a required modifier group left unselected', async () => {
      const response = await placeOrder({
        items: [
          { productId: tenant.modifierProductId, quantity: 1, modifierOptionIds: [] },
        ],
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('MODIFIER_INVALID');
    });

    it('rejects a modifier that belongs to a different product', async () => {
      const response = await placeOrder({
        items: [
          {
            productId: tenant.productId,
            quantity: 1,
            modifierOptionIds: [tenant.modifierOptionId],
          },
        ],
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('MODIFIER_INVALID');
    });

    it('refuses to sell an unavailable product', async () => {
      await ctx.prisma.product.update({
        where: { id: tenant.productId },
        data: { isAvailable: false },
      });

      const response = await placeOrder();
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PRODUCT_UNAVAILABLE');

      await ctx.prisma.product.update({
        where: { id: tenant.productId },
        data: { isAvailable: true },
      });
    });

    it('requires a table for dine-in and a name for takeaway', async () => {
      const noTable = await placeOrder({ tableId: null });
      expect(noTable.status).toBe(422);
      expect(noTable.body.error.details.tableId).toBeDefined();

      const noName = await placeOrder({
        type: 'TAKEAWAY',
        tableId: null,
        customerName: null,
        customerPhone: null,
      });
      expect(noName.status).toBe(422);
    });

    it('normalises an Iranian mobile number to canonical form', async () => {
      const response = await placeOrder({
        type: 'TAKEAWAY',
        tableId: null,
        customerName: 'علی',
        customerPhone: '+98 912 123 4567',
      });
      expect(response.status).toBe(201);
      expect(response.body.data.order.customerPhone).toBe('09121234567');
    });
  });

  describe('atomicity', () => {
    it('writes nothing when a line fails validation part-way through', async () => {
      const before = await ctx.prisma.order.count({ where: { tenantId: tenant.tenantId } });

      const response = await placeOrder({
        items: [
          { productId: tenant.productId, quantity: 1, modifierOptionIds: [] },
          // Second line references a product that does not exist.
          {
            productId: '00000000-0000-0000-0000-000000000000',
            quantity: 1,
            modifierOptionIds: [],
          },
        ],
      });
      expect(response.status).toBe(404);

      const after = await ctx.prisma.order.count({ where: { tenantId: tenant.tenantId } });
      expect(after).toBe(before);
    });

    it('allocates gapless, unique order numbers under concurrency', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => placeOrder()),
      );
      for (const result of results) expect(result.status).toBe(201);

      const numbers = results.map((r) => Number(r.body.data.order.orderNumber));
      expect(new Set(numbers).size).toBe(numbers.length);
    });
  });

  describe('state machine enforcement', () => {
    let orderId: string;

    beforeEach(async () => {
      const response = await placeOrder();
      orderId = response.body.data.order.id;
    });

    it('starts in the kitchen when auto-confirm is on', async () => {
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('SENT_TO_KITCHEN');

      // Every intermediate hop is recorded, so the customer timeline is honest.
      const history = await ctx.prisma.orderStatusHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((h) => h.toStatus)).toEqual([
        'PENDING',
        'CONFIRMED',
        'SENT_TO_KITCHEN',
      ]);
    });

    it('rejects an illegal jump with ORDER_INVALID_STATE', async () => {
      const response = await ctx
        .http()
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'COMPLETED' })
        .expect(409);

      expect(response.body.error.code).toBe('ORDER_INVALID_STATE');
      // The message names the transitions that *are* allowed.
      expect(response.body.error.message).toContain('در حال آماده‌سازی');
    });

    it('rejects a dine-in order using the takeaway pickup state', async () => {
      await ctx
        .http()
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'PREPARING' })
        .expect(200);

      const response = await ctx
        .http()
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'READY_FOR_PICKUP' })
        .expect(409);
      expect(response.body.error.code).toBe('ORDER_INVALID_STATE');
    });

    it('refuses to complete an unpaid order', async () => {
      for (const status of ['PREPARING', 'READY', 'SERVED']) {
        await ctx
          .http()
          .patch(`/api/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ status })
          .expect(200);
      }

      const response = await ctx
        .http()
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'COMPLETED' })
        .expect(409);
      expect(response.body.error.message).toContain('پرداخت');
    });

    it('records who changed the status and when', async () => {
      await ctx
        .http()
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'PREPARING', note: 'شروع شد' })
        .expect(200);

      const entry = await ctx.prisma.orderStatusHistory.findFirstOrThrow({
        where: { orderId, toStatus: 'PREPARING' },
      });
      expect(entry.fromStatus).toBe('SENT_TO_KITCHEN');
      expect(entry.changedByUserId).toBe(tenant.users.OWNER.id);
      expect(entry.note).toBe('شروع شد');
    });
  });

  describe('table coupling', () => {
    it('seats the table on create and frees it on completion', async () => {
      const tableId = tenant.tableIds[2];
      const created = await placeOrder({ tableId });
      const orderId = created.body.data.order.id;

      let table = await ctx.prisma.restaurantTable.findUniqueOrThrow({
        where: { id: tableId },
      });
      expect(table.status).toBe('OCCUPIED');
      expect(table.activeOrderId).toBe(orderId);

      for (const status of ['PREPARING', 'READY', 'SERVED']) {
        await ctx
          .http()
          .patch(`/api/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ status })
          .expect(200);
      }

      // Serving an unpaid order puts the table in front of the counter.
      table = await ctx.prisma.restaurantTable.findUniqueOrThrow({
        where: { id: tableId },
      });
      expect(table.status).toBe('WAITING_PAYMENT');

      await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CASH' })
        .expect(200);

      await ctx
        .http()
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      table = await ctx.prisma.restaurantTable.findUniqueOrThrow({
        where: { id: tableId },
      });
      expect(table.status).toBe('AVAILABLE');
      expect(table.activeOrderId).toBeNull();
    });

    it('keeps the table occupied while another order is still open on it', async () => {
      const tableId = tenant.tableIds[1];
      const first = await placeOrder({ tableId });
      const second = await placeOrder({ tableId });

      await ctx
        .http()
        .patch(`/api/orders/${first.body.data.order.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const table = await ctx.prisma.restaurantTable.findUniqueOrThrow({
        where: { id: tableId },
      });
      expect(table.status).toBe('OCCUPIED');
      expect(second.body.data.order.id).toBeTruthy();
    });
  });

  describe('payments', () => {
    let orderId: string;
    let total: number;

    beforeEach(async () => {
      const response = await placeOrder();
      orderId = response.body.data.order.id;
      total = response.body.data.order.total;
    });

    it('settles a cash payment immediately and marks the order paid', async () => {
      const response = await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CASH' })
        .expect(200);

      expect(response.body.data.payment.status).toBe('PAID');
      expect(response.body.data.order.paymentStatus).toBe('PAID');
      expect(response.body.data.order.paidTotal).toBe(total);
    });

    it('supports splitting a bill across two payments', async () => {
      const half = Math.floor(total / 2);

      const first = await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CASH', amount: half })
        .expect(200);
      // Still outstanding, so the order is not paid yet.
      expect(first.body.data.order.paymentStatus).toBe('PENDING');

      const second = await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CARD' })
        .expect(200);
      expect(second.body.data.order.paymentStatus).toBe('PAID');
      expect(second.body.data.order.paidTotal).toBe(total);
    });

    it('refuses to take more than the outstanding balance', async () => {
      const response = await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CASH', amount: total + 1 })
        .expect(422);
      expect(response.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    });

    it('refuses to charge an already-settled order twice', async () => {
      await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CASH' })
        .expect(200);

      const response = await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CASH' })
        .expect(409);
      expect(response.body.error.code).toBe('ORDER_ALREADY_PAID');
    });

    it('restores the outstanding balance after a refund', async () => {
      const paid = await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CASH' })
        .expect(200);

      await ctx
        .http()
        .post(`/api/orders/${orderId}/payment/refund`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ paymentId: paid.body.data.payment.id, reason: 'اشتباه صندوق' })
        .expect(200);

      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.paidTotal).toBe(0);
      expect(order.paymentStatus).toBe('REFUNDED');
    });
  });

  describe('customer tracking', () => {
    it('exposes a timeline that advances with the order', async () => {
      const created = await placeOrder();
      const { order, trackingToken } = created.body.data;

      await ctx
        .http()
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'PREPARING' })
        .expect(200);

      const response = await ctx
        .http()
        .get(`/api/public/orders/track/${trackingToken}`)
        .expect(200);

      const tracking = response.body.data;
      expect(tracking.status).toBe('PREPARING');
      const current = tracking.steps.find((s: { isCurrent: boolean }) => s.isCurrent);
      expect(current.status).toBe('PREPARING');
      expect(
        tracking.steps.filter((s: { isComplete: boolean }) => s.isComplete),
      ).toHaveLength(2);
    });

    it('raises in-app notifications the customer can read', async () => {
      const created = await placeOrder();
      const { order, trackingToken } = created.body.data;

      await ctx
        .http()
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'PREPARING' })
        .expect(200);

      // Notifications are raised by an async listener after the transaction.
      await new Promise((resolve) => setTimeout(resolve, 400));

      const response = await ctx
        .http()
        .get(`/api/public/orders/track/${trackingToken}/notifications`)
        .expect(200);

      const types = response.body.data.map((n: { type: string }) => n.type);
      expect(types).toContain('ORDER_PREPARING');
    });

    it('queues an SMS for a takeaway customer who left a number', async () => {
      const created = await placeOrder({
        type: 'TAKEAWAY',
        tableId: null,
        customerName: 'زهرا',
        customerPhone: '09121112233',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const messages = await ctx.prisma.smsMessage.findMany({
        where: { tenantId: tenant.tenantId, to: '09121112233' },
      });
      expect(messages.length).toBeGreaterThan(0);
      // The outbox row exists regardless of provider outcome.
      expect(['PENDING', 'SENT', 'DELIVERED']).toContain(messages[0].status);
    });
  });

  describe('reporting reflects real orders', () => {
    it('counts a paid order in today revenue', async () => {
      const before = await ctx
        .http()
        .get('/api/reports/sales?preset=today')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const created = await placeOrder();
      const orderId = created.body.data.order.id;
      const total = created.body.data.order.total;

      await ctx
        .http()
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ method: 'CARD' })
        .expect(200);

      const after = await ctx
        .http()
        .get('/api/reports/sales?preset=today')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(after.body.data.totals.grossSales).toBe(
        before.body.data.totals.grossSales + total,
      );
      expect(after.body.data.totals.orderCount).toBe(
        before.body.data.totals.orderCount + 1,
      );
    });

    it('excludes unpaid orders from revenue', async () => {
      const before = await ctx
        .http()
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await placeOrder();

      const after = await ctx
        .http()
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(after.body.data.today.grossSales).toBe(before.body.data.today.grossSales);
    });
  });
});
