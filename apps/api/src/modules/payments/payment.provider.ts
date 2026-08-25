import type { Currency, PaymentMethod } from '@restaurant-os/types';

/**
 * Payment provider abstraction.
 *
 * Order and Payment are separate domain entities on purpose: an order can be
 * split across several payments, refunded partially, or paid by a method the
 * gateway knows nothing about. No gateway logic ever leaks into the order
 * aggregate.
 */
export interface CreatePaymentRequest {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  description: string;
  customerPhone?: string | null;
  callbackUrl: string;
}

export interface CreatePaymentResponse {
  /** Provider-side identifier (authority, token, trace number). */
  providerRef: string | null;
  /** Where to send the customer, for redirect-based gateways. */
  redirectUrl: string | null;
  /** True when the money is already captured (cash, card terminal). */
  settled: boolean;
  raw?: Record<string, unknown>;
}

export interface VerifyPaymentRequest {
  providerRef: string;
  amount: number;
  payload?: Record<string, unknown>;
}

export interface VerifyPaymentResponse {
  verified: boolean;
  /** Bank reference number to print on the receipt. */
  referenceId: string | null;
  error?: string;
  raw?: Record<string, unknown>;
}

export interface RefundRequest {
  providerRef: string;
  amount: number;
  reason?: string | null;
}

export interface RefundResponse {
  refunded: boolean;
  referenceId: string | null;
  error?: string;
}

export interface ProviderPaymentStatus {
  settled: boolean;
  pending: boolean;
  error?: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** Methods this provider is able to handle. */
  readonly supports: PaymentMethod[];
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse>;
  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse>;
  refund(request: RefundRequest): Promise<RefundResponse>;
  getPaymentStatus(providerRef: string): Promise<ProviderPaymentStatus>;
}
