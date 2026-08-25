import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '@restaurant-os/types';
import type {
  CreateProductInput,
  UpdateProductInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import { buildPaginationMeta, paginationArgs } from '../../common/utils/pagination.util';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { toPublicProduct } from './menu.mappers';

const PRODUCT_INCLUDE = Prisma.validator<Prisma.ProductInclude>()({
  modifierGroups: {
    orderBy: { displayOrder: 'asc' },
    include: { options: { orderBy: { displayOrder: 'asc' } } },
  },
  category: { select: { id: true, nameFa: true } },
});

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly audit: AuditService,
  ) {}

  async list(
    ctx: RequestContext,
    query: {
      page: number;
      pageSize: number;
      categoryId?: string;
      search?: string | null;
      availableOnly?: boolean;
      branchId?: string;
    },
  ) {
    const branchId = await this.restaurants.resolveBranchId(ctx, query.branchId);
    const menuId = await this.restaurants.getOrCreateMenuId(ctx.tenantId, branchId);

    const where = {
      tenantId: ctx.tenantId,
      category: { menuId },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.availableOnly ? { isAvailable: true } : {}),
      ...(query.search
        ? {
            OR: [
              { nameFa: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ displayOrder: 'asc' }, { nameFa: 'asc' }],
        include: PRODUCT_INCLUDE,
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...toPublicProduct(row),
        categoryNameFa: row.category.nameFa,
      })),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async get(ctx: RequestContext, id: string) {
    const row = await this.prisma.product.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: PRODUCT_INCLUDE,
    });
    if (!row) throw AppException.notFound('محصول');
    return { ...toPublicProduct(row), categoryNameFa: row.category.nameFa };
  }

  async create(ctx: RequestContext, input: CreateProductInput) {
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!category) throw AppException.notFound('دسته‌بندی');

    const displayOrder =
      input.displayOrder ?? (await this.nextDisplayOrder(ctx, input.categoryId));

    const created = await this.prisma.product.create({
      data: {
        tenantId: ctx.tenantId,
        categoryId: input.categoryId,
        name: input.name,
        nameFa: input.nameFa,
        description: input.description ?? null,
        descriptionFa: input.descriptionFa ?? null,
        imageUrl: input.imageUrl ?? null,
        price: input.price,
        discountPrice: input.discountPrice ?? null,
        isAvailable: input.isAvailable,
        isFeatured: input.isFeatured,
        displayOrder,
        preparationMinutes: input.preparationMinutes ?? null,
        calories: input.calories ?? null,
        ...(input.modifierGroups?.length
          ? {
              modifierGroups: {
                create: input.modifierGroups.map((group) => ({
                  tenantId: ctx.tenantId,
                  name: group.name,
                  nameFa: group.nameFa,
                  type: group.type,
                  isRequired: group.isRequired,
                  minSelect: group.minSelect,
                  maxSelect: group.maxSelect,
                  displayOrder: group.displayOrder,
                  options: {
                    create: group.options.map((option) => ({
                      tenantId: ctx.tenantId,
                      name: option.name,
                      nameFa: option.nameFa,
                      priceDelta: option.priceDelta,
                      isAvailable: option.isAvailable,
                      displayOrder: option.displayOrder,
                    })),
                  },
                })),
              },
            }
          : {}),
      },
      include: PRODUCT_INCLUDE,
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'Product',
      entityId: created.id,
      metadata: { nameFa: created.nameFa, price: created.price },
    });
    return { ...toPublicProduct(created), categoryNameFa: created.category.nameFa };
  }

  async update(ctx: RequestContext, id: string, input: UpdateProductInput) {
    const existing = await this.prisma.product.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, price: true, discountPrice: true },
    });
    if (!existing) throw AppException.notFound('محصول');

    if (input.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: input.categoryId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!category) throw AppException.notFound('دسته‌بندی');
    }

    // The schema can only compare price and discountPrice when both are sent;
    // re-check against the stored values for partial updates.
    const nextPrice = input.price ?? existing.price;
    const nextDiscount =
      input.discountPrice !== undefined ? input.discountPrice : existing.discountPrice;
    if (nextDiscount != null && nextDiscount >= nextPrice) {
      throw AppException.validation('قیمت با تخفیف باید کمتر از قیمت اصلی باشد.', {
        discountPrice: ['قیمت با تخفیف باید کمتر از قیمت اصلی باشد.'],
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Replacing modifier groups wholesale keeps the write idempotent and
      // matches how the admin form submits them.
      if (input.modifierGroups !== undefined) {
        await tx.modifierGroup.deleteMany({ where: { productId: id, tenantId: ctx.tenantId } });
        for (const group of input.modifierGroups) {
          await tx.modifierGroup.create({
            data: {
              tenantId: ctx.tenantId,
              productId: id,
              name: group.name,
              nameFa: group.nameFa,
              type: group.type,
              isRequired: group.isRequired,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              displayOrder: group.displayOrder,
              options: {
                create: group.options.map((option) => ({
                  tenantId: ctx.tenantId,
                  name: option.name,
                  nameFa: option.nameFa,
                  priceDelta: option.priceDelta,
                  isAvailable: option.isAvailable,
                  displayOrder: option.displayOrder,
                })),
              },
            },
          });
        }
      }

      return tx.product.update({
        where: { id, tenantId: ctx.tenantId },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.nameFa !== undefined ? { nameFa: input.nameFa } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.descriptionFa !== undefined
            ? { descriptionFa: input.descriptionFa }
            : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.discountPrice !== undefined
            ? { discountPrice: input.discountPrice }
            : {}),
          ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
          ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
          ...(input.displayOrder !== undefined
            ? { displayOrder: input.displayOrder }
            : {}),
          ...(input.preparationMinutes !== undefined
            ? { preparationMinutes: input.preparationMinutes }
            : {}),
          ...(input.calories !== undefined ? { calories: input.calories } : {}),
        },
        include: PRODUCT_INCLUDE,
      });
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'Product',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return { ...toPublicProduct(updated), categoryNameFa: updated.category.nameFa };
  }

  async setAvailability(ctx: RequestContext, id: string, isAvailable: boolean) {
    const existing = await this.prisma.product.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, nameFa: true },
    });
    if (!existing) throw AppException.notFound('محصول');

    const updated = await this.prisma.product.update({
      where: { id, tenantId: ctx.tenantId },
      data: { isAvailable },
      include: PRODUCT_INCLUDE,
    });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'Product',
      entityId: id,
      metadata: { isAvailable, nameFa: existing.nameFa },
    });
    return { ...toPublicProduct(updated), categoryNameFa: updated.category.nameFa };
  }

  async remove(ctx: RequestContext, id: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, nameFa: true, _count: { select: { orderItems: true } } },
    });
    if (!existing) throw AppException.notFound('محصول');

    // Order items keep a copy of the product name and price, so deleting a
    // product that has been sold is safe: the FK is nulled, history survives.
    await this.prisma.product.delete({ where: { id, tenantId: ctx.tenantId } });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.DELETE,
      entity: 'Product',
      entityId: id,
      metadata: { nameFa: existing.nameFa, soldCount: existing._count.orderItems },
    });
    return { deleted: true };
  }

  async reorder(ctx: RequestContext, items: Array<{ id: string; displayOrder: number }>) {
    const ids = items.map((i) => i.id);
    const owned = await this.prisma.product.count({
      where: { id: { in: ids }, tenantId: ctx.tenantId },
    });
    if (owned !== ids.length) throw AppException.notFound('محصول');

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.product.update({
          where: { id: item.id, tenantId: ctx.tenantId },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    return { reordered: items.length };
  }

  private async nextDisplayOrder(ctx: RequestContext, categoryId: string) {
    const last = await this.prisma.product.findFirst({
      where: { tenantId: ctx.tenantId, categoryId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    return (last?.displayOrder ?? -1) + 1;
  }
}
