import { Inject, Injectable } from '@nestjs/common';
import { AuditAction, QrCodeType, type QrCodeDto } from '@restaurant-os/types';
import * as QRCode from 'qrcode';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

/**
 * QR codes encode a *routing path only* - never menu content.
 *
 * That is the whole point: a printed table card keeps working after a price
 * change, a renamed product or a whole menu redesign, because the client
 * always fetches the live menu from the path the code points at.
 */
@Injectable()
export class QrService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly restaurants: RestaurantsService,
    private readonly audit: AuditService,
  ) {}

  private absoluteUrl(path: string): string {
    return `${this.config.appUrl.replace(/\/$/, '')}${path}`;
  }

  async list(ctx: RequestContext, branchId?: string): Promise<QrCodeDto[]> {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const rows = await this.prisma.qrCode.findMany({
      where: { tenantId: ctx.tenantId, branchId: resolvedBranchId },
      orderBy: [{ type: 'asc' }, { label: 'asc' }],
      include: { table: { select: { number: true } } },
    });

    return rows
      .map((row) => ({
        id: row.id,
        type: row.type,
        label: row.label,
        targetUrl: this.absoluteUrl(row.targetPath),
        tableId: row.tableId,
        branchId: row.branchId,
        scanCount: row.scanCount,
        tableNumber: row.table?.number ?? null,
        createdAt: row.createdAt.toISOString(),
      }))
      .sort((a, b) => (a.tableNumber ?? -1) - (b.tableNumber ?? -1));
  }

  /**
   * Idempotently ensures a restaurant-level code plus one code per table.
   * Safe to call after adding tables; existing codes are left untouched so
   * already-printed cards stay valid.
   */
  async syncForBranch(ctx: RequestContext, branchId?: string) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const restaurant = await this.restaurants.getRestaurantEntity(ctx.tenantId);

    const [tables, existing] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where: { tenantId: ctx.tenantId, branchId: resolvedBranchId },
        orderBy: { number: 'asc' },
        select: { id: true, number: true, name: true },
      }),
      this.prisma.qrCode.findMany({
        where: { tenantId: ctx.tenantId, branchId: resolvedBranchId },
        select: { id: true, type: true, tableId: true },
      }),
    ]);

    const existingTableIds = new Set(
      existing.filter((q) => q.tableId).map((q) => q.tableId as string),
    );
    const hasRestaurantCode = existing.some((q) => q.type === QrCodeType.RESTAURANT);

    const toCreate: Array<{
      tenantId: string;
      branchId: string;
      tableId: string | null;
      type: QrCodeType;
      label: string;
      targetPath: string;
    }> = [];

    if (!hasRestaurantCode) {
      toCreate.push({
        tenantId: ctx.tenantId,
        branchId: resolvedBranchId,
        tableId: null,
        type: QrCodeType.RESTAURANT,
        label: `منوی ${restaurant.name}`,
        targetPath: `/r/${restaurant.slug}`,
      });
    }

    for (const table of tables) {
      if (existingTableIds.has(table.id)) continue;
      toCreate.push({
        tenantId: ctx.tenantId,
        branchId: resolvedBranchId,
        tableId: table.id,
        type: QrCodeType.TABLE,
        label: table.name ?? `میز ${table.number}`,
        targetPath: `/r/${restaurant.slug}/t/${table.number}`,
      });
    }

    if (toCreate.length > 0) {
      await this.prisma.qrCode.createMany({ data: toCreate });
      this.audit.record({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: AuditAction.CREATE,
        entity: 'QrCode',
        metadata: { created: toCreate.length, branchId: resolvedBranchId },
      });
    }

    return { created: toCreate.length, total: existing.length + toCreate.length };
  }

  async getOne(ctx: RequestContext, id: string) {
    const row = await this.prisma.qrCode.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { table: { select: { number: true } } },
    });
    if (!row) throw AppException.notFound('کد QR');
    return row;
  }

  async remove(ctx: RequestContext, id: string) {
    await this.getOne(ctx, id);
    await this.prisma.qrCode.delete({ where: { id, tenantId: ctx.tenantId } });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.DELETE,
      entity: 'QrCode',
      entityId: id,
    });
    return { deleted: true };
  }

  /** Vector output for print: crisp at any physical size. */
  async renderSvg(ctx: RequestContext, id: string): Promise<string> {
    const row = await this.getOne(ctx, id);
    return QRCode.toString(this.absoluteUrl(row.targetPath), {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#0B0B0DFF', light: '#FFFFFFFF' },
    });
  }

  /** Raster output for sharing in chat apps and quick previews. */
  async renderPng(ctx: RequestContext, id: string, size = 640): Promise<Buffer> {
    const row = await this.getOne(ctx, id);
    return QRCode.toBuffer(this.absoluteUrl(row.targetPath), {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: Math.min(Math.max(size, 128), 2048),
      color: { dark: '#0B0B0DFF', light: '#FFFFFFFF' },
    });
  }

  /** Data URL used by the admin preview and the printable sheet. */
  async renderDataUrl(targetPath: string, size = 320): Promise<string> {
    return QRCode.toDataURL(this.absoluteUrl(targetPath), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#0B0B0DFF', light: '#FFFFFFFF' },
    });
  }

  /** Everything the printable QR sheet needs, in one request. */
  async printSheet(ctx: RequestContext, branchId?: string) {
    const resolvedBranchId = await this.restaurants.resolveBranchId(ctx, branchId);
    const restaurant = await this.restaurants.getRestaurantEntity(ctx.tenantId);
    const rows = await this.prisma.qrCode.findMany({
      where: { tenantId: ctx.tenantId, branchId: resolvedBranchId },
      orderBy: [{ type: 'asc' }],
      include: { table: { select: { number: true } } },
    });

    const codes = await Promise.all(
      rows
        .sort((a, b) => (a.table?.number ?? -1) - (b.table?.number ?? -1))
        .map(async (row) => ({
          id: row.id,
          label: row.label,
          type: row.type,
          tableNumber: row.table?.number ?? null,
          targetUrl: this.absoluteUrl(row.targetPath),
          dataUrl: await this.renderDataUrl(row.targetPath, 320),
        })),
    );

    return {
      restaurant: {
        name: restaurant.name,
        logoUrl: restaurant.logoUrl,
        tagline: restaurant.tagline,
      },
      codes,
    };
  }
}
