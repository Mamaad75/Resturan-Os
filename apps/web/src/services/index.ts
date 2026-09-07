import type {
  AuditLogDto,
  CampaignDto,
  CustomerDto,
  CustomerSegment,
  MenuThemeDto,
  PlanDto,
  PlatformDashboard,
  PlatformSession,
  PlatformTenantDetail,
  PlatformTenantSummary,
  SubscriptionDto,
  TenantEntitlements,
  CouponDto,
  CouponPreview,
  FeedbackSummary,
  WaiterCallDto,
  AuthSession,
  DashboardSummary,
  NotificationDto,
  OrderDto,
  OrderSummaryDto,
  OrderTrackingDto,
  PaymentDto,
  PublicMenu,
  PublicProduct,
  QrCodeDto,
  RestaurantBranding,
  RestaurantSettings,
  SalesReport,
  SmsMessageDto,
  StaffDto,
  TableDto,
  PublicRestaurant,
} from '@restaurant-os/types';
import {
  api,
  uploadFile,
  type ListResult,
  type UploadFolder,
} from '@/lib/api-client';

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const authService = {
  login: (body: { email: string; password: string; tenantSlug?: string }) =>
    api.post<AuthSession>('/auth/login', body),
  refresh: () => api.post<AuthSession>('/auth/refresh'),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout'),
  me: () => api.get<AuthSession>('/auth/me'),
  switchBranch: (branchId: string) =>
    api.post<{ accessToken: string; expiresIn: number }>('/auth/switch-branch', {
      branchId,
    }),
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => api.post<{ changed: boolean }>('/auth/change-password', body),
};

/* ------------------------------------------------------------------ */
/* Signup                                                              */
/* ------------------------------------------------------------------ */

export const storageService = {
  /** Returns an optimised WebP plus a square thumbnail. */
  uploadImage: (file: File, folder: UploadFolder = 'products') =>
    uploadFile<{
      key: string;
      url: string;
      thumbnailUrl: string;
      size: number;
      contentType: string;
    }>('/uploads/image', file, { folder }),
};

export const guestService = {
  callWaiter: (
    slug: string,
    body: { tableId: string; reason: 'ASSISTANCE' | 'BILL' | 'SUPPLIES'; note?: string | null },
  ) =>
    api.post<{ callId: string; alreadyOpen: boolean; tableNumber: number }>(
      `/public/restaurants/${slug}/waiter-call`,
      body,
      { retryOnAuthFailure: false },
    ),
  submitFeedback: (token: string, body: { rating: number; comment?: string | null }) =>
    api.post<{ id: string; rating: number }>(
      `/public/orders/track/${token}/feedback`,
      body,
      { retryOnAuthFailure: false },
    ),

  // Staff side.
  openCalls: (branchId?: string) =>
    api.get<WaiterCallDto[]>('/waiter-calls', { query: { branchId } }),
  updateCall: (id: string, status: 'ACKNOWLEDGED' | 'RESOLVED') =>
    api.patch<{ id: string; status: string }>(`/waiter-calls/${id}`, { status }),
  feedbackSummary: (branchId?: string) =>
    api.get<FeedbackSummary>('/feedback', { query: { branchId } }),
};

