import { randomBytes, randomUUID } from 'node:crypto';
import { CouponsService } from '../src/modules/coupons/coupons.service';
import { DEFAULT_GAME_RULES } from '@restaurant-os/types';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedTenant,
  login,
  type TestContext,
  type TestTenant,
} from './harness';

// Real database regression tests: keep on the pre-deployment gate.
describe('Table games and wallet rewards', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let customerId: string;
  let token: string;
  let owner: string;
  const phone = '09121112233';
  const base = () => `/api/public/orders/track/${token}/games`;
  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'games');
    owner = await login(ctx, tenant, 'OWNER');
    await ctx.prisma.loyaltyProgram.create({
      data: { tenantId: tenant.tenantId, isEnabled: true },
    });
    customerId = (
      await ctx.prisma.customer.create({
        data: { tenantId: tenant.tenantId, phone },
      })
    ).id;
    token = randomBytes(24).toString('hex');
    await ctx.prisma.order.create({
      data: {
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        customerId,
        customerPhone: phone,
        orderNumber: 'game-1',
        trackingToken: token,
        type: 'TAKEAWAY',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        total: 100000,
        completedAt: new Date(),
      },
    });
  });
  afterAll(async () => {
    if (ctx) {
      await resetDatabase(ctx.prisma);
      await closeTestApp(ctx);
    }
  });
  it('is disabled until the owner explicitly enables it', async () => {
    await ctx.http().post(base()).send({ kind: 'MATH' }).expect(403);
    await ctx
      .http()
      .put('/api/games/program')
      .set('Authorization', `Bearer ${owner}`)
      .send({ ...DEFAULT_GAME_RULES, isEnabled: true })
      .expect(200);
  });
  it('rejects unknown tokens and client-supplied scores', async () => {
    await ctx
      .http()
      .get(`/api/public/orders/track/${'a'.repeat(48)}/games`)
      .expect(404);
    await ctx
      .http()
      .post(base())
      .send({ kind: 'MATH', score: 900 })
      .expect(422);
  });
  it('resumes one session and credits a completed game once despite concurrent retries', async () => {
    const starts = await Promise.all([
      ctx.http().post(base()).send({ kind: 'MATH' }),
      ctx.http().post(base()).send({ kind: 'MATH' }),
    ]);
    expect(starts[0].status).toBe(201);
    expect(starts[1].body.data.id).toBe(starts[0].body.data.id);
    let s = starts[0].body.data;
    for (let i = 0; i < 4; i++) {
      const q = s.question;
      s = (
        await ctx
          .http()
          .post(`${base()}/${s.id}/moves`)
          .send({
            revision: s.revision,
            value: q.operation === '+' ? q.a + q.b : q.a - q.b,
          })
          .expect(201)
      ).body.data;
    }
    const q = s.question;
    const dto = {
      revision: s.revision,
      value: q.operation === '+' ? q.a + q.b : q.a - q.b,
    };
    const results = await Promise.all([
      ctx.http().post(`${base()}/${s.id}/moves`).send(dto),
      ctx.http().post(`${base()}/${s.id}/moves`).send(dto),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.data.awardedPoints).toBe(10);
    const customer = await ctx.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.gameXp).toBe(60);
    expect(customer.loyaltyPoints).toBe(10);
    expect(
      await ctx.prisma.loyaltyEntry.count({
        where: { customerId, type: 'GAME_EARN' },
      }),
    ).toBe(1);
  });
  it('rejects sessions belonging to another order/tenant and expired sessions', async () => {
    await ctx
      .http()
      .post(`${base()}/${randomUUID()}/moves`)
      .send({ revision: 0, value: 1 })
      .expect(404);
    const s = (
      await ctx.http().post(base()).send({ kind: 'MEMORY' }).expect(201)
    ).body.data;
    await ctx.prisma.gameSession.update({
      where: { id: s.id },
      data: { expiresAt: new Date(0) },
    });
    await ctx
      .http()
      .post(`${base()}/${s.id}/moves`)
      .send({ revision: 0, value: 1 })
      .expect(422);
    const other = await seedTenant(ctx.prisma, 'other-games');
    const otherToken = randomBytes(24).toString('hex');
    const c = await ctx.prisma.customer.create({
      data: { tenantId: other.tenantId, phone },
    });
    await ctx.prisma.loyaltyProgram.create({
      data: { tenantId: other.tenantId, isEnabled: true },
    });
    await ctx.prisma.gameProgram.create({
      data: { tenantId: other.tenantId, isEnabled: true },
    });
    await ctx.prisma.order.create({
      data: {
        tenantId: other.tenantId,
        branchId: other.branchId,
        customerId: c.id,
        customerPhone: phone,
        orderNumber: 'other-1',
        trackingToken: otherToken,
        type: 'TAKEAWAY',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        total: 100000,
        completedAt: new Date(),
      },
    });
    await ctx
      .http()
      .post(`/api/public/orders/track/${otherToken}/games/${s.id}/moves`)
      .send({ revision: 0, value: 1 })
      .expect(404);
  });
  it('enforces the daily limit across orders and refuses unpaid orders', async () => {
    const nextToken = randomBytes(24).toString('hex');
    const order = await ctx.prisma.order.create({
      data: {
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        customerId,
        customerPhone: phone,
        orderNumber: 'game-2',
        trackingToken: nextToken,
        type: 'TAKEAWAY',
        status: 'COMPLETED',
        paymentStatus: 'PENDING',
        total: 100000,
        completedAt: new Date(),
      },
    });
    const next = `/api/public/orders/track/${nextToken}/games`;
    await ctx.http().post(next).send({ kind: 'MATH' }).expect(403);
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAID' },
    });
    await ctx.http().post(next).send({ kind: 'MATH' }).expect(422);
  });
  it('atomically exchanges points for one phone-bound, capped coupon and retries safely', async () => {
    await ctx.prisma.customer.update({
      where: { id: customerId },
      data: { gameXp: 100 },
    });
    await ctx
      .http()
      .post(`/api/loyalty/customers/${customerId}/adjust`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ points: 40, note: 'Test reward balance' })
      .expect(201);
    const requestId = randomUUID();
    const responses = await Promise.all([
      ctx.http().post(`${base()}/reward`).send({ requestId }),
      ctx.http().post(`${base()}/reward`).send({ requestId }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body.data.code).toEqual(responses[1].body.data.code);
    const c = await ctx.prisma.coupon.findUniqueOrThrow({
      where: { rewardRequestId: requestId },
    });
    const coupons = ctx.app.get(CouponsService);
    expect(
      (await coupons.preview(tenant.tenantId, c.code, 200000, '09120000000'))
        .valid,
    ).toBe(false);
    expect((await coupons.preview(tenant.tenantId, c.code, 200000)).valid).toBe(
      false,
    );
    expect(
      (await coupons.preview(tenant.tenantId, c.code, 200000, phone)).discount,
    ).toBe(10000);
    expect(c.rewardCustomerPhone).toBe(phone);
    expect(c.usageLimit).toBe(1);
    expect(c.value).toBe(500);
    expect(c.maxDiscount).toBe(20000);
    expect(
      (
        await ctx.prisma.customer.findUniqueOrThrow({
          where: { id: customerId },
        })
      ).loyaltyPoints,
    ).toBe(0);
    await ctx
      .http()
      .post(`${base()}/reward`)
      .send({ requestId: randomUUID() })
      .expect(422);
    expect(
      await ctx.prisma.loyaltyEntry.count({
        where: { customerId, type: 'GAME_REDEEM' },
      }),
    ).toBe(1);
  });
  it('prevents concurrent manual debits from overdrawing the shared wallet', async () => {
    await ctx
      .http()
      .post(`/api/loyalty/customers/${customerId}/adjust`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ points: 50, note: 'Race setup' })
      .expect(201);
    const debit = () =>
      ctx
        .http()
        .post(`/api/loyalty/customers/${customerId}/adjust`)
        .set('Authorization', `Bearer ${owner}`)
        .send({ points: -40, note: 'Race debit' });
    const responses = await Promise.all([debit(), debit()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 422]);
    const customer = await ctx.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    const entries = await ctx.prisma.loyaltyEntry.aggregate({
      where: { tenantId: tenant.tenantId, customerId },
      _sum: { points: true },
    });
    expect(customer.loyaltyPoints).toBe(10);
    expect(entries._sum.points).toBe(customer.loyaltyPoints);
  });
});
