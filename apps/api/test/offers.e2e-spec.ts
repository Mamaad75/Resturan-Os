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
 * The offer shown just before payment.
 *
 * The popup quotes a price, so the tests that matter are the ones an attacker
 * or a stale browser tab would produce: a paused offer, an expired one, one
 * belonging to another restaurant, and an offer accepted for a product the
 * guest then removed. In every case the order must be priced by the server,
 * never by the request.
 */
describe('Checkout offers', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let other: TestTenant;
  let token: string;

  // The harness product costs 200,000; one of them plus a 20% offer on the
  // modifier product (100,000) is the shape these tests use.
  const offeredPrice = 100_000;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'offers');
    other = await seedTenant(ctx.prisma, 'offers-other');
    token = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  function createOffer(body: Record<string, unknown>) {
    return ctx
      .http()
      .post('/api/offers')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function liveOffer(exclude?: string) {
    return ctx
      .http()
      .get(`/api/public/restaurants/${tenant.restaurantSlug}/checkout-offer`)
      .query(exclude ? { exclude } : {});
  }

  /** The offered product is ordered unless `withOffered` says otherwise. */
  function placeOrder(offerId?: string | null, withOffered = true) {
    const items: Array<{
      productId: string;
      quantity: number;
      modifierOptionIds: string[];
    }> = [{ productId: tenant.productId, quantity: 1, modifierOptionIds: [] }];
    if (withOffered) {
      items.push({
        productId: tenant.modifierProductId,
        quantity: 1,
        modifierOptionIds: [tenant.modifierOptionId],
      });
    }
    return ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'مشتری',
        customerPhone: '09121234567',
        ...(offerId ? { offerId } : {}),
        items,
      });
  }

  describe('the owner side', () => {
    it('creates an offer from a percentage and a number of days', async () => {
      const response = await createOffer({
        productId: tenant.modifierProductId,
        discountBps: 2_000,
        days: 7,
      }).expect(201);

      const offer = response.body.data;
      expect(offer.discountBps).toBe(2_000);
      // Days in, an end date out: seven days is what the owner asked for.
      const span = new Date(offer.endsAt).getTime() - new Date(offer.startsAt).getTime();
      expect(Math.round(span / 86_400_000)).toBe(7);
    });

    it('refuses a product belonging to another restaurant', async () => {
      await createOffer({
        productId: other.productId,
        discountBps: 2_000,
        days: 7,
      }).expect(404);
    });

    it('refuses a discount outside the allowed range', async () => {
      await createOffer({
        productId: tenant.modifierProductId,
        discountBps: 9_900,
        days: 7,
      }).expect(422);
    });

    it('reports how often the offer was shown and taken', async () => {
      const response = await ctx
        .http()
        .get('/api/offers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      const offer = response.body.data[0];
      expect(offer.productNameFa).toBeTruthy();
      expect(offer).toHaveProperty('shownCount');
      expect(offer).toHaveProperty('acceptedCount');
    });
  });

  describe('what the guest is shown', () => {
    it('quotes the discounted price of one unit', async () => {
      const response = await liveOffer().expect(200);
      const offer = response.body.data;
      expect(offer.productId).toBe(tenant.modifierProductId);
      expect(offer.price).toBe(offeredPrice);
      expect(offer.offerPrice).toBe(80_000);
      // A title the owner did not write is generated from the product.
      expect(offer.title).toContain('20');
    });

    it('skips an offer for something already in the cart', async () => {
      const response = await liveOffer(tenant.modifierProductId).expect(200);
      expect(response.body.data).toBeNull();
    });

    it('ignores a nonsense exclude list rather than failing', async () => {
      const response = await liveOffer('not-a-uuid,,42').expect(200);
      expect(response.body.data).not.toBeNull();
    });

    it('shows nothing for a restaurant with no offer', async () => {
      const response = await ctx
        .http()
        .get(`/api/public/restaurants/${other.restaurantSlug}/checkout-offer`)
        .expect(200);
      expect(response.body.data).toBeNull();
    });

    it('counts each impression', async () => {
      const before = await ctx.prisma.checkoutOffer.findFirst({
        where: { tenantId: tenant.tenantId },
      });
      await liveOffer().expect(200);
      const after = await ctx.prisma.checkoutOffer.findFirst({
        where: { tenantId: tenant.tenantId },
      });
      expect(after!.shownCount).toBe(before!.shownCount + 1);
    });
  });

  describe('what the order is charged', () => {
    let offerId: string;

    beforeAll(async () => {
      const response = await liveOffer().expect(200);
      offerId = response.body.data.id;
    });

    it('discounts exactly one unit of the offered product', async () => {
      const response = await placeOrder(offerId).expect(201);
      const order = response.body.data.order;
      // 200,000 + (100,000 + 50,000 large) = 350,000 of food, less 20% of the
      // offered line's unit price.
      expect(order.subtotal).toBe(350_000);
      expect(order.discountTotal).toBe(30_000);
    });

    it('records the offer as accepted', async () => {
      const offer = await ctx.prisma.checkoutOffer.findUniqueOrThrow({
        where: { id: offerId },
      });
      expect(offer.acceptedCount).toBeGreaterThan(0);
    });

    it('gives nothing when the offered product is not on the order', async () => {
      const response = await placeOrder(offerId, false).expect(201);
      expect(response.body.data.order.discountTotal).toBe(0);
    });

    it('gives nothing for an offer id from another restaurant', async () => {
      const foreign = await ctx.prisma.checkoutOffer.create({
        data: {
          tenantId: other.tenantId,
          productId: other.productId,
          discountBps: 5_000,
          endsAt: new Date(Date.now() + 86_400_000),
        },
      });
      const response = await placeOrder(foreign.id).expect(201);
      expect(response.body.data.order.discountTotal).toBe(0);
    });

    it('gives nothing once the offer is paused', async () => {
      await ctx
        .http()
        .patch(`/api/offers/${offerId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false })
        .expect(200);

      const response = await placeOrder(offerId).expect(201);
      expect(response.body.data.order.discountTotal).toBe(0);

      // And it disappears from the popup as well.
      const shown = await liveOffer().expect(200);
      expect(shown.body.data).toBeNull();
    });

    it('gives nothing once the offer has run out', async () => {
      const expired = await ctx.prisma.checkoutOffer.create({
        data: {
          tenantId: tenant.tenantId,
          productId: tenant.modifierProductId,
          discountBps: 3_000,
          startsAt: new Date(Date.now() - 10 * 86_400_000),
          endsAt: new Date(Date.now() - 86_400_000),
        },
      });
      const response = await placeOrder(expired.id).expect(201);
      expect(response.body.data.order.discountTotal).toBe(0);
    });

    it('rejects an offer id that is not a uuid', async () => {
      await placeOrder('11111111-not-a-uuid').expect(422);
    });
  });

  describe('authorisation', () => {
    it('refuses to create an offer without a session', async () => {
      await ctx
        .http()
        .post('/api/offers')
        .send({ productId: tenant.modifierProductId, discountBps: 1_000, days: 1 })
        .expect(401);
    });

    it('refuses a waiter the offer list', async () => {
      const waiter = await login(ctx, tenant, 'WAITER');
      await ctx
        .http()
        .get('/api/offers')
        .set('Authorization', `Bearer ${waiter}`)
        .expect(403);
    });
  });
});
