import { Logger } from '@nestjs/common';
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

const API_BASE = 'https://api.zarinpal.com/pg/v4/payment';
const STARTPAY = 'https://www.zarinpal.com/pg/StartPay';

/**
 * ZarinPal adapter - one of the most widely used Iranian gateways.
 *
 * ZarinPal quotes amounts in Rial while the app stores Toman by default, so
 * the conversion happens here rather than polluting the domain.
 */
export class ZarinpalPaymentProvider implements PaymentProvider {
  readonly name = 'zarinpal';
  readonly supports = [PaymentMethod.ONLINE];
  private readonly logger = new Logger('Payment/zarinpal');

  constructor(private readonly merchantId: string) {}

  private toRial(amount: number, currency: string): number {
    return currency === 'IRT' ? amount * 10 : amount;
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    try {
      const response = await fetch(`${API_BASE}/request.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          merchant_id: this.merchantId,
          amount: this.toRial(request.amount, request.currency),
          description: request.description,
          callback_url: request.callbackUrl,
          metadata: {
            order_id: request.orderId,
            ...(request.customerPhone ? { mobile: request.customerPhone } : {}),
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });

      const payload = (await response.json()) as {
        data?: { code?: number; authority?: string };
        errors?: { message?: string } | unknown[];
      };

      const authority = payload.data?.authority;
      if (payload.data?.code !== 100 || !authority) {
        const message =
          (payload.errors as { message?: string })?.message ?? `HTTP ${response.status}`;
        throw new Error(message);
      }

      return {
        providerRef: authority,
        redirectUrl: `${STARTPAY}/${authority}`,
        settled: false,
        raw: payload as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.error(`createPayment failed: ${(error as Error).message}`);
      throw error;
    }
  }

  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    try {
      const response = await fetch(`${API_BASE}/verify.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          merchant_id: this.merchantId,
          authority: request.providerRef,
          // The caller passes the amount already converted to Rial.
          amount: request.amount,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const payload = (await response.json()) as {
        data?: { code?: number; ref_id?: number };
        errors?: { message?: string };
      };

      // 100 = verified now, 101 = already verified previously.
      const code = payload.data?.code;
      if (code === 100 || code === 101) {
        return {
          verified: true,
          referenceId: payload.data?.ref_id?.toString() ?? null,
          raw: payload as Record<string, unknown>,
        };
      }
      return {
        verified: false,
        referenceId: null,
        error: payload.errors?.message ?? `code ${code}`,
      };
    } catch (error) {
      return { verified: false, referenceId: null, error: (error as Error).message };
    }
  }

  refund(_request: RefundRequest): Promise<RefundResponse> {
    // ZarinPal refunds require a separate merchant agreement and API scope;
    // until that is configured, refunds are recorded manually by the operator.
    return Promise.resolve({
      refunded: false,
      referenceId: null,
      error:
        'استرداد خودکار برای این درگاه فعال نیست. استرداد را به‌صورت دستی ثبت کنید.',
    });
  }

  getPaymentStatus(_providerRef: string): Promise<ProviderPaymentStatus> {
    // ZarinPal has no idempotent status endpoint outside verify, and calling
    // verify speculatively would capture the payment. Treat as pending until
    // the callback arrives.
    return Promise.resolve({ settled: false, pending: true });
  }
}
