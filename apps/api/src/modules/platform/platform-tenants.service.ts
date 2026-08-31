import { Inject, Injectable } from '@nestjs/common';
import {
  SubscriptionStatus,
  type PlatformTenantDetail,
  type PlatformTenantSummary,
} from '@restaurant-os/types';
import type {
  ExtendSubscriptionInput,
  SuspendTenantInput,
  TenantNotesInput,
  UpdateSubscriptionInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { PlatformContext } from '../../common/types/request-context';
import {
  buildPaginationMeta,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { tehranMonthStart } from '../../common/utils/time.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { PlansService, effectiveStatus, toSubscriptionDto } from '../plans/plans.service';
import { PlatformAction, PlatformAuditService } from './platform-audit.service';

export interface TenantListQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  status?: string | null;
  planKey?: string | null;
}

export interface AuditMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Tenant administration for the platform.
 *
 * Every read here spans tenants, which is exactly what the isolation guard
 * exists to prevent for tenant sessions - so each one is wrapped in
 * `runAsSystem` with a stated reason. The guard stays armed everywhere else,
 * and these call sites are the complete, greppable list of places that see
 * across the platform.
 */
@Injectable()
export class PlatformTenantsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly audit: PlatformAuditService,
  ) {}

  /* ----------------------------------------------------------------- list */

  async list(query: TenantListQuery) {
    const search = query.search?.trim();
    const where = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.planKey ? { subscription: { plan: { key: query.planKey } } } : {}),
    };

    const [rows, total] = await runAsSystem('platform: list tenants', () =>
      Promise.all([
        this.prisma.tenant.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: TENANT_SUMMARY_INCLUDE,
          ...paginationArgs(query.page, query.pageSize),
        }),
        this.prisma.tenant.count({ where }),
      ]),
    );

    let items = rows.map(toSummary);

    /*
     * Status is computed from dates rather than stored, so it cannot be a SQL
     * filter without duplicating that logic in two places. Filtering here keeps
     * one definition of "expired"; the page size bounds the cost.
     */
    if (query.status) {
      items = items.filter((t) => t.subscription?.status === query.status);
    }

    return { items, meta: buildPaginationMeta(query.page, query.pageSize, total) };
  }

  async detail(tenantId: string): Promise<PlatformTenantDetail> {
    const tenant = await runAsSystem('platform: tenant detail', () =>
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          ...TENANT_SUMMARY_INCLUDE,
          branches: {
            orderBy: { createdAt: 'asc' },
            include: { _count: { select: { orders: true } } },
          },
          users: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              isActive: true,
              lastLoginAt: true,
            },
          },
        },
      }),
    );
    if (!tenant) throw AppException.notFound('مجموعه');

    const monthStart = tehranMonthStart();
    const [smsThisMonth, marketingThisMonth, smsAllTime, activity, entitlements] =
      await Promise.all([
        runAsSystem('platform: sms count', () =>
          this.prisma.smsMessage.count({
            where: { tenantId, createdAt: { gte: monthStart } },
          }),
        ),
        runAsSystem('platform: marketing sms count', () =>
          this.prisma.smsMessage.count({
            where: { tenantId, kind: 'MARKETING', createdAt: { gte: monthStart } },
          }),
        ),
        runAsSystem('platform: sms all time', () =>
          this.prisma.smsMessage.count({ where: { tenantId } }),
        ),
        this.audit.list({ tenantId, limit: 20 }),
        this.plans.entitlements(tenantId),
      ]);

    return {
      ...toSummary(tenant),
      adminNotes: tenant.adminNotes,
      entitlements,
      branches: tenant.branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        slug: branch.slug,
        isActive: branch.isActive,
        isOpen: branch.isOpen,
        orders: branch._count.orders,
      })),
      users: tenant.users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      })),
      smsUsage: {
        thisMonth: smsThisMonth,
        marketingThisMonth,
        allTime: smsAllTime,
      },
      recentActivity: activity,
    };
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Suspends a tenant: staff can still sign in and read, but nothing writes. */
  async suspend(
    admin: PlatformContext,
    tenantId: string,
    input: SuspendTenantInput,
    meta: AuditMeta,
  ) {
    const before = await this.requireSubscription(tenantId);

    const updated = await runAsSystem('platform: suspend tenant', () =>
      this.prisma.$transaction(async (tx) => {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { isActive: false },
        });
        return tx.subscription.update({
          where: { tenantId },
          data: {
            status: SubscriptionStatus.SUSPENDED,
            suspendedAt: new Date(),
            suspendedReason: input.reason,
          },
          include: { plan: true },
        });
      }),
    );

    this.audit.record({
      adminId: admin.adminId,
      tenantId,
      action: PlatformAction.TENANT_SUSPEND,
      entity: 'Tenant',
      entityId: tenantId,
      previousValue: { status: effectiveStatus(before), isActive: true },
      newValue: { status: SubscriptionStatus.SUSPENDED, reason: input.reason },
      ...meta,
    });
    return toSubscriptionDto(updated);
  }

  /** Lifts a suspension and puts the tenant back where its dates say it belongs. */
  async activate(admin: PlatformContext, tenantId: string, meta: AuditMeta) {
    const before = await this.requireSubscription(tenantId);

    const updated = await runAsSystem('platform: activate tenant', () =>
      this.prisma.$transaction(async (tx) => {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { isActive: true },
        });
        return tx.subscription.update({
          where: { tenantId },
          data: {
            // Back to ACTIVE; `effectiveStatus` immediately re-derives EXPIRED
            // if the dates say so, so lifting a suspension never silently
            // grants unpaid time.
            status: SubscriptionStatus.ACTIVE,
            suspendedAt: null,
            suspendedReason: null,
          },
          include: { plan: true },
        });
      }),
    );

    this.audit.record({
      adminId: admin.adminId,
      tenantId,
      action: PlatformAction.TENANT_ACTIVATE,
      entity: 'Tenant',
      entityId: tenantId,
      previousValue: {
        status: effectiveStatus(before),
        reason: before.suspendedReason,
      },
      newValue: { status: effectiveStatus(updated) },
      ...meta,
    });
    return toSubscriptionDto(updated);
  }

  /**
   * Hard disable: the tenant flag alone, leaving the subscription untouched.
   * Used for a business that has closed rather than one that owes money.
   */
  async setActive(
    admin: PlatformContext,
    tenantId: string,
    isActive: boolean,
    meta: AuditMeta,
  ) {
    const tenant = await runAsSystem('platform: read tenant flag', () =>
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { isActive: true },
      }),
    );
    if (!tenant) throw AppException.notFound('مجموعه');

    await runAsSystem('platform: set tenant active', () =>
      this.prisma.tenant.update({ where: { id: tenantId }, data: { isActive } }),
    );

    this.audit.record({
      adminId: admin.adminId,
      tenantId,
      action: isActive ? PlatformAction.TENANT_RESTORE : PlatformAction.TENANT_DISABLE,
      entity: 'Tenant',
      entityId: tenantId,
      previousValue: { isActive: tenant.isActive },
      newValue: { isActive },
      ...meta,
    });
    return { isActive };
  }

  async setNotes(
    admin: PlatformContext,
    tenantId: string,
    input: TenantNotesInput,
    meta: AuditMeta,
  ) {
    const tenant = await runAsSystem('platform: read notes', () =>
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { adminNotes: true },
      }),
    );
    if (!tenant) throw AppException.notFound('مجموعه');

    await runAsSystem('platform: set notes', () =>
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { adminNotes: input.adminNotes ?? null },
      }),
    );

    this.audit.record({
      adminId: admin.adminId,
      tenantId,
      action: PlatformAction.TENANT_NOTES,
      entity: 'Tenant',
      entityId: tenantId,
      previousValue: { adminNotes: tenant.adminNotes },
      newValue: { adminNotes: input.adminNotes ?? null },
      ...meta,
    });
    return { adminNotes: input.adminNotes ?? null };
  }

  /* ---------------------------------------------------------- subscription */

  async updateSubscription(
    admin: PlatformContext,
    tenantId: string,
    input: UpdateSubscriptionInput,
    meta: AuditMeta,
  ) {
    const before = await this.requireSubscription(tenantId);

    if (input.planId) {
      const plan = await runAsSystem('platform: verify plan', () =>
        this.prisma.plan.findUnique({ where: { id: input.planId } }),
      );
      if (!plan) throw AppException.notFound('پلن');
    }

    const data = {
      ...(input.planId !== undefined ? { planId: input.planId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startedAt !== undefined ? { startedAt: toDate(input.startedAt) } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: toDate(input.expiresAt) } : {}),
      ...(input.trialEndsAt !== undefined
        ? { trialEndsAt: toDate(input.trialEndsAt) }
        : {}),
      ...(input.graceUntil !== undefined ? { graceUntil: toDate(input.graceUntil) } : {}),
      ...(input.suspendedReason !== undefined
        ? { suspendedReason: input.suspendedReason }
        : {}),
    };

    // `startedAt` is non-nullable in the schema; a null here would be a
    // client asking to unset a required column.
    if (data.startedAt === null) {
      throw AppException.validation('تاریخ شروع اشتراک نمی‌تواند خالی باشد.', {
        startedAt: ['تاریخ شروع اشتراک الزامی است.'],
      });
    }

    const updated = await runAsSystem('platform: update subscription', () =>
      this.prisma.subscription.update({
        where: { tenantId },
        data: data as typeof data & { startedAt?: Date },
        include: { plan: true },
      }),
    );

    // Suspension and activation move the tenant flag too, so a subscription
    // edit that lands on those statuses keeps the two in step.
    if (input.status) {
      const isActive = input.status !== SubscriptionStatus.SUSPENDED;
      await runAsSystem('platform: sync tenant flag', () =>
        this.prisma.tenant.update({ where: { id: tenantId }, data: { isActive } }),
      );
    }

    this.audit.record({
      adminId: admin.adminId,
      tenantId,
      action:
        input.planId && input.planId !== before.planId
          ? PlatformAction.PLAN_CHANGE
          : PlatformAction.SUBSCRIPTION_UPDATE,
      entity: 'Subscription',
      entityId: before.id,
      previousValue: snapshot(before),
      newValue: snapshot(updated),
      ...meta,
    });
    return toSubscriptionDto(updated);
  }

  /** "Give them another N days", counted from whichever is later: now or expiry. */
  async extend(
    admin: PlatformContext,
    tenantId: string,
    input: ExtendSubscriptionInput,
    meta: AuditMeta,
  ) {
    const before = await this.requireSubscription(tenantId);

    const now = new Date();
    const base =
      before.expiresAt && before.expiresAt > now ? before.expiresAt : now;
    const expiresAt = new Date(base.getTime() + input.days * 86_400_000);

    const updated = await runAsSystem('platform: extend subscription', () =>
      this.prisma.subscription.update({
        where: { tenantId },
        data: {
          expiresAt,
          // Extending is how an operator says "they are paid up"; leaving the
          // row EXPIRED with a future date would be contradictory.
          status: SubscriptionStatus.ACTIVE,
          suspendedAt: null,
          suspendedReason: null,
        },
        include: { plan: true },
      }),
    );

    await runAsSystem('platform: reactivate tenant', () =>
      this.prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } }),
    );

    this.audit.record({
      adminId: admin.adminId,
      tenantId,
      action: PlatformAction.SUBSCRIPTION_EXTEND,
      entity: 'Subscription',
      entityId: before.id,
      previousValue: { expiresAt: before.expiresAt, status: effectiveStatus(before) },
      newValue: { expiresAt, days: input.days, note: input.note ?? null },
      ...meta,
    });
    return toSubscriptionDto(updated);
  }

  private async requireSubscription(tenantId: string) {
    const subscription = await runAsSystem('platform: read subscription', () =>
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
    );
    if (!subscription) throw AppException.notFound('اشتراک');
    return subscription;
  }
}

