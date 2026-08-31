import { Inject, Injectable } from '@nestjs/common';
import { CustomerSegment, type CustomerDto } from '@restaurant-os/types';
import type { UpdateCustomerInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import {
  buildPaginationMeta,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import {
  LISTABLE_SEGMENTS,
  segmentFilter,
  segmentsForCustomer,
} from './customer-segments';

export interface CustomerListQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  segment?: CustomerSegment | null;
  consentOnly?: boolean;
}

/**
 * The restaurant's own customer book.
 *
 * Every query is tenant-scoped through the normal repository path, so the
 * isolation guard applies here exactly as it does everywhere else - one
 * restaurant can never read another's customers, which is the whole point of
 * keeping the CRM inside the tenant boundary rather than at the platform.
 */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async list(ctx: RequestContext, query: CustomerListQuery) {
    await this.plans.requireFeature(ctx.tenantId, 'crmEnabled');

    const search = query.search?.trim();
    const where = {
      tenantId: ctx.tenantId,
      ...(query.segment ? segmentFilter(query.segment) : {}),
      ...(query.consentOnly ? { marketingConsent: true } : {}),
      ...(search
        ? {
            OR: [
              { phone: { contains: search } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ lastOrderAt: 'desc' }, { createdAt: 'desc' }],
        include: { lastBranch: { select: { name: true } } },
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: rows.map(toCustomerDto),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  /** How many customers sit in each segment, for the filter bar. */
  async segmentCounts(ctx: RequestContext) {
    await this.plans.requireFeature(ctx.tenantId, 'crmEnabled');

    const counts = await Promise.all(
      LISTABLE_SEGMENTS.map(async (segment) => ({
        segment,
        count: await this.prisma.customer.count({
          where: { tenantId: ctx.tenantId, ...segmentFilter(segment) },
        }),
      })),
    );
    return counts;
  }

  async get(ctx: RequestContext, id: string) {
    await this.plans.requireFeature(ctx.tenantId, 'crmEnabled');

    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lastBranch: { select: { name: true } } },
    });
    if (!customer) throw AppException.notFound('مشتری');

    // Recent orders give the profile the context a list row cannot.
    const orders = await this.prisma.order.findMany({
      where: { tenantId: ctx.tenantId, customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        type: true,
        status: true,
        total: true,
        createdAt: true,
      },
    });

    return {
      ...toCustomerDto(customer),
      recentOrders: orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
      })),
    };
  }

  async update(ctx: RequestContext, id: string, input: UpdateCustomerInput) {
    await this.plans.requireFeature(ctx.tenantId, 'crmEnabled');

    const existing = await this.prisma.customer.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, marketingConsent: true },
    });
    if (!existing) throw AppException.notFound('مشتری');

    const consentChanged =
      input.marketingConsent !== undefined &&
      input.marketingConsent !== existing.marketingConsent;

    const updated = await this.prisma.customer.update({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.marketingConsent !== undefined
          ? { marketingConsent: input.marketingConsent }
          : {}),
        // Stamped only on the transition, so the record says when consent was
        // actually given rather than when the row was last touched.
        ...(consentChanged
          ? { marketingConsentAt: input.marketingConsent ? new Date() : null }
          : {}),
      },
      include: { lastBranch: { select: { name: true } } },
    });

    return toCustomerDto(updated);
  }
}

type CustomerRow = {
  id: string;
  phone: string;
  name: string | null;
  ordersCount: number;
  totalSpent: number;
  dineInCount: number;
  takeawayCount: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  marketingConsent: boolean;
  marketingConsentAt: Date | null;
  tags: string[];
  notes: string | null;
  createdAt: Date;
  lastBranch: { name: string } | null;
};

export function toCustomerDto(row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    ordersCount: row.ordersCount,
    totalSpent: row.totalSpent,
    // Derived rather than stored: two cached numbers that could disagree are
    // worse than one division.
    averageOrderValue:
      row.ordersCount > 0 ? Math.round(row.totalSpent / row.ordersCount) : 0,
    dineInCount: row.dineInCount,
    takeawayCount: row.takeawayCount,
    firstOrderAt: row.firstOrderAt?.toISOString() ?? null,
    lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    lastBranchName: row.lastBranch?.name ?? null,
    marketingConsent: row.marketingConsent,
    marketingConsentAt: row.marketingConsentAt?.toISOString() ?? null,
    tags: row.tags,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    segments: segmentsForCustomer(row),
  };
}
