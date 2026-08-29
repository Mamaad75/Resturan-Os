/**
 * Domain enums shared by the API and every frontend surface.
 *
 * These are declared as const objects + union types rather than TypeScript
 * `enum`s so they can be consumed from both the NestJS backend (CommonJS) and
 * Next.js server/client components without runtime interop surprises. The
 * string values are identical to the PostgreSQL enum values declared in
 * `apps/api/prisma/schema.prisma`.
 */

export const UserRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  KITCHEN: 'KITCHEN',
  WAITER: 'WAITER',
  ACCOUNTANT: 'ACCOUNTANT',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const OrderType = {
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY',
  DELIVERY: 'DELIVERY',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SENT_TO_KITCHEN: 'SENT_TO_KITCHEN',
  PREPARING: 'PREPARING',
  READY: 'READY',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  SERVED: 'SERVED',
  PICKED_UP: 'PICKED_UP',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  ONLINE: 'ONLINE',
  CASH: 'CASH',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const TableStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  RESERVED: 'RESERVED',
  DISABLED: 'DISABLED',
} as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];

export const ServiceMode = {
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY',
  DELIVERY: 'DELIVERY',
} as const;
export type ServiceMode = (typeof ServiceMode)[keyof typeof ServiceMode];

export const QrCodeType = {
  RESTAURANT: 'RESTAURANT',
  BRANCH: 'BRANCH',
  TABLE: 'TABLE',
} as const;
export type QrCodeType = (typeof QrCodeType)[keyof typeof QrCodeType];

export const NotificationChannel = {
  IN_APP: 'IN_APP',
  SMS: 'SMS',
  PUSH: 'PUSH',
  TELEGRAM: 'TELEGRAM',
  WHATSAPP: 'WHATSAPP',
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationType = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_SENT_TO_KITCHEN: 'ORDER_SENT_TO_KITCHEN',
  ORDER_PREPARING: 'ORDER_PREPARING',
  ORDER_READY: 'ORDER_READY',
  ORDER_SERVED: 'ORDER_SERVED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const SmsStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  DELIVERED: 'DELIVERED',
} as const;
export type SmsStatus = (typeof SmsStatus)[keyof typeof SmsStatus];

export const ModifierGroupType = {
  /** Exactly one option must be chosen (size, sugar level, ...). */
  SINGLE: 'SINGLE',
  /** Zero or more options may be chosen (extra cheese, extra sauce, ...). */
  MULTIPLE: 'MULTIPLE',
} as const;
export type ModifierGroupType =
  (typeof ModifierGroupType)[keyof typeof ModifierGroupType];

export const CouponType = {
  /** `value` is basis points: 1500 = 15% off. */
  PERCENTAGE: 'PERCENTAGE',
  /** `value` is a flat amount in the branch currency unit. */
  FIXED: 'FIXED',
} as const;
export type CouponType = (typeof CouponType)[keyof typeof CouponType];

export const Currency = {
  /** Iranian Toman - the unit people actually quote prices in. */
  IRT: 'IRT',
  /** Iranian Rial - the official unit (1 Toman = 10 Rial). */
  IRR: 'IRR',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  STATUS_CHANGE: 'STATUS_CHANGE',
  PAYMENT: 'PAYMENT',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
  SETTINGS_CHANGE: 'SETTINGS_CHANGE',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
