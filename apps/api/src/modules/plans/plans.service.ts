import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  PLAN_FEATURE_KEYS,
  PLAN_LIMIT_KEYS,
  SubscriptionStatus,
  type PlanDto,
  type PlanFeatureKey,
  type PlanFeatures,
  type PlanLimitKey,
  type PlanLimits,
  type PlanUsage,
  type SubscriptionDto,
  type TenantEntitlements,
} from '@restaurant-os/types';
import { AppException } from '../../common/exceptions/app.exception';
import { tehranMonthStart } from '../../common/utils/time.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';

/** Which resource a limit governs, for the error message. */
const LIMIT_LABEL_FA: Record<PlanLimitKey, string> = {
  maxBranches: 'شعبه',
  maxStaff: 'کاربر',
  maxProducts: 'محصول',
  maxTables: 'میز',
  maxMonthlyOrders: 'سفارش در ماه',
  smsAllowance: 'پیامک تبلیغاتی در ماه',
};

const FEATURE_LABEL_FA: Record<PlanFeatureKey, string> = {
  customThemeEnabled: 'سفارشی‌سازی ظاهر منو',
  advancedThemeEnabled: 'سفارشی‌سازی پیشرفته',
  customCssEnabled: 'CSS اختصاصی',
  crmEnabled: 'باشگاه مشتریان',
  campaignsEnabled: 'کمپین پیامکی',
  takeawayEnabled: 'سفارش بیرون‌بر',
  dineInEnabled: 'سرو در محل',
  waiterCallEnabled: 'صدا زدن گارسون',
  reportsEnabled: 'گزارش‌ها',
  couponsEnabled: 'کد تخفیف',
  multiBranchEnabled: 'چند شعبه',
};

