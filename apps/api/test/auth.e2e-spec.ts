import {
  closeTestApp,
  createTestApp,
  login,
  resetDatabase,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

describe('Authentication and authorisation', () => {
  let ctx: TestContext;
  let tenant: TestTenant;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'auth');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  describe('login', () => {
    it('issues an access token and sets httpOnly cookies', async () => {
      const response = await ctx
        .http()
        .post('/api/auth/login')
        .send({
          email: tenant.users.OWNER.email,
          password: tenant.users.OWNER.password,
        })
        .expect(200);

      expect(response.body.data.accessToken).toBeTruthy();
      expect(response.body.data.user.role).toBe('OWNER');
      expect(response.body.data.user.permissions.length).toBeGreaterThan(0);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const access = cookies.find((c) => c.startsWith('ros_access='));
      const refresh = cookies.find((c) => c.startsWith('ros_refresh='));
      expect(access).toMatch(/HttpOnly/i);
      expect(refresh).toMatch(/HttpOnly/i);
      // The refresh cookie is scoped to the auth routes only.
      expect(refresh).toMatch(/Path=\/api\/auth/i);
    });

    it('never returns the password hash', async () => {
      const response = await ctx
        .http()
        .post('/api/auth/login')
        .send({
          email: tenant.users.OWNER.email,
          password: tenant.users.OWNER.password,
        })
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('argon2');
      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    it('rejects a wrong password with a generic message', async () => {
      const response = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: tenant.users.OWNER.email, password: 'wrong-password' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      // The same message for both cases, so accounts cannot be enumerated.
      expect(response.body.error.message).toBe('ایمیل یا رمز عبور نادرست است.');
    });

    it('gives an unknown email the identical response', async () => {
      const response = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.test', password: 'whatever12345' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('ایمیل یا رمز عبور نادرست است.');
    });

    it('rejects a malformed email before touching the database', async () => {
      const response = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.details.email).toBeDefined();
    });

    it('refuses a deactivated account', async () => {
      await ctx.prisma.user.update({
        where: { id: tenant.users.WAITER.id },
        data: { isActive: false },
      });

      await ctx
        .http()
        .post('/api/auth/login')
        .send({
          email: tenant.users.WAITER.email,
          password: tenant.users.WAITER.password,
        })
        .expect(401);

      await ctx.prisma.user.update({
        where: { id: tenant.users.WAITER.id },
        data: { isActive: true },
      });
    });
  });

  describe('protected routes', () => {
    it('fails closed without a token', async () => {
      const response = await ctx.http().get('/api/orders').expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a forged token', async () => {
      const response = await ctx
        .http()
        .get('/api/orders')
        .set('Authorization', 'Bearer not.a.real.token')
        .expect(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('leaves public routes reachable', async () => {
      await ctx
        .http()
        .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu`)
        .expect(200);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the token and invalidates the presented one', async () => {
      const loginResponse = await ctx
        .http()
        .post('/api/auth/login')
        .send({
          email: tenant.users.MANAGER.email,
          password: tenant.users.MANAGER.password,
        })
        .expect(200);

      const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
      const firstRefresh = cookies.find((c) => c.startsWith('ros_refresh='))!;

      const refreshResponse = await ctx
        .http()
        .post('/api/auth/refresh')
        .set('Cookie', firstRefresh)
        .expect(200);

      expect(refreshResponse.body.data.accessToken).toBeTruthy();

      // Replaying the old cookie must fail: it was revoked on rotation.
      const replay = await ctx
        .http()
        .post('/api/auth/refresh')
        .set('Cookie', firstRefresh)
        .expect(401);
      expect(replay.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects a refresh with no cookie at all', async () => {
      await ctx.http().post('/api/auth/refresh').expect(401);
    });
  });

  describe('role-based access control', () => {
    it('lets the kitchen read orders but not manage products', async () => {
      const token = await login(ctx, tenant, 'KITCHEN');
      await ctx
        .http()
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const denied = await ctx
        .http()
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryId: tenant.categoryId, name: 'x', nameFa: 'ایکس', price: 1000 })
        .expect(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
    });

    it('keeps sales reports away from cashiers and waiters', async () => {
      for (const role of ['CASHIER', 'WAITER'] as const) {
        const token = await login(ctx, tenant, role);
        await ctx
          .http()
          .get('/api/reports/sales?preset=today')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('gives the accountant read-only financial access', async () => {
      const token = await login(ctx, tenant, 'ACCOUNTANT');
      await ctx
        .http()
        .get('/api/reports/sales?preset=today')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await ctx
        .http()
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryId: tenant.categoryId, name: 'x', nameFa: 'ایکس', price: 1000 })
        .expect(403);
    });

    it('restricts staff management to the owner', async () => {
      const managerToken = await login(ctx, tenant, 'MANAGER');
      await ctx
        .http()
        .post('/api/staff')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          email: 'new@example.test',
          fullName: 'کاربر جدید',
          password: 'Password12345',
          role: 'CASHIER',
        })
        .expect(403);
    });
  });

  describe('password change', () => {
    it('changes the password and revokes existing sessions', async () => {
      const token = await login(ctx, tenant, 'CASHIER');

      await ctx
        .http()
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: tenant.users.CASHIER.password,
          newPassword: 'BrandNewPass123',
          confirmPassword: 'BrandNewPass123',
        })
        .expect(200);

      // The old password no longer works, the new one does.
      await ctx
        .http()
        .post('/api/auth/login')
        .send({
          email: tenant.users.CASHIER.email,
          password: tenant.users.CASHIER.password,
        })
        .expect(401);

      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: tenant.users.CASHIER.email, password: 'BrandNewPass123' })
        .expect(200);

      const activeSessions = await ctx.prisma.refreshToken.count({
        where: { userId: tenant.users.CASHIER.id, revokedAt: null },
      });
      // Only the session created by the login above survives.
      expect(activeSessions).toBe(1);
    });

    it('rejects a weak new password', async () => {
      const token = await login(ctx, tenant, 'MANAGER');
      const response = await ctx
        .http()
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: tenant.users.MANAGER.password,
          newPassword: 'short',
          confirmPassword: 'short',
        })
        .expect(422);
      expect(response.body.error.details.newPassword).toBeDefined();
    });

    it('rejects a mismatched confirmation', async () => {
      const token = await login(ctx, tenant, 'MANAGER');
      await ctx
        .http()
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: tenant.users.MANAGER.password,
          newPassword: 'ValidPass12345',
          confirmPassword: 'DifferentPass12345',
        })
        .expect(422);
    });
  });
});
