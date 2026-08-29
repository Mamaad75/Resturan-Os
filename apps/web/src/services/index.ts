import type {
  AuditLogDto,
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
} from '@restaurant-os/types';
import { api, uploadFile, type ListResult } from '@/lib/api-client';

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
  uploadImage: (file: File, folder: 'products' | 'branding' = 'products') =>
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
      type: 'DINE_IN' | 'TAKEAWAY';
      tableId?: string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      notes?: string | null;
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
};

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
