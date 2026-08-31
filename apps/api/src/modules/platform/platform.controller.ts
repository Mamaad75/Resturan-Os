import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createPlanSchema,
  extendSubscriptionSchema,
  suspendTenantSchema,
  tenantNotesSchema,
  updatePlanSchema,
  updateSubscriptionSchema,
  uuidSchema,
  type CreatePlanInput,
  type ExtendSubscriptionInput,
  type SuspendTenantInput,
  type TenantNotesInput,
  type UpdatePlanInput,
  type UpdateSubscriptionInput,
} from '@restaurant-os/validation';
import {
  ClientInfo,
  PlatformCtx,
  PlatformOnly,
} from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { PlatformContext } from '../../common/types/request-context';
import { PlansService } from '../plans/plans.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformDashboardService } from './platform-dashboard.service';
import { PlatformPlansService } from './platform-plans.service';
import { PlatformTenantsService, type AuditMeta } from './platform-tenants.service';

/**
 * The FoodOS platform surface.
 *
 * `@PlatformOnly()` on the class means every route here authenticates against
 * PlatformAdmin and is invisible to tenant sessions - a restaurant owner's
 * token fails signature verification before any handler runs.
 */
@ApiTags('platform')
@PlatformOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly dashboard: PlatformDashboardService,
    private readonly tenants: PlatformTenantsService,
    private readonly plans: PlansService,
    private readonly platformPlans: PlatformPlansService,
    private readonly audit: PlatformAuditService,
  ) {}

  /* ------------------------------------------------------------ dashboard */

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform-wide totals, revenue and recent activity' })
  getDashboard() {
    return this.dashboard.summary();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Recent platform administrator actions' })
  getActivity(@Query('limit') limit = '30') {
    return this.audit.list({ limit: Number(limit) || 30 });
  }

  /* -------------------------------------------------------------- tenants */

  @Get('tenants')
  @ApiOperation({ summary: 'Search and page through every business on the platform' })
  listTenants(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('planKey') planKey?: string,
  ) {
    return this.tenants.list({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      search: search?.trim() || null,
      status: status?.trim() || null,
      planKey: planKey?.trim() || null,
    });
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'One business: subscription, usage, branches, staff' })
  getTenant(@ZodParam('id', uuidSchema) id: string) {
    return this.tenants.detail(id);
  }

  @Post('tenants/:id/suspend')
  @ApiOperation({ summary: 'Suspend a business; reads continue, writes stop' })
  suspend(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(suspendTenantSchema) dto: SuspendTenantInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.suspend(admin, id, dto, meta);
  }

  @Post('tenants/:id/activate')
  @ApiOperation({ summary: 'Lift a suspension' })
  activate(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.activate(admin, id, meta);
  }

  @Post('tenants/:id/disable')
  @ApiOperation({ summary: 'Disable a business without touching its subscription' })
  disable(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.setActive(admin, id, false, meta);
  }

  @Post('tenants/:id/restore')
  @ApiOperation({ summary: 'Restore a disabled business' })
  restore(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.setActive(admin, id, true, meta);
  }

  @Patch('tenants/:id/notes')
  @ApiOperation({ summary: 'Platform-only notes about a business' })
  setNotes(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(tenantNotesSchema) dto: TenantNotesInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.setNotes(admin, id, dto, meta);
  }

  /* --------------------------------------------------------- subscription */

  @Patch('tenants/:id/subscription')
  @ApiOperation({ summary: 'Change plan, status, or any subscription date' })
  updateSubscription(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateSubscriptionSchema) dto: UpdateSubscriptionInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.updateSubscription(admin, id, dto, meta);
  }

  @Post('tenants/:id/subscription/extend')
  @ApiOperation({ summary: 'Extend the subscription by a number of days' })
  extend(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(extendSubscriptionSchema) dto: ExtendSubscriptionInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.tenants.extend(admin, id, dto, meta);
  }

  /* ---------------------------------------------------------------- plans */

  @Get('plans')
  @ApiOperation({ summary: 'Every plan, including inactive ones' })
  listPlans() {
    return this.plans.listPlans(true);
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a plan' })
  createPlan(
    @PlatformCtx() admin: PlatformContext,
    @ZodBody(createPlanSchema) dto: CreatePlanInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.platformPlans.create(admin, dto, meta);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Change a plan s limits, features or price' })
  updatePlan(
    @PlatformCtx() admin: PlatformContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updatePlanSchema) dto: UpdatePlanInput,
    @ClientInfo() meta: AuditMeta,
  ) {
    return this.platformPlans.update(admin, id, dto, meta);
  }
}
