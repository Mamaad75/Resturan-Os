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
 * The complete end-to-end scenario the product must support, driven through
 * the real HTTP API in one continuous flow:
 *
 *   owner signs in → sees dashboard → creates a product → product appears in
 *   the customer menu → customer scans a table QR → adds to cart → submits →
 *   order reaches the counter and the kitchen → kitchen advances it →
 *   customer is notified and sees the change → counter takes payment →
 *   receipt data is available → order completes → table frees → dashboard and
 *   reports reflect the sale.
 *
 * Kept as a single ordered suite on purpose: the value is in the whole chain
 * holding together, not in the individual steps.
 */
describe('Definition of done: full order journey', () => {
  let ctx: TestContext;
  let tenant: TestTenant;

  let ownerToken: string;
  let cashierToken: string;
  let kitchenToken: string;

  let newProductId: string;
  let largeOptionId: string;
  let tableId: string;
  let orderId: string;
  let orderNumber: string;
  let orderTotal: number;
  let trackingToken: string;

  let revenueBefore = 0;
  let ordersBefore = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'dod');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  it('1. the owner signs in', async () => {
    ownerToken = await login(ctx, tenant, 'OWNER');
    cashierToken = await login(ctx, tenant, 'CASHIER');
    kitchenToken = await login(ctx, tenant, 'KITCHEN');
    expect(ownerToken).toBeTruthy();
  });

  it('2. the owner sees a dashboard built from real data', async () => {
    const response = await ctx
      .http()
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const data = response.body.data;
    revenueBefore = data.today.grossSales;
    ordersBefore = data.today.orderCount;

    expect(Array.isArray(data.hourlySeries)).toBe(true);
    expect(Array.isArray(data.dailySeries)).toBe(true);
    expect(data.activeTables.total).toBe(tenant.tableIds.length);
  });

  it('3. the owner creates a product with a required modifier group', async () => {
    const response = await ctx
      .http()
      .post('/api/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        categoryId: tenant.categoryId,
        name: 'Saffron Latte',
        nameFa: 'لاته زعفرانی',
        descriptionFa: 'لاته با زعفران ایرانی',
        price: 210_000,
        isAvailable: true,
        isFeatured: true,
        modifierGroups: [
          {
            name: 'Size',
            nameFa: 'اندازه',
            type: 'SINGLE',
            isRequired: true,
            minSelect: 1,
            maxSelect: 1,
            displayOrder: 0,
            options: [
              { name: 'Medium', nameFa: 'متوسط', priceDelta: 0, isAvailable: true, displayOrder: 0 },
              { name: 'Large', nameFa: 'بزرگ', priceDelta: 40_000, isAvailable: true, displayOrder: 1 },
            ],
          },
        ],
      })
      .expect(201);

    newProductId = response.body.data.id;
    largeOptionId = response.body.data.modifierGroups[0].options.find(
      (option: { nameFa: string }) => option.nameFa === 'بزرگ',
    ).id;
    expect(largeOptionId).toBeTruthy();
  });

  it('4. the product appears immediately in the customer menu', async () => {
    const response = await ctx
      .http()
      .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu?table=1`)
      .expect(200);

    const products = response.body.data.categories.flatMap(
      (category: { products: unknown[] }) => category.products,
    );
    const found = products.find((p: { id: string }) => p.id === newProductId);

    expect(found).toBeDefined();
    expect(found.effectivePrice).toBe(210_000);
    // The QR path resolved the table, so the customer is seated.
    expect(response.body.data.restaurant.table.number).toBe(1);
    tableId = response.body.data.restaurant.table.id;
  });

  it('5. the customer submits a dine-in order from the QR menu', async () => {
    const response = await ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'DINE_IN',
        tableId,
        customerName: 'محمد تهرانی',
        customerPhone: '09351234567',
        notes: 'لطفاً کم‌شیرین',
        items: [
          {
            productId: newProductId,
            quantity: 2,
            notes: 'داغ',
            modifierOptionIds: [largeOptionId],
          },
          { productId: tenant.productId, quantity: 1, modifierOptionIds: [] },
        ],
      })
      .expect(201);

    const order = response.body.data.order;
    orderId = order.id;
    orderNumber = order.orderNumber;
    orderTotal = order.total;
    trackingToken = response.body.data.trackingToken;

    // (210 000 + 40 000) x 2 + 200 000
    expect(order.subtotal).toBe(700_000);
    expect(order.serviceChargeTotal).toBe(70_000);
    expect(order.taxTotal).toBe(69_300);
    expect(order.total).toBe(839_300);
    expect(order.status).toBe('SENT_TO_KITCHEN');
  });

  it('6. the order appears at the counter', async () => {
    const response = await ctx
      .http()
      .get('/api/orders?activeOnly=true&pageSize=50')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    expect(response.body.data.map((o: { id: string }) => o.id)).toContain(orderId);
  });

  it('7. the order appears in the kitchen with modifiers and notes intact', async () => {
    const response = await ctx
      .http()
      .get('/api/orders/kitchen/queue')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .expect(200);

    const ticket = response.body.data.find((o: { id: string }) => o.id === orderId);
    expect(ticket).toBeDefined();

    const line = ticket.items.find(
      (item: { productNameFa: string }) => item.productNameFa === 'لاته زعفرانی',
    );
    expect(line.modifiers).toContain('بزرگ');
    expect(line.notes).toBe('داغ');
    expect(ticket.notes).toBe('لطفاً کم‌شیرین');
  });

  it('8. the kitchen starts preparation', async () => {
    const response = await ctx
      .http()
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'PREPARING' })
      .expect(200);

    expect(response.body.data.status).toBe('PREPARING');
  });

  it('9. the customer receives an in-app notification and an SMS is queued', async () => {
    // Notifications are raised by an async listener after the transaction.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const notifications = await ctx
      .http()
      .get(`/api/public/orders/track/${trackingToken}/notifications`)
      .expect(200);

    const types = notifications.body.data.map((n: { type: string }) => n.type);
    expect(types).toContain('ORDER_CREATED');
    expect(types).toContain('ORDER_PREPARING');

    const messages = await ctx.prisma.smsMessage.findMany({
      where: { tenantId: tenant.tenantId, orderId },
    });
    expect(messages.length).toBeGreaterThan(0);
  });

  it('10. the kitchen marks the order ready', async () => {
    await ctx
      .http()
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'READY' })
      .expect(200);
  });

  it('11. the customer tracking page reflects READY', async () => {
    const response = await ctx
      .http()
      .get(`/api/public/orders/track/${trackingToken}`)
      .expect(200);

    const tracking = response.body.data;
    expect(tracking.status).toBe('READY');
    expect(
      tracking.steps.find((s: { isCurrent: boolean }) => s.isCurrent).status,
    ).toBe('READY');
    // Earlier steps are marked done, so the timeline reads correctly.
    expect(
      tracking.steps.filter((s: { isComplete: boolean }) => s.isComplete),
    ).toHaveLength(3);
  });

  it('12. the counter serves, and completing before payment is refused', async () => {
    await ctx
      .http()
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ status: 'SERVED' })
      .expect(200);

    const refused = await ctx
      .http()
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);
    expect(refused.body.error.code).toBe('ORDER_INVALID_STATE');

    // The table is now in front of the counter, awaiting settlement.
    const table = await ctx.prisma.restaurantTable.findUniqueOrThrow({
      where: { id: tableId },
    });
    expect(table.status).toBe('WAITING_PAYMENT');
  });

  it('13. the counter takes payment', async () => {
    const overpay = await ctx
      .http()
      .post(`/api/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ method: 'CARD', amount: orderTotal + 1 })
      .expect(422);
    expect(overpay.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');

    const paid = await ctx
      .http()
      .post(`/api/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ method: 'CARD', reference: '123456' })
      .expect(200);

    expect(paid.body.data.order.paymentStatus).toBe('PAID');
    expect(paid.body.data.order.paidTotal).toBe(orderTotal);
  });

  it('14. the receipt has everything needed to print', async () => {
    const response = await ctx
      .http()
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    const order = response.body.data;
    expect(order.orderNumber).toBe(orderNumber);
    expect(order.items).toHaveLength(2);
    expect(order.items[0].modifiers.length).toBeGreaterThan(0);
    expect(order.payments.some((p: { status: string }) => p.status === 'PAID')).toBe(true);
    expect(order.subtotal + order.serviceChargeTotal + order.taxTotal).toBe(order.total);
    // The full audit trail is available for the receipt footer and disputes.
    expect(order.statusHistory.length).toBeGreaterThanOrEqual(6);
  });

  it('15. the order completes and the table is released', async () => {
    await ctx
      .http()
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const table = await ctx.prisma.restaurantTable.findUniqueOrThrow({
      where: { id: tableId },
    });
    expect(table.status).toBe('AVAILABLE');
    expect(table.activeOrderId).toBeNull();

    const tables = await ctx
      .http()
      .get('/api/tables')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);
    const seen = tables.body.data.find((t: { id: string }) => t.id === tableId);
    expect(seen.activeOrder).toBeNull();
  });

  it('16. the dashboard reflects the sale', async () => {
    const response = await ctx
      .http()
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.data.today.grossSales).toBe(revenueBefore + orderTotal);
    expect(response.body.data.today.orderCount).toBe(ordersBefore + 1);
  });

  it('17. the reports include the order, its product and its payment method', async () => {
    const response = await ctx
      .http()
      .get('/api/reports/sales?preset=today&granularity=hour')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const report = response.body.data;
    expect(report.totals.orderCount).toBe(ordersBefore + 1);
    expect(report.totals.grossSales).toBe(revenueBefore + orderTotal);

    const product = report.topProducts.find(
      (p: { productId: string }) => p.productId === newProductId,
    );
    expect(product?.quantity).toBe(2);

    const card = report.breakdown.byPaymentMethod.find(
      (m: { method: string }) => m.method === 'CARD',
    );
    expect(card.total).toBe(orderTotal);

    const dineIn = report.breakdown.byOrderType.find(
      (t: { type: string }) => t.type === 'DINE_IN',
    );
    expect(dineIn.orderCount).toBe(1);

    expect(report.series.length).toBeGreaterThan(0);
    expect(report.peakHours.length).toBeGreaterThan(0);
  });

  it('18. the audit trail recorded the privileged actions', async () => {
    const response = await ctx
      .http()
      .get('/api/audit?pageSize=100')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const actions = response.body.data.map(
      (entry: { action: string; entity: string }) => `${entry.action}:${entry.entity}`,
    );
    expect(actions).toContain('LOGIN:User');
    expect(actions).toContain('CREATE:Product');
    expect(actions).toContain('PAYMENT:Payment');
    expect(actions).toContain('STATUS_CHANGE:Order');
  });
});
