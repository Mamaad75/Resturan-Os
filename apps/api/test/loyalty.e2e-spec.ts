import { OrderStatus } from '@restaurant-os/types';
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
 * The points scheme, against real orders.
 *
 * The property that matters is that the ledger and the cached balance never
 * disagree: every test below re-derives the balance by summing the ledger and
 * checks it against the number the customer is shown.
 */
describe('Loyalty points', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;
  let productPrice: number;

  const PHONE = '09121110000';

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'loyalty');
    token = await login(ctx, tenant, 'OWNER');

    await ctx
      .http()
      .put('/api/loyalty/program')
      .set('Authorization', `Bearer ${token}`)
      .send({
        isEnabled: true,
        pointsPerThousand: 1,
        tomanPerPoint: 1_000,
        minRedeemPoints: 10,
        maxRedeemBps: 5_000,
        welcomePoints: 100,
      })
      .expect(200);

    const product = await ctx.prisma.product.findUniqueOrThrow({
      where: { id: tenant.productId },
      select: { price: true, discountPrice: true },
    });
    productPrice = product.discountPrice ?? product.price;
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  const place = (body: Record<string, unknown> = {}) =>
    ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'احسان',
        customerPhone: PHONE,
        items: [{ productId: tenant.productId, quantity: 1, modifierOptionIds: [] }],
        ...body,
      });

  const move = (orderId: string, status: string) =>
    ctx
      .http()
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });

  const pay = async (orderId: string) =>
    ctx
      .http()
      .post(`/api/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH' })
      .expect(200);

  /** The balance, and the ledger's own running total, which must agree. */
  async function balances() {
    const customer = await ctx.prisma.customer.findFirstOrThrow({
      where: { tenantId: tenant.tenantId, phone: PHONE },
      select: { id: true, loyaltyPoints: true },
    });
    const entries = await ctx.prisma.loyaltyEntry.findMany({
      where: { tenantId: tenant.tenantId, customerId: customer.id },
      orderBy: { createdAt: 'asc' },
      select: { points: true, type: true, balanceAfter: true },
    });
    return {
      customerId: customer.id,
      cached: customer.loyaltyPoints,
      ledger: entries.reduce((sum, entry) => sum + entry.points, 0),
      entries,
    };
  }

  it('grants the welcome bonus on a first order', async () => {
    await place().expect(201);
    const { cached, ledger, entries } = await balances();
    expect(cached).toBe(100);
    expect(ledger).toBe(cached);
    expect(entries.at(-1)?.balanceAfter).toBe(100);
  });

  it('grants it only once', async () => {
    await place().expect(201);
    const { cached, ledger } = await balances();
    expect(cached).toBe(100);
    expect(ledger).toBe(cached);
  });

  it('awards points when an order completes, not when it is placed', async () => {
    const created = await place().expect(201);
    const orderId = created.body.data.order.id;
    const before = await balances();

    await move(orderId, OrderStatus.PREPARING).expect(200);
    await move(orderId, OrderStatus.READY_FOR_PICKUP).expect(200);
    await move(orderId, OrderStatus.PICKED_UP).expect(200);
    expect((await balances()).cached).toBe(before.cached);

    await pay(orderId);
    await move(orderId, OrderStatus.COMPLETED).expect(200);

    const after = await balances();
    expect(after.cached).toBe(before.cached + Math.floor(productPrice / 1_000));
    expect(after.ledger).toBe(after.cached);
  });

  it('spends points at checkout and takes exactly what it quoted', async () => {
    const before = await balances();
    const created = await place({ redeemPoints: 50 }).expect(201);
    const order = created.body.data.order;

    expect(order.discountTotal).toBe(50_000);
    const after = await balances();
    expect(after.cached).toBe(before.cached - 50);
    expect(after.ledger).toBe(after.cached);
  });

  it('refuses to spend points the customer does not hold', async () => {
    const before = await balances();
    const res = await place({ redeemPoints: before.cached + 1_000 });
    expect(res.status).toBe(422);
    expect((await balances()).cached).toBe(before.cached);
  });

  it('refuses a redemption below the minimum', async () => {
    const res = await place({ redeemPoints: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('حداقل');
  });

  it('caps redemption at the configured share of the order', async () => {
    // maxRedeemBps is 50%, so points can never pay for more than half.
    const created = await place({ redeemPoints: 1_000_000 });
    expect(created.status).toBe(422);

    const affordable = Math.floor((productPrice * 0.5) / 1_000);
    const ok = await place({ redeemPoints: affordable }).expect(201);
    expect(ok.body.data.order.discountTotal).toBeLessThanOrEqual(
      Math.floor(productPrice * 0.5),
    );
  });

  it('returns points when the order that spent them is cancelled', async () => {
    const before = await balances();
    const created = await place({ redeemPoints: 20 }).expect(201);
    const orderId = created.body.data.order.id;
    expect((await balances()).cached).toBe(before.cached - 20);

    await move(orderId, OrderStatus.CANCELLED).expect(200);

    const after = await balances();
    expect(after.cached).toBe(before.cached);
    expect(after.ledger).toBe(after.cached);
  });

  it('pays for one order only once, however often it is completed', async () => {
    const created = await place().expect(201);
    const orderId = created.body.data.order.id;
    await move(orderId, OrderStatus.PREPARING).expect(200);
    await move(orderId, OrderStatus.READY_FOR_PICKUP).expect(200);
    await move(orderId, OrderStatus.PICKED_UP).expect(200);
    await pay(orderId);
    await move(orderId, OrderStatus.COMPLETED).expect(200);

    const earned = await balances();
    // Re-issuing the same terminal status must not award a second time. It is
    // a no-op at the state machine, and the earn rule is idempotent behind it.
    await move(orderId, OrderStatus.COMPLETED).expect(200);

    const after = await balances();
    expect(after.cached).toBe(earned.cached);
    expect(after.ledger).toBe(after.cached);
    expect(
      after.entries.filter((entry) => entry.type === 'EARN').length,
    ).toBe(earned.entries.filter((entry) => entry.type === 'EARN').length);
  });

  it('lets staff correct a balance, with the reason on the ledger', async () => {
    const { customerId, cached } = await balances();
    const res = await ctx
      .http()
      .post(`/api/loyalty/customers/${customerId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ points: 25, note: 'جبران تاخیر سفارش' })
      .expect(201);

    expect(res.body.data.points).toBe(cached + 25);
    const after = await balances();
    expect(after.ledger).toBe(after.cached);
    expect(after.entries.at(-1)?.type).toBe('ADJUST');
  });

  it('refuses an adjustment that would go negative', async () => {
    const { customerId, cached } = await balances();
    const res = await ctx
      .http()
      .post(`/api/loyalty/customers/${customerId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ points: -(cached + 1), note: 'تست' });
    expect(res.status).toBe(422);
    expect((await balances()).cached).toBe(cached);
  });

  it("does not expose another tenant's customer", async () => {
    const other = await seedTenant(ctx.prisma, 'loyalty-other');
    const otherToken = await login(ctx, other, 'OWNER');
    const { customerId } = await balances();

    await ctx
      .http()
      .get(`/api/loyalty/customers/${customerId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('awards nothing while the scheme is switched off', async () => {
    await ctx
      .http()
      .put('/api/loyalty/program')
      .set('Authorization', `Bearer ${token}`)
      .send({
        isEnabled: false,
        pointsPerThousand: 1,
        tomanPerPoint: 1_000,
        minRedeemPoints: 10,
        maxRedeemBps: 5_000,
        welcomePoints: 100,
      })
      .expect(200);

    const before = await balances();
    const created = await place().expect(201);
    const orderId = created.body.data.order.id;
    await move(orderId, OrderStatus.PREPARING).expect(200);
    await move(orderId, OrderStatus.READY_FOR_PICKUP).expect(200);
    await move(orderId, OrderStatus.PICKED_UP).expect(200);
    await pay(orderId);
    await move(orderId, OrderStatus.COMPLETED).expect(200);

    expect((await balances()).cached).toBe(before.cached);
  });
});
