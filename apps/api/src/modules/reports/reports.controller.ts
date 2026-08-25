import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import { reportQuerySchema, type ReportQueryInput } from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodQuery } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({
    summary: 'Dashboard summary',
    description:
      'Today vs yesterday, hourly and 14-day series, live orders, table ' +
      'occupancy and top products. Every figure is a real database aggregate.',
  })
  dashboard(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.reports.dashboard(ctx, branchId);
  }

  @Get('reports/sales')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({
    summary: 'Sales report for a preset or custom range',
    description: 'Buckets are Asia/Tehran day and hour boundaries.',
  })
  sales(@Ctx() ctx: RequestContext, @ZodQuery(reportQuerySchema) query: ReportQueryInput) {
    return this.reports.salesReport(ctx, query);
  }

  @Get('reports/hourly')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Hourly sales for the requested range' })
  async hourly(
    @Ctx() ctx: RequestContext,
    @ZodQuery(reportQuerySchema) query: ReportQueryInput,
  ) {
    const report = await this.reports.salesReport(ctx, {
      ...query,
      granularity: 'hour',
    });
    return { range: report.range, series: report.series, peakHours: report.peakHours };
  }
}
