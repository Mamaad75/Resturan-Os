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
 * Courier delivery, end to end.
 *
 * Three things decide whether this feature is trustworthy: the customer cannot
 * set their own delivery price, an order cannot be created for an area the
 * restaurant does not serve, and one restaurant's zones are invisible to
 * another. The lifecycle is checked too, because a delivery that can be marked
 * "served" has no meaning.
 */
describe('Courier delivery', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;
  let zoneId: string;
  let productPrice: number;

  const ZONE_FEE = 45_000;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'delivery');
    token = await login(ctx, tenant, 'OWNER');

    await ctx
      .http()
      .patch('/api/restaurant/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceModes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] })
      .expect(200);

    const zone = await ctx
      .http()
      .post(`/api/delivery/zones/${tenant.branchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'ونک', fee: ZONE_FEE, estimatedMinutes: 40 })
      .expect(201);
    zoneId = zone.body.data.id;

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

  const orderBody = (overrides: Record<string, unknown> = {}) => ({
    type: 'DELIVERY',
    customerName: 'احسان',
    customerPhone: '09121234567',
    deliveryZoneId: zoneId,
    deliveryAddress: 'ونک، خیابان گاندی، پلاک ۵',
    items: [{ productId: tenant.productId, quantity: 2, modifierOptionIds: [] }],
    ...overrides,
  });

  const place = (body: Record<string, unknown>) =>
    ctx.http().post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`).send(body);

  it('publishes active zones on the guest menu', async () => {
    const res = await ctx
      .http()
      .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu`)
      .expect(200);
    expect(res.body.data.restaurant.deliveryZones).toEqual([
      expect.objectContaining({ id: zoneId, title: 'ونک', fee: ZONE_FEE }),
    ]);
  });

  it('rejects a delivery order with no address', async () => {
    const res = await place(orderBody({ deliveryAddress: null }));
    expect(res.status).toBe(422);
  });

  it('rejects a delivery order with no zone', async () => {
    const res = await place(orderBody({ deliveryZoneId: null }));
    expect(res.status).toBe(422);
  });

  it('rejects a zone that belongs to another restaurant', async () => {
    const other = await seedTenant(ctx.prisma, 'delivery-other');
    const otherToken = await login(ctx, other, 'OWNER');
    await ctx
      .http()
      .patch('/api/restaurant/settings')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ serviceModes: ['DELIVERY'] })
      .expect(200);
    const otherZone = await ctx
      .http()
      .post(`/api/delivery/zones/${other.branchId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'منطقه دیگر', fee: 1_000 })
      .expect(201);

    // Ordering from this restaurant, quoting the other restaurant's zone.
    const res = await place(orderBody({ deliveryZoneId: otherZone.body.data.id }));
    expect(res.status).toBe(404);
  });

  it("does not let another tenant read this tenant's zones", async () => {
    const other = await seedTenant(ctx.prisma, 'delivery-peek');
    const otherToken = await login(ctx, other, 'OWNER');
    const res = await ctx
      .http()
      .get('/api/delivery/zones')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(res.body.data.every((zone: { id: string }) => zone.id !== zoneId)).toBe(true);
  });

  it('prices the trip from the zone, ignoring anything the client sends', async () => {
    const res = await place(
      // A client trying to set its own fee. There is no such field, and the
      // total must come out as though it were never sent.
      orderBody({ deliveryFee: 1, deliveryTotal: 1 }),
    ).expect(201);

    const order = res.body.data.order;
    expect(order.type).toBe('DELIVERY');
    expect(order.subtotal).toBe(productPrice * 2);
    expect(order.deliveryTotal).toBe(ZONE_FEE);
    expect(order.total).toBe(
      order.subtotal -
        order.discountTotal +
        order.taxTotal +
        order.serviceChargeTotal +
        ZONE_FEE,
    );
    expect(order.delivery.zone.title).toBe('ونک');
    expect(order.delivery.address).toBe('ونک، خیابان گاندی، پلاک ۵');
  });

  it('enforces the zone minimum against the food, not the fee', async () => {
    const strict = await ctx
      .http()
      .post(`/api/delivery/zones/${tenant.branchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'دوردست', fee: 10_000, minOrderTotal: productPrice * 10 })
      .expect(201);

    const res = await place(
      orderBody({
        deliveryZoneId: strict.body.data.id,
        items: [{ productId: tenant.productId, quantity: 1, modifierOptionIds: [] }],
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('حداقل مبلغ سفارش');
  });

  it('walks ready -> out for delivery -> delivered, and refuses SERVED', async () => {
    const created = await place(orderBody()).expect(201);
    const orderId = created.body.data.order.id;

    const move = (status: string) =>
      ctx
        .http()
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status });

    // The seed restaurant auto-confirms, so the order starts at the kitchen.
    await move(OrderStatus.PREPARING).expect(200);
    await move(OrderStatus.READY).expect(200);

    // A delivery is never "served" at a table.
    await move(OrderStatus.SERVED).expect(409);
    await move(OrderStatus.READY_FOR_PICKUP).expect(409);

    const dispatched = await move(OrderStatus.OUT_FOR_DELIVERY).expect(200);
    expect(dispatched.body.data.delivery.dispatchedAt).not.toBeNull();
    // Whoever dispatched it is the courier until someone says otherwise.
    expect(dispatched.body.data.delivery.courier).not.toBeNull();

    // Once a courier holds the food, cancelling is no longer a status change.
    await move(OrderStatus.CANCELLED).expect(409);

    const delivered = await move(OrderStatus.DELIVERED).expect(200);
    expect(delivered.body.data.delivery.deliveredAt).not.toBeNull();
  });

  it('keeps the fee when items are added to an open delivery order', async () => {
    const created = await place(orderBody()).expect(201);
    const orderId = created.body.data.order.id;

    const updated = await ctx
      .http()
      .post(`/api/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: tenant.productId, quantity: 1, modifierOptionIds: [] }],
      })
      .expect(201);

    expect(updated.body.data.deliveryTotal).toBe(ZONE_FEE);
    expect(updated.body.data.subtotal).toBe(productPrice * 3);
  });

  it('retires a zone that orders reference instead of deleting it', async () => {
    const res = await ctx
      .http()
      .delete(`/api/delivery/zones/${zoneId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.deleted).toBe(false);
    expect(res.body.data.zone.isActive).toBe(false);

    // Still readable, so past orders keep their zone name.
    const still = await ctx.prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    expect(still).not.toBeNull();
  });
});