export const couponService = {
  list: () => api.get<CouponDto[]>('/coupons'),
  create: (body: Record<string, unknown>) => api.post<CouponDto>('/coupons', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<CouponDto>(`/coupons/${id}`, body),
  remove: (id: string) =>
    api.delete<{ deleted: boolean; deactivated: boolean }>(`/coupons/${id}`),

  /** Customer-facing check before the order is submitted. */
  preview: (slug: string, body: { code: string; subtotal: number; phone?: string | null }) =>
    api.post<CouponPreview>(`/public/restaurants/${slug}/coupons/preview`, body, {
      retryOnAuthFailure: false,
    }),
};

export const signupService = {
  /** Live availability check as the owner types their public address. */
  checkSlug: (slug: string) =>
    api.get<{ slug: string; available: boolean; reason?: string }>(
      '/public/signup/slug-available',
      { query: { slug }, retryOnAuthFailure: false },
    ),
  create: (body: {
    restaurantName: string;
    slug: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
    businessType: 'cafe' | 'restaurant' | 'fastfood';
    acceptedTerms: boolean;
  }) => api.post<AuthSession>('/public/signup', body, { retryOnAuthFailure: false }),
};

/* ------------------------------------------------------------------ */
/* Public (customer) surface                                           */
/* ------------------------------------------------------------------ */

export const publicService = {
  menu: (slug: string, table?: number) =>
    api.get<PublicMenu>(`/public/restaurants/${slug}/menu`, {
      query: { table },
      // The menu is public; skip the refresh dance entirely.
      retryOnAuthFailure: false,
    }),
  createOrder: (
    slug: string,
    body: {
      type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
      tableId?: string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      notes?: string | null;
      /** Delivery only. The server prices the trip from the zone. */
      deliveryZoneId?: string | null;
      deliveryAddress?: string | null;
      deliveryNotes?: string | null;
      couponCode?: string | null;
      marketingConsent?: boolean;
      items: Array<{
        productId: string;
        quantity: number;
        notes?: string | null;
        modifierOptionIds: string[];
      }>;
    },
  ) =>
    api.post<{ order: OrderDto; trackingToken: string; trackingUrl: string }>(
      `/public/restaurants/${slug}/orders`,
      body,
      { retryOnAuthFailure: false },
    ),
  track: (token: string) =>
    api.get<OrderTrackingDto>(`/public/orders/track/${token}`, {
      retryOnAuthFailure: false,
    }),
  trackNotifications: (token: string) =>
    api.get<NotificationDto[]>(`/public/orders/track/${token}/notifications`, {
      retryOnAuthFailure: false,
    }),
  payOptions: (token: string) =>
    api.get<PayOptionsDto>(`/public/payments/options/${token}`, {
      retryOnAuthFailure: false,
    }),
  startOnlinePayment: (token: string) =>
    api.post<{ redirectUrl: string | null }>(
      `/public/payments/start/${token}`,
      undefined,
      { retryOnAuthFailure: false },
    ),
  verifyPayment: (providerRef: string) =>
    api.post<{ verified: boolean; orderId: string | null; trackingToken: string | null }>(
      '/public/payments/verify',
      { providerRef },
      { retryOnAuthFailure: false },
    ),
};

export interface PayOptionsDto {
  orderNumber: string;
  total: number;
  paidTotal: number;
  outstanding: number;
  paymentStatus: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
  methods: { cash: boolean; cardOnSite: boolean; online: boolean };
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export interface AdminCategory {
  id: string;
  name: string;
  nameFa: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  productCount: number;
}

export type AdminProduct = PublicProduct & { categoryNameFa: string };

export const menuService = {
  tree: (branchId?: string) =>
    api.get<{
      menuId: string;
      branchId: string;
      categories: Array<{ id: string; nameFa: string; products: PublicProduct[] }>;
    }>('/menu', { query: { branchId } }),

  categories: (branchId?: string) =>
    api.get<AdminCategory[]>('/categories', { query: { branchId } }),
  createCategory: (body: Record<string, unknown>) =>
    api.post<AdminCategory>('/categories', body),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    api.patch<AdminCategory>(`/categories/${id}`, body),
  deleteCategory: (id: string) => api.delete<{ deleted: boolean }>(`/categories/${id}`),
  reorderCategories: (items: Array<{ id: string; displayOrder: number }>) =>
    api.post<{ reordered: number }>('/categories/reorder', { items }),

  products: (params: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    search?: string;
    branchId?: string;
  }) => api.get<ListResult<AdminProduct>>('/products', { query: params }),
  product: (id: string) => api.get<AdminProduct>(`/products/${id}`),
  createProduct: (body: Record<string, unknown>) =>
    api.post<AdminProduct>('/products', body),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    api.patch<AdminProduct>(`/products/${id}`, body),
  setAvailability: (id: string, isAvailable: boolean) =>
    api.patch<AdminProduct>(`/products/${id}/availability`, { isAvailable }),
  deleteProduct: (id: string) => api.delete<{ deleted: boolean }>(`/products/${id}`),
  reorderProducts: (items: Array<{ id: string; displayOrder: number }>) =>
    api.post<{ reordered: number }>('/products/reorder', { items }),
};

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export interface OrderListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
  paymentStatus?: string;
  search?: string;
  activeOnly?: boolean;
  tableId?: string;
  from?: string;
  to?: string;
  branchId?: string;
}

