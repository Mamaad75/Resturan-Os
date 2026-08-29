import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

/**
 * Self-service signup is the only way a tenant enters the platform, so it has
 * to produce a restaurant that is complete, immediately usable, and isolated
 * from everyone else's from the very first request.
 */
describe('Restaurant signup', () => {
  let ctx: TestContext;
  let existing: TestTenant;

  const validSignup = {
    restaurantName: 'کافه آزمون',
    slug: 'cafe-azmoon',
    ownerName: 'مالک آزمون',
    email: 'owner@azmoon.test',
    phone: '09121234567',
    password: 'SignupPass123',
    confirmPassword: 'SignupPass123',
    businessType: 'cafe' as const,
    acceptedTerms: true,
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    existing = await seedTenant(ctx.prisma, 'incumbent');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  describe('slug availability', () => {
    it('reports a free address as available', async () => {
      const response = await ctx
        .http()
        .get('/api/public/signup/slug-available?slug=totally-free-address')
        .expect(200);
      expect(response.body.data.available).toBe(true);
    });

    it('reports an address already taken by another tenant', async () => {
      const response = await ctx
        .http()
        .get(`/api/public/signup/slug-available?slug=${existing.restaurantSlug}`)
        .expect(200);
      expect(response.body.data.available).toBe(false);
    });

    it('rejects a malformed address with a reason', async () => {
      const response = await ctx
        .http()
        .get('/api/public/signup/slug-available?slug=Bad_Slug!')
        .expect(200);
      expect(response.body.data.available).toBe(false);
      expect(response.body.data.reason).toBeTruthy();
    });
  });

  describe('creating a restaurant', () => {
    let session: Record<string, never>;

    it('creates the tenant and signs the owner straight in', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send(validSignup)
        .expect(201);

      session = response.body.data;
      expect(response.body.data.user.role).toBe('OWNER');
      expect(response.body.data.user.email).toBe(validSignup.email);
      expect(response.body.data.tenant.slug).toBe(validSignup.slug);
      expect(response.body.data.accessToken).toBeTruthy();
      // The owner chose this password, so there is nothing to force-change.
      expect(response.body.data.user.mustChangePassword).toBe(false);
    });

    it('sets the session cookies', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send({ ...validSignup, slug: 'cookie-check', email: 'cookie@azmoon.test' })
        .expect(201);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.find((c) => c.startsWith('ros_access='))).toMatch(/HttpOnly/i);
      expect(cookies.find((c) => c.startsWith('ros_refresh='))).toMatch(/HttpOnly/i);
    });

    it('builds a complete, usable restaurant', async () => {
      const tenant = await ctx.prisma.tenant.findFirstOrThrow({
        where: { slug: validSignup.slug },
      });

      const [restaurant, branch, menu, categories, owner, qr] = await Promise.all([
        ctx.prisma.restaurant.findFirstOrThrow({ where: { tenantId: tenant.id } }),
        ctx.prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } }),
        ctx.prisma.menu.findFirstOrThrow({ where: { tenantId: tenant.id } }),
        ctx.prisma.category.findMany({ where: { tenantId: tenant.id } }),
        ctx.prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id } }),
        ctx.prisma.qrCode.findMany({ where: { tenantId: tenant.id } }),
      ]);

      expect(restaurant.slug).toBe(validSignup.slug);
      expect(branch.name).toBe('شعبه اصلی');
      expect(menu.branchId).toBe(branch.id);
      // Starter categories mean the menu screen is never an empty void.
      expect(categories.length).toBeGreaterThan(0);
      expect(owner.role).toBe('OWNER');
      expect(owner.branchId).toBeNull();
      expect(qr.some((code) => code.type === 'RESTAURANT')).toBe(true);
    });

    it('applies the business-type preset', async () => {
      const response = await ctx
        .http()
        .get(`/api/public/restaurants/${validSignup.slug}/menu`)
        .expect(200);

      const settings = response.body.data.restaurant.settings;
      expect(settings.serviceModes).toEqual(['DINE_IN', 'TAKEAWAY']);
      expect(settings.estimatedPrepMinutes).toBe(12);
      // VAT stays off until the owner confirms their registration status.
      expect(settings.taxEnabled).toBe(false);
    });

    it('never stores the password in recoverable form', async () => {
      const owner = await ctx.prisma.user.findFirstOrThrow({
        where: { email: validSignup.email },
      });
      expect(owner.passwordHash).not.toContain(validSignup.password);
      expect(owner.passwordHash.startsWith('$argon2')).toBe(true);
    });
  });

  describe('rejections', () => {
    it('refuses an address already in use', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send({ ...validSignup, email: 'other@azmoon.test' })
        .expect(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('refuses an email already registered anywhere on the platform', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send({ ...validSignup, slug: 'another-address' })
        .expect(409);
      expect(response.body.error.message).toContain('ایمیل');
    });

    it('refuses a weak password', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send({
          ...validSignup,
          slug: 'weak-pass',
          email: 'weak@azmoon.test',
          password: 'short',
          confirmPassword: 'short',
        })
        .expect(422);
      expect(response.body.error.details.password).toBeDefined();
    });

    it('refuses a mismatched confirmation', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send({
          ...validSignup,
          slug: 'mismatch',
          email: 'mismatch@azmoon.test',
          confirmPassword: 'DifferentPass123',
        })
        .expect(422);
      expect(response.body.error.details.confirmPassword).toBeDefined();
    });

    it('refuses an invalid Iranian mobile number', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send({
          ...validSignup,
          slug: 'bad-phone',
          email: 'badphone@azmoon.test',
          phone: '12345',
        })
        .expect(422);
      expect(response.body.error.details.phone).toBeDefined();
    });

    it('requires accepting the terms', async () => {
      const response = await ctx
        .http()
        .post('/api/public/signup')
        .send({
          ...validSignup,
          slug: 'no-terms',
          email: 'noterms@azmoon.test',
          acceptedTerms: false,
        })
        .expect(422);
      expect(response.body.error.details.acceptedTerms).toBeDefined();
    });

    it('leaves no partial tenant behind when signup fails', async () => {
      const before = await ctx.prisma.tenant.count();
      await ctx
        .http()
        .post('/api/public/signup')
        .send({ ...validSignup, slug: 'rollback-check', password: 'weak' })
        .expect(422);
      expect(await ctx.prisma.tenant.count()).toBe(before);
    });
  });

  describe('isolation of a freshly created tenant', () => {
    it('cannot see the incumbent tenant data', async () => {
      const login = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: validSignup.email, password: validSignup.password })
        .expect(200);
      const token = login.body.data.accessToken;

      const [products, orders, tables, staff] = await Promise.all([
        ctx.http().get('/api/products').set('Authorization', `Bearer ${token}`).expect(200),
        ctx.http().get('/api/orders').set('Authorization', `Bearer ${token}`).expect(200),
        ctx.http().get('/api/tables').set('Authorization', `Bearer ${token}`).expect(200),
        ctx.http().get('/api/staff').set('Authorization', `Bearer ${token}`).expect(200),
      ]);

      expect(products.body.data).toHaveLength(0);
      expect(orders.body.data).toHaveLength(0);
      expect(tables.body.data).toHaveLength(0);
      // Only its own owner.
      expect(staff.body.data).toHaveLength(1);
      expect(staff.body.data[0].email).toBe(validSignup.email);
    });
  });
});
