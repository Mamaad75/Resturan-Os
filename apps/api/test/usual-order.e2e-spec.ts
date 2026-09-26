import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

/**
 * "Your usual" at the top of the menu.
 *
 * The endpoint hands out one customer's ordering habits, so the tests that
 * matter are about who is allowed to see them: possession of a tracking token
 * from one's own past order, at the restaurant that issued it, and nothing
 * else. A phone number must never be enough.
 */
describe('Usual order', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let other: TestTenant;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'usual');
    other = await seedTenant(ctx.prisma, 'usual-other');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  /** Places an order for the plain product and returns its tracking token. */
  async function placeOrder(quantity = 1): Promise<string> {
    const response = await ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'مشتری همیشگی',
        customerPhone: '09121110000',
        items: [
          { productId: tenant.productId, quantity, modifierOptionIds: [] },
        ],
      })
      .expect(201);
    return response.body.data.trackingToken as string;
  }

  function usual(slug: string, token?: string) {
    return ctx
      .http()
      .get(`/api/public/restaurants/${slug}/usual`)
      .query(token ? { token } : {});
  }

  it('knows nothing about a first-time guest', async () => {
    const response = await usual(tenant.restaurantSlug).expect(200);
    expect(response.body.data).toBeNull();
  });

  it('ignores a token that is not a token', async () => {
    const response = await usual(tenant.restaurantSlug, 'nonsense').expect(200);
    expect(response.body.data).toBeNull();
  });

  it('ignores a well-formed token nobody was ever issued', async () => {
    const response = await usual(tenant.restaurantSlug, 'a'.repeat(48)).expect(200);
    expect(response.body.data).toBeNull();
  });

  it('offers the last order back after a single visit', async () => {
    const token = await placeOrder();
    const response = await usual(tenant.restaurantSlug, token).expect(200);

    const data = response.body.data;
    expect(data.repeatCount).toBe(1);
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0].productId).toBe(tenant.productId);
    expect(data.lines[0].quantity).toBe(1);
    // Ids and quantities only - no prices, which the live menu supplies.
    expect(data.lines[0]).not.toHaveProperty('unitPrice');
  });

  it('counts the repeat once the same basket comes back', async () => {
    const token = await placeOrder();
    const response = await usual(tenant.restaurantSlug, token).expect(200);
    expect(response.body.data.repeatCount).toBeGreaterThanOrEqual(2);
  });

  it('prefers the basket ordered most often, not the most recent one', async () => {
    // Two of the same, then one different: the habit wins.
    await ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'مشتری همیشگی',
        customerPhone: '09121110000',
        items: [
          { productId: tenant.productId, quantity: 5, modifierOptionIds: [] },
        ],
      })
      .expect(201);

    const token = await placeOrder();
    const response = await usual(tenant.restaurantSlug, token).expect(200);
    expect(response.body.data.lines[0].quantity).toBe(1);
  });

  it('refuses to identify a customer across restaurants', async () => {
    const token = await placeOrder();
    // The token is real, but it was not issued by this restaurant.
    const response = await usual(other.restaurantSlug, token).expect(200);
    expect(response.body.data).toBeNull();
  });

  it('knows nothing about an order placed without a phone number', async () => {
    const anonymous = await ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'DINE_IN',
        tableId: tenant.tableIds[0],
        items: [
          { productId: tenant.productId, quantity: 1, modifierOptionIds: [] },
        ],
      })
      .expect(201);

    const response = await usual(
      tenant.restaurantSlug,
      anonymous.body.data.trackingToken,
    ).expect(200);
    // No phone means no customer record, so there is no history to read.
    expect(response.body.data).toBeNull();
  });

  it('forgets a basket once the order is cancelled', async () => {
    const solo = await seedTenant(ctx.prisma, 'usual-cancel');
    const placed = await ctx
      .http()
      .post(`/api/public/restaurants/${solo.restaurantSlug}/orders`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'مشتری',
        customerPhone: '09122220000',
        items: [{ productId: solo.productId, quantity: 1, modifierOptionIds: [] }],
      })
      .expect(201);

    await ctx.prisma.order.update({
      where: { id: placed.body.data.order.id },
      data: { status: 'CANCELLED' },
    });

    const response = await ctx
      .http()
      .get(`/api/public/restaurants/${solo.restaurantSlug}/usual`)
      .query({ token: placed.body.data.trackingToken })
      .expect(200);
    expect(response.body.data).toBeNull();
  });
});
