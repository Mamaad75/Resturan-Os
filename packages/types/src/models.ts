import type {
  Currency,
  ModifierGroupType,
  NotificationChannel,
  NotificationType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  QrCodeType,
  ServiceMode,
  SmsStatus,
  TableStatus,
  UserRole,
} from './enums';

/**
 * All monetary amounts are integers in the branch's configured currency unit
 * (Toman by default). Storing minor units as integers avoids floating point
 * drift entirely; formatting to "۱۲۵٬۰۰۰ تومان" happens only at the edge.
 */
export type Money = number;

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  permissions: string[];
  branchId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  tenant: TenantSummary;
  branches: BranchSummary[];
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
}

export interface BranchSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface RestaurantBranding {
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  accentColor: string;
  theme: 'dark' | 'light';
  tagline: string | null;
}

export interface RestaurantSettings {
  serviceModes: ServiceMode[];
  currency: Currency;
  taxEnabled: boolean;
  /** Basis points, e.g. 900 = 9.00% VAT. */
  taxRateBps: number;
  serviceChargeEnabled: boolean;
  serviceChargeBps: number;
  estimatedPrepMinutes: number;
  smsNotificationsEnabled: boolean;
  autoConfirmOrders: boolean;
}

export interface PublicRestaurant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  branding: RestaurantBranding;
  settings: RestaurantSettings;
  branch: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    isOpen: boolean;
  };
  table?: {
    id: string;
    number: number;
    name: string | null;
  } | null;
}

export interface PublicMenu {
  restaurant: PublicRestaurant;
  categories: PublicCategory[];
}

export interface PublicCategory {
  id: string;
  name: string;
  nameFa: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  products: PublicProduct[];
}

export interface PublicProduct {
  id: string;
  name: string;
  nameFa: string;
  description: string | null;
  descriptionFa: string | null;
  imageUrl: string | null;
  price: Money;
  discountPrice: Money | null;
  /** `discountPrice ?? price` - what the customer actually pays. */
  effectivePrice: Money;
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  categoryId: string;
  preparationMinutes: number | null;
  calories: number | null;
  modifierGroups: PublicModifierGroup[];
}

export interface PublicModifierGroup {
  id: string;
  name: string;
  nameFa: string;
  type: ModifierGroupType;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  displayOrder: number;
  options: PublicModifierOption[];
}

export interface PublicModifierOption {
  id: string;
  name: string;
  nameFa: string;
  priceDelta: Money;
  isAvailable: boolean;
  displayOrder: number;
}

export interface OrderItemModifierDto {
  id: string;
  modifierOptionId: string;
  name: string;
  nameFa: string;
  priceDelta: Money;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  /** Product name captured at order time so history survives menu edits. */
  productName: string;
  productNameFa: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: Money;
  modifiersTotal: Money;
  lineTotal: Money;
  notes: string | null;
  modifiers: OrderItemModifierDto[];
}

export interface OrderStatusHistoryDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedByUserId: string | null;
  changedByName: string | null;
  note: string | null;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: Money;
  provider: string | null;
  providerRef: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  branchId: string;
  type: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  table: { id: string; number: number; name: string | null } | null;
  customerName: string | null;
  customerPhone: string | null;
  pickupAt: string | null;
  notes: string | null;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  serviceChargeTotal: Money;
  total: Money;
  paidTotal: Money;
  currency: Currency;
  itemCount: number;
  items: OrderItemDto[];
  payments: PaymentDto[];
  statusHistory: OrderStatusHistoryDto[];
  allowedTransitions: OrderStatus[];
  estimatedReadyAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
}

/** Trimmed order shape for list views, KDS cards and the POS ticket rail. */
export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  table: { id: string; number: number; name: string | null } | null;
  customerName: string | null;
  customerPhone: string | null;
  total: Money;
  itemCount: number;
  notes: string | null;
  items: Array<{
    id: string;
    productNameFa: string;
    quantity: number;
    notes: string | null;
    modifiers: string[];
  }>;
  allowedTransitions: OrderStatus[];
  createdAt: string;
  updatedAt: string;
}

