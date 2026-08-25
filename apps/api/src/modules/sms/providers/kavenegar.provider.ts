import { Logger } from '@nestjs/common';
import { normalizeIranianMobile } from '@restaurant-os/types';
import type { SmsDeliveryStatus, SmsProvider, SmsSendResult } from '../sms.provider';

/**
 * Kavenegar (kavenegar.com) adapter.
 *
 * Uses the REST API directly rather than the vendor SDK, so the only
 * dependency is fetch. Network and HTTP failures are reported as
 * `accepted: false` and left for the outbox worker to retry.
 */
export class KavenegarSmsProvider implements SmsProvider {
  readonly name = 'kavenegar';
  private readonly logger = new Logger('SMS/kavenegar');

  constructor(
    private readonly apiKey: string,
    private readonly sender: string | null,
  ) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/sms/send.json`;
    const params = new URLSearchParams({ receptor: to, message: body });
    if (this.sender) params.set('sender', this.sender);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as {
        return?: { status: number; message: string };
        entries?: Array<{ messageid: number }>;
      };

      if (payload.return?.status !== 200) {
        return {
          providerRef: null,
          accepted: false,
          error: payload.return?.message ?? `HTTP ${response.status}`,
        };
      }
      return {
        providerRef: payload.entries?.[0]?.messageid?.toString() ?? null,
        accepted: true,
      };
    } catch (error) {
      this.logger.warn(`send failed: ${(error as Error).message}`);
      return { providerRef: null, accepted: false, error: (error as Error).message };
    }
  }

  async getStatus(providerRef: string): Promise<SmsDeliveryStatus> {
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/sms/status.json`;
    try {
      const response = await fetch(`${url}?messageid=${encodeURIComponent(providerRef)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as {
        entries?: Array<{ status: number }>;
      };
      const status = payload.entries?.[0]?.status;
      // 10 = delivered; 1/2/4/5 are still in flight; anything else failed.
      if (status === 10) return { delivered: true, pending: false };
      if (status === 1 || status === 2 || status === 4 || status === 5) {
        return { delivered: false, pending: true };
      }
      return { delivered: false, pending: false, error: `status ${status}` };
    } catch (error) {
      return { delivered: false, pending: true, error: (error as Error).message };
    }
  }

  normalizePhone(input: string): string | null {
    return normalizeIranianMobile(input);
  }
}
