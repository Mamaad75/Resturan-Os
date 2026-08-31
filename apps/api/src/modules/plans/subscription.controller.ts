import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  AllowInactiveSubscription,
  Ctx,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { PlansService } from './plans.service';

/**
 * What the tenant can see about their own plan.
 *
 * Read-only by design: a restaurant cannot change its own subscription, only
 * the platform can. Marked `@AllowInactiveSubscription()` so an owner whose
 * subscription has lapsed can still reach the page that explains why.
 */
@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @AllowInactiveSubscription()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Current plan, status, limits and usage' })
  async get(@Ctx() ctx: RequestContext) {
    const [subscription, entitlements] = await Promise.all([
      this.plans.subscriptionDto(ctx.tenantId),
      this.plans.entitlements(ctx.tenantId),
    ]);
    return { subscription, entitlements };
  }

  @Get('plans')
  @AllowInactiveSubscription()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Plans available to upgrade to' })
  listPlans() {
    return this.plans.listPlans(false);
  }
}
