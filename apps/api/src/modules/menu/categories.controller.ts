import { Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createCategorySchema,
  reorderSchema,
  updateCategorySchema,
  uuidSchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(Permission.MENU_READ)
  @ApiOperation({ summary: 'List categories with product counts' })
  list(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.categories.list(ctx, branchId);
  }

  @Post()
  @RequirePermissions(Permission.CATEGORY_MANAGE)
  @ApiOperation({ summary: 'Create a category' })
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createCategorySchema) dto: CreateCategoryInput,
    @Query('branchId') branchId?: string,
  ) {
    return this.categories.create(ctx, dto, branchId);
  }

  @Post('reorder')
  @RequirePermissions(Permission.CATEGORY_MANAGE)
  @ApiOperation({ summary: 'Persist a new category display order' })
  reorder(
    @Ctx() ctx: RequestContext,
    @ZodBody(reorderSchema) dto: { items: Array<{ id: string; displayOrder: number }> },
  ) {
    return this.categories.reorder(ctx, dto.items);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CATEGORY_MANAGE)
  @ApiOperation({ summary: 'Update a category' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateCategorySchema) dto: UpdateCategoryInput,
  ) {
    return this.categories.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CATEGORY_MANAGE)
  @ApiOperation({ summary: 'Delete an empty category' })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.categories.remove(ctx, id);
  }
}
