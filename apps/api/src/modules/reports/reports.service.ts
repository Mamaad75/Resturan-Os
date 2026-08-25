import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_ORDER_STATUSES,
  KITCHEN_ACTIVE_STATUSES,
  OrderStatus,
  TableStatus,
  toPersianDigits,
  type DashboardSummary,
  type SalesReport,
  type SalesTotals,
  type TimeSeriesPoint,
  type TopCategory,
  type TopProduct,
} from '@restaurant-os/types';
import type { ReportQueryInput } from '@restaurant-os/validation';
import { toNumber } from '../../common/utils/money.util';
import {
  resolveReportRange,
  TEHRAN_TZ,
  tehranDayRange,
  tehranRangeForDays,
} from '../../common/utils/time.util';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ORDER_SUMMARY_INCLUDE, toOrderSummaryDto } from '../orders/order.mappers';

/**
 * Operational sales analytics.
 *
 * Every figure is computed by SQL against real orders - nothing here is
 * approximated or cached client-side. Day and hour buckets are Asia/Tehran
 * boundaries: `createdAt` is a naive UTC timestamp, so it is anchored to UTC
 * and then converted, otherwise "today" would be off by three and a half hours
 * for every restaurant on the platform.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  async salesReport(ctx: RequestContext, query: ReportQueryInput): Promise<SalesReport> {
    const branchId = await this.restaurants.resolveBranchId(ctx, query.branchId);
    const range = resolveReportRange(query.preset, query.from, query.to);

    const [totals, series, byOrderType, byPaymentMethod, topProducts, topCategories, peakHours] =
      await Promise.all([
        this.totals(ctx.tenantId, branchId, range),
        this.series(ctx.tenantId, branchId, range, query.granularity),
        this.byOrderType(ctx.tenantId, branchId, range),
        this.byPaymentMethod(ctx.tenantId, branchId, range),
        this.topProducts(ctx.tenantId, branchId, range, 10),
        this.topCategories(ctx.tenantId, branchId, range, 10),
        this.peakHours(ctx.tenantId, branchId, range),
      ]);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timezone: TEHRAN_TZ,
      },
      totals,
      breakdown: { byOrderType, byPaymentMethod },
      series,
      topProducts,
      topCategories,
      peakHours,
    };
  }

  async dashboard(ctx: RequestContext, branchIdInput?: string): Promise<DashboardSummary> {
    const branchId = await this.restaurants.resolveBranchId(ctx, branchIdInput);
    const today = tehranDayRange();
    const yesterday = {
      from: new Date(today.from.getTime() - 24 * 60 * 60 * 1000),
      to: today.from,
    };
    const last14Days = tehranRangeForDays(14);

    const [
      todayTotals,
      yesterdayTotals,
      hourlySeries,
      dailySeries,
      topProducts,
      paymentBreakdown,
      orderTypeBreakdown,
      tableStats,
      liveOrders,
      kitchenQueueCount,
      unavailableProducts,
    ] = await Promise.all([
      this.totals(ctx.tenantId, branchId, today),
      this.totals(ctx.tenantId, branchId, yesterday),
      this.series(ctx.tenantId, branchId, today, 'hour'),
      this.series(ctx.tenantId, branchId, last14Days, 'day'),
      this.topProducts(ctx.tenantId, branchId, today, 5),
      this.byPaymentMethod(ctx.tenantId, branchId, today),
      this.byOrderType(ctx.tenantId, branchId, today),
      this.tableStats(ctx.tenantId, branchId),
      this.prisma.order.findMany({
        where: {
          tenantId: ctx.tenantId,
          branchId,
          status: { in: ACTIVE_ORDER_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: ORDER_SUMMARY_INCLUDE,
      }),
      this.prisma.order.count({
        where: {
          tenantId: ctx.tenantId,
          branchId,
          status: { in: KITCHEN_ACTIVE_STATUSES },
        },
      }),
      this.prisma.product.findMany({
        where: { tenantId: ctx.tenantId, isAvailable: false },
        select: { id: true, nameFa: true },
        take: 10,
      }),
    ]);

    return {
      today: todayTotals,
      yesterdayComparison: {
        grossSalesDeltaPct: percentDelta(
          yesterdayTotals.grossSales,
          todayTotals.grossSales,
        ),
        orderCountDeltaPct: percentDelta(
          yesterdayTotals.orderCount,
          todayTotals.orderCount,
        ),
      },
      activeTables: tableStats,
      liveOrders: liveOrders.map(toOrderSummaryDto),
      kitchenQueueCount,
      hourlySeries,
      dailySeries,
      topProducts,
      paymentBreakdown,
      orderTypeBreakdown,
      unavailableProducts,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Queries                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Revenue counts orders that were actually paid and not cancelled. An order
   * sitting unpaid on a table is not revenue yet, and a cancelled one never
   * was.
   */
  private revenueFilter(tenantId: string, branchId: string, range: { from: Date; to: Date }) {
    return Prisma.sql`
      "tenantId" = ${tenantId}::uuid
      AND "branchId" = ${branchId}::uuid
      AND "status" <> 'CANCELLED'
      AND "paymentStatus" = 'PAID'
      AND "createdAt" >= ${range.from}
      AND "createdAt" < ${range.to}
    `;
  }

  private async totals(
    tenantId: string,
    branchId: string,
    range: { from: Date; to: Date },
  ): Promise<SalesTotals> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        gross: bigint | null;
        discount: bigint | null;
        tax: bigint | null;
        service: bigint | null;
        orders: bigint;
      }>
    >`
      SELECT COALESCE(SUM("total"), 0)               AS gross,
             COALESCE(SUM("discountTotal"), 0)       AS discount,
             COALESCE(SUM("taxTotal"), 0)            AS tax,
             COALESCE(SUM("serviceChargeTotal"), 0)  AS service,
             COUNT(*)                                AS orders
        FROM "orders"
       WHERE ${this.revenueFilter(tenantId, branchId, range)}
    `;

    const row = rows[0];
    const grossSales = toNumber(row?.gross);
    const discountTotal = toNumber(row?.discount);
    const taxTotal = toNumber(row?.tax);
    const serviceChargeTotal = toNumber(row?.service);
    const orderCount = toNumber(row?.orders);

    return {
      grossSales,
      discountTotal,
      // Net of the amounts that are not the restaurant's own revenue.
      netSales: grossSales - taxTotal - serviceChargeTotal,
      taxTotal,
      serviceChargeTotal,
      orderCount,
      averageOrderValue: orderCount > 0 ? Math.round(grossSales / orderCount) : 0,
    };
  }

  /**
   * Bucketed sales over time.
   *
   * The label components come back from SQL as plain integers rather than as a
   * timestamp: `date_trunc` on a naive timestamp yields Tehran wall-clock time,
   * which the driver would then re-interpret through the process timezone and
   * shift. Reading the parts directly sidesteps that entirely.
   */
  private async series(
    tenantId: string,
    branchId: string,
    range: { from: Date; to: Date },
    granularity: 'hour' | 'day' | 'week' | 'month',
  ): Promise<TimeSeriesPoint[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: string;
        hour: number;
        day: number;
        month: number;
        year: number;
        orders: bigint;
        total: bigint | null;
      }>
    >`
      WITH bucketed AS (
        SELECT date_trunc(
                 ${granularity},
                 ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TEHRAN_TZ}
               ) AS b,
               "total"
          FROM "orders"
         WHERE ${this.revenueFilter(tenantId, branchId, range)}
      )
      SELECT to_char(b, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket,
             EXTRACT(HOUR  FROM b)::int            AS hour,
             EXTRACT(DAY   FROM b)::int            AS day,
             EXTRACT(MONTH FROM b)::int            AS month,
             EXTRACT(YEAR  FROM b)::int            AS year,
             COUNT(*)                              AS orders,
             COALESCE(SUM("total"), 0)             AS total
        FROM bucketed
       GROUP BY b
       ORDER BY b ASC
    `;

    return rows.map((row) => ({
      bucket: row.bucket,
      label: formatBucketLabel(row, granularity),
      orderCount: toNumber(row.orders),
      total: toNumber(row.total),
    }));
  }

  private async peakHours(
    tenantId: string,
    branchId: string,
    range: { from: Date; to: Date },
  ): Promise<TimeSeriesPoint[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ hour: number; orders: bigint; total: bigint | null }>
    >`
      SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TEHRAN_TZ})::int AS hour,
             COUNT(*)                   AS orders,
             COALESCE(SUM("total"), 0)  AS total
        FROM "orders"
       WHERE ${this.revenueFilter(tenantId, branchId, range)}
       GROUP BY hour
       ORDER BY hour ASC
    `;

    return rows.map((row) => ({
      bucket: String(row.hour).padStart(2, '0'),
      label: `${toPersianDigits(String(row.hour).padStart(2, '0'))}:۰۰`,
      orderCount: toNumber(row.orders),
      total: toNumber(row.total),
    }));
  }

  private async byOrderType(
    tenantId: string,
    branchId: string,
    range: { from: Date; to: Date },
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ type: string; orders: bigint; total: bigint | null }>
    >`
      SELECT "type",
             COUNT(*)                   AS orders,
             COALESCE(SUM("total"), 0)  AS total
        FROM "orders"
       WHERE ${this.revenueFilter(tenantId, branchId, range)}
       GROUP BY "type"
    `;
    return rows.map((row) => ({
      type: row.type as SalesReport['breakdown']['byOrderType'][number]['type'],
      orderCount: toNumber(row.orders),
      total: toNumber(row.total),
    }));
  }

  private async byPaymentMethod(
    tenantId: string,
    branchId: string,
    range: { from: Date; to: Date },
  ) {
    // Joined through orders so the branch and date filters stay consistent
    // with every other figure on the report.
    const rows = await this.prisma.$queryRaw<
      Array<{ method: string; payments: bigint; total: bigint | null }>
    >`
      SELECT p."method",
             COUNT(*)                                      AS payments,
             COALESCE(SUM(p."amount" - p."refundAmount"), 0) AS total
        FROM "payments" p
        JOIN "orders" o ON o."id" = p."orderId"
       WHERE p."tenantId" = ${tenantId}::uuid
         AND o."branchId" = ${branchId}::uuid
         AND p."status" IN ('PAID', 'REFUNDED')
         AND o."createdAt" >= ${range.from}
         AND o."createdAt" < ${range.to}
       GROUP BY p."method"
    `;
    return rows.map((row) => ({
      method: row.method as SalesReport['breakdown']['byPaymentMethod'][number]['method'],
      paymentCount: toNumber(row.payments),
      total: toNumber(row.total),
    }));
  }

  private async topProducts(
    tenantId: string,
    branchId: string,
    range: { from: Date; to: Date },
    limit: number,
  ): Promise<TopProduct[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        productId: string | null;
        name: string;
        nameFa: string;
        categoryNameFa: string | null;
        quantity: bigint;
        total: bigint | null;
      }>
    >`
      SELECT oi."productId"                        AS "productId",
             oi."productName"                      AS name,
             oi."productNameFa"                    AS "nameFa",
             c."nameFa"                            AS "categoryNameFa",
             COALESCE(SUM(oi."quantity"), 0)       AS quantity,
             COALESCE(SUM(oi."lineTotal"), 0)      AS total
        FROM "order_items" oi
        JOIN "orders" o     ON o."id" = oi."orderId"
        LEFT JOIN "products" p  ON p."id" = oi."productId"
        LEFT JOIN "categories" c ON c."id" = p."categoryId"
       WHERE oi."tenantId" = ${tenantId}::uuid
         AND o."branchId" = ${branchId}::uuid
         AND o."status" <> 'CANCELLED'
         AND o."paymentStatus" = 'PAID'
         AND o."createdAt" >= ${range.from}
         AND o."createdAt" < ${range.to}
       GROUP BY oi."productId", oi."productName", oi."productNameFa", c."nameFa"
       ORDER BY quantity DESC
       LIMIT ${limit}
    `;

    return rows.map((row) => ({
      productId: row.productId ?? '',
      name: row.name,
      nameFa: row.nameFa,
      categoryNameFa: row.categoryNameFa ?? 'بدون دسته',
      quantity: toNumber(row.quantity),
      total: toNumber(row.total),
    }));
  }

  private async topCategories(
    tenantId: string,
    branchId: string,
    range: { from: Date; to: Date },
    limit: number,
  ): Promise<TopCategory[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        categoryId: string | null;
        nameFa: string | null;
        quantity: bigint;
        total: bigint | null;
      }>
    >`
      SELECT c."id"                            AS "categoryId",
             c."nameFa"                        AS "nameFa",
             COALESCE(SUM(oi."quantity"), 0)   AS quantity,
             COALESCE(SUM(oi."lineTotal"), 0)  AS total
        FROM "order_items" oi
        JOIN "orders" o        ON o."id" = oi."orderId"
        JOIN "products" p      ON p."id" = oi."productId"
        JOIN "categories" c    ON c."id" = p."categoryId"
       WHERE oi."tenantId" = ${tenantId}::uuid
         AND o."branchId" = ${branchId}::uuid
         AND o."status" <> 'CANCELLED'
         AND o."paymentStatus" = 'PAID'
         AND o."createdAt" >= ${range.from}
         AND o."createdAt" < ${range.to}
       GROUP BY c."id", c."nameFa"
       ORDER BY total DESC
       LIMIT ${limit}
    `;

    return rows.map((row) => ({
      categoryId: row.categoryId ?? '',
      nameFa: row.nameFa ?? 'بدون دسته',
      quantity: toNumber(row.quantity),
      total: toNumber(row.total),
    }));
  }

  private async tableStats(tenantId: string, branchId: string) {
    const [occupied, total] = await Promise.all([
      this.prisma.restaurantTable.count({
        where: {
          tenantId,
          branchId,
          status: { in: [TableStatus.OCCUPIED, TableStatus.WAITING_PAYMENT] },
        },
      }),
      this.prisma.restaurantTable.count({
        where: { tenantId, branchId, status: { not: TableStatus.DISABLED } },
      }),
    ]);
    return { occupied, total };
  }
}

/** Percentage change from `previous` to `current`; null when undefined. */
function percentDelta(previous: number, current: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const FA_MONTHS_GREGORIAN = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
];

/** Renders a bucket label from the Tehran wall-clock parts returned by SQL. */
function formatBucketLabel(
  parts: { hour: number; day: number; month: number; year: number },
  granularity: string,
): string {
  switch (granularity) {
    case 'hour':
      return `${toPersianDigits(String(parts.hour).padStart(2, '0'))}:۰۰`;
    case 'day':
    case 'week':
      return `${toPersianDigits(parts.day)} ${FA_MONTHS_GREGORIAN[parts.month - 1]}`;
    case 'month':
      return `${FA_MONTHS_GREGORIAN[parts.month - 1]} ${toPersianDigits(parts.year)}`;
    default:
      return `${parts.year}-${parts.month}-${parts.day}`;
  }
}
