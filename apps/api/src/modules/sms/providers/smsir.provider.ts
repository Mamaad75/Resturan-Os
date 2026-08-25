import { Logger } from '@nestjs/common';
import { normalizeIranianMobile } from '@restaurant-os/types';
import type { SmsDeliveryStatus, SmsProvider, SmsSendResult } from '../sms.provider';

/** SMS.ir adapter, using their v1 bulk send endpoint. */
export class SmsIrProvider implements SmsProvider {
  readonly name = 'sms_ir';
  private readonly logger = new Logger('SMS/sms_ir');

  constructor(
    private readonly apiKey: string,
    private readonly sender: string | null,
  ) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    try {
      const response = await fetch('https://api.sms.ir/v1/send/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          lineNumber: this.sender,
          messageText: body,
          mobiles: [to],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as {
        status?: number;
        message?: string;
        data?: { messageIds?: number[]; packId?: string };
      };

      if (payload.status !== 1) {
        return {
          providerRef: null,
          accepted: false,
          error: payload.message ?? `HTTP ${response.status}`,
        };
      }
      return {
        providerRef:
          payload.data?.messageIds?.[0]?.toString() ?? payload.data?.packId ?? null,
        accepted: true,
      };
    } catch (error) {
      this.logger.warn(`send failed: ${(error as Error).message}`);
      return { providerRef: null, accepted: false, error: (error as Error).message };
    }
  }

  async getStatus(providerRef: string): Promise<SmsDeliveryStatus> {
    try {
      const response = await fetch(
        `https://api.sms.ir/v1/send/${encodeURIComponent(providerRef)}`,
        { headers: { 'x-api-key': this.apiKey }, signal: AbortSignal.timeout(15_000) },
      );
      const payload = (await response.json()) as {
        data?: { deliveryState?: number };
      };
      const state = payload.data?.deliveryState;
      if (state === 1) return { delivered: true, pending: false };
      if (state === 0) return { delivered: false, pending: true };
      return { delivered: false, pending: false, error: `state ${state}` };
    } catch (error) {
      return { delivered: false, pending: true, error: (error as Error).message };
    }
  }

  normalizePhone(input: string): string | null {
    return normalizeIranianMobile(input);
  }
}