/** What the customer's tracking page renders; deliberately narrow. */
export interface OrderTrackingDto {
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  restaurantName: string;
  branchName: string;
  branchPhone: string | null;
  tableNumber: number | null;
  customerName: string | null;
  items: Array<{
    productNameFa: string;
    quantity: number;
    lineTotal: Money;
    modifiers: string[];
  }>;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  serviceChargeTotal: Money;
  total: Money;
  currency: Currency;
  estimatedReadyAt: string | null;
  steps: Array<{
    status: OrderStatus;
    label: string;
    reachedAt: string | null;
    isCurrent: boolean;
    isComplete: boolean;
  }>;
  createdAt: string;
}

export interface TableDto {
  id: string;
  branchId: string;
  number: number;
  name: string | null;
  capacity: number;
  status: TableStatus;
  zone: string | null;
  activeOrder: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: Money;
    itemCount: number;
    openedAt: string;
  } | null;
  qrUrl: string;
}

export interface QrCodeDto {
  id: string;
  type: QrCodeType;
  label: string;
  targetUrl: string;
  tableId: string | null;
  branchId: string | null;
  scanCount: number;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface SmsMessageDto {
  id: string;
  to: string;
  body: string;
  status: SmsStatus;
  provider: string;
  providerRef: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface StaffDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  branchId: string | null;
  branchName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/* ---------------------------------------------------------------------- */
/* Reporting                                                               */
/* ---------------------------------------------------------------------- */

export interface SalesTotals {
  grossSales: Money;
  discountTotal: Money;
  netSales: Money;
  taxTotal: Money;
  serviceChargeTotal: Money;
  orderCount: number;
  averageOrderValue: Money;
}

export interface SalesBreakdown {
  byOrderType: Array<{ type: OrderType; orderCount: number; total: Money }>;
  byPaymentMethod: Array<{
    method: PaymentMethod;
    paymentCount: number;
    total: Money;
  }>;
}

export interface TimeSeriesPoint {
  /** ISO date or `YYYY-MM-DDTHH` bucket key, always in Asia/Tehran. */
  bucket: string;
  label: string;
  orderCount: number;
  total: Money;
}

export interface TopProduct {
  productId: string;
  name: string;
  nameFa: string;
  categoryNameFa: string;
  quantity: number;
  total: Money;
}

export interface TopCategory {
  categoryId: string;
  nameFa: string;
  quantity: number;
  total: Money;
}

export interface SalesReport {
  range: { from: string; to: string; timezone: string };
  totals: SalesTotals;
  breakdown: SalesBreakdown;
  series: TimeSeriesPoint[];
  topProducts: TopProduct[];
  topCategories: TopCategory[];
  peakHours: TimeSeriesPoint[];
}

export interface DashboardSummary {
  today: SalesTotals;
  yesterdayComparison: {
    grossSalesDeltaPct: number | null;
    orderCountDeltaPct: number | null;
  };
  activeTables: { occupied: number; total: number };
  liveOrders: OrderSummaryDto[];
  kitchenQueueCount: number;
  hourlySeries: TimeSeriesPoint[];
  dailySeries: TimeSeriesPoint[];
  topProducts: TopProduct[];
  paymentBreakdown: SalesBreakdown['byPaymentMethod'];
  orderTypeBreakdown: SalesBreakdown['byOrderType'];
  unavailableProducts: Array<{ id: string; nameFa: string }>;
}

/* ---------------------------------------------------------------------- */
/* Promotions                                                              */
/* ---------------------------------------------------------------------- */

export interface CouponDto {
  id: string;
  code: string;
  type: import('./enums').CouponType;
  value: number;
  description: string | null;
  minOrderTotal: Money;
  maxDiscount: Money | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  /** Derived: active, in-window and not exhausted right now. */
  isRedeemable: boolean;
  /** Total discount this campaign has given away, for cost reporting. */
  totalDiscountGiven: Money;
  createdAt: string;
}

/** Result of previewing a coupon against a cart, before the order exists. */
export interface CouponPreview {
  valid: boolean;
  code: string;
  /** Discount that would apply to the supplied subtotal. */
  discount: Money;
  description: string | null;
  /** Persian reason the code was rejected; null when valid. */
  reason: string | null;
}
