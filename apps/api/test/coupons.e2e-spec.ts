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
 * Coupons touch money, so the rules that matter are the ones an attacker or a
 * rush of simultaneous customers would probe: can a code be forged, reused
 * past its limit, stacked, or applied below its minimum.
 */
describe('Discount coupons', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;

  // One product at 200,000; a two-item order subtotals 400,000.
  const orderSubtotal = 400_000;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'coupons');
    token = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  function createCoupon(body: Record<string, unknown>) {
    return ctx
      .http()
      .post('/api/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function placeOrder(couponCode?: string, phone?: string) {
    return ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'مشتری',
        customerPhone: phone ?? '09121234567',
        ...(couponCode ? { couponCode } : {}),
        items: [{ productId: tenant.productId, quantity: 2, modifierOptionIds: [] }],
      });
  }

  describe('creation rules', () => {
    it('creates a percentage coupon', async () => {
      const response = await createCoupon({
        code: 'welcome15',
        type: 'PERCENTAGE',
        value: 1500,
        description: 'خوش‌آمدگویی',
      }).expect(201);
      // Codes are normalised so the customer can type any casing.
      expect(response.body.data.code).toBe('WELCOME15');
      expect(response.body.data.isRedeemable).toBe(true);
    });

    it('rejects a percentage above 100', async () => {
      const response = await createCoupon({
        code: 'TOOMUCH',
        type: 'PERCENTAGE',
        value: 12_000,
      }).expect(422);
      expect(response.body.error.details.value).toBeDefined();
    });

    it('rejects a duplicate code', async () => {
      const response = await createCoupon({
        code: 'WELCOME15',
        type: 'FIXED',
        value: 1000,
      }).expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('rejects an end date before the start date', async () => {
      const response = await createCoupon({
        code: 'BADWINDOW',
        type: 'FIXED',
        value: 1000,
        startsAt: '2026-09-01',
        endsAt: '2026-08-01',
      }).expect(422);
      expect(response.body.error.details.endsAt).toBeDefined();
    });

    it('keeps coupons scoped to their tenant', async () => {
      const other = await seedTenant(ctx.prisma, 'rival');
      const rivalToken = await login(ctx, other, 'OWNER');
      const response = await ctx
        .http()
        .get('/api/coupons')
        .set('Authorization', `Bearer ${rivalToken}`)
        .expect(200);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('applying a coupon', () => {
    it('discounts the order and flows through tax and service charge', async () => {
      const response = await placeOrder('WELCOME15');
      expect(response.status).toBe(201);

      const order = response.body.data.order;
      const expectedDiscount = Math.round((orderSubtotal * 1500) / 10_000);
      expect(order.subtotal).toBe(orderSubtotal);
      expect(order.discountTotal).toBe(expectedDiscount);

      // Service charge and VAT are computed on the discounted base.
      const base = orderSubtotal - expectedDiscount;
      const service = Math.round((base * 1000) / 10_000);
      const tax = Math.round(((base + service) * 900) / 10_000);
      expect(order.serviceChargeTotal).toBe(service);
      expect(order.taxTotal).toBe(tax);
      expect(order.total).toBe(base + service + tax);
    });

    it('records the redemption and advances the usage counter', async () => {
      const coupon = await ctx.prisma.coupon.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, code: 'WELCOME15' },
      });
      expect(coupon.usageCount).toBeGreaterThan(0);

      const redemptions = await ctx.prisma.couponRedemption.count({
        where: { couponId: coupon.id },
      });
      expect(redemptions).toBe(coupon.usageCount);
    });

    it('accepts the code in any casing or spacing', async () => {
      const response = await placeOrder('  welcome 15 ');
      expect(response.status).toBe(201);
      expect(response.body.data.order.discountTotal).toBeGreaterThan(0);
    });

    it('caps a percentage discount at maxDiscount', async () => {
      await createCoupon({
        code: 'CAPPED',
        type: 'PERCENTAGE',
        value: 5000,
        maxDiscount: 30_000,
      }).expect(201);

      const response = await placeOrder('CAPPED');
      // 50% of 400,000 is 200,000, but the cap holds it to 30,000.
      expect(response.body.data.order.discountTotal).toBe(30_000);
    });

    it('never lets a fixed coupon exceed the subtotal', async () => {
      await createCoupon({
        code: 'HUGE',
        type: 'FIXED',
        value: 900_000,
      }).expect(201);

      const response = await placeOrder('HUGE');
      const order = response.body.data.order;
      expect(order.discountTotal).toBe(orderSubtotal);
      expect(order.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rejections', () => {
    it('rejects an unknown code', async () => {
      const response = await placeOrder('NOSUCHCODE');
      expect(response.status).toBe(422);
      expect(response.body.error.details.couponCode).toBeDefined();
    });

    it('rejects an inactive code', async () => {
      await createCoupon({
        code: 'DISABLED',
        type: 'FIXED',
        value: 10_000,
        isActive: false,
      }).expect(201);

      const response = await placeOrder('DISABLED');
      expect(response.status).toBe(422);
      expect(response.body.error.message).toContain('غیرفعال');
    });

    it('rejects a code that has expired', async () => {
      await createCoupon({
        code: 'EXPIRED',
        type: 'FIXED',
        value: 10_000,
        startsAt: '2020-01-01',
        endsAt: '2020-02-01',
      }).expect(201);

      const response = await placeOrder('EXPIRED');
      expect(response.status).toBe(422);
      expect(response.body.error.message).toContain('مهلت');
    });

    it('rejects a code below its minimum order value', async () => {
      await createCoupon({
        code: 'BIGSPEND',
        type: 'FIXED',
        value: 50_000,
        minOrderTotal: 10_000_000,
      }).expect(201);

      const response = await placeOrder('BIGSPEND');
      expect(response.status).toBe(422);
      expect(response.body.error.message).toContain('بالای');
    });

    it('enforces the total usage limit', async () => {
      await createCoupon({
        code: 'ONLYONCE',
        type: 'FIXED',
        value: 10_000,
        usageLimit: 1,
      }).expect(201);

      const first = await placeOrder('ONLYONCE', '09120000001');
      expect(first.status).toBe(201);

      const second = await placeOrder('ONLYONCE', '09120000002');
      expect(second.status).toBe(422);
      expect(second.body.error.message).toContain('ظرفیت');
    });

    it('enforces the per-customer limit by phone', async () => {
      await createCoupon({
        code: 'ONEPER',
        type: 'FIXED',
        value: 10_000,
        perCustomerLimit: 1,
      }).expect(201);

      const first = await placeOrder('ONEPER', '09125550000');
      expect(first.status).toBe(201);

      const again = await placeOrder('ONEPER', '09125550000');
      expect(again.status).toBe(422);
      expect(again.body.error.message).toContain('قبلاً');

      // A different customer is still entitled to it.
      const other = await placeOrder('ONEPER', '09125551111');
      expect(other.status).toBe(201);
    });

    it('writes no order at all when the coupon is rejected', async () => {
      const before = await ctx.prisma.order.count({
        where: { tenantId: tenant.tenantId },
      });
      await placeOrder('NOSUCHCODE');
      expect(
        await ctx.prisma.order.count({ where: { tenantId: tenant.tenantId } }),
      ).toBe(before);
    });
  });

  describe('concurrency', () => {
    it('never exceeds the usage limit under simultaneous redemption', async () => {
      await createCoupon({
        code: 'RACE',
        type: 'FIXED',
        value: 10_000,
        usageLimit: 3,
      }).expect(201);

      // Ten customers hit the same three-redemption code at once.
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          placeOrder('RACE', `0912777${String(i).padStart(4, '0')}`),
        ),
      );
      const accepted = results.filter((r) => r.status === 201);

      const coupon = await ctx.prisma.coupon.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, code: 'RACE' },
      });
      const redemptions = await ctx.prisma.couponRedemption.count({
        where: { couponId: coupon.id },
      });

      expect(accepted.length).toBeLessThanOrEqual(3);
      expect(redemptions).toBeLessThanOrEqual(3);
      expect(coupon.usageCount).toBe(redemptions);
    });
  });

  describe('preview', () => {
    it('reports the discount a code would give', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/coupons/preview`)
        .send({ code: 'WELCOME15', subtotal: 400_000 })
        .expect(200);

      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.discount).toBe(60_000);
    });

    it('explains why a code does not apply', async () => {
      const response = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/coupons/preview`)
        .send({ code: 'BIGSPEND', subtotal: 400_000 })
        .expect(200);

      expect(response.body.data.valid).toBe(false);
      expect(response.body.data.reason).toContain('بالای');
      expect(response.body.data.discount).toBe(0);
    });
  });

  describe('campaign reporting', () => {
    it('reports how much each campaign has given away', async () => {
      const response = await ctx
        .http()
        .get('/api/coupons')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const welcome = response.body.data.find(
        (c: { code: string }) => c.code === 'WELCOME15',
      );
      expect(welcome.usageCount).toBeGreaterThan(0);
      expect(welcome.totalDiscountGiven).toBeGreaterThan(0);
    });

    it('deactivates rather than deletes a redeemed coupon', async () => {
      const coupon = await ctx.prisma.coupon.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, code: 'WELCOME15' },
      });
      const response = await ctx
        .http()
        .delete(`/api/coupons/${coupon.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.deactivated).toBe(true);
      // The row survives so past orders keep a valid reference.
      const still = await ctx.prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(still?.isActive).toBe(false);
    });
  });
});
