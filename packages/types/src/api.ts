/**
 * Uniform API envelope. Every controller response and every thrown exception
 * is serialised into one of these two shapes by the global exception filter and
 * the response interceptor in `apps/api`.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: ApiErrorCode | string;
    message: string;
    /** Field-level validation problems, keyed by dotted field path. */
    details?: Record<string, string[]>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Stable machine-readable error codes. Clients branch on these, never on the
 * human-readable (Persian) message.
 */
export const ApiErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',

  ORDER_INVALID_STATE: 'ORDER_INVALID_STATE',
  ORDER_EMPTY: 'ORDER_EMPTY',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  MODIFIER_INVALID: 'MODIFIER_INVALID',
  TABLE_UNAVAILABLE: 'TABLE_UNAVAILABLE',
  SERVICE_MODE_DISABLED: 'SERVICE_MODE_DISABLED',
  PAYMENT_INVALID_STATE: 'PAYMENT_INVALID_STATE',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',
  SMS_PROVIDER_ERROR: 'SMS_PROVIDER_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
