import { Inject, Injectable } from '@nestjs/common';
import { SubscriptionStatus, type PlatformDashboard } from '@restaurant-os/types';
import { tehranDayRange, tehranMonthStart } from '../../common/utils/time.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { effectiveStatus } from '../plans/plans.service';
import { PlatformAuditService } from './platform-audit.service';

/**
 * Platform-wide numbers.
 *
 * Subscription status is derived from dates rather than stored, so the status
 * breakdown is computed in memory from the subscription rows instead of being
 * grouped in SQL. There is one subscription per tenant, so this reads one row
 * per customer of the business - fine at the scale this dashboard serves, and
 * it keeps a single definition of "expired".
 */
@Injectable()
export class PlatformDashboardService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async summary(): Promise<PlatformDashboard> {
    const monthStart = tehranMonthStart();
    const { from: todayStart } = tehranDayRange(new Date());

    const [
      subscriptions,
      tenantCount,
      restaurants,
      branches,
      users,
      totalOrders,
      todayOrders,
      monthOrders,
      smsRows,
      recentActivity,
    ] = await Promise.all([
      runAsSystem('platform: subscriptions', () =>
        this.prisma.subscription.findMany({
          include: { plan: { select: { key: true, nameFa: true, monthlyPrice: true } } },
        }),
      ),
      runAsSystem('platform: tenant count', () => this.prisma.tenant.count()),
      runAsSystem('platform: restaurant count', () => this.prisma.restaurant.count()),
      runAsSystem('platform: branch count', () => this.prisma.branch.count()),
      runAsSystem('platform: user count', () => this.prisma.user.count()),
      runAsSystem('platform: order count', () => this.prisma.order.count()),
      runAsSystem('platform: today orders', () =>
        this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      ),
      runAsSystem('platform: month orders', () =>
        this.prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
      ),
      runAsSystem('platform: sms breakdown', () =>
        this.prisma.smsMessage.groupBy({
          by: ['kind', 'status'],
          where: { createdAt: { gte: monthStart } },
          _count: { _all: true },
        }),
      ),
      this.audit.list({ limit: 15 }),
    ]);

    const statuses = subscriptions.map((s) => effectiveStatus(s));
    const countOf = (status: SubscriptionStatus) =>
      statuses.filter((s) => s === status).length;

    // Recurring revenue counts only tenants that are actually paying: a
    // trial, an expired account or a suspension contributes nothing.
    const byPlan = new Map<string, { nameFa: string; tenants: number; amount: number }>();
    let monthlyRecurring = 0;
    subscriptions.forEach((subscription, index) => {
      if (statuses[index] !== SubscriptionStatus.ACTIVE) return;
      const { key, nameFa, monthlyPrice } = subscription.plan;
      const entry = byPlan.get(key) ?? { nameFa, tenants: 0, amount: 0 };
      entry.tenants += 1;
      entry.amount += monthlyPrice;
      byPlan.set(key, entry);
      monthlyRecurring += monthlyPrice;
    });

    const smsTotal = smsRows.reduce((sum, row) => sum + row._count._all, 0);
    const smsOf = (predicate: (row: (typeof smsRows)[number]) => boolean) =>
      smsRows.filter(predicate).reduce((sum, row) => sum + row._count._all, 0);

    return {
      tenants: {
        total: tenantCount,
        active: countOf(SubscriptionStatus.ACTIVE),
        suspended: countOf(SubscriptionStatus.SUSPENDED),
        trial: countOf(SubscriptionStatus.TRIAL),
        expired: countOf(SubscriptionStatus.EXPIRED),
        gracePeriod: countOf(SubscriptionStatus.GRACE_PERIOD),
      },
      restaurants,
      branches,
      users,
      orders: { total: totalOrders, today: todayOrders, thisMonth: monthOrders },
      revenue: {
        monthlyRecurring,
        byPlan: [...byPlan.entries()].map(([planKey, value]) => ({
          planKey,
          planNameFa: value.nameFa,
          tenants: value.tenants,
          amount: value.amount,
        })),
      },
      sms: {
        totalThisMonth: smsTotal,
        marketingThisMonth: smsOf((row) => row.kind === 'MARKETING'),
        transactionalThisMonth: smsOf((row) => row.kind === 'TRANSACTIONAL'),
        failedThisMonth: smsOf((row) => row.status === 'FAILED'),
      },
      recentActivity,
    };
  }
}