/* ------------------------------------------------------------------ */

const TENANT_SUMMARY_INCLUDE = {
  subscription: { include: { plan: true } },
  restaurants: {
    take: 1,
    orderBy: { createdAt: 'asc' as const },
    select: { name: true, businessType: true },
  },
  _count: { select: { branches: true, users: true, orders: true } },
};

type TenantSummaryRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  subscription: Parameters<typeof toSubscriptionDto>[0] | null;
  restaurants: Array<{ name: string; businessType: string }>;
  _count: { branches: number; users: number; orders: number };
};

function toSummary(tenant: TenantSummaryRow): PlatformTenantSummary {
  const restaurant = tenant.restaurants[0];
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    isActive: tenant.isActive,
    businessType: (restaurant?.businessType as PlatformTenantSummary['businessType']) ?? null,
    restaurantName: restaurant?.name ?? null,
    createdAt: tenant.createdAt.toISOString(),
    subscription: tenant.subscription ? toSubscriptionDto(tenant.subscription) : null,
    counts: {
      branches: tenant._count.branches,
      users: tenant._count.users,
      orders: tenant._count.orders,
    },
  };
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw AppException.validation('تاریخ معتبر نیست.');
  }
  return parsed;
}

function snapshot(row: {
  planId: string;
  status: string;
  startedAt: Date;
  expiresAt: Date | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
  plan: { key: string };
}) {
  return {
    planKey: row.plan.key,
    status: row.status,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    trialEndsAt: row.trialEndsAt,
    graceUntil: row.graceUntil,
  };
}
