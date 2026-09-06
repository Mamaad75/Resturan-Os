import { Controller, Get, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  adjustPointsSchema,
  loyaltyProgramSchema,
  uuidSchema,
  type AdjustPointsInput,
  type LoyaltyProgramInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { LoyaltyService } from './loyalty.service';

/**
 * The points scheme and its ledger.
 *
 * Reading a balance needs the CRM read permission; changing the scheme or
 * correcting a balance by hand needs settings management, because both decide
 * what customers are owed.
 */
@ApiTags('loyalty')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('program')
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Current points rules' })
  program(@Ctx() ctx: RequestContext) {
    return this.loyalty.getProgram(ctx);
  }

  @Put('program')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Set the earn rate, point value and caps' })
  save(
    @Ctx() ctx: RequestContext,
    @ZodBody(loyaltyProgramSchema) dto: LoyaltyProgramInput,
  ) {
    return this.loyalty.saveProgram(ctx, dto);
  }

  @Get('customers/:id')
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Balance, tier and recent point history' })
  customer(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.loyalty.customerSummary(ctx, id);
  }

  @Post('customers/:id/adjust')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Correct a balance by hand, with a stated reason' })
  adjust(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(adjustPointsSchema) dto: AdjustPointsInput,
  ) {
    return this.loyalty.adjust(ctx, id, dto);
  }
}
