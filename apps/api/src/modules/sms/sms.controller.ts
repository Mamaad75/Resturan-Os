import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, SmsStatus } from '@restaurant-os/types';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { SmsService } from './sms.service';

@ApiTags('sms')
@Controller('sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Outbound SMS log with delivery status' })
  list(
    @Ctx() ctx: RequestContext,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '30',
    @Query('status') status?: SmsStatus,
  ) {
    return this.sms.list(ctx, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 30)),
      status,
    });
  }
}
