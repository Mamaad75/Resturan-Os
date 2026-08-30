import {
  MENU_TEMPLATE_SPECS,
  MenuTemplate,
  menuTemplateSpec,
} from '@restaurant-os/types';
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
 * Per-restaurant look and feel.
 *
 * The menu template is what a guest sees before anything else, so the rules
 * that matter are that it reaches the public menu, that a value the server
 * does not recognise degrades to the default instead of breaking the page,
 * and that one restaurant's styling cannot be set by another.
 */
describe('Restaurant branding and menu template', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'branding');
    token = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('defaults a new restaurant to the classic template', async () => {
    const response = await ctx.http().get('/api/restaurant').set(auth()).expect(200);
    expect(response.body.data.branding.menuTemplate).toBe(MenuTemplate.CLASSIC);
  });

  it('saves a template and serves it on the public menu', async () => {
    const saved = await ctx
      .http()
      .patch('/api/restaurant/branding')
      .set(auth())
      .send({
        menuTemplate: MenuTemplate.FASTFOOD,
        accentColor: MENU_TEMPLATE_SPECS.FASTFOOD.defaultAccent,
        theme: 'light',
      })
      .expect(200);
    expect(saved.body.data.branding.menuTemplate).toBe(MenuTemplate.FASTFOOD);

    // The guest surface is the one that has to reflect it.
    const menu = await ctx
      .http()
      .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu`)
      .expect(200);
    expect(menu.body.data.restaurant.branding.menuTemplate).toBe(MenuTemplate.FASTFOOD);
    expect(menu.body.data.restaurant.branding.theme).toBe('light');
    expect(menu.body.data.restaurant.branding.accentColor).toBe(
      MENU_TEMPLATE_SPECS.FASTFOOD.defaultAccent,
    );
  });

  it('leaves the restaurant s own palette alone when the template changes', async () => {
    // The colour and logo are the restaurant's identity; the template only
    // supplies layout. Switching one must never quietly overwrite the other.
    await ctx
      .http()
      .patch('/api/restaurant/branding')
      .set(auth())
      .send({
        accentColor: '#123456',
        theme: 'dark',
        logoUrl: 'https://cdn.example.com/our-logo.webp',
        menuTemplate: MenuTemplate.CLASSIC,
      })
      .expect(200);

    const switched = await ctx
      .http()
      .patch('/api/restaurant/branding')
      .set(auth())
      .send({ menuTemplate: MenuTemplate.CAFE })
      .expect(200);

    expect(switched.body.data.branding.menuTemplate).toBe(MenuTemplate.CAFE);
    expect(switched.body.data.branding.accentColor).toBe('#123456');
    expect(switched.body.data.branding.theme).toBe('dark');
    expect(switched.body.data.branding.logoUrl).toBe(
      'https://cdn.example.com/our-logo.webp',
    );
    // Notably not the CAFE template's own suggested accent.
    expect(switched.body.data.branding.accentColor).not.toBe(
      MENU_TEMPLATE_SPECS.CAFE.defaultAccent,
    );
  });

  it('rejects a template that does not exist', async () => {
    await ctx
      .http()
      .patch('/api/restaurant/branding')
      .set(auth())
      .send({ menuTemplate: 'NEON_CYBERPUNK' })
      .expect(422);
  });

  it('falls back to classic when the stored value is no longer a template', async () => {
    // Simulates a template being retired after restaurants had already chosen
    // it: the column is a plain string, so the row survives the release.
    await ctx.prisma.restaurant.update({
      where: { id: tenant.restaurantId },
      data: { menuTemplate: 'RETIRED_STYLE' },
    });

    const menu = await ctx
      .http()
      .get(`/api/public/restaurants/${tenant.restaurantSlug}/menu`)
      .expect(200);
    expect(menu.body.data.restaurant.branding.menuTemplate).toBe(MenuTemplate.CLASSIC);
  });

  it('keeps one restaurant out of another restaurant s branding', async () => {
    const other = await seedTenant(ctx.prisma, 'branding-other');
    await ctx
      .http()
      .patch('/api/restaurant/branding')
      .set(auth())
      .send({ menuTemplate: MenuTemplate.MINIMAL })
      .expect(200);

    // The write above targeted the caller's own restaurant; the neighbour is
    // untouched. There is no route that takes another restaurant's id.
    const untouched = await ctx.prisma.restaurant.findUnique({
      where: { id: other.restaurantId },
    });
    expect(untouched?.menuTemplate).toBe(MenuTemplate.CLASSIC);
  });

  it('rejects an accent colour that is not a hex value', async () => {
    await ctx
      .http()
      .patch('/api/restaurant/branding')
      .set(auth())
      .send({ accentColor: 'javascript:alert(1)' })
      .expect(422);
  });

  it('gives every template a usable spec', () => {
    for (const [id, spec] of Object.entries(MENU_TEMPLATE_SPECS)) {
      expect(spec.id).toBe(id);
      expect(spec.labelFa.length).toBeGreaterThan(0);
      expect(spec.descriptionFa.length).toBeGreaterThan(0);
      expect(spec.defaultAccent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(menuTemplateSpec(id)).toEqual(spec);
    }
    // Anything unknown resolves rather than throwing.
    expect(menuTemplateSpec(null).id).toBe(MenuTemplate.CLASSIC);
    expect(menuTemplateSpec('nonsense').id).toBe(MenuTemplate.CLASSIC);
  });
});
