import { Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from '@restaurant-os/types';
import {
  referralProgramSchema,
  slugSchema,
  type ReferralProgramInput,
} from '@restaurant-os/validation';
import { z } from 'zod';
import {
  Ctx,
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import { PUBLIC_MENU_THROTTLE } from '../../common/throttle';
import type { RequestContext } from '../../common/types/request-context';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ReferralsService } from './referrals.service';

/** 48 hex characters, as produced by generateOpaqueToken(24). */
const trackingTokenSchema = z.string().regex(/^[a-f0-9]{48}$/);

/**
 * The owner's side: the terms of the invitation.
 *
 * Gated like coupons and checkout offers - deciding what a guest pays less for
 * is one authority, wherever the discount comes from.
 */
@ApiTags('referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('program')
  @RequirePermissions(Permission.REPORT_READ, Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'The referral programme, with how much it has paid out' })
  program(@Ctx() ctx: RequestContext) {
    return this.referrals.program(ctx);
  }

  @Put('program')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Set the terms of the invitation',
    description:
      'Rewards already earned keep the terms they were earned under; this only ' +
      'changes what future invitations are worth.',
  })
  saveProgram(
    @Ctx() ctx: RequestContext,
    @ZodBody(referralProgramSchema) dto: ReferralProgramInput,
  ) {
    return this.referrals.saveProgram(ctx, dto);
  }
}

/**
 * The guest's side: their own code, their progress and what they have earned.
 *
 * Reached with the tracking token of one of their own orders. A phone number
 * would let anyone read a stranger's rewards, so it is not accepted.
 */
@ApiTags('public-referrals')
@Controller('public/restaurants/:slug')
export class PublicReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly restaurants: RestaurantsService,
  ) {}

  @Public()
  @Get('referral')
  @Throttle(PUBLIC_MENU_THROTTLE)
  @ApiOperation({
    summary: 'This guest s invitation code, progress and unspent rewards',
  })
  async panel(
    @ZodParam('slug', slugSchema) slug: string,
    @Query('token') token?: string,
  ) {
    const parsed = trackingTokenSchema.safeParse(token ?? '');
    // An unrecognised guest is told the programme is off rather than refused:
    // this sits on a page that must render for someone with no history.
    if (!parsed.success) return inactivePanel();

    const resolved = await this.restaurants.findPublicBySlug(slug);
    const customerId = await this.referrals.customerFor(
      resolved.tenantId,
      parsed.data,
    );
    if (!customerId) return inactivePanel();

    return this.referrals.panel(resolved.tenantId, customerId);
  }
}

function inactivePanel() {
  return {
    isActive: false,
    code: null,
    invitedCount: 0,
    invitesRequired: 0,
    rewardLabelFa: '',
    friendRewardLabelFa: null,
    termsFa: null,
    rewards: [],
  };
}
