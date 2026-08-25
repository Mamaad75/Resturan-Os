import { Inject, Injectable, Logger } from '@nestjs/common';
import { SmsStatus, type SmsMessageDto } from '@restaurant-os/types';
import { buildPaginationMeta, paginationArgs } from '../../common/utils/pagination.util';
import type { RequestContext } from '../../common/types/request-context';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { createSmsProvider } from './sms-provider.factory';
import type { SmsProvider } from './sms.provider';

export interface EnqueueSmsInput {
  tenantId: string;
  orderId?: string | null;
  to: string;
  body: string;
}

/**
 * Transactional SMS outbox.
 *
 * Messages are persisted first and delivered afterwards, so a provider outage
 * can never lose a message or roll back the order that triggered it. Delivery
 * is attempted immediately for latency, and the worker sweeps up whatever
 * failed.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: SmsProvider;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.provider = createSmsProvider(config);
    this.logger.log(`SMS provider: ${this.provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Queues a message. Never throws: SMS is a side channel and must not be able
   * to fail an order.
   */
  async enqueue(input: EnqueueSmsInput): Promise<string | null> {
    const normalized = this.provider.normalizePhone(input.to);
    if (!normalized) {
      this.logger.warn(`Refusing to queue SMS to unparseable number "${input.to}"`);
      return null;
    }

    try {
      const message = await this.prisma.smsMessage.create({
        data: {
          tenantId: input.tenantId,
          orderId: input.orderId ?? null,
          to: normalized,
          body: input.body.slice(0, 600),
          provider: this.provider.name,
          status: SmsStatus.PENDING,
          nextAttemptAt: new Date(),
        },
      });

      // Fire immediately; the worker is the safety net, not the primary path.
      void this.attemptDelivery(message.id);
      return message.id;
    } catch (error) {
      this.logger.error(
        'Failed to queue SMS message',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Sends one queued message and records the outcome. Failures schedule an
   * exponential backoff retry until SMS_MAX_ATTEMPTS is reached.
   */
  async attemptDelivery(messageId: string): Promise<void> {
    // Outbox rows are addressed by primary key: this is queue infrastructure,
    // not a tenant-scoped request, so the isolation guard is stood down here.
    return runAsSystem('sms delivery attempt', () => this.deliver(messageId));
  }

  private async deliver(messageId: string): Promise<void> {
    try {
      const message = await this.prisma.smsMessage.findFirst({
        where: { id: messageId },
      });
      if (!message || message.status === SmsStatus.SENT) return;
      if (message.status === SmsStatus.DELIVERED) return;

      const attempts = message.attempts + 1;
      const result = await this.provider.send(message.to, message.body);

      if (result.accepted) {
        await this.prisma.smsMessage.update({
          where: { id: message.id },
          data: {
            status: SmsStatus.SENT,
            providerRef: result.providerRef,
            attempts,
            sentAt: new Date(),
            nextAttemptAt: null,
            lastError: null,
          },
        });
        return;
      }

      const exhausted = attempts >= this.config.sms.maxAttempts;
      await this.prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: exhausted ? SmsStatus.FAILED : SmsStatus.PENDING,
          attempts,
          lastError: result.error?.slice(0, 500) ?? 'unknown provider error',
          // 1m, 4m, 9m, ... - quadratic backoff keeps a flapping provider quiet.
          nextAttemptAt: exhausted
            ? null
            : new Date(Date.now() + attempts * attempts * 60_000),
        },
      });

      if (exhausted) {
        this.logger.error(
          `SMS ${message.id} to ${message.to} failed permanently after ${attempts} attempts: ${result.error}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Unexpected error delivering SMS ${messageId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Messages that are due for another attempt, across every tenant. */
  async findDue(limit = 25): Promise<string[]> {
    return runAsSystem('sms outbox sweep', () => this.queryDue(limit));
  }

  private async queryDue(limit: number): Promise<string[]> {
    const rows = await this.prisma.smsMessage.findMany({
      where: {
        status: SmsStatus.PENDING,
        nextAttemptAt: { lte: new Date() },
        attempts: { lt: this.config.sms.maxAttempts },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Reconciles delivery receipts for messages the provider has accepted. */
  async reconcileDeliveries(limit = 25): Promise<number> {
    return runAsSystem('sms delivery reconciliation', () => this.reconcile(limit));
  }

  private async reconcile(limit: number): Promise<number> {
    const rows = await this.prisma.smsMessage.findMany({
      where: {
        status: SmsStatus.SENT,
        providerRef: { not: null },
        sentAt: { lte: new Date(Date.now() - 60_000) },
      },
      orderBy: { sentAt: 'asc' },
      take: limit,
      select: { id: true, providerRef: true },
    });

    let updated = 0;
    for (const row of rows) {
      const status = await this.provider.getStatus(row.providerRef!);
      if (status.pending) continue;
      await this.prisma.smsMessage.update({
        where: { id: row.id },
        data: status.delivered
          ? { status: SmsStatus.DELIVERED, deliveredAt: new Date() }
          : { status: SmsStatus.FAILED, lastError: status.error?.slice(0, 500) ?? null },
      });
      updated += 1;
    }
    return updated;
  }

  async list(
    ctx: RequestContext,
    query: { page: number; pageSize: number; status?: SmsStatus },
  ) {
    const where = {
      tenantId: ctx.tenantId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.smsMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.smsMessage.count({ where }),
    ]);

    return {
      items: rows.map(
        (row): SmsMessageDto => ({
          id: row.id,
          to: row.to,
          body: row.body,
          status: row.status,
          provider: row.provider,
          providerRef: row.providerRef,
          attempts: row.attempts,
          lastError: row.lastError,
          sentAt: row.sentAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }
}
