import { SubscriptionStatus } from '@restaurant-os/types';
import {
  closeTestApp,
  createTestApp,
  ensurePlan,
  login,
  platformLogin,
  resetDatabase,
  seedPlatformAdmin,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

/**
 * The FoodOS platform surface.
 *
 * The rules worth proving are the boundaries: a restaurant owner must not be
 * able to reach the platform however hard they try, the platform must be able
 * to reach every tenant, and a subscription's state must actually change what
 * a tenant can do.
 */
describe('Platform super admin', () => {
  let ctx: TestContext;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let platformToken: string;
  let ownerToken: string;
  let adminAccount: { id: string; email: string; password: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenantA = await seedTenant(ctx.prisma, 'plat-a');
    tenantB = await seedTenant(ctx.prisma, 'plat-b');
    adminAccount = await seedPlatformAdmin(ctx.prisma);
    platformToken = await platformLogin(ctx, adminAccount);
    ownerToken = await login(ctx, tenantA, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  const platform = () => ({ Authorization: `Bearer ${platformToken}` });
  const owner = () => ({ Authorization: `Bearer ${ownerToken}` });

  describe('authentication boundary', () => {
    it('refuses a platform route with no credentials', async () => {
      await ctx.http().get('/api/platform/dashboard').expect(401);
    });

    it('refuses a platform route presented with a tenant token', async () => {
      // The two token types are signed with different keys, so a restaurant
      // owner's session cannot be replayed here whatever it claims inside.
      await ctx.http().get('/api/platform/dashboard').set(owner()).expect(401);
      await ctx.http().get(`/api/platform/tenants/${tenantB.tenantId}`).set(owner()).expect(401);
    });

    it('refuses a tenant route presented with a platform token', async () => {
      await ctx.http().get('/api/orders').set(platform()).expect(401);
      await ctx.http().get('/api/restaurant').set(platform()).expect(401);
    });

    it('rejects a wrong password without revealing whether the account exists', async () => {
      const wrongPassword = await ctx
        .http()
        .post('/api/platform/auth/login')
        .send({ email: adminAccount.email, password: 'not-the-password' })
        .expect(401);
      const noSuchAccount = await ctx
        .http()
        .post('/api/platform/auth/login')
        .send({ email: 'nobody@foodos.test', password: 'not-the-password' })
        .expect(401);

      expect(wrongPassword.body.error.message).toBe(noSuchAccount.body.error.message);
    });

    it('refuses a deactivated administrator', async () => {
      const disabled = await seedPlatformAdmin(ctx.prisma);
      await ctx.prisma.platformAdmin.update({
        where: { id: disabled.id },
        data: { isActive: false },
      });
      await ctx
        .http()
        .post('/api/platform/auth/login')
        .send({ email: disabled.email, password: disabled.password })
        .expect(401);
    });
  });

  describe('tenant administration', () => {
    it('sees every tenant on the platform', async () => {
      const response = await ctx
        .http()
        .get('/api/platform/tenants')
        .set(platform())
        .expect(200);

      const slugs = response.body.data.map((t: { slug: string }) => t.slug);
      expect(slugs).toEqual(
        expect.arrayContaining([tenantA.restaurantSlug, tenantB.restaurantSlug]),
      );
    });

    it('filters by search term', async () => {
      const response = await ctx
        .http()
        .get(`/api/platform/tenants?search=${tenantB.restaurantSlug}`)
        .set(platform())
        .expect(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].slug).toBe(tenantB.restaurantSlug);
    });

    it('returns branches, staff and usage on the detail view', async () => {
      const response = await ctx
        .http()
        .get(`/api/platform/tenants/${tenantA.tenantId}`)
        .set(platform())
        .expect(200);

      expect(response.body.data.branches.length).toBeGreaterThan(0);
      expect(response.body.data.users.length).toBeGreaterThan(0);
      expect(response.body.data.entitlements.usage.tables).toBe(3);
    });

    it('records a platform note without exposing it to the tenant', async () => {
      await ctx
        .http()
        .patch(`/api/platform/tenants/${tenantA.tenantId}/notes`)
        .set(platform())
        .send({ adminNotes: 'فاکتور مرداد پرداخت نشده' })
        .expect(200);

      // Nothing on the tenant's own restaurant endpoint carries the note.
      const asOwner = await ctx.http().get('/api/restaurant').set(owner()).expect(200);
      expect(JSON.stringify(asOwner.body)).not.toContain('فاکتور مرداد');
    });
  });

  describe('suspension', () => {
    afterEach(async () => {
      await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/activate`)
        .set(platform());
    });

    it('stops the tenant writing but not reading', async () => {
      await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/suspend`)
        .set(platform())
        .send({ reason: 'عدم پرداخت' })
        .expect(201);

      const write = await ctx
        .http()
        .post('/api/categories')
        .set(owner())
        .send({ name: 'Blocked', nameFa: 'مسدود' })
        .expect(402);
      expect(write.body.error.code).toBe('SUBSCRIPTION_INACTIVE');

      // Reads keep working: an owner sorting out an invoice should still be
      // able to see their own orders.
      await ctx.http().get('/api/orders').set(owner()).expect(200);
      await ctx.http().get('/api/subscription').set(owner()).expect(200);
    });

    it('lets writes through again once the suspension is lifted', async () => {
      await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/suspend`)
        .set(platform())
        .send({ reason: 'تست' })
        .expect(201);
      await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/activate`)
        .set(platform())
        .expect(201);

      await ctx
        .http()
        .post('/api/categories')
        .set(owner())
        .send({ name: 'Allowed', nameFa: 'مجاز' })
        .expect(201);
    });

    it('leaves the neighbouring tenant untouched', async () => {
      await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/suspend`)
        .set(platform())
        .send({ reason: 'تست' })
        .expect(201);

      const neighbour = await ctx.prisma.tenant.findUnique({
        where: { id: tenantB.tenantId },
      });
      expect(neighbour?.isActive).toBe(true);
    });
  });

  describe('subscription lifecycle', () => {
    it('derives EXPIRED from a past date without a job having run', async () => {
      const response = await ctx
        .http()
        .patch(`/api/platform/tenants/${tenantA.tenantId}/subscription`)
        .set(platform())
        .send({ status: 'ACTIVE', expiresAt: '2020-01-01T00:00:00.000Z' })
        .expect(200);

      expect(response.body.data.status).toBe(SubscriptionStatus.EXPIRED);
      expect(response.body.data.daysRemaining).toBeLessThan(0);

      await ctx
        .http()
        .post('/api/categories')
        .set(owner())
        .send({ name: 'X', nameFa: 'ایکس' })
        .expect(402);
    });

    it('keeps writes alive during the grace period', async () => {
      const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const response = await ctx
        .http()
        .patch(`/api/platform/tenants/${tenantA.tenantId}/subscription`)
        .set(platform())
        .send({
          status: 'ACTIVE',
          expiresAt: '2020-01-01T00:00:00.000Z',
          graceUntil: future,
        })
        .expect(200);

      expect(response.body.data.status).toBe(SubscriptionStatus.GRACE_PERIOD);
      // The whole point of a grace period: a late invoice does not take a
      // restaurant offline mid-service.
      await ctx
        .http()
        .post('/api/categories')
        .set(owner())
        .send({ name: 'Grace', nameFa: 'مهلت' })
        .expect(201);
    });

    it('extends from the later of now and the current expiry', async () => {
      await ctx
        .http()
        .patch(`/api/platform/tenants/${tenantA.tenantId}/subscription`)
        .set(platform())
        .send({ status: 'ACTIVE', expiresAt: '2020-01-01T00:00:00.000Z', graceUntil: null })
        .expect(200);

      const extended = await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/subscription/extend`)
        .set(platform())
        .send({ days: 30 })
        .expect(201);

      expect(extended.body.data.status).toBe(SubscriptionStatus.ACTIVE);
      // Counted from today, not from the long-past expiry.
      expect(extended.body.data.daysRemaining).toBeGreaterThan(28);
      expect(extended.body.data.daysRemaining).toBeLessThanOrEqual(30);
    });

    it('rejects a plan id that does not exist', async () => {
      await ctx
        .http()
        .patch(`/api/platform/tenants/${tenantA.tenantId}/subscription`)
        .set(platform())
        .send({ planId: '3f1d8c9e-2a6b-4c1d-9e5f-7a8b9c0d1e2f' })
        .expect(404);
    });

    it('writes an audit entry with the previous and new value', async () => {
      await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/suspend`)
        .set(platform())
        .send({ reason: 'برای بررسی تاریخچه' })
        .expect(201);

      // Audit writes are fire-and-forget, so give the write a moment to land.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const entry = await ctx.prisma.platformAuditLog.findFirst({
        where: { tenantId: tenantA.tenantId, action: 'tenant.suspend' },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry).not.toBeNull();
      expect(entry?.adminId).toBe(adminAccount.id);
      expect(JSON.stringify(entry?.newValue)).toContain('برای بررسی تاریخچه');

      await ctx
        .http()
        .post(`/api/platform/tenants/${tenantA.tenantId}/activate`)
        .set(platform());
    });
  });

  describe('plans', () => {
    it('lists plans with their subscriber counts', async () => {
      const response = await ctx
        .http()
        .get('/api/platform/plans')
        .set(platform())
        .expect(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('subscriberCount');
    });

    it('creates a plan and refuses a duplicate key', async () => {
      const payload = {
        key: 'starter-test',
        name: 'Starter',
        nameFa: 'شروع',
        monthlyPrice: 100_000,
        maxBranches: 1,
      };
      await ctx.http().post('/api/platform/plans').set(platform()).send(payload).expect(201);
      await ctx.http().post('/api/platform/plans').set(platform()).send(payload).expect(409);
    });

    it('changes a limit and the tenant feels it immediately', async () => {
      const capped = await ensurePlan(ctx.prisma, 'capped-tables', { maxTables: 3 });
      await ctx
        .http()
        .patch(`/api/platform/tenants/${tenantA.tenantId}/subscription`)
        .set(platform())
        .send({ planId: capped.id, status: 'ACTIVE', expiresAt: null })
        .expect(200);

      // The tenant already has three tables from the seed.
      const blocked = await ctx
        .http()
        .post('/api/tables')
        .set(owner())
        .send({ number: 99, capacity: 2 })
        .expect(402);
      expect(blocked.body.error.code).toBe('PLAN_LIMIT_REACHED');

      // Raising the ceiling takes effect on the very next request; there is no
      // cached entitlement to invalidate.
      await ctx.prisma.plan.update({
        where: { id: capped.id },
        data: { maxTables: 10 },
      });
      await ctx
        .http()
        .post('/api/tables')
        .set(owner())
        .send({ number: 99, capacity: 2 })
        .expect(201);
    });
  });
});
