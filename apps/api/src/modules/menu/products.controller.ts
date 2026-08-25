import { Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createProductSchema,
  reorderSchema,
  toggleAvailabilitySchema,
  updateProductSchema,
  uuidSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permission.PRODUCT_READ)
  @ApiOperation({ summary: 'Search and page through products' })
  list(
    @Ctx() ctx: RequestContext,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('availableOnly') availableOnly?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.products.list(ctx, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(200, Math.max(1, Number(pageSize) || 50)),
      categoryId,
      search: search?.trim() || null,
      availableOnly: availableOnly === 'true',
      branchId,
    });
  }

  @Post()
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Create a product, optionally with modifier groups' })
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createProductSchema) dto: CreateProductInput,
  ) {
    return this.products.create(ctx, dto);
  }

  @Post('reorder')
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Persist a new product display order' })
  reorder(
    @Ctx() ctx: RequestContext,
    @ZodBody(reorderSchema) dto: { items: Array<{ id: string; displayOrder: number }> },
  ) {
    return this.products.reorder(ctx, dto.items);
  }

  @Get(':id')
  @RequirePermissions(Permission.PRODUCT_READ)
  @ApiOperation({ summary: 'Get one product with its modifier groups' })
  get(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.products.get(ctx, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Update a product' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateProductSchema) dto: UpdateProductInput,
  ) {
    return this.products.update(ctx, id, dto);
  }

  @Patch(':id/availability')
  // Cashiers and kitchen staff need to 86 an item without full menu rights.
  @RequirePermissions(Permission.PRODUCT_MANAGE, Permission.KITCHEN_UPDATE)
  @ApiOperation({ summary: 'Mark a product available or sold out' })
  setAvailability(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(toggleAvailabilitySchema) dto: { isAvailable: boolean },
  ) {
    return this.products.setAvailability(ctx, id, dto.isAvailable);
  }

  @Delete(':id')
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Delete a product; sold history is preserved' })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.products.remove(ctx, id);
  }
}
