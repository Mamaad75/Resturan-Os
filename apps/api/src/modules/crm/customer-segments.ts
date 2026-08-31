import { CustomerSegment } from '@restaurant-os/types';
import type { Prisma } from '@prisma/client';

/**
 * Customer segments.
 *
 * Each segment is a `where` fragment, so filtering a list, counting a segment
 * and picking a campaign's recipients all use the same definition. A segment
 * that meant one thing in the list and another in the campaign would send the
 * wrong people the wrong message.
 */

/** A customer is "new" until their second order. */
const NEW_ORDER_CEILING = 1;
/** VIP is about loyalty: how often they come back. */
const VIP_ORDER_FLOOR = 5;
/** High value is about spend, in Toman. */
const HIGH_VALUE_FLOOR = 3_000_000;

export const SEGMENT_LABEL_FA: Record<CustomerSegment, string> = {
  [CustomerSegment.ALL]: 'همه مشتریان',
  [CustomerSegment.NEW]: 'مشتریان جدید',
  [CustomerSegment.RETURNING]: 'مشتریان بازگشتی',
  [CustomerSegment.VIP]: 'مشتریان وفادار',
  [CustomerSegment.HIGH_VALUE]: 'پرخرج‌ترین‌ها',
  [CustomerSegment.INACTIVE_30]: 'غیرفعال ۳۰ روز',
  [CustomerSegment.INACTIVE_60]: 'غیرفعال ۶۰ روز',
  [CustomerSegment.DINE_IN]: 'بیشتر در محل',
  [CustomerSegment.TAKEAWAY]: 'بیشتر بیرون‌بر',
};

export const SEGMENT_DESCRIPTION_FA: Record<CustomerSegment, string> = {
  [CustomerSegment.ALL]: 'هر کسی که حداقل یک بار شماره‌اش را ثبت کرده است.',
  [CustomerSegment.NEW]: 'فقط یک سفارش ثبت کرده‌اند.',
  [CustomerSegment.RETURNING]: 'دو سفارش یا بیشتر داشته‌اند.',
  [CustomerSegment.VIP]: 'پنج سفارش یا بیشتر — مشتری همیشگی.',
  [CustomerSegment.HIGH_VALUE]: 'بیش از ۳٬۰۰۰٬۰۰۰ تومان خرید کرده‌اند.',
  [CustomerSegment.INACTIVE_30]: 'بیش از ۳۰ روز است سفارشی نداده‌اند.',
  [CustomerSegment.INACTIVE_60]: 'بیش از ۶۰ روز است سفارشی نداده‌اند.',
  [CustomerSegment.DINE_IN]: 'بیشتر سفارش‌هایشان در محل بوده است.',
  [CustomerSegment.TAKEAWAY]: 'بیشتر سفارش‌هایشان بیرون‌بر بوده است.',
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** The `where` fragment for one segment, to be combined with the tenant filter. */
export function segmentFilter(
  segment: CustomerSegment,
): Prisma.CustomerWhereInput {
  switch (segment) {
    case CustomerSegment.ALL:
      return {};
    case CustomerSegment.NEW:
      return { ordersCount: { lte: NEW_ORDER_CEILING, gt: 0 } };
    case CustomerSegment.RETURNING:
      return { ordersCount: { gt: NEW_ORDER_CEILING } };
    case CustomerSegment.VIP:
      return { ordersCount: { gte: VIP_ORDER_FLOOR } };
    case CustomerSegment.HIGH_VALUE:
      return { totalSpent: { gte: HIGH_VALUE_FLOOR } };
    case CustomerSegment.INACTIVE_30:
      return { lastOrderAt: { lt: daysAgo(30) } };
    case CustomerSegment.INACTIVE_60:
      return { lastOrderAt: { lt: daysAgo(60) } };
    case CustomerSegment.DINE_IN:
      // Comparing two columns needs raw SQL in Prisma; "mostly dine-in" is
      // expressed as "has dine-in orders and no more takeaway than dine-in",
      // which the aggregate columns can answer directly.
      return { dineInCount: { gt: 0 }, takeawayCount: { equals: 0 } };
    case CustomerSegment.TAKEAWAY:
      return { takeawayCount: { gt: 0 }, dineInCount: { equals: 0 } };
  }
}

/** Which segments a given customer currently falls into. */
export function segmentsForCustomer(customer: {
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  dineInCount: number;
  takeawayCount: number;
}): CustomerSegment[] {
  const segments: CustomerSegment[] = [];
  if (customer.ordersCount > 0 && customer.ordersCount <= NEW_ORDER_CEILING) {
    segments.push(CustomerSegment.NEW);
  }
  if (customer.ordersCount > NEW_ORDER_CEILING) {
    segments.push(CustomerSegment.RETURNING);
  }
  if (customer.ordersCount >= VIP_ORDER_FLOOR) segments.push(CustomerSegment.VIP);
  if (customer.totalSpent >= HIGH_VALUE_FLOOR) {
    segments.push(CustomerSegment.HIGH_VALUE);
  }
  if (customer.lastOrderAt) {
    const idleDays = (Date.now() - customer.lastOrderAt.getTime()) / 86_400_000;
    if (idleDays > 60) segments.push(CustomerSegment.INACTIVE_60);
    else if (idleDays > 30) segments.push(CustomerSegment.INACTIVE_30);
  }
  if (customer.dineInCount > 0 && customer.takeawayCount === 0) {
    segments.push(CustomerSegment.DINE_IN);
  }
  if (customer.takeawayCount > 0 && customer.dineInCount === 0) {
    segments.push(CustomerSegment.TAKEAWAY);
  }
  return segments;
}

export const LISTABLE_SEGMENTS: CustomerSegment[] = [
  CustomerSegment.ALL,
  CustomerSegment.NEW,
  CustomerSegment.RETURNING,
  CustomerSegment.VIP,
  CustomerSegment.HIGH_VALUE,
  CustomerSegment.INACTIVE_30,
  CustomerSegment.INACTIVE_60,
  CustomerSegment.DINE_IN,
  CustomerSegment.TAKEAWAY,
];
