import { Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  bulkCreateTablesSchema,
  createTableSchema,
  updateTableSchema,
  uuidSchema,
  type CreateTableInput,
  type UpdateTableInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { TablesService } from './tables.service';

@ApiTags('tables')
@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @RequirePermissions(Permission.TABLE_READ)
  @ApiOperation({ summary: 'Floor plan with each table status and its open order' })
  list(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.tables.list(ctx, branchId);
  }

  @Post()
  @RequirePermissions(Permission.TABLE_MANAGE)
  @ApiOperation({ summary: 'Create a table' })
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createTableSchema) dto: CreateTableInput,
    @Query('branchId') branchId?: string,
  ) {
    return this.tables.create(ctx, dto, branchId);
  }

  @Post('bulk')
  @RequirePermissions(Permission.TABLE_MANAGE)
  @ApiOperation({ summary: 'Create a numbered range of tables in one call' })
  bulkCreate(
    @Ctx() ctx: RequestContext,
    @ZodBody(bulkCreateTablesSchema)
    dto: { from: number; to: number; capacity: number; zone?: string | null },
    @Query('branchId') branchId?: string,
  ) {
    return this.tables.bulkCreate(ctx, dto, branchId);
  }

  @Patch(':id')
  @RequirePermissions(Permission.TABLE_MANAGE)
  @ApiOperation({ summary: 'Update a table or change its status' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateTableSchema) dto: UpdateTableInput,
  ) {
    return this.tables.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.TABLE_MANAGE)
  @ApiOperation({ summary: 'Delete a table that is not occupied' })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.tables.remove(ctx, id);
  }
}
