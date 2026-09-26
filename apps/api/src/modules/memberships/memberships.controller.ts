import { Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  cancelMembershipSchema,
  grantMembershipSchema,
  membershipPlanSchema,
  updateMembershipPlanSchema,
  uuidSchema,
  type GrantMembershipInput,
  type MembershipPlanInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { MembershipsService } from './memberships.service';

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('plans')
  @RequirePermissions(Permission.MEMBERSHIP_READ)
  plans(@Ctx() ctx: RequestContext) { return this.memberships.listPlans(ctx); }

  @Post('plans')
  @RequirePermissions(Permission.MEMBERSHIP_MANAGE)
  createPlan(@Ctx() ctx: RequestContext, @ZodBody(membershipPlanSchema) dto: MembershipPlanInput) {
    return this.memberships.createPlan(ctx, dto);
  }

  @Patch('plans/:id')
  @RequirePermissions(Permission.MEMBERSHIP_MANAGE)
  updatePlan(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateMembershipPlanSchema) dto: Partial<MembershipPlanInput>,
  ) { return this.memberships.updatePlan(ctx, id, dto); }

  @Get()
  @RequirePermissions(Permission.MEMBERSHIP_READ)
  list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    return this.memberships.listMemberships(ctx, status);
  }

  @Post()
  @RequirePermissions(Permission.MEMBERSHIP_MANAGE)
  grant(@Ctx() ctx: RequestContext, @ZodBody(grantMembershipSchema) dto: GrantMembershipInput) {
    return this.memberships.grant(ctx, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.MEMBERSHIP_MANAGE)
  cancel(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(cancelMembershipSchema) dto: { reason?: string | null },
  ) { return this.memberships.cancel(ctx, id, dto.reason); }
}
