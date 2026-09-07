import { randomUUID } from 'node:crypto';
import { PaymentMethod } from '@restaurant-os/types';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentProvider,
  ProviderPaymentStatus,
  RefundRequest,
  RefundResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '../payment.provider';

/**
 * A stand-in online gateway for testing the whole online-payment flow before a
 * real gateway is contracted. It behaves like a redirect gateway — the customer
 * is sent to the callback URL — but "verification" always succeeds, so an
 * owner can prove the redirect → return → order-marked-paid loop end to end.
 *
 * It is only ever selected when a restaurant (or the platform) has its gateway
 * in sandbox mode, so it never touches real money.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';
  readonly supports = [PaymentMethod.ONLINE];

  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const providerRef = `sbx_${randomUUID()}`;
    const sep = request.callbackUrl.includes('?') ? '&' : '?';
    return Promise.resolve({
      providerRef,
      // Send the customer to the same callback a real gateway would use; the
      // sandbox flag lets the callback page know it can verify immediately.
      redirectUrl: `${request.callbackUrl}${sep}ref=${encodeURIComponent(providerRef)}&sandbox=1`,
      settled: false,
      raw: { sandbox: true, orderId: request.orderId, amount: request.amount },
    });
  }

  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    return Promise.resolve({
      verified: true,
      referenceId: `SBX-${request.providerRef.slice(-8).toUpperCase()}`,
      raw: { sandbox: true },
    });
  }

  refund(request: RefundRequest): Promise<RefundResponse> {
    return Promise.resolve({ refunded: true, referenceId: request.providerRef });
  }

  getPaymentStatus(_providerRef: string): Promise<ProviderPaymentStatus> {
    return Promise.resolve({ settled: false, pending: true });
  }
}
