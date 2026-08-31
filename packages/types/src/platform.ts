import type {
  BusinessType,
  CampaignStatus,
  CustomerSegment,
  ServiceModeChoice,
  SmsKind,
  SubscriptionStatus,
} from './enums';

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

/** Numeric caps. `null` means unlimited. */
export interface PlanLimits {
  maxBranches: number | null;
  maxStaff: number | null;
  maxProducts: number | null;
  maxTables: number | null;
  maxMonthlyOrders: number | null;
  /** Marketing messages per calendar month. Transactional SMS is never capped. */
  smsAllowance: number | null;
}

export interface PlanFeatures {
  customThemeEnabled: boolean;
  advancedThemeEnabled: boolean;
  customCssEnabled: boolean;
  crmEnabled: boolean;
  campaignsEnabled: boolean;
  takeawayEnabled: boolean;
  dineInEnabled: boolean;
  waiterCallEnabled: boolean;
  reportsEnabled: boolean;
  couponsEnabled: boolean;
  multiBranchEnabled: boolean;
}

export type PlanLimitKey = keyof PlanLimits;
export type PlanFeatureKey = keyof PlanFeatures;

export const PLAN_LIMIT_KEYS = [
  'maxBranches',
  'maxStaff',
  'maxProducts',
  'maxTables',
  'maxMonthlyOrders',
  'smsAllowance',
] as const satisfies readonly PlanLimitKey[];

export const PLAN_FEATURE_KEYS = [
  'customThemeEnabled',
  'advancedThemeEnabled',
  'customCssEnabled',
  'crmEnabled',
  'campaignsEnabled',
  'takeawayEnabled',
  'dineInEnabled',
  'waiterCallEnabled',
  'reportsEnabled',
  'couponsEnabled',
  'multiBranchEnabled',
] as const satisfies readonly PlanFeatureKey[];

export interface PlanDto extends PlanLimits, PlanFeatures {
  id: string;
  key: string;
  name: string;
  nameFa: string;
  description: string | null;
  monthlyPrice: number;
  isActive: boolean;
  isDefault: boolean;
  displayOrder: number;
  /** How many tenants are currently on this plan. */
  subscriberCount?: number;
}

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

export interface SubscriptionDto {
  id: string;
  status: SubscriptionStatus;
  plan: Pick<PlanDto, 'id' | 'key' | 'name' | 'nameFa' | 'monthlyPrice'>;
  startedAt: string;
  expiresAt: string | null;
  trialEndsAt: string | null;
  graceUntil: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  /** Negative once the subscription has lapsed. Null when open-ended. */
  daysRemaining: number | null;
}

/** What a tenant may currently do. Computed, never stored. */
export interface TenantEntitlements {
  planKey: string;
  planNameFa: string;
  status: SubscriptionStatus;
  /** False once the subscription has expired past its grace period. */
  writable: boolean;
  limits: PlanLimits;
  features: PlanFeatures;
  usage: PlanUsage;
}

export interface PlanUsage {
  branches: number;
  staff: number;
  products: number;
  tables: number;
  /** Orders in the current Tehran calendar month. */
  monthlyOrders: number;
  /** Marketing messages in the current Tehran calendar month. */
  monthlyMarketingSms: number;
}

/* ------------------------------------------------------------------ */
/* Platform admin surface                                              */
/* ------------------------------------------------------------------ */

export interface PlatformAdminDto {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface PlatformSession {
  admin: PlatformAdminDto;
  accessToken: string;
  expiresIn: number;
}

export interface PlatformDashboard {
  tenants: {
    total: number;
    active: number;
    suspended: number;
    trial: number;
    expired: number;
    gracePeriod: number;
  };
  restaurants: number;
  branches: number;
  users: number;
  orders: {
    total: number;
    today: number;
    thisMonth: number;
  };
  revenue: {
    /** Sum of monthly price across non-expired subscriptions, in Toman. */
    monthlyRecurring: number;
    byPlan: Array<{ planKey: string; planNameFa: string; tenants: number; amount: number }>;
  };
  sms: {
    totalThisMonth: number;
    marketingThisMonth: number;
    transactionalThisMonth: number;
    failedThisMonth: number;
  };
  recentActivity: PlatformAuditEntry[];
}

export interface PlatformAuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  adminName: string | null;
  tenantName: string | null;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export interface PlatformTenantSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  businessType: BusinessType | null;
  restaurantName: string | null;
  createdAt: string;
  subscription: SubscriptionDto | null;
  counts: {
    branches: number;
    users: number;
    orders: number;
  };
}

export interface PlatformTenantDetail extends PlatformTenantSummary {
  adminNotes: string | null;
  entitlements: TenantEntitlements;
  branches: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    isOpen: boolean;
    orders: number;
  }>;
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
  }>;
  smsUsage: {
    thisMonth: number;
    marketingThisMonth: number;
    allTime: number;
  };
  recentActivity: PlatformAuditEntry[];
}

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

export interface CustomerDto {
  id: string;
  phone: string;
  name: string | null;
  ordersCount: number;
  totalSpent: number;
  /** totalSpent / ordersCount, rounded. Zero when they have never ordered. */
  averageOrderValue: number;
  dineInCount: number;
  takeawayCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  lastBranchName: string | null;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  /** Which segments this customer currently falls into. */
  segments: CustomerSegment[];
}

export interface CustomerSegmentCounts {
  segment: CustomerSegment;
  count: number;
}

export interface CampaignDto {
  id: string;
  name: string;
  segment: CustomerSegment;
  body: string;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  createdAt: string;
}

export interface SmsUsageSummary {
  kind: SmsKind;
  count: number;
  credits: number;
}

/* ------------------------------------------------------------------ */
/* Restaurant configuration                                            */
/* ------------------------------------------------------------------ */

/** The two settings that decide which surfaces a tenant even sees. */
export interface RestaurantProfile {
  businessType: BusinessType;
  serviceMode: ServiceModeChoice;
  requireCustomerPhone: boolean;
  marketingOptInEnabled: boolean;
}
