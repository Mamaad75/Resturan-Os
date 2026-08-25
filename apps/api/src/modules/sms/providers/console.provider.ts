import { Logger } from '@nestjs/common';
import { normalizeIranianMobile } from '@restaurant-os/types';
import { randomUUID } from 'node:crypto';
import type { SmsDeliveryStatus, SmsProvider, SmsSendResult } from '../sms.provider';

/**
 * Development provider: writes the message to the log instead of sending it.
 * Keeps the whole notification pipeline exercisable without an account or
 * spending credit, and is the default so a fresh checkout just works.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('SMS/console');

  send(to: string, body: string): Promise<SmsSendResult> {
    this.logger.log(`-> ${to}: ${body.replace(/\n/g, ' | ')}`);
    return Promise.resolve({ providerRef: randomUUID(), accepted: true });
  }

  getStatus(): Promise<SmsDeliveryStatus> {
    return Promise.resolve({ delivered: true, pending: false });
  }

  normalizePhone(input: string): string | null {
    return normalizeIranianMobile(input);
  }
}