export const orderService = {
  list: (params: OrderListParams = {}) =>
    api.get<ListResult<OrderSummaryDto>>('/orders', { query: params }),
  get: (id: string) => api.get<OrderDto>(`/orders/${id}`),
  kitchenQueue: (branchId?: string) =>
    api.get<OrderSummaryDto[]>('/orders/kitchen/queue', { query: { branchId } }),
  create: (body: Record<string, unknown>, branchId?: string) =>
    api.post<{ order: OrderDto; trackingToken: string }>('/orders', body, {
      query: { branchId },
    }),
  updateStatus: (id: string, status: string, note?: string) =>
    api.patch<OrderDto>(`/orders/${id}/status`, { status, note }),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<OrderDto>(`/orders/${id}`, body),
  addItems: (id: string, items: Array<Record<string, unknown>>) =>
    api.post<OrderDto>(`/orders/${id}/items`, { items }),
};

export const paymentService = {
  list: (orderId: string) => api.get<PaymentDto[]>(`/orders/${orderId}/payment`),
  create: (
    orderId: string,
    body: { method: string; amount?: number; reference?: string; note?: string },
  ) =>
    api.post<{
      payment: PaymentDto;
      redirectUrl: string | null;
      order: { paidTotal: number; total: number; paymentStatus: string };
    }>(`/orders/${orderId}/payment`, body),
  refund: (orderId: string, body: { paymentId: string; amount?: number; reason?: string }) =>
    api.post<PaymentDto>(`/orders/${orderId}/payment/refund`, body),
};

/* ------------------------------------------------------------------ */
/* Floor, QR, staff, settings                                          */
/* ------------------------------------------------------------------ */

