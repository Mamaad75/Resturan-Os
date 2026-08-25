import { Controller, Delete, Get, Header, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import { uuidSchema } from '@restaurant-os/validation';
import type { Response } from 'express';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { QrService } from './qr.service';

@ApiTags('qr')
@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get()
  @RequirePermissions(Permission.QR_MANAGE)
  @ApiOperation({ summary: 'List QR codes for a branch' })
  list(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.qr.list(ctx, branchId);
  }

  @Post('sync')
  @RequirePermissions(Permission.QR_MANAGE)
  @ApiOperation({ summary: 'Create any missing restaurant/table QR codes' })
  sync(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.qr.syncForBranch(ctx, branchId);
  }

  @Get('print-sheet')
  @RequirePermissions(Permission.QR_MANAGE)
  @ApiOperation({ summary: 'All QR codes as data URLs, ready for a print layout' })
  printSheet(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.qr.printSheet(ctx, branchId);
  }

  @Get(':id/svg')
  @RequirePermissions(Permission.QR_MANAGE)
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({ summary: 'Download a QR code as SVG' })
  async svg(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Content-Disposition', `inline; filename="qr-${id}.svg"`);
    return this.qr.renderSvg(ctx, id);
  }

  @Get(':id/png')
  @RequirePermissions(Permission.QR_MANAGE)
  @ApiOperation({ summary: 'Download a QR code as PNG' })
  async png(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @Query('size') size: string | undefined,
    @Res() response: Response,
  ) {
    const buffer = await this.qr.renderPng(ctx, id, Number(size) || 640);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Disposition', `attachment; filename="qr-${id}.png"`);
    response.send(buffer);
  }

  @Delete(':id')
  @RequirePermissions(Permission.QR_MANAGE)
  @ApiOperation({ summary: 'Delete a QR code' })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.qr.remove(ctx, id);
  }
}
