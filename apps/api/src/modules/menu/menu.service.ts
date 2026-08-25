import { Inject, Injectable } from '@nestjs/common';
import type { PublicMenu } from '@restaurant-os/types';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { MENU_INCLUDE, toPublicCategory } from './menu.mappers';

@Injectable()
export class MenuService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  /**
   * The customer-facing menu.
   *
   * Everything is resolved live from the database, which is why a printed QR
   * code never goes stale when a price or availability changes.
   */
  async getPublicMenu(slug: string, tableNumber?: number): Promise<PublicMenu> {
    const resolved = await this.restaurants.findPublicBySlug(slug, tableNumber);
    if (!resolved.menuId) {
      return { restaurant: resolved.publicRestaurant, categories: [] };
    }

    // The slug lookup established the tenant, so this read is properly scoped.
    const categories = await this.prisma.category.findMany({
      where: {
        tenantId: resolved.tenantId,
        menuId: resolved.menuId,
        isActive: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { nameFa: 'asc' }],
      include: MENU_INCLUDE,
    });

    return {
      restaurant: resolved.publicRestaurant,
      // Categories with nothing to show are dropped rather than rendered empty.
      categories: categories
        .map(toPublicCategory)
        .filter((category) => category.products.length > 0),
    };
  }

  /** Admin menu tree, including hidden categories and unavailable products. */
  async getAdminMenu(ctx: RequestContext, branchId?: string) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const menuId = await this.restaurants.getOrCreateMenuId(
      ctx.tenantId,
      resolvedBranchId,
    );

    const categories = await this.prisma.category.findMany({
      where: { tenantId: ctx.tenantId, menuId },
      orderBy: [{ displayOrder: 'asc' }, { nameFa: 'asc' }],
      include: MENU_INCLUDE,
    });

    return {
      menuId,
      branchId: resolvedBranchId,
      categories: categories.map((category) => ({
        ...toPublicCategory(category),
        isActive: category.isActive,
        productCount: category.products.length,
      })),
    };
  }

  /** Increments the scan counter for analytics; never blocks the menu render. */
  async recordScan(slug: string, tableNumber?: number): Promise<void> {
    await runAsSystem('qr scan counter', async () => {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: { slug },
        select: { tenantId: true, branches: { select: { id: true }, take: 1 } },
      });
      if (!restaurant) return;
      await this.prisma.qrCode.updateMany({
        where: {
          tenantId: restaurant.tenantId,
          ...(tableNumber != null
            ? { table: { number: tableNumber } }
            : { type: 'RESTAURANT' }),
        },
        data: { scanCount: { increment: 1 } },
      });
    });
  }

  /** Shared guard: the category must exist inside the caller's tenant. */
  async assertCategoryInTenant(tenantId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true, menuId: true },
    });
    if (!category) throw AppException.notFound('دسته‌بندی');
    return category;
  }
}