export const tableService = {
  list: (branchId?: string) => api.get<TableDto[]>('/tables', { query: { branchId } }),
  create: (body: Record<string, unknown>, branchId?: string) =>
    api.post<TableDto>('/tables', body, { query: { branchId } }),
  bulkCreate: (body: Record<string, unknown>, branchId?: string) =>
    api.post<{ created: number; skipped: number }>('/tables/bulk', body, {
      query: { branchId },
    }),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<TableDto>(`/tables/${id}`, body),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/tables/${id}`),
};

export const qrService = {
  list: (branchId?: string) =>
    api.get<Array<QrCodeDto & { tableNumber: number | null }>>('/qr', {
      query: { branchId },
    }),
  sync: (branchId?: string) =>
    api.post<{ created: number; total: number }>('/qr/sync', undefined, {
      query: { branchId },
    }),
  printSheet: (branchId?: string) =>
    api.get<{
      restaurant: { name: string; logoUrl: string | null; tagline: string | null };
      codes: Array<{
        id: string;
        label: string;
        type: string;
        tableNumber: number | null;
        targetUrl: string;
        dataUrl: string;
      }>;
    }>('/qr/print-sheet', { query: { branchId } }),
};

export const staffService = {
  list: () => api.get<StaffDto[]>('/staff'),
  create: (body: Record<string, unknown>) => api.post<StaffDto>('/staff', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<StaffDto>(`/staff/${id}`, body),
  resetPassword: (id: string, newPassword: string) =>
    api.post<{ reset: boolean }>(`/staff/${id}/reset-password`, { newPassword }),
  remove: (id: string) => api.delete<{ disabled: boolean }>(`/staff/${id}`),
};

export interface RestaurantAdminDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  branding: RestaurantBranding;
  settings: RestaurantSettings;
  branches: Array<{
    id: string;
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    isOpen: boolean;
    isActive: boolean;
  }>;
  publicUrl: string;
}

export const restaurantService = {
  get: () => api.get<RestaurantAdminDto>('/restaurant'),
  update: (body: Record<string, unknown>) =>
    api.patch<RestaurantAdminDto>('/restaurant', body),
  updateBranding: (body: Record<string, unknown>) =>
    api.patch<RestaurantAdminDto>('/restaurant/branding', body),
  updateSettings: (body: Record<string, unknown>) =>
    api.patch<RestaurantAdminDto>('/restaurant/settings', body),
  updateBranch: (id: string, body: Record<string, unknown>) =>
    api.patch<unknown>(`/restaurant/branches/${id}`, body),
};

/* ------------------------------------------------------------------ */
/* Analytics & messaging                                               */
/* ------------------------------------------------------------------ */

export const reportService = {
  dashboard: (branchId?: string) =>
    api.get<DashboardSummary>('/dashboard', { query: { branchId } }),
  sales: (params: {
    preset?: string;
    from?: string;
    to?: string;
    granularity?: string;
    branchId?: string;
  }) => api.get<SalesReport>('/reports/sales', { query: params }),
};

export const notificationService = {
  list: (params: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}) =>
    api.get<ListResult<NotificationDto> & { meta: { unread: number } }>(
      '/notifications',
      { query: params },
    ),
  markRead: (body: { ids?: string[]; all?: boolean }) =>
    api.post<{ updated: number }>('/notifications/read', body),
};

export const smsService = {
  list: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
    api.get<ListResult<SmsMessageDto>>('/sms', { query: params }),
};

export const auditService = {
  list: (params: { page?: number; pageSize?: number; entity?: string } = {}) =>
    api.get<ListResult<AuditLogDto>>('/audit', { query: params }),
};

/* ------------------------------------------------------------------ */
/* Menu theme                                                          */
/* ------------------------------------------------------------------ */

export const themeService = {
  get: () => api.get<MenuThemeDto>('/menu-theme'),
  update: (body: Record<string, unknown>) =>
    api.patch<MenuThemeDto>('/menu-theme', body),
  reset: (publish = false) =>
    api.post<MenuThemeDto>('/menu-theme/reset', undefined, {
      query: { publish: publish ? 'true' : 'false' },
    }),
  discardDraft: () => api.post<MenuThemeDto>('/menu-theme/discard-draft'),
};

/* ------------------------------------------------------------------ */
/* Subscription (tenant's own view)                                    */
/* ------------------------------------------------------------------ */

export const subscriptionService = {
  get: () =>
    api.get<{ subscription: SubscriptionDto | null; entitlements: TenantEntitlements }>(
      '/subscription',
    ),
  plans: () => api.get<PlanDto[]>('/subscription/plans'),
};

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

export interface CustomerDetail extends CustomerDto {
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    type: string;
    status: string;
    total: number;
    createdAt: string;
  }>;
}

export const customerService = {
  list: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    segment?: string;
    consentOnly?: boolean;
  }) => api.get<ListResult<CustomerDto>>('/customers', { query: params }),
  segments: () =>
    api.get<
      Array<{
        segment: CustomerSegment;
        count: number;
        labelFa: string;
        descriptionFa: string;
      }>
    >('/customers/segments'),
  get: (id: string) => api.get<CustomerDetail>(`/customers/${id}`),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<CustomerDto>(`/customers/${id}`, body),
};

export const campaignService = {
  list: () => api.get<CampaignDto[]>('/campaigns'),
  preview: (segment: string) =>
    api.get<{
      recipients: number;
      allowance: number | null;
      used: number;
      remaining: number | null;
    }>('/campaigns/preview', { query: { segment } }),
  create: (body: Record<string, unknown>) => api.post<CampaignDto>('/campaigns', body),
  send: (id: string) => api.post<CampaignDto>(`/campaigns/${id}/send`),
};

/* ------------------------------------------------------------------ */
/* Platform (FoodOS super admin)                                       */
/* ------------------------------------------------------------------ */

/**
 * The platform surface authenticates separately from the tenant app: its own
 * cookie, its own token, its own `me` endpoint. Nothing here shares state with
 * `authService`, which is what keeps a restaurant session and a platform
 * session from being mistaken for each other.
 */
export const platformService = {
  login: (body: { email: string; password: string }) =>
    api.post<PlatformSession>('/platform/auth/login', body, {
      retryOnAuthFailure: false,
    }),
  refresh: () => api.post<PlatformSession>('/platform/auth/refresh'),
  logout: () => api.post<{ loggedOut: boolean }>('/platform/auth/logout'),
  me: () => api.get<PlatformSession>('/platform/auth/me'),

  dashboard: () => api.get<PlatformDashboard>('/platform/dashboard'),
  tenants: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    planKey?: string;
  }) => api.get<ListResult<PlatformTenantSummary>>('/platform/tenants', { query: params }),
  tenant: (id: string) => api.get<PlatformTenantDetail>(`/platform/tenants/${id}`),

  suspend: (id: string, reason: string) =>
    api.post<SubscriptionDto>(`/platform/tenants/${id}/suspend`, { reason }),
  activate: (id: string) =>
    api.post<SubscriptionDto>(`/platform/tenants/${id}/activate`),
  disable: (id: string) =>
    api.post<{ isActive: boolean }>(`/platform/tenants/${id}/disable`),
  restore: (id: string) =>
    api.post<{ isActive: boolean }>(`/platform/tenants/${id}/restore`),
  setNotes: (id: string, adminNotes: string | null) =>
    api.patch<{ adminNotes: string | null }>(`/platform/tenants/${id}/notes`, {
      adminNotes,
    }),
  updateSubscription: (id: string, body: Record<string, unknown>) =>
    api.patch<SubscriptionDto>(`/platform/tenants/${id}/subscription`, body),
  extend: (id: string, days: number, note?: string) =>
    api.post<SubscriptionDto>(`/platform/tenants/${id}/subscription/extend`, {
      days,
      note,
    }),

  plans: () => api.get<PlanDto[]>('/platform/plans'),
  createPlan: (body: Record<string, unknown>) =>
    api.post<PlanDto>('/platform/plans', body),
  updatePlan: (id: string, body: Record<string, unknown>) =>
    api.patch<PlanDto>(`/platform/plans/${id}`, body),

  /** One call: this tenant, this plan, this many months, starting now. */
  activatePlan: (id: string, body: { planId: string; months: number; note?: string }) =>
    api.post<SubscriptionDto>(`/platform/tenants/${id}/subscription/activate`, body),

  bankAccounts: () => api.get<BankAccountDto[]>('/platform/bank-accounts'),
  createBankAccount: (body: Record<string, unknown>) =>
    api.post<BankAccountDto>('/platform/bank-accounts', body),
  updateBankAccount: (id: string, body: Record<string, unknown>) =>
    api.patch<BankAccountDto>(`/platform/bank-accounts/${id}`, body),

  invoices: (params: { status?: string; page?: number; pageSize?: number }) =>
    api.get<ListResult<PlatformInvoiceDto>>('/platform/invoices', { query: params }),
  approveInvoice: (id: string, reviewNote?: string) =>
    api.post<{ invoice: InvoiceDto; subscription: SubscriptionDto }>(
      `/platform/invoices/${id}/approve`,
      { reviewNote },
    ),
  rejectInvoice: (id: string, reviewNote: string) =>
    api.post<InvoiceDto>(`/platform/invoices/${id}/reject`, { reviewNote }),

  /* --- online payments: platform gateway, SMS service, settlements --- */
  paymentConfig: () =>
    api.get<PlatformPaymentConfigDto>('/platform/payment-config'),
  updatePaymentConfig: (body: UpdatePlatformPaymentConfigBody) =>
    api.put<PlatformPaymentConfigDto>('/platform/payment-config', body),

  smsConfig: () => api.get<PlatformSmsConfigDto>('/platform/sms-config'),
  updateSmsConfig: (body: UpdatePlatformSmsConfigBody) =>
    api.put<PlatformSmsConfigDto>('/platform/sms-config', body),

  settlements: (params: {
    status?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  }) =>
    api.get<SettlementListDto>('/platform/settlements', { query: params }),
  settle: (body: { ids: string[]; settlementRef?: string; note?: string }) =>
    api.post<{ settled: number }>('/platform/settlements/settle', body),

  phoneBank: (params: {
    search?: string;
    consentOnly?: boolean;
    page?: number;
    pageSize?: number;
  }) => api.get<PhoneBankDto>('/platform/phone-bank', { query: params }),
};

export interface PhoneBankRow {
  phone: string;
  name: string | null;
  restaurantName: string;
  ordersCount: number;
  marketingConsent: boolean;
  createdAt: string;
}

export interface PhoneBankDto {
  items: PhoneBankRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  totals: { records: number; consenting: number; uniquePhones: number };
}

/* --- platform online-payment DTOs --- */

export interface PlatformPaymentConfigDto {
  provider: string;
  credentials: Record<string, string>;
  sandbox: boolean;
  enabled: boolean;
  commissionBps: number;
  settleMinHours: number;
  settleMaxHours: number;
}

export interface UpdatePlatformPaymentConfigBody {
  provider: string;
  credentials?: Record<string, string>;
  sandbox?: boolean;
  enabled?: boolean;
  commissionBps: number;
  settleMinHours: number;
  settleMaxHours: number;
}

export interface PlatformSmsConfigDto {
  provider: 'console' | 'kavenegar' | 'sms_ir';
  apiKey: string;
  sender: string;
  enabled: boolean;
}

export interface UpdatePlatformSmsConfigBody {
  provider: 'console' | 'kavenegar' | 'sms_ir';
  apiKey?: string;
  sender?: string;
  enabled?: boolean;
}

export type SettlementStatus = 'PENDING' | 'SETTLED' | 'CANCELLED';

export interface SettlementDto {
  id: string;
  tenant: { id: string; name: string; slug: string };
  orderNumber: string | number;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
  status: SettlementStatus;
  eligibleAt: string;
  dueAt: string;
  settledAt: string | null;
  createdAt: string;
}

export interface SettlementListDto {
  items: SettlementDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  totals: { pendingNet: number; pendingCommission: number };
}

/* ------------------------------------------------------------------ */
/* Tenant payment configuration (the restaurant owner's side)          */
/* ------------------------------------------------------------------ */

export type OnlinePaymentMode = 'OFF' | 'PLATFORM' | 'OWN';

export interface TenantPaymentConfigDto {
  mode: OnlinePaymentMode;
  ownProvider: string | null;
  ownCredentials: Record<string, string>;
  ownSandbox: boolean;
  cashEnabled: boolean;
  cardOnSiteEnabled: boolean;
  platformAvailable: boolean;
  platformCommissionBps: number;
}

export interface UpdateTenantPaymentConfigBody {
  mode: OnlinePaymentMode;
  ownProvider?: string | null;
  ownCredentials?: Record<string, string>;
  ownSandbox?: boolean;
  cashEnabled?: boolean;
  cardOnSiteEnabled?: boolean;
}

export const paymentConfigService = {
  get: () => api.get<TenantPaymentConfigDto>('/payment-config'),
  update: (body: UpdateTenantPaymentConfigBody) =>
    api.put<TenantPaymentConfigDto>('/payment-config', body),
};

/* ------------------------------------------------------------------ */
/* Billing, from the tenant's side                                     */
/* ------------------------------------------------------------------ */

export interface BankAccountDto {
  id: string;
  bankName: string;
  holderName: string;
  cardNumber: string;
  iban: string | null;
  note: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface InvoiceDto {
  id: string;
  tenantId: string;
  months: number;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  method: string;
  payerName: string | null;
  referenceCode: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
  note: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  plan: { id: string; nameFa: string; monthlyPrice: number } | null;
  bankAccount: BankAccountDto | null;
}

export interface PlatformInvoiceDto extends InvoiceDto {
  tenant: { id: string; name: string; slug: string };
}

export interface DeliveryZoneDto {
  id: string;
  branchId: string;
  title: string;
  fee: number;
  minOrderTotal: number;
  estimatedMinutes: number;
  isActive: boolean;
  displayOrder: number;
}

export interface CourierDto {
  id: string;
  fullName: string;
  role: string;
  phone: string | null;
}

export interface DeliveryBoardOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  deliveryFee: number;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  dispatchedAt: string | null;
  createdAt: string;
  paymentStatus: string;
  deliveryZone: { id: string; title: string; estimatedMinutes: number } | null;
  courier: { id: string; fullName: string } | null;
}

export interface LoyaltyRulesDto {
  isEnabled: boolean;
  pointsPerThousand: number;
  tomanPerPoint: number;
  minRedeemPoints: number;
  maxRedeemBps: number;
  welcomePoints: number;
  expiryDays: number | null;
}

export interface LoyaltyEntryDto {
  id: string;
  type: 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE' | 'REVERSAL';
  points: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface LoyaltySummaryDto {
  points: number;
  pointsValue: number;
  tier: { key: string; label: string; toNext: number | null; nextLabel: string | null };
  entries: LoyaltyEntryDto[];
}

export const loyaltyService = {
  program: () => api.get<LoyaltyRulesDto>('/loyalty/program'),
  saveProgram: (body: LoyaltyRulesDto) =>
    api.put<LoyaltyRulesDto>('/loyalty/program', body),
  customer: (id: string) => api.get<LoyaltySummaryDto>(`/loyalty/customers/${id}`),
  adjust: (id: string, points: number, note: string) =>
    api.post<LoyaltySummaryDto>(`/loyalty/customers/${id}/adjust`, { points, note }),
};

export const deliveryService = {
  zones: (params: { branchId?: string; activeOnly?: boolean } = {}) =>
    api.get<DeliveryZoneDto[]>('/delivery/zones', {
      query: { branchId: params.branchId, activeOnly: params.activeOnly },
    }),
  createZone: (branchId: string, body: Record<string, unknown>) =>
    api.post<DeliveryZoneDto>(`/delivery/zones/${branchId}`, body),
  updateZone: (id: string, body: Record<string, unknown>) =>
    api.patch<DeliveryZoneDto>(`/delivery/zones/${id}`, body),
  deleteZone: (id: string) =>
    api.delete<{ deleted: boolean; zone: DeliveryZoneDto | null }>(
      `/delivery/zones/${id}`,
    ),
  couriers: () => api.get<CourierDto[]>('/delivery/couriers'),
  board: (branchId?: string) =>
    api.get<DeliveryBoardOrder[]>('/delivery/board', { query: { branchId } }),
  assignCourier: (orderId: string, courierId: string | null) =>
    api.patch<{ id: string; courierId: string | null }>(
      `/delivery/orders/${orderId}/courier`,
      { courierId: courierId ?? undefined },
    ),
};

export const billingService = {
  bankAccounts: () => api.get<BankAccountDto[]>('/billing/bank-accounts'),
  invoices: () => api.get<InvoiceDto[]>('/billing/invoices'),
  submit: (body: {
    planId: string;
    months: number;
    bankAccountId?: string;
    payerName?: string | null;
    referenceCode?: string | null;
    paidAt?: string;
    receiptUrl?: string | null;
    note?: string | null;
  }) => api.post<InvoiceDto>('/billing/invoices', body),
  cancel: (id: string) => api.post<InvoiceDto>(`/billing/invoices/${id}/cancel`),
};

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export interface EventDto {
  id: string;
  branchId: string | null;
  title: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  accentColor: string | null;
  theme: string | null;
  menuTemplate: string | null;
  menuId: string | null;
  capacity: number | null;
  rsvpEnabled: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventRsvpItem {
  id: string;
  name: string;
  phone: string;
  guests: number;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface EventRsvpsResult {
  capacity: number | null;
  reserved: number;
  spotsLeft: number | null;
  items: EventRsvpItem[];
}

export interface PublicEventsResult {
  restaurant: PublicRestaurant;
  events: EventDto[];
}

export interface PublicEventDetail {
  restaurant: PublicRestaurant;
  event: EventDto;
  spotsLeft: number | null;
}

export const eventService = {
  list: () => api.get<EventDto[]>('/events'),
  create: (body: Record<string, unknown>) => api.post<EventDto>('/events', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<EventDto>(`/events/${id}`, body),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/events/${id}`),
  rsvps: (id: string) => api.get<EventRsvpsResult>(`/events/${id}/rsvps`),
  qr: (id: string) => api.get<{ targetPath: string; dataUrl: string }>(`/events/${id}/qr`),
};

export const publicEventService = {
  list: (slug: string) =>
    api.get<PublicEventsResult>(`/public/restaurants/${slug}/events`),
  get: (slug: string, eventSlug: string) =>
    api.get<PublicEventDetail>(`/public/restaurants/${slug}/events/${eventSlug}`),
  rsvp: (
    slug: string,
    eventSlug: string,
    body: { name: string; phone: string; guests: number; note?: string | null },
  ) =>
    api.post<{ id: string; status: string }>(
      `/public/restaurants/${slug}/events/${eventSlug}/rsvp`,
      body,
    ),
};