/**
 * Plans, subscriptions and what a tenant is currently allowed to do.
 *
 * Everything here answers one question: given a tenant, what does their plan
 * permit right now. Callers ask before acting; nothing in the frontend is
 * trusted to have asked first.
 */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------- plans */

  async listPlans(includeInactive = false): Promise<PlanDto[]> {
    // Plans are platform-owned rows with no tenantId, so they are read
    // outside the tenant guard by design.
    const rows = await runAsSystem('read platform plans', () =>
      this.prisma.plan.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { monthlyPrice: 'asc' }],
        include: { _count: { select: { subscriptions: true } } },
      }),
    );
    return rows.map(toPlanDto);
  }

  async getPlanByKey(key: string) {
    return runAsSystem(`read plan ${key}`, () =>
      this.prisma.plan.findUnique({ where: { key } }),
    );
  }

  /** The plan new signups land on. Falls back to the cheapest active plan. */
  async defaultPlanId(): Promise<string> {
    const plan = await runAsSystem('resolve default plan', async () => {
      const flagged = await this.prisma.plan.findFirst({
        where: { isDefault: true, isActive: true },
      });
      if (flagged) return flagged;
      return this.prisma.plan.findFirst({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { monthlyPrice: 'asc' }],
      });
    });
    if (!plan) {
      throw AppException.conflict(
        'هیچ پلن فعالی تعریف نشده است. با پشتیبانی تماس بگیرید.',
      );
    }
    return plan.id;
  }

  /* -------------------------------------------------------- entitlements */

  /**
   * Everything a tenant may do, resolved from their subscription.
   *
   * A tenant with no subscription row (only possible for data predating the
   * platform module) is treated as expired rather than unlimited: failing
   * closed is the only safe default for a billing gate.
   */
  async entitlements(tenantId: string): Promise<TenantEntitlements> {
    const subscription = await this.loadSubscription(tenantId);
    const status = subscription
      ? effectiveStatus(subscription)
      : SubscriptionStatus.EXPIRED;

    const limits = subscription
      ? pickLimits(subscription.plan)
      : ZERO_LIMITS;
    const features = subscription
      ? pickFeatures(subscription.plan)
      : NO_FEATURES;

    return {
      planKey: subscription?.plan.key ?? 'none',
      planNameFa: subscription?.plan.nameFa ?? 'بدون اشتراک',
      status,
      writable: isWritable(status),
      limits,
      features,
      usage: await this.usage(tenantId),
    };
  }

  async subscriptionDto(tenantId: string): Promise<SubscriptionDto | null> {
    const row = await this.loadSubscription(tenantId);
    return row ? toSubscriptionDto(row) : null;
  }

  /** Current consumption of every metered resource. */
  async usage(tenantId: string): Promise<PlanUsage> {
    const monthStart = tehranMonthStart();

    const [branches, staff, products, tables, monthlyOrders, monthlyMarketingSms] =
      await Promise.all([
        this.prisma.branch.count({ where: { tenantId, isActive: true } }),
        this.prisma.user.count({ where: { tenantId, isActive: true } }),
        this.prisma.product.count({ where: { tenantId } }),
        this.prisma.restaurantTable.count({ where: { tenantId } }),
        this.prisma.order.count({
          where: { tenantId, createdAt: { gte: monthStart } },
        }),
        this.prisma.smsMessage.count({
          where: { tenantId, kind: 'MARKETING', createdAt: { gte: monthStart } },
        }),
      ]);

    return { branches, staff, products, tables, monthlyOrders, monthlyMarketingSms };
  }

  /* ----------------------------------------------------------- enforcement */

  /**
   * Throws unless the plan includes `feature`.
   *
   * Called from the service that owns the feature, not from a controller
   * decorator, so a feature reached through several routes is gated once.
   */
  async requireFeature(tenantId: string, feature: PlanFeatureKey): Promise<void> {
    const { features, planNameFa } = await this.entitlements(tenantId);
    if (features[feature]) return;
    throw new AppException(
      ApiErrorCode.PLAN_FEATURE_UNAVAILABLE,
      `«${FEATURE_LABEL_FA[feature]}» در پلن ${planNameFa} فعال نیست. برای استفاده، پلن خود را ارتقا دهید.`,
      402,
      { plan: [feature] },
    );
  }

  async hasFeature(tenantId: string, feature: PlanFeatureKey): Promise<boolean> {
    const { features } = await this.entitlements(tenantId);
    return features[feature];
  }

  /**
   * Throws when creating `count` more of a metered resource would exceed the
   * plan. Checked against live counts, so it holds however the rows got there.
   */
  async requireCapacity(
    tenantId: string,
    limit: PlanLimitKey,
    count = 1,
  ): Promise<void> {
    const { limits, usage, planNameFa } = await this.entitlements(tenantId);
    const cap = limits[limit];
    if (cap === null) return;

    const current = usageFor(usage, limit);
    if (current + count <= cap) return;

    throw new AppException(
      ApiErrorCode.PLAN_LIMIT_REACHED,
      `سقف ${LIMIT_LABEL_FA[limit]} در پلن ${planNameFa} ${cap} است و شما ${current} مورد دارید. برای افزودن بیشتر، پلن خود را ارتقا دهید.`,
      402,
      { limit: [limit, String(cap), String(current)] },
    );
  }

  /** Same check without throwing, for callers that degrade instead of failing. */
  async hasCapacity(tenantId: string, limit: PlanLimitKey, count = 1): Promise<boolean> {
    const { limits, usage } = await this.entitlements(tenantId);
    const cap = limits[limit];
    if (cap === null) return true;
    return usageFor(usage, limit) + count <= cap;
  }

  /* -------------------------------------------------------------- internals */

  private loadSubscription(tenantId: string) {
    // Subscriptions carry a tenantId but are written only by the platform, so
    // this read runs as system: an owner reading their own subscription and a
    // platform admin reading anyone's go through the same path.
    return runAsSystem('read subscription', () =>
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

type SubscriptionRow = {
  id: string;
  status: string;
  startedAt: Date;
  expiresAt: Date | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  plan: PlanRow;
};

type PlanRow = Record<string, unknown> & {
  id: string;
  key: string;
  name: string;
  nameFa: string;
  monthlyPrice: number;
};

const ZERO_LIMITS: PlanLimits = {
  maxBranches: 0,
  maxStaff: 0,
  maxProducts: 0,
  maxTables: 0,
  maxMonthlyOrders: 0,
  smsAllowance: 0,
};

const NO_FEATURES: PlanFeatures = PLAN_FEATURE_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: false }),
  {} as PlanFeatures,
);

