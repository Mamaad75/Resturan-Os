import { Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createStaffSchema,
  resetStaffPasswordSchema,
  updateStaffSchema,
  uuidSchema,
  type CreateStaffInput,
  type UpdateStaffInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { StaffService } from './staff.service';

@ApiTags('staff')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions(Permission.STAFF_READ)
  @ApiOperation({ summary: 'List staff accounts in the current tenant' })
  list(@Ctx() ctx: RequestContext) {
    return this.staff.list(ctx);
  }

  @Post()
  @RequirePermissions(Permission.STAFF_MANAGE)
  @ApiOperation({ summary: 'Create a staff account' })
  create(@Ctx() ctx: RequestContext, @ZodBody(createStaffSchema) dto: CreateStaffInput) {
    return this.staff.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.STAFF_MANAGE)
  @ApiOperation({ summary: 'Update a staff account, its role or its branch' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateStaffSchema) dto: UpdateStaffInput,
  ) {
    return this.staff.update(ctx, id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions(Permission.STAFF_MANAGE)
  @ApiOperation({ summary: 'Set a new password and revoke that user sessions' })
  resetPassword(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(resetStaffPasswordSchema) dto: { newPassword: string },
  ) {
    return this.staff.resetPassword(ctx, id, dto.newPassword);
  }

  @Delete(':id')
  @RequirePermissions(Permission.STAFF_MANAGE)
  @ApiOperation({ summary: 'Disable a staff account; history is preserved' })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.staff.remove(ctx, id);
  }
}
