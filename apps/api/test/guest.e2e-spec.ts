import {
  closeTestApp,
  createTestApp,
  login,
  resetDatabase,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

describe('Guest interaction: waiter calls and feedback', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let staffToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'guest');
    staffToken = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  describe('waiter calls', () => {
    it('lets an anonymous guest call for service', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/waiter-call`)
        .send({ tableId: tenant.tableIds[0], reason: 'ASSISTANCE' })
        .expect(200);

      expect(response.body.data.callId).toBeTruthy();
      expect(response.body.data.alreadyOpen).toBe(false);
    });

    it('collapses repeat taps into the existing open call', async () => {
      const again = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/waiter-call`)
        .send({ tableId: tenant.tableIds[0], reason: 'ASSISTANCE' })
        .expect(200);

      expect(again.body.data.alreadyOpen).toBe(true);

      const open = await ctx.prisma.waiterCall.count({
        where: { tableId: tenant.tableIds[0], reason: 'ASSISTANCE', status: 'OPEN' },
      });
      expect(open).toBe(1);
    });

    it('treats a different reason as a separate request', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/waiter-call`)
        .send({ tableId: tenant.tableIds[0], reason: 'BILL' })
        .expect(200);
      expect(response.body.data.alreadyOpen).toBe(false);
    });

    it('rejects a table belonging to another restaurant', async () => {
      const other = await seedTenant(ctx.prisma, 'guest-rival');
      await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/waiter-call`)
        .send({ tableId: other.tableIds[0], reason: 'ASSISTANCE' })
        .expect(404);
    });

    it('shows the calls to staff with a waiting time', async () => {
      const response = await ctx
        .http()
        .get('/api/waiter-calls')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      const call = response.body.data[0];
      expect(call.tableNumber).toBeDefined();
      expect(typeof call.waitingMinutes).toBe('number');
    });

    it('raises a durable notification for floor staff', async () => {
      const notifications = await ctx.prisma.notification.count({
        where: { tenantId: tenant.tenantId, userId: tenant.users.OWNER.id },
      });
      expect(notifications).toBeGreaterThan(0);
    });

    it('resolves a call and drops it off the list', async () => {
      const list = await ctx
        .http()
        .get('/api/waiter-calls')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      const target = list.body.data[0];

      await ctx
        .http()
        .patch(`/api/waiter-calls/${target.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'RESOLVED' })
        .expect(200);

      const after = await ctx
        .http()
        .get('/api/waiter-calls')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(after.body.data.map((c: { id: string }) => c.id)).not.toContain(target.id);
    });

    it('keeps calls scoped to their tenant', async () => {
      const rival = await seedTenant(ctx.prisma, 'guest-peek');
      const rivalToken = await login(ctx, rival, 'OWNER');
      const response = await ctx
        .http()
        .get('/api/waiter-calls')
        .set('Authorization', `Bearer ${rivalToken}`)
        .expect(200);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('order feedback', () => {
    let trackingToken: string;
    let orderId: string;

    beforeAll(async () => {
      const created = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type: 'TAKEAWAY',
          customerName: 'مشتری',
          customerPhone: '09121234567',
          items: [{ productId: tenant.productId, quantity: 1, modifierOptionIds: [] }],
        })
        .expect(201);
      trackingToken = created.body.data.trackingToken;
      orderId = created.body.data.order.id;
    });

    it('refuses a rating before the order is handed over', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/orders/track/${trackingToken}/feedback`)
        .send({ rating: 5 })
        .expect(409);
      expect(response.body.error.message).toContain('تحویل');
    });

    it('accepts a rating once the order is picked up', async () => {
      for (const status of ['PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP']) {
        await ctx
          .http()
          .patch(`/api/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ status })
          .expect(200);
      }

      const response = await ctx
        .http()
        .post(`/api/public/orders/track/${trackingToken}/feedback`)
        .send({ rating: 5, comment: 'عالی بود' })
        .expect(201);
      expect(response.body.data.rating).toBe(5);
    });

    it('allows only one rating per order', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/orders/track/${trackingToken}/feedback`)
        .send({ rating: 1 })
        .expect(409);
      expect(response.body.error.message).toContain('قبلاً');
    });

    it('rejects an out-of-range rating', async () => {
      await ctx
        .http()
        .post(`/api/public/orders/track/${'a'.repeat(48)}/feedback`)
        .send({ rating: 9 })
        .expect(422);
    });

    it('rejects an unknown tracking token', async () => {
      await ctx
        .http()
        .post(`/api/public/orders/track/${'0'.repeat(48)}/feedback`)
        .send({ rating: 4 })
        .expect(404);
    });

    it('summarises ratings for the admin', async () => {
      const response = await ctx
        .http()
        .get('/api/feedback')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const summary = response.body.data;
      expect(summary.totalCount).toBe(1);
      expect(summary.averageRating).toBe(5);
      expect(summary.distribution).toHaveLength(5);
      expect(summary.recent[0].comment).toBe('عالی بود');
      expect(summary.recent[0].orderNumber).toBeTruthy();
    });

    it('keeps feedback away from other tenants', async () => {
      const rival = await seedTenant(ctx.prisma, 'feedback-peek');
      const rivalToken = await login(ctx, rival, 'OWNER');
      const response = await ctx
        .http()
        .get('/api/feedback')
        .set('Authorization', `Bearer ${rivalToken}`)
        .expect(200);
      expect(response.body.data.totalCount).toBe(0);
    });
  });
});
