import { Inject, Injectable } from '@nestjs/common';
import type {
  SettleSettlementsInput,
  SettlementQueryInput,
  UpdatePlatformPaymentConfigInput,
  UpdatePlatformSmsConfigInput,
} from '@restaurant-os/validation';
import {
  buildPaginationMeta,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';

// Both config tables hold exactly one row at a fixed sentinel id.
const PAYMENT_CONFIG_ID = '00000000-0000-0000-0000-000000000001';
const SMS_CONFIG_ID = '00000000-0000-0000-0000-000000000002';
const MASK = '••••••';

type Creds = Record<string, string>;

function maskCreds(credentials: unknown): Creds {
  const out: Creds = {};
  if (credentials && typeof credentials === 'object') {
    for (const [k, v] of Object.entries(credentials as Record<string, unknown>)) {
      out[k] = v ? MASK : '';
    }
  }
  return out;
}

/**
 * Platform payment + SMS configuration and the settlement ledger, all edited
 * from the superadmin console. Secrets are never returned in the clear: reads
 * mask credential values, and writes keep an existing value when the incoming
 * one is still the mask placeholder.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------ payment config */

  async getPaymentConfig() {
    const row = await runAsSystem('platform: load payment config', () =>
      this.prisma.platformPaymentConfig.upsert({
        where: { id: PAYMENT_CONFIG_ID },
        create: { id: PAYMENT_CONFIG_ID },
        update: {},
      }),
    );
    return {
      provider: row.provider,
      credentials: maskCreds(row.credentials),
      sandbox: row.sandbox,
      enabled: row.enabled,
      commissionBps: row.commissionBps,
      settleMinHours: row.settleMinHours,
      settleMaxHours: row.settleMaxHours,
    };
  }

  async updatePaymentConfig(input: UpdatePlatformPaymentConfigInput) {
    const existing = await runAsSystem('platform: load payment config', () =>
      this.prisma.platformPaymentConfig.upsert({
        where: { id: PAYMENT_CONFIG_ID },
        create: { id: PAYMENT_CONFIG_ID },
        update: {},
      }),
    );
    const merged = this.mergeCreds(existing.credentials, input.credentials);
    await runAsSystem('platform: save payment config', () =>
      this.prisma.platformPaymentConfig.update({
        where: { id: PAYMENT_CONFIG_ID },
        data: {
          provider: input.provider,
          credentials: merged,
          sandbox: input.sandbox ?? existing.sandbox,
          enabled: input.enabled ?? false,
          commissionBps: input.commissionBps,
          settleMinHours: input.settleMinHours,
          settleMaxHours: input.settleMaxHours,
        },
      }),
    );
    return this.getPaymentConfig();
  }

  /* ---------------------------------------------------------- sms config */

  async getSmsConfig() {
    const row = await runAsSystem('platform: load sms config', () =>
      this.prisma.platformSmsConfig.upsert({
        where: { id: SMS_CONFIG_ID },
        create: { id: SMS_CONFIG_ID },
        update: {},
      }),
    );
    return {
      provider: row.provider,
      apiKey: row.apiKey ? MASK : '',
      sender: row.sender ?? '',
      enabled: row.enabled,
    };
  }

  async updateSmsConfig(input: UpdatePlatformSmsConfigInput) {
    const existing = await runAsSystem('platform: load sms config', () =>
      this.prisma.platformSmsConfig.upsert({
        where: { id: SMS_CONFIG_ID },
        create: { id: SMS_CONFIG_ID },
        update: {},
      }),
    );
    // A masked apiKey means "unchanged".
    const apiKey =
      input.apiKey == null || input.apiKey === MASK ? existing.apiKey : input.apiKey;
    await runAsSystem('platform: save sms config', () =>
      this.prisma.platformSmsConfig.update({
        where: { id: SMS_CONFIG_ID },
        data: {
          provider: input.provider,
          apiKey,
          sender: input.sender ?? null,
          enabled: input.enabled ?? false,
        },
      }),
    );
    return this.getSmsConfig();
  }

  /* --------------------------------------------------------- settlements */

  async listSettlements(query: SettlementQueryInput) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    };
    const [rows, total, pendingAgg] = await runAsSystem(
      'platform: settlement ledger',
      () =>
        Promise.all([
          this.prisma.platformSettlement.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
              tenant: { select: { id: true, name: true, slug: true } },
              payment: {
                select: {
                  id: true,
                  order: { select: { id: true, orderNumber: true } },
                },
              },
            },
            ...paginationArgs(query.page, query.pageSize),
          }),
          this.prisma.platformSettlement.count({ where }),
          this.prisma.platformSettlement.aggregate({
            where: { status: 'PENDING' },
            _sum: { netAmount: true, commissionAmount: true },
          }),
        ]),
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        tenant: r.tenant,
        orderNumber: r.payment.order.orderNumber,
        grossAmount: r.grossAmount,
        commissionAmount: r.commissionAmount,
        netAmount: r.netAmount,
        status: r.status,
        eligibleAt: r.eligibleAt.toISOString(),
        dueAt: r.dueAt.toISOString(),
        settledAt: r.settledAt ? r.settledAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
      totals: {
        pendingNet: pendingAgg._sum.netAmount ?? 0,
        pendingCommission: pendingAgg._sum.commissionAmount ?? 0,
      },
    };
  }

  async settle(input: SettleSettlementsInput) {
    const result = await runAsSystem('platform: settle payouts', () =>
      this.prisma.platformSettlement.updateMany({
        where: { id: { in: input.ids }, status: 'PENDING' },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
          settlementRef: input.settlementRef ?? null,
          note: input.note ?? null,
        },
      }),
    );
    return { settled: result.count };
  }

  private mergeCreds(existing: unknown, incoming: Creds | undefined): Creds {
    const base: Creds =
      existing && typeof existing === 'object'
        ? (Object.fromEntries(
            Object.entries(existing as Record<string, unknown>).map(([k, v]) => [
              k,
              String(v ?? ''),
            ]),
          ) as Creds)
        : {};
    if (!incoming) return base;
    for (const [k, v] of Object.entries(incoming)) {
      if (v === MASK) continue; // unchanged
      base[k] = v;
    }
    return base;
  }
}
