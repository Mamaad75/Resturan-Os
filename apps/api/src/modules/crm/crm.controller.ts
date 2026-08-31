import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerSegment, Permission } from '@restaurant-os/types';
import {
  createCampaignSchema,
  customerSegmentSchema,
  updateCustomerSchema,
  uuidSchema,
  type CreateCampaignInput,
  type UpdateCustomerInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { CampaignsService } from './campaigns.service';
import { LISTABLE_SEGMENTS, SEGMENT_DESCRIPTION_FA, SEGMENT_LABEL_FA } from './customer-segments';
import { CustomersService } from './customers.service';

/**
 * The restaurant's customer book.
 *
 * Guarded by `REPORT_READ` for reads and `SETTINGS_MANAGE` for writes: seeing
 * who your regulars are is management information, and editing a customer's
 * consent is an administrative act. A waiter or kitchen account reaches
 * neither.
 */
@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Search, filter and page through customers' })
  list(
    @Ctx() ctx: RequestContext,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('segment') segment?: string,
    @Query('consentOnly') consentOnly?: string,
  ) {
    const parsed = segment ? customerSegmentSchema.safeParse(segment) : null;
    return this.customers.list(ctx, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
      search: search?.trim() || null,
      segment: parsed?.success ? (parsed.data as CustomerSegment) : null,
      consentOnly: consentOnly === 'true',
    });
  }

  @Get('segments')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Segment definitions with live counts' })
  async segments(@Ctx() ctx: RequestContext) {
    const counts = await this.customers.segmentCounts(ctx);
    return counts.map((entry) => ({
      ...entry,
      labelFa: SEGMENT_LABEL_FA[entry.segment],
      descriptionFa: SEGMENT_DESCRIPTION_FA[entry.segment],
    }));
  }

  @Get(':id')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'One customer with their recent orders' })
  get(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.customers.get(ctx, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Edit a customer s name, tags, notes or consent' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateCustomerSchema) dto: UpdateCustomerInput,
  ) {
    return this.customers.update(ctx, id, dto);
  }
}

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Campaign history' })
  list(@Ctx() ctx: RequestContext) {
    return this.campaigns.list(ctx);
  }

  @Get('preview')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'How many opted-in customers a segment would reach' })
  preview(@Ctx() ctx: RequestContext, @Query('segment') segment = 'ALL') {
    const parsed = customerSegmentSchema.safeParse(segment);
    return this.campaigns.preview(
      ctx,
      (parsed.success ? parsed.data : CustomerSegment.ALL) as CustomerSegment,
    );
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Draft a campaign' })
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createCampaignSchema) dto: CreateCampaignInput,
  ) {
    return this.campaigns.create(ctx, dto);
  }

  @Post(':id/send')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Send a draft campaign to its segment' })
  send(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.campaigns.send(ctx, id);
  }
}
