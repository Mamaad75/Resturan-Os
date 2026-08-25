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
 * Counter payments: cash, a card terminal, or anything else settled in person.
 *
 * There is no remote call to make - the money changed hands before the request
 * reached us - so every operation settles immediately. This is a real provider,
 * not a stub: most orders in an Iranian cafe are paid exactly this way.
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual';
  readonly supports = [PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.OTHER];

  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    return Promise.resolve({
      providerRef: randomUUID(),
      redirectUrl: null,
      settled: true,
      raw: { method: request.method, capturedAt: new Date().toISOString() },
    });
  }

  verifyPayment(_request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    return Promise.resolve({ verified: true, referenceId: null });
  }

  refund(request: RefundRequest): Promise<RefundResponse> {
    // Cash back out of the drawer; the record is what matters here.
    return Promise.resolve({ refunded: true, referenceId: request.providerRef });
  }

  getPaymentStatus(_providerRef: string): Promise<ProviderPaymentStatus> {
    return Promise.resolve({ settled: true, pending: false });
  }
}