function usageFor(usage: PlanUsage, limit: PlanLimitKey): number {
  switch (limit) {
    case 'maxBranches':
      return usage.branches;
    case 'maxStaff':
      return usage.staff;
    case 'maxProducts':
      return usage.products;
    case 'maxTables':
      return usage.tables;
    case 'maxMonthlyOrders':
      return usage.monthlyOrders;
    case 'smsAllowance':
      return usage.monthlyMarketingSms;
  }
}

export function pickLimits(plan: Record<string, unknown>): PlanLimits {
  return PLAN_LIMIT_KEYS.reduce((acc, key) => {
    const value = plan[key];
    return { ...acc, [key]: typeof value === 'number' ? value : null };
  }, {} as PlanLimits);
}

export function pickFeatures(plan: Record<string, unknown>): PlanFeatures {
  return PLAN_FEATURE_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: plan[key] === true }),
    {} as PlanFeatures,
  );
}

/**
 * The status a subscription actually has right now.
 *
 * The stored status is what an operator set; dates move a tenant along on
 * their own. Computing on read means an expiry takes effect at the instant it
 * falls due without a scheduled job having to have run.
 */
export function effectiveStatus(
  subscription: Pick<
    SubscriptionRow,
    'status' | 'expiresAt' | 'trialEndsAt' | 'graceUntil'
  >,
  now: Date = new Date(),
): SubscriptionStatus {
  // A suspension is an operator decision and outranks every date.
  if (subscription.status === SubscriptionStatus.SUSPENDED) {
    return SubscriptionStatus.SUSPENDED;
  }

  if (subscription.status === SubscriptionStatus.TRIAL) {
    const trialEnd = subscription.trialEndsAt;
    if (!trialEnd || trialEnd > now) return SubscriptionStatus.TRIAL;
    // A lapsed trial still gets its grace window if one was granted.
    if (subscription.graceUntil && subscription.graceUntil > now) {
      return SubscriptionStatus.GRACE_PERIOD;
    }
    return SubscriptionStatus.EXPIRED;
  }

  const expiry = subscription.expiresAt;
  if (!expiry) return SubscriptionStatus.ACTIVE;
  if (expiry > now) return SubscriptionStatus.ACTIVE;
  if (subscription.graceUntil && subscription.graceUntil > now) {
    return SubscriptionStatus.GRACE_PERIOD;
  }
  return SubscriptionStatus.EXPIRED;
}

/** Grace period still writes; expiry and suspension do not. */
export function isWritable(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIAL ||
    status === SubscriptionStatus.GRACE_PERIOD
  );
}

function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

export function toSubscriptionDto(row: SubscriptionRow): SubscriptionDto {
  const now = new Date();
  const status = effectiveStatus(row, now);
  const horizon =
    status === SubscriptionStatus.TRIAL ? row.trialEndsAt : row.expiresAt;

  return {
    id: row.id,
    status,
    plan: {
      id: row.plan.id,
      key: row.plan.key,
      name: row.plan.name,
      nameFa: row.plan.nameFa,
      monthlyPrice: row.plan.monthlyPrice,
    },
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    graceUntil: row.graceUntil?.toISOString() ?? null,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    suspendedReason: row.suspendedReason,
    daysRemaining: daysUntil(horizon, now),
  };
}

export function toPlanDto(
  row: PlanRow & { _count?: { subscriptions: number } },
): PlanDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    nameFa: row.nameFa,
    description: (row.description as string | null) ?? null,
    monthlyPrice: row.monthlyPrice,
    isActive: row.isActive === true,
    isDefault: row.isDefault === true,
    displayOrder: (row.displayOrder as number) ?? 0,
    ...pickLimits(row),
    ...pickFeatures(row),
    ...(row._count ? { subscriberCount: row._count.subscriptions } : {}),
  };
}
