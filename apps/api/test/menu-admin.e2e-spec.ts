import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
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
 * The admin menu surface: categories, modifier groups and image uploads.
 *
 * These are the endpoints the menu editor drives, and each has a rule the UI
 * relies on being enforced server-side - a category with products cannot be
 * deleted, a product update replaces its modifier groups wholesale, and an
 * upload is only accepted if the bytes really are an image.
 */
describe('Menu administration', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;
  let kitchenToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'menuadmin');
    token = await login(ctx, tenant, 'OWNER');
    kitchenToken = await login(ctx, tenant, 'KITCHEN');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  describe('categories', () => {
    let createdId: string;

    it('creates a category on the current branch menu', async () => {
      const response = await ctx
        .http()
        .post('/api/categories')
        .set(auth())
        .send({
          name: 'Hot Drinks',
          nameFa: 'نوشیدنی گرم',
          description: 'دم‌آوری تازه',
          isActive: true,
        })
        .expect(201);

      createdId = response.body.data.id;
      expect(response.body.data.nameFa).toBe('نوشیدنی گرم');
      expect(response.body.data.productCount).toBe(0);

      const row = await ctx.prisma.category.findUnique({ where: { id: createdId } });
      expect(row?.menuId).toBe(tenant.menuId);
      expect(row?.tenantId).toBe(tenant.tenantId);
    });

    it('rejects a name carrying markup', async () => {
      await ctx
        .http()
        .post('/api/categories')
        .set(auth())
        .send({ name: 'X', nameFa: '<script>alert(1)</script>' })
        .expect(422);
    });

    it('renames and hides a category', async () => {
      const response = await ctx
        .http()
        .patch(`/api/categories/${createdId}`)
        .set(auth())
        .send({ nameFa: 'نوشیدنی داغ', isActive: false })
        .expect(200);

      expect(response.body.data.nameFa).toBe('نوشیدنی داغ');
      expect(response.body.data.isActive).toBe(false);
    });

    it('persists a new display order for the whole list', async () => {
      const before = await ctx
        .http()
        .get('/api/categories')
        .set(auth())
        .expect(200);

      const ids: string[] = before.body.data.map((c: { id: string }) => c.id);
      expect(ids.length).toBeGreaterThan(1);

      const reversed = [...ids].reverse();
      await ctx
        .http()
        .post('/api/categories/reorder')
        .set(auth())
        .send({
          items: reversed.map((id, index) => ({ id, displayOrder: index })),
        })
        .expect(201);

      const after = await ctx.http().get('/api/categories').set(auth()).expect(200);
      expect(after.body.data.map((c: { id: string }) => c.id)).toEqual(reversed);
    });

    it('refuses to delete a category that still holds products', async () => {
      await ctx
        .http()
        .delete(`/api/categories/${tenant.categoryId}`)
        .set(auth())
        // A conflict, not a validation error: the request is well formed, the
        // resource is simply not in a deletable state.
        .expect(409);

      // The category and its products are untouched.
      expect(
        await ctx.prisma.category.count({ where: { id: tenant.categoryId } }),
      ).toBe(1);
    });

    it('deletes an empty category', async () => {
      await ctx.http().delete(`/api/categories/${createdId}`).set(auth()).expect(200);
      expect(
        await ctx.prisma.category.count({ where: { id: createdId } }),
      ).toBe(0);
    });

    it('hides a category behind category:manage', async () => {
      await ctx
        .http()
        .post('/api/categories')
        .set(auth(kitchenToken))
        .send({ name: 'Nope', nameFa: 'نه' })
        .expect(403);
    });

    it('reports a foreign category as missing, not forbidden', async () => {
      const other = await seedTenant(ctx.prisma, 'menuadmin-other');
      await ctx
        .http()
        .patch(`/api/categories/${other.categoryId}`)
        .set(auth())
        .send({ nameFa: 'ربوده شده' })
        .expect(404);

      const untouched = await ctx.prisma.category.findUnique({
        where: { id: other.categoryId },
      });
      expect(untouched?.nameFa).toBe('اصلی');
    });
  });

  describe('modifier groups', () => {
    let productId: string;

    it('creates a product with a group and its options', async () => {
      const response = await ctx
        .http()
        .post('/api/products')
        .set(auth())
        .send({
          categoryId: tenant.categoryId,
          name: 'Latte',
          nameFa: 'لاته',
          price: 120_000,
          modifierGroups: [
            {
              name: 'Milk',
              nameFa: 'نوع شیر',
              type: 'SINGLE',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              displayOrder: 0,
              options: [
                { name: 'Whole', nameFa: 'پرچرب', priceDelta: 0, displayOrder: 0 },
                { name: 'Oat', nameFa: 'جو دوسر', priceDelta: 25_000, displayOrder: 1 },
              ],
            },
          ],
        })
        .expect(201);

      productId = response.body.data.id;
      expect(response.body.data.modifierGroups).toHaveLength(1);
      expect(response.body.data.modifierGroups[0].options).toHaveLength(2);
    });

    it('replaces the groups wholesale on update, leaving no orphans', async () => {
      const response = await ctx
        .http()
        .patch(`/api/products/${productId}`)
        .set(auth())
        .send({
          modifierGroups: [
            {
              name: 'Syrup',
              nameFa: 'سیروپ',
              type: 'MULTIPLE',
              isRequired: false,
              minSelect: 0,
              maxSelect: 2,
              displayOrder: 0,
              options: [
                { name: 'Vanilla', nameFa: 'وانیل', priceDelta: 15_000, displayOrder: 0 },
                { name: 'Caramel', nameFa: 'کارامل', priceDelta: 15_000, displayOrder: 1 },
                { name: 'Hazelnut', nameFa: 'فندق', priceDelta: 20_000, displayOrder: 2 },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.body.data.modifierGroups).toHaveLength(1);
      expect(response.body.data.modifierGroups[0].nameFa).toBe('سیروپ');

      // The old group and its two options are gone, not merely detached.
      expect(
        await ctx.prisma.modifierGroup.count({ where: { productId } }),
      ).toBe(1);
      expect(
        await ctx.prisma.modifierOption.count({
          where: { group: { productId } },
        }),
      ).toBe(3);
    });

    it('clears every group when an empty list is sent', async () => {
      await ctx
        .http()
        .patch(`/api/products/${productId}`)
        .set(auth())
        .send({ modifierGroups: [] })
        .expect(200);

      expect(await ctx.prisma.modifierGroup.count({ where: { productId } })).toBe(0);
    });

    it('rejects a group whose maximum exceeds its option count', async () => {
      await ctx
        .http()
        .patch(`/api/products/${productId}`)
        .set(auth())
        .send({
          modifierGroups: [
            {
              name: 'Size',
              nameFa: 'اندازه',
              type: 'MULTIPLE',
              isRequired: false,
              minSelect: 0,
              maxSelect: 5,
              displayOrder: 0,
              options: [{ name: 'S', nameFa: 'کوچک', priceDelta: 0, displayOrder: 0 }],
            },
          ],
        })
        .expect(422);
    });

    it('rejects a required group that allows zero selections', async () => {
      await ctx
        .http()
        .patch(`/api/products/${productId}`)
        .set(auth())
        .send({
          modifierGroups: [
            {
              name: 'Size',
              nameFa: 'اندازه',
              type: 'SINGLE',
              isRequired: true,
              minSelect: 0,
              maxSelect: 1,
              displayOrder: 0,
              options: [{ name: 'S', nameFa: 'کوچک', priceDelta: 0, displayOrder: 0 }],
            },
          ],
        })
        .expect(422);
    });
  });

  describe('image upload', () => {
    async function pngBytes(size = 64) {
      return sharp({
        create: {
          width: size,
          height: size,
          channels: 3,
          background: { r: 200, g: 160, b: 70 },
        },
      })
        .png()
        .toBuffer();
    }

    it('stores an image and returns namespaced URLs', async () => {
      const response = await ctx
        .http()
        .post('/api/uploads/image')
        .set(auth())
        .attach('file', await pngBytes(), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(201);

      const { key, url, thumbnailUrl, contentType } = response.body.data;
      // Re-encoded to WebP, and namespaced under the tenant so one restaurant
      // can never overwrite another's asset.
      expect(contentType).toBe('image/webp');
      expect(key.startsWith(`${tenant.tenantId}/products/`)).toBe(true);
      expect(url.endsWith('.webp')).toBe(true);
      expect(thumbnailUrl).toContain('-thumb.webp');

      // The URL must be reachable, which only holds if the app mounts the
      // local storage directory.
      const served = await ctx
        .http()
        .get(new URL(url).pathname)
        .expect(200);
      expect(served.headers['content-type']).toContain('image/webp');
    });

    it('accepts the branding folder and ignores anything else', async () => {
      const response = await ctx
        .http()
        .post('/api/uploads/image?folder=../../etc')
        .set(auth())
        .attach('file', await pngBytes(), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(response.body.data.key.startsWith(`${tenant.tenantId}/products/`)).toBe(true);
    });

    it('rejects a non-image that claims to be one', async () => {
      await ctx
        .http()
        .post('/api/uploads/image')
        .set(auth())
        .attach('file', Buffer.from('<?php system($_GET[0]); ?>'), {
          filename: 'shell.png',
          contentType: 'image/png',
        })
        .expect(422);
    });

    it('requires a menu or branding permission', async () => {
      await ctx
        .http()
        .post('/api/uploads/image')
        .set(auth(kitchenToken))
        .attach('file', await pngBytes(), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(403);
    });
  });

  describe('product images survive a round trip', () => {
    it('saves and clears an image URL', async () => {
      const imageUrl = `https://cdn.example.com/${randomUUID()}.webp`;

      const saved = await ctx
        .http()
        .patch(`/api/products/${tenant.productId}`)
        .set(auth())
        .send({ imageUrl })
        .expect(200);
      expect(saved.body.data.imageUrl).toBe(imageUrl);

      const cleared = await ctx
        .http()
        .patch(`/api/products/${tenant.productId}`)
        .set(auth())
        .send({ imageUrl: null })
        .expect(200);
      expect(cleared.body.data.imageUrl).toBeNull();
    });
  });
});
