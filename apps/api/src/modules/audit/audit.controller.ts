import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'List audit log entries for the current tenant' })
  list(
    @Ctx() ctx: RequestContext,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '30',
    @Query('entity') entity?: string,
    @Query('userId') userId?: string,
  ) {
    return this.auditService.list(ctx, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 30)),
      entity,
      userId,
    });
  }
}
