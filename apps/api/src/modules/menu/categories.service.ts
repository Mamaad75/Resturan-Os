import { Inject, Injectable } from '@nestjs/common';
import { AuditAction } from '@restaurant-os/types';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: RequestContext, branchId?: string) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const menuId = await this.restaurants.getOrCreateMenuId(
      ctx.tenantId,
      resolvedBranchId,
    );
    const rows = await this.prisma.category.findMany({
      where: { tenantId: ctx.tenantId, menuId },
      orderBy: [{ displayOrder: 'asc' }, { nameFa: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameFa: row.nameFa,
      description: row.description,
      imageUrl: row.imageUrl,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      productCount: row._count.products,
    }));
  }

  async create(ctx: RequestContext, input: CreateCategoryInput, branchId?: string) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const menuId = await this.restaurants.getOrCreateMenuId(
      ctx.tenantId,
      resolvedBranchId,
    );

    // New categories land at the end of the list unless positioned explicitly.
    const displayOrder = input.displayOrder ?? (await this.nextDisplayOrder(ctx, menuId));

    const created = await this.prisma.category.create({
      data: {
        tenantId: ctx.tenantId,
        menuId,
        name: input.name,
        nameFa: input.nameFa,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        displayOrder,
        isActive: input.isActive ?? true,
      },
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'Category',
      entityId: created.id,
      metadata: { nameFa: created.nameFa },
    });
    return created;
  }

  async update(ctx: RequestContext, id: string, input: UpdateCategoryInput) {
    await this.assertExists(ctx, id);
    const updated = await this.prisma.category.update({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameFa !== undefined ? { nameFa: input.nameFa } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'Category',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return updated;
  }

  async remove(ctx: RequestContext, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw AppException.notFound('دسته‌بندی');

    // Deleting a category would cascade to its products and orphan historical
    // reporting, so a non-empty category is hidden instead of removed.
    if (category._count.products > 0) {
      throw AppException.conflict(
        'این دسته‌بندی دارای محصول است. ابتدا محصولات را منتقل یا حذف کنید.',
      );
    }

    await this.prisma.category.delete({ where: { id, tenantId: ctx.tenantId } });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.DELETE,
      entity: 'Category',
      entityId: id,
      metadata: { nameFa: category.nameFa },
    });
    return { deleted: true };
  }

  async reorder(ctx: RequestContext, items: Array<{ id: string; displayOrder: number }>) {
    const ids = items.map((i) => i.id);
    const owned = await this.prisma.category.count({
      where: { id: { in: ids }, tenantId: ctx.tenantId },
    });
    if (owned !== ids.length) throw AppException.notFound('دسته‌بندی');

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id, tenantId: ctx.tenantId },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    return { reordered: items.length };
  }

  private async assertExists(ctx: RequestContext, id: string) {
    const found = await this.prisma.category.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!found) throw AppException.notFound('دسته‌بندی');
    return found;
  }

  private async nextDisplayOrder(ctx: RequestContext, menuId: string): Promise<number> {
    const last = await this.prisma.category.findFirst({
      where: { tenantId: ctx.tenantId, menuId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    return (last?.displayOrder ?? -1) + 1;
  }
}
