import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SmsService } from './sms.service';

/**
 * Background worker for the SMS outbox.
 *
 * Runs in-process, which is the right call for a modular monolith serving one
 * restaurant group. The queue itself lives in PostgreSQL, so moving this into a
 * dedicated worker process later needs no schema change.
 */
@Injectable()
export class SmsWorker {
  private readonly logger = new Logger(SmsWorker.name);
  private running = false;

  constructor(private readonly sms: SmsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processQueue(): Promise<void> {
    // The sweep spans tenants by design: it is infrastructure, not a request.
    // Guard against overlap if a provider is slow enough to outlast the tick.
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.sms.findDue(25);
      if (due.length === 0) return;

      this.logger.log(`Retrying ${due.length} queued SMS message(s)`);
      for (const id of due) {
        await this.sms.attemptDelivery(id);
      }
    } catch (error) {
      this.logger.error(
        'SMS queue sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile(): Promise<void> {
    try {
      const updated = await this.sms.reconcileDeliveries(25);
      if (updated > 0) {
        this.logger.log(`Reconciled delivery status for ${updated} message(s)`);
      }
    } catch (error) {
      this.logger.error(
        'SMS reconciliation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
