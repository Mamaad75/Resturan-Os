import { CustomerSegment } from '@restaurant-os/types';
import {
  closeTestApp,
  createTestApp,
  ensurePlan,
  login,
  resetDatabase,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

/**
 * Service modes, the customer book and the menu theme.
 *
 * These are the three features that change what a tenant sees, so the tests
 * are about consequences rather than round trips: does a takeaway-only
 * restaurant actually lose its tables, does an order actually build a customer
 * record, does a saved theme actually reach a guest.
 */
describe('FoodOS tenant features', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'foodos');
    token = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** A product with no modifier groups, so orders stay simple. */
  async function simpleProductId(): Promise<string> {
    const product = await ctx.prisma.product.findFirst({
      where: { tenantId: tenant.tenantId, modifierGroups: { none: {} } },
      select: { id: true },
    });
    return product!.id;
  }

  describe('business type and service mode', () => {
    afterAll(async () => {
      await ctx
        .http()
        .patch('/api/restaurant/settings')
        .set(auth())
        .send({ serviceMode: 'BOTH' });
    });

    it('defaults to a restaurant serving both ways', async () => {
      const response = await ctx.http().get('/api/restaurant').set(auth()).expect(200);
      expect(response.body.data.settings.businessType).toBe('RESTAURANT');
      expect(response.body.data.settings.serviceMode).toBe('BOTH');
    });

    it('stores the business type independently of the service mode', async () => {
      const response = await ctx
        .http()
        .patch('/api/restaurant/settings')
        .set(auth())
        .send({ businessType: 'CAFE', serviceMode: 'TAKEAWAY' })
        .expect(200);

      // The two are separate concepts: a cafe can be takeaway-only.
      expect(response.body.data.settings.businessType).toBe('CAFE');
      expect(response.body.data.settings.serviceMode).toBe('TAKEAWAY');
      expect(response.body.data.settings.serviceModes).toEqual(['TAKEAWAY']);
    });

    it('refuses to create a table for a takeaway-only restaurant', async () => {
      await ctx
        .http()
        .patch('/api/restaurant/settings')
        .set(auth())
        .send({ serviceMode: 'TAKEAWAY' })
        .expect(200);

      const blocked = await ctx
        .http()
        .post('/api/tables')
        .set(auth())
        .send({ number: 42, capacity: 4 })
        .expect(409);
      expect(blocked.body.error.code).toBe('SERVICE_MODE_DISABLED');

      // Bulk creation goes through the same gate.
      await ctx
        .http()
        .post('/api/tables/bulk')
        .set(auth())
        .send({ from: 50, to: 55, capacity: 2 })
        .expect(409);
    });

    it('still gives a takeaway-only restaurant a general QR code', async () => {
      await ctx.http().post('/api/qr/sync').set(auth()).expect(201);
      const codes = await ctx.http().get('/api/qr').set(auth()).expect(200);

      const types = codes.body.data.map((c: { type: string }) => c.type);
      expect(types).toContain('RESTAURANT');
    });

    it('allows tables again once dine-in is switched back on', async () => {
      await ctx
        .http()
        .patch('/api/restaurant/settings')
        .set(auth())
        .send({ serviceMode: 'BOTH' })
        .expect(200);

      await ctx
        .http()
        .post('/api/tables')
        .set(auth())
        .send({ number: 42, capacity: 4 })
        .expect(201);
    });

    it('refuses a dine-in order at a takeaway-only restaurant', async () => {
      await ctx
        .http()
        .patch('/api/restaurant/settings')
        .set(auth())
        .send({ serviceMode: 'TAKEAWAY' })
        .expect(200);

      const productId = await simpleProductId();
      const rejected = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type: 'DINE_IN',
          tableId: tenant.tableIds[0],
          items: [{ productId, quantity: 1, modifierOptionIds: [] }],
        })
        .expect(409);
      expect(rejected.body.error.code).toBe('SERVICE_MODE_DISABLED');
    });
  });

  describe('phone capture', () => {
    it('requires a phone on a dine-in order once the setting is on', async () => {
      await ctx
        .http()
        .patch('/api/restaurant/settings')
        .set(auth())
        .send({ serviceMode: 'BOTH', requireCustomerPhone: true })
        .expect(200);

      const productId = await simpleProductId();
      const rejected = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type: 'DINE_IN',
          tableId: tenant.tableIds[0],
          items: [{ productId, quantity: 1, modifierOptionIds: [] }],
        })
        .expect(422);
      expect(rejected.body.error.details).toHaveProperty('customerPhone');
    });

    it('accepts the order once a phone is given', async () => {
      const productId = await simpleProductId();
      await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type: 'DINE_IN',
          tableId: tenant.tableIds[1],
          customerPhone: '09121110000',
          items: [{ productId, quantity: 1, modifierOptionIds: [] }],
        })
        .expect(201);
    });
  });

  describe('customer book', () => {
    const phone = '09129998877';

    async function placeOrder(type: 'DINE_IN' | 'TAKEAWAY', consent?: boolean) {
      const productId = await simpleProductId();
      return ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type,
          ...(type === 'DINE_IN'
            ? { tableId: tenant.tableIds[0] }
            : { customerName: 'مهمان تست' }),
          customerPhone: phone,
          ...(consent !== undefined ? { marketingConsent: consent } : {}),
          items: [{ productId, quantity: 2, modifierOptionIds: [] }],
        })
        .expect(201);
    }

    it('creates one customer and keeps counting on the same record', async () => {
      const first = await placeOrder('DINE_IN');
      await placeOrder('TAKEAWAY');

      const customers = await ctx.prisma.customer.findMany({
        where: { tenantId: tenant.tenantId, phone },
      });
      // The same number must never produce a second customer.
      expect(customers).toHaveLength(1);

      const customer = customers[0];
      expect(customer.ordersCount).toBe(2);
      expect(customer.dineInCount).toBe(1);
      expect(customer.takeawayCount).toBe(1);
      expect(customer.firstOrderAt).not.toBeNull();
      expect(customer.totalSpent).toBeGreaterThan(0);
      expect(customer.totalSpent).toBe(
        first.body.data.order.total +
          (await ctx.prisma.order.findFirst({
            where: { tenantId: tenant.tenantId, customerId: customer.id },
            orderBy: { createdAt: 'desc' },
          }))!.total,
      );
    });

    it('normalises the phone so one person is one customer', async () => {
      const productId = await simpleProductId();
      for (const written of ['+98 912 999 8877', '00989129998877', '۰۹۱۲۹۹۹۸۸۷۷']) {
        await ctx
          .http()
          .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
          .send({
            type: 'TAKEAWAY',
            customerName: 'مهمان',
            customerPhone: written,
            items: [{ productId, quantity: 1, modifierOptionIds: [] }],
          })
          .expect(201);
      }

      const customers = await ctx.prisma.customer.findMany({
        where: { tenantId: tenant.tenantId, phone },
      });
      expect(customers).toHaveLength(1);
      expect(customers[0].ordersCount).toBe(5);
    });

    it('reverses the aggregates when an order is cancelled', async () => {
      const before = await ctx.prisma.customer.findFirst({
        where: { tenantId: tenant.tenantId, phone },
      });
      const order = await ctx.prisma.order.findFirst({
        where: { tenantId: tenant.tenantId, customerId: before!.id },
        orderBy: { createdAt: 'desc' },
      });

      await ctx
        .http()
        .patch(`/api/orders/${order!.id}/status`)
        .set(auth())
        .send({ status: 'CANCELLED' })
        .expect(200);

      const after = await ctx.prisma.customer.findFirst({
        where: { tenantId: tenant.tenantId, phone },
      });
      // A cancelled order should not go on counting towards lifetime value.
      expect(after!.ordersCount).toBe(before!.ordersCount - 1);
      expect(after!.totalSpent).toBe(before!.totalSpent - order!.total);
    });

    it('records marketing consent only when it is given', async () => {
      const beforeConsent = await ctx.prisma.customer.findFirst({
        where: { tenantId: tenant.tenantId, phone },
      });
      expect(beforeConsent!.marketingConsent).toBe(false);

      await placeOrder('TAKEAWAY', true);
      const granted = await ctx.prisma.customer.findFirst({
        where: { tenantId: tenant.tenantId, phone },
      });
      expect(granted!.marketingConsent).toBe(true);
      expect(granted!.marketingConsentAt).not.toBeNull();

      // A later order that does not tick the box must not withdraw it.
      await placeOrder('TAKEAWAY', false);
      const stillGranted = await ctx.prisma.customer.findFirst({
        where: { tenantId: tenant.tenantId, phone },
      });
      expect(stillGranted!.marketingConsent).toBe(true);
    });

    it('lists customers with their segments', async () => {
      const response = await ctx
        .http()
        .get('/api/customers')
        .set(auth())
        .expect(200);

      const customer = response.body.data.find(
        (c: { phone: string }) => c.phone === phone,
      );
      expect(customer).toBeDefined();
      expect(customer.averageOrderValue).toBeGreaterThan(0);
      expect(customer.segments).toContain(CustomerSegment.RETURNING);
      expect(customer.segments).toContain(CustomerSegment.VIP);
    });

    it('counts every segment', async () => {
      const response = await ctx
        .http()
        .get('/api/customers/segments')
        .set(auth())
        .expect(200);

      const all = response.body.data.find(
        (s: { segment: string }) => s.segment === 'ALL',
      );
      expect(all.count).toBeGreaterThan(0);
      expect(all.labelFa).toBeTruthy();
    });

    it('hides another tenant s customers completely', async () => {
      const other = await seedTenant(ctx.prisma, 'foodos-other');
      await ctx.prisma.customer.create({
        data: { tenantId: other.tenantId, phone: '09120000000', name: 'همسایه' },
      });

      const response = await ctx.http().get('/api/customers').set(auth()).expect(200);
      const phones = response.body.data.map((c: { phone: string }) => c.phone);
      expect(phones).not.toContain('09120000000');
    });
  });

  describe('campaigns', () => {
    it('only counts customers who consented', async () => {
      const preview = await ctx
        .http()
        .get('/api/campaigns/preview?segment=ALL')
        .set(auth())
        .expect(200);

      const consenting = await ctx.prisma.customer.count({
        where: { tenantId: tenant.tenantId, marketingConsent: true },
      });
      expect(preview.body.data.recipients).toBe(consenting);
    });

    it('sends only to consenting customers', async () => {
      const created = await ctx
        .http()
        .post('/api/campaigns')
        .set(auth())
        .send({
          name: 'بازگشت مشتریان',
          segment: 'ALL',
          body: 'سلام {name}، این هفته ۲۰٪ تخفیف داریم.',
        })
        .expect(201);

      const sent = await ctx
        .http()
        .post(`/api/campaigns/${created.body.data.id}/send`)
        .set(auth())
        .expect(201);

      expect(sent.body.data.status).toBe('SENT');

      const messages = await ctx.prisma.smsMessage.findMany({
        where: { tenantId: tenant.tenantId, campaignId: created.body.data.id },
        include: { customer: true },
      });
      expect(messages.length).toBe(sent.body.data.sentCount);
      // The consent filter is part of the recipient query, so there is no path
      // that reaches somebody who declined.
      for (const message of messages) {
        expect(message.customer?.marketingConsent).toBe(true);
        expect(message.kind).toBe('MARKETING');
      }
    });

    it('refuses to send the same campaign twice', async () => {
      const created = await ctx
        .http()
        .post('/api/campaigns')
        .set(auth())
        .send({ name: 'دوباره', segment: 'ALL', body: 'متن تست برای ارسال دوباره.' })
        .expect(201);

      await ctx.http().post(`/api/campaigns/${created.body.data.id}/send`).set(auth());
      await ctx
        .http()
        .post(`/api/campaigns/${created.body.data.id}/send`)
        .set(auth())
        .expect(409);
    });

    it('stops at the plan s monthly marketing allowance', async () => {
      const stingy = await ensurePlan(ctx.prisma, 'sms-capped', { smsAllowance: 0 });
      await ctx.prisma.subscription.update({
        where: { tenantId: tenant.tenantId },
        data: { planId: stingy.id },
      });

      const created = await ctx
        .http()
        .post('/api/campaigns')
        .set(auth())
        .send({ name: 'بیش از سهمیه', segment: 'ALL', body: 'این پیام نباید ارسال شود.' })
        .expect(201);

      const blocked = await ctx
        .http()
        .post(`/api/campaigns/${created.body.data.id}/send`)
        .set(auth())
        .expect(402);
      expect(blocked.body.error.code).toBe('PLAN_LIMIT_REACHED');

      const unlimited = await ensurePlan(ctx.prisma, 'test-unlimited');
      await ctx.prisma.subscription.update({
        where: { tenantId: tenant.tenantId },
        data: { planId: unlimited.id },
      });
    });
  });

  describe('menu theme', () => {
    it('starts from the preset the restaurant already uses', async () => {
      const response = await ctx.http().get('/api/menu-theme').set(auth()).expect(200);
      expect(response.body.data.preset).toBe('CLASSIC');
      expect(response.body.data.hasDraft).toBe(false);
      expect(response.body.data.config.colors.primary).toBeTruthy();
    });

    it('keeps a draft off the public menu until it is published', async () => {
      await ctx
        .http()
        .patch('/api/menu-theme')
        .set(auth())
        .send({ config: { colors: { primary: '#123456' } } })
        .expect(200);

      const live = await ctx
        .http()
        .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu`)
        .expect(200);
      expect(live.body.data.theme?.config.colors.primary).not.toBe('#123456');

      await ctx.http().patch('/api/menu-theme').set(auth()).send({ publish: true }).expect(200);

      const published = await ctx
        .http()
        .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu`)
        .expect(200);
      expect(published.body.data.theme.config.colors.primary).toBe('#123456');
    });

    it('resets to the preset', async () => {
      await ctx
        .http()
        .post('/api/menu-theme/reset?publish=true')
        .set(auth())
        .expect(201);

      const live = await ctx
        .http()
        .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu`)
        .expect(200);
      expect(live.body.data.theme.config.colors.primary).not.toBe('#123456');
    });

    it('rejects a colour that is not a hex value', async () => {
      await ctx
        .http()
        .patch('/api/menu-theme')
        .set(auth())
        .send({ config: { colors: { primary: 'url(javascript:alert(1))' } } })
        .expect(422);
    });

    it('rejects custom CSS carrying script or import', async () => {
      for (const css of [
        '</style><script>alert(1)</script>',
        '@import url(http://evil.test/x.css);',
        'a{background:url(javascript:alert(1))}',
        'a{width:expression(alert(1))}',
      ]) {
        await ctx
          .http()
          .patch('/api/menu-theme')
          .set(auth())
          .send({ customCss: css })
          .expect(422);
      }
    });

    it('gates the customizer and custom CSS on separate plan features', async () => {
      const basic = await ensurePlan(ctx.prisma, 'theme-basic', {
        customThemeEnabled: false,
        customCssEnabled: false,
      });
      await ctx.prisma.subscription.update({
        where: { tenantId: tenant.tenantId },
        data: { planId: basic.id },
      });
      const blocked = await ctx
        .http()
        .patch('/api/menu-theme')
        .set(auth())
        .send({ config: { colors: { primary: '#000000' } } })
        .expect(402);
      expect(blocked.body.error.code).toBe('PLAN_FEATURE_UNAVAILABLE');

      const pro = await ensurePlan(ctx.prisma, 'theme-pro', {
        customThemeEnabled: true,
        customCssEnabled: false,
      });
      await ctx.prisma.subscription.update({
        where: { tenantId: tenant.tenantId },
        data: { planId: pro.id },
      });
      // The customizer opens up, custom CSS stays shut.
      await ctx
        .http()
        .patch('/api/menu-theme')
        .set(auth())
        .send({ config: { colors: { primary: '#000000' } } })
        .expect(200);
      await ctx
        .http()
        .patch('/api/menu-theme')
        .set(auth())
        .send({ customCss: '.x { color: red; }' })
        .expect(402);

      const unlimited = await ensurePlan(ctx.prisma, 'test-unlimited');
      await ctx.prisma.subscription.update({
        where: { tenantId: tenant.tenantId },
        data: { planId: unlimited.id },
      });
      await ctx
        .http()
        .patch('/api/menu-theme')
        .set(auth())
        .send({ customCss: '.x { color: red; }' })
        .expect(200);
    });

    it('cannot read or write another tenant s theme', async () => {
      const other = await seedTenant(ctx.prisma, 'theme-other');
      const otherToken = await login(ctx, other, 'OWNER');

      await ctx
        .http()
        .patch('/api/menu-theme')
        .set({ Authorization: `Bearer ${otherToken}` })
        .send({ config: { colors: { primary: '#ABCDEF' } }, publish: true })
        .expect(200);

      // The neighbour's publish must not touch this tenant's live menu.
      const mine = await ctx.http().get('/api/menu-theme').set(auth()).expect(200);
      expect(mine.body.data.config.colors.primary).not.toBe('#ABCDEF');
    });
  });
});
