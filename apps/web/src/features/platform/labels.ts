/**
 * Shared Persian labels for the platform console.
 *
 * In their own module because a Next.js page file may only export the handful
 * of fields the framework recognises - exporting a constant from a page is a
 * build error, not a lint warning.
 */

export const PLATFORM_ACTION_LABEL: Record<string, string> = {
  'tenant.suspend': 'تعلیق',
  'tenant.activate': 'فعال‌سازی',
  'tenant.disable': 'غیرفعال‌سازی',
  'tenant.restore': 'بازگردانی',
  'tenant.notes': 'یادداشت',
  'subscription.update': 'تغییر اشتراک',
  'subscription.extend': 'تمدید',
  'subscription.plan_change': 'تغییر پلن',
  'plan.create': 'ساخت پلن',
  'plan.update': 'ویرایش پلن',
};

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  TRIAL: 'آزمایشی',
  ACTIVE: 'فعال',
  GRACE_PERIOD: 'مهلت تمدید',
  EXPIRED: 'منقضی',
  SUSPENDED: 'معلق',
};

export const SUBSCRIPTION_STATUS_TONE: Record<
  string,
  'positive' | 'info' | 'caution' | 'critical'
> = {
  ACTIVE: 'positive',
  TRIAL: 'info',
  GRACE_PERIOD: 'caution',
  EXPIRED: 'critical',
  SUSPENDED: 'critical',
};

export const BUSINESS_TYPE_LABEL: Record<string, string> = {
  CAFE: 'کافه',
  RESTAURANT: 'رستوران',
  FAST_FOOD: 'فست‌فود',
};
