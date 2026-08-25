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
 * Tenant isolation is the single most important property of a multi-tenant
 * SaaS: a bug here leaks one restaurant's revenue, customers and menu to
 * another. These tests drive two fully independent tenants through the real
 * HTTP surface and assert that neither can observe or touch the other.
 */
describe('Tenant isolation (restaurant A cannot reach restaurant B)', () => {
  let ctx: TestContext;
  let alpha: TestTenant;
  let beta: TestTenant;
  let alphaToken: string;
  let betaToken: string;
  let betaOrderId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    alpha = await seedTenant(ctx.prisma, 'alpha');
    beta = await seedTenant(ctx.prisma, 'beta');
    alphaToken = await login(ctx, alpha, 'OWNER');
    betaToken = await login(ctx, beta, 'OWNER');

    // Give tenant B an order for tenant A to try to reach.
    const created = await ctx
      .http()
      .post(`/api/public/restaurants/${beta.restaurantSlug}/orders`)
      .send({
        type: 'DINE_IN',
        tableId: beta.tableIds[0],
        items: [{ productId: beta.productId, quantity: 2, modifierOptionIds: [] }],
      })
      .expect(201);
    betaOrderId = created.body.data.order.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  describe('reads', () => {
    it('lists only its own products', async () => {
      const response = await ctx
        .http()
        .get('/api/products?pageSize=100')
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);

      const ids = response.body.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(alpha.productId);
      expect(ids).not.toContain(beta.productId);
    });

    it('lists only its own orders', async () => {
      const response = await ctx
        .http()
        .get('/api/orders?pageSize=100')
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);

      const ids = response.body.data.map((o: { id: string }) => o.id);
      expect(ids).not.toContain(betaOrderId);
    });

    it('lists only its own tables', async () => {
      const response = await ctx
        .http()
        .get('/api/tables')
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);

      const ids = response.body.data.map((t: { id: string }) => t.id);
      expect(ids.sort()).toEqual([...alpha.tableIds].sort());
      for (const betaTable of beta.tableIds) {
        expect(ids).not.toContain(betaTable);
      }
    });

    it('lists only its own staff', async () => {
      const response = await ctx
        .http()
        .get('/api/staff')
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);

      const emails = response.body.data.map((u: { email: string }) => u.email);
      expect(emails).toContain(alpha.users.OWNER.email);
      expect(emails).not.toContain(beta.users.OWNER.email);
    });

    it('returns 404 rather than another tenant order', async () => {
      await ctx
        .http()
        .get(`/api/orders/${betaOrderId}`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(404);
    });

    it('returns 404 rather than another tenant product', async () => {
      await ctx
        .http()
        .get(`/api/products/${beta.productId}`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(404);
    });
  });

  describe('writes', () => {
    it('cannot change another tenant order status', async () => {
      await ctx
        .http()
        .patch(`/api/orders/${betaOrderId}/status`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({ status: 'CANCELLED' })
        .expect(404);

      const order = await ctx.prisma.order.findUnique({ where: { id: betaOrderId } });
      expect(order?.status).not.toBe('CANCELLED');
    });

    it('cannot edit another tenant product', async () => {
      await ctx
        .http()
        .patch(`/api/products/${beta.productId}`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({ price: 1 })
        .expect(404);

      const product = await ctx.prisma.product.findUnique({
        where: { id: beta.productId },
      });
      expect(product?.price).toBe(200_000);
    });

    it('cannot delete another tenant product', async () => {
      await ctx
        .http()
        .delete(`/api/products/${beta.productId}`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(404);

      expect(
        await ctx.prisma.product.count({ where: { id: beta.productId } }),
      ).toBe(1);
    });

    it('cannot take payment against another tenant order', async () => {
      await ctx
        .http()
        .post(`/api/orders/${betaOrderId}/payment`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({ method: 'CASH' })
        .expect(404);

      expect(await ctx.prisma.payment.count({ where: { orderId: betaOrderId } })).toBe(0);
    });

    it('cannot attach a product to another tenant category', async () => {
      await ctx
        .http()
        .post('/api/products')
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({
          categoryId: beta.categoryId,
          name: 'Smuggled',
          nameFa: 'قاچاق',
          price: 1000,
        })
        .expect(404);
    });

    it('cannot disable another tenant staff account', async () => {
      await ctx
        .http()
        .patch(`/api/staff/${beta.users.CASHIER.id}`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({ isActive: false })
        .expect(404);

      const user = await ctx.prisma.user.findUnique({
        where: { id: beta.users.CASHIER.id },
      });
      expect(user?.isActive).toBe(true);
    });
  });

  describe('ordering across tenants', () => {
    it('rejects a product from another tenant menu', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/restaurants/${alpha.restaurantSlug}/orders`)
        .send({
          type: 'DINE_IN',
          tableId: alpha.tableIds[0],
          items: [{ productId: beta.productId, quantity: 1, modifierOptionIds: [] }],
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('rejects a table belonging to another tenant', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/restaurants/${alpha.restaurantSlug}/orders`)
        .send({
          type: 'DINE_IN',
          tableId: beta.tableIds[0],
          items: [{ productId: alpha.productId, quantity: 1, modifierOptionIds: [] }],
        });

      expect(response.status).toBe(404);
    });
  });

  describe('reporting', () => {
    it('reports revenue for its own tenant only', async () => {
      // Give tenant B a paid, completed order worth real money.
      const order = await ctx.prisma.order.findUniqueOrThrow({
        where: { id: betaOrderId },
      });
      await ctx.prisma.order.update({
        where: { id: betaOrderId },
        data: { paymentStatus: 'PAID', paidTotal: order.total },
      });

      const [alphaReport, betaReport] = await Promise.all([
        ctx
          .http()
          .get('/api/reports/sales?preset=today')
          .set('Authorization', `Bearer ${alphaToken}`)
          .expect(200),
        ctx
          .http()
          .get('/api/reports/sales?preset=today')
          .set('Authorization', `Bearer ${betaToken}`)
          .expect(200),
      ]);

      expect(alphaReport.body.data.totals.grossSales).toBe(0);
      expect(betaReport.body.data.totals.grossSales).toBe(order.total);
    });
  });

  describe('customer tracking tokens', () => {
    it('does not expose an order to a guessed token', async () => {
      await ctx
        .http()
        .get(`/api/public/orders/track/${'0'.repeat(48)}`)
        .expect(404);
    });

    it('grants access to exactly the one order the token belongs to', async () => {
      const order = await ctx.prisma.order.findUniqueOrThrow({
        where: { id: betaOrderId },
      });
      const response = await ctx
        .http()
        .get(`/api/public/orders/track/${order.trackingToken}`)
        .expect(200);

      expect(response.body.data.orderNumber).toBe(order.orderNumber);
      // The tracking payload must not leak internal identifiers.
      expect(response.body.data.id).toBeUndefined();
      expect(response.body.data.tenantId).toBeUndefined();
      expect(response.body.data.branchId).toBeUndefined();
    });
  });
});
