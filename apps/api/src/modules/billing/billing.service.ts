import { Inject, Injectable } from '@nestjs/common';
import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import type {
  ActivatePlanInput,
  BankAccountInput,
  InvoiceQueryInput,
  RejectInvoiceInput,
  ReviewInvoiceInput,
  SubmitInvoiceInput,
  UpdateBankAccountInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type {
  PlatformContext,
  RequestContext,
} from '../../common/types/request-context';
import {
  buildPaginationMeta,
  paginationArgs,
} from '../../common/utils/pagination.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { toSubscriptionDto } from '../plans/plans.service';
import {
  PlatformAction,
  PlatformAuditService,
  type AuditMeta,
} from '../platform/platform-audit.service';

/** Whole months forward from an instant, clamped for short months. */
export function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  const targetMonth = next.getMonth() + months;
  const dayOfMonth = next.getDate();
  next.setMonth(targetMonth, 1);
  // 31 January + 1 month is 28/29 February, not 3 March.
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(dayOfMonth, lastDay));
  return next;
}

/**
 * What a period costs.
 *
 * Computed here and never taken from the client: the price a tenant is shown
 * and the price recorded on the invoice have to come from the same line of
 * code, or a tampered request buys a year for one Toman.
 */
export function invoiceAmount(monthlyPrice: number, months: number): number {
  return monthlyPrice * months;
}

/**
 * Subscription billing.
 *
 * Two audiences share this service on purpose. `activatePlan` is the single
 * writer that turns a plan plus a period into a live subscription; an operator
 * pressing "activate" and an approved card-to-card receipt both go through it,
 * so the two paths cannot drift into producing different subscriptions.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  /* ----------------------------------------------------------- activation */

  /**
   * Put a tenant on a plan for a number of months, starting now.
   *
   * An unexpired subscription is extended from its own expiry rather than from
   * today, so paying early never costs the days already bought.
   */
  async activatePlan(
    tenantId: string,
    input: ActivatePlanInput,
    actor: { adminId: string; source: 'platform' | 'invoice' },
    meta: AuditMeta,
  ) {
    const plan = await runAsSystem('billing: load plan', () =>
      this.prisma.plan.findUnique({ where: { id: input.planId } }),
    );
    if (!plan) throw AppException.notFound('پلن');
    if (!plan.isActive) {
      throw AppException.validation('این پلن غیرفعال است و قابل تخصیص نیست.', {
        planId: ['پلن غیرفعال است.'],
      });
    }

    const before = await runAsSystem('billing: load subscription', () =>
      this.prisma.subscription.findUnique({ where: { tenantId } }),
    );
    if (!before) throw AppException.notFound('اشتراک');

    const now = new Date();
    const samePlan = before.planId === input.planId;
    // Only the same plan carries its remaining days over. Switching plans
    // starts a fresh period, or an upgrade would inherit a downgrade's runway.
    const base =
      samePlan && before.expiresAt && before.expiresAt > now ? before.expiresAt : now;
    const expiresAt = addMonths(base, input.months);

    const updated = await runAsSystem('billing: activate plan', () =>
      this.prisma.subscription.update({
        where: { tenantId },
        data: {
          planId: input.planId,
          status: SubscriptionStatus.ACTIVE,
          expiresAt,
          // A live paid period contradicts every reason the row was parked.
          trialEndsAt: null,
          graceUntil: null,
          suspendedAt: null,
          suspendedReason: null,
          cancelledAt: null,
        },
        include: { plan: true },
      }),
    );

    // A suspended tenant is switched off at the tenant row too; paying up has
    // to undo both or the restaurant stays dark with an ACTIVE subscription.
    await runAsSystem('billing: reactivate tenant', () =>
      this.prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } }),
    );

    this.audit.record({
      adminId: actor.adminId,
      tenantId,
      action: PlatformAction.PLAN_ACTIVATE,
      entity: 'Subscription',
      entityId: before.id,
      previousValue: {
        planId: before.planId,
        status: before.status,
        expiresAt: before.expiresAt,
      },
      newValue: {
        planId: input.planId,
        months: input.months,
        expiresAt,
        source: actor.source,
        note: input.note ?? null,
      },
      ...meta,
    });

    return toSubscriptionDto(updated);
  }

  /* --------------------------------------------------------- bank accounts */

  /** The cards a tenant may transfer to. Public to signed-in tenants. */
  async activeBankAccounts() {
    const rows = await runAsSystem('billing: list bank accounts', () =>
      this.prisma.platformBankAccount.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    );
    return rows.map(toBankAccountDto);
  }

  async listBankAccounts() {
    const rows = await runAsSystem('billing: list all bank accounts', () =>
      this.prisma.platformBankAccount.findMany({
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    );
    return rows.map(toBankAccountDto);
  }

  async createBankAccount(
    admin: PlatformContext,
    input: BankAccountInput,
    meta: AuditMeta,
  ) {
    const row = await runAsSystem('billing: create bank account', () =>
      this.prisma.platformBankAccount.create({
        data: {
          bankName: input.bankName,
          holderName: input.holderName,
          cardNumber: input.cardNumber,
          iban: input.iban ?? null,
          note: input.note ?? null,
          isActive: input.isActive ?? true,
          displayOrder: input.displayOrder ?? 0,
        },
      }),
    );
    this.audit.record({
      adminId: admin.adminId,
      tenantId: null,
      action: PlatformAction.BANK_ACCOUNT_CREATE,
      entity: 'PlatformBankAccount',
      entityId: row.id,
      previousValue: null,
      newValue: { bankName: row.bankName, holderName: row.holderName },
      ...meta,
    });
    return toBankAccountDto(row);
  }

  async updateBankAccount(
    admin: PlatformContext,
    id: string,
    input: UpdateBankAccountInput,
    meta: AuditMeta,
  ) {
    const before = await runAsSystem('billing: load bank account', () =>
      this.prisma.platformBankAccount.findUnique({ where: { id } }),
    );
    if (!before) throw AppException.notFound('حساب بانکی');

    const row = await runAsSystem('billing: update bank account', () =>
      this.prisma.platformBankAccount.update({
        where: { id },
        data: {
          ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
          ...(input.holderName !== undefined ? { holderName: input.holderName } : {}),
          ...(input.cardNumber !== undefined ? { cardNumber: input.cardNumber } : {}),
          ...(input.iban !== undefined ? { iban: input.iban } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.displayOrder !== undefined
            ? { displayOrder: input.displayOrder }
            : {}),
        },
      }),
    );
    this.audit.record({
      adminId: admin.adminId,
      tenantId: null,
      action: PlatformAction.BANK_ACCOUNT_UPDATE,
      entity: 'PlatformBankAccount',
      entityId: id,
      previousValue: { isActive: before.isActive, cardNumber: before.cardNumber },
      newValue: { isActive: row.isActive, cardNumber: row.cardNumber },
      ...meta,
    });
    return toBankAccountDto(row);
  }

  /* -------------------------------------------------------------- invoices */

  /** A tenant reporting that it has transferred the money. */
  async submitInvoice(ctx: RequestContext, input: SubmitInvoiceInput) {
    const plan = await runAsSystem('billing: price the plan', () =>
      this.prisma.plan.findUnique({ where: { id: input.planId } }),
    );
    if (!plan || !plan.isActive) throw AppException.notFound('پلن');

    // One open request at a time, or an operator reviews the same transfer
    // three times because the tenant pressed submit three times.
    const pending = await runAsSystem('billing: check open invoice', () =>
      this.prisma.subscriptionInvoice.findFirst({
        where: { tenantId: ctx.tenantId, status: InvoiceStatus.PENDING },
      }),
    );
    if (pending) {
      throw AppException.validation(
        'یک درخواست پرداخت در انتظار بررسی دارید. تا تعیین تکلیف آن نمی‌توانید درخواست تازه ثبت کنید.',
      );
    }

    if (input.bankAccountId) {
      const account = await runAsSystem('billing: verify bank account', () =>
        this.prisma.platformBankAccount.findFirst({
          where: { id: input.bankAccountId, isActive: true },
        }),
      );
      if (!account) throw AppException.notFound('حساب بانکی');
    }

    const row = await runAsSystem('billing: create invoice', () =>
      this.prisma.subscriptionInvoice.create({
        data: {
          tenantId: ctx.tenantId,
          planId: plan.id,
          months: input.months,
          amount: invoiceAmount(plan.monthlyPrice, input.months),
          bankAccountId: input.bankAccountId ?? null,
          payerName: input.payerName ?? null,
          referenceCode: input.referenceCode ?? null,
          paidAt: input.paidAt ? new Date(input.paidAt) : null,
          receiptUrl: input.receiptUrl ?? null,
          note: input.note ?? null,
        },
        include: { plan: true, bankAccount: true },
      }),
    );
    return toInvoiceDto(row);
  }

  /** The tenant's own billing history. */
  async myInvoices(ctx: RequestContext) {
    const rows = await runAsSystem('billing: list tenant invoices', () =>
      this.prisma.subscriptionInvoice.findMany({
        where: { tenantId: ctx.tenantId },
        include: { plan: true, bankAccount: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    return rows.map(toInvoiceDto);
  }

  /** A tenant withdrawing a request it submitted by mistake. */
  async cancelInvoice(ctx: RequestContext, id: string) {
    const row = await runAsSystem('billing: load own invoice', () =>
      this.prisma.subscriptionInvoice.findFirst({
        where: { id, tenantId: ctx.tenantId },
      }),
    );
    if (!row) throw AppException.notFound('درخواست پرداخت');
    if (row.status !== InvoiceStatus.PENDING) {
      throw AppException.validation('فقط درخواست در انتظار بررسی قابل لغو است.');
    }
    const updated = await runAsSystem('billing: cancel invoice', () =>
      this.prisma.subscriptionInvoice.update({
        where: { id },
        data: { status: InvoiceStatus.CANCELLED },
        include: { plan: true, bankAccount: true },
      }),
    );
    return toInvoiceDto(updated);
  }

  /* ---------------------------------------------------- platform review */

  async listInvoices(query: InvoiceQueryInput) {
    const where = query.status ? { status: query.status as InvoiceStatus } : {};
    const [rows, total] = await runAsSystem('billing: platform invoice queue', () =>
      Promise.all([
        this.prisma.subscriptionInvoice.findMany({
          where,
          include: {
            plan: true,
            bankAccount: true,
            tenant: { select: { id: true, name: true, slug: true } },
          },
          // Oldest first inside the pending queue: whoever waited longest is
          // reviewed first.
          orderBy: { createdAt: query.status === 'PENDING' ? 'asc' : 'desc' },
          ...paginationArgs(query.page, query.pageSize),
        }),
        this.prisma.subscriptionInvoice.count({ where }),
      ]),
    );

    return {
      items: rows.map((row) => ({
        ...toInvoiceDto(row),
        tenant: row.tenant,
      })),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async pendingCount(): Promise<number> {
    return runAsSystem('billing: pending invoice count', () =>
      this.prisma.subscriptionInvoice.count({
        where: { status: InvoiceStatus.PENDING },
      }),
    );
  }

  /** Approving a receipt is what activates the plan. */
  async approveInvoice(
    admin: PlatformContext,
    id: string,
    input: ReviewInvoiceInput,
    meta: AuditMeta,
  ) {
    const invoice = await this.requirePending(id);

    const updated = await runAsSystem('billing: approve invoice', () =>
      this.prisma.subscriptionInvoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.APPROVED,
          reviewedByAdminId: admin.adminId,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote ?? null,
        },
        include: { plan: true, bankAccount: true },
      }),
    );

    const subscription = await this.activatePlan(
      invoice.tenantId,
      { planId: invoice.planId, months: invoice.months, note: `فاکتور ${id}` },
      { adminId: admin.adminId, source: 'invoice' },
      meta,
    );

    this.audit.record({
      adminId: admin.adminId,
      tenantId: invoice.tenantId,
      action: PlatformAction.INVOICE_APPROVE,
      entity: 'SubscriptionInvoice',
      entityId: id,
      previousValue: { status: InvoiceStatus.PENDING },
      newValue: { status: InvoiceStatus.APPROVED, amount: invoice.amount },
      ...meta,
    });

    return { invoice: toInvoiceDto(updated), subscription };
  }

  async rejectInvoice(
    admin: PlatformContext,
    id: string,
    input: RejectInvoiceInput,
    meta: AuditMeta,
  ) {
    const invoice = await this.requirePending(id);

    const updated = await runAsSystem('billing: reject invoice', () =>
      this.prisma.subscriptionInvoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.REJECTED,
          reviewedByAdminId: admin.adminId,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote,
        },
        include: { plan: true, bankAccount: true },
      }),
    );

    this.audit.record({
      adminId: admin.adminId,
      tenantId: invoice.tenantId,
      action: PlatformAction.INVOICE_REJECT,
      entity: 'SubscriptionInvoice',
      entityId: id,
      previousValue: { status: InvoiceStatus.PENDING },
      newValue: { status: InvoiceStatus.REJECTED, reason: input.reviewNote },
      ...meta,
    });

    return toInvoiceDto(updated);
  }

  private async requirePending(id: string) {
    const row = await runAsSystem('billing: load invoice', () =>
      this.prisma.subscriptionInvoice.findUnique({ where: { id } }),
    );
    if (!row) throw AppException.notFound('درخواست پرداخت');
    if (row.status !== InvoiceStatus.PENDING) {
      throw AppException.validation('این درخواست قبلاً بررسی شده است.');
    }
    return row;
  }
}

/* ------------------------------------------------------------------ */
/* DTOs                                                                */
/* ------------------------------------------------------------------ */

interface BankAccountRow {
  id: string;
  bankName: string;
  holderName: string;
  cardNumber: string;
  iban: string | null;
  note: string | null;
  isActive: boolean;
  displayOrder: number;
}

function toBankAccountDto(row: BankAccountRow) {
  return {
    id: row.id,
    bankName: row.bankName,
    holderName: row.holderName,
    cardNumber: row.cardNumber,
    iban: row.iban,
    note: row.note,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
  };
}

interface InvoiceRow {
  id: string;
  tenantId: string;
  planId: string;
  months: number;
  amount: number;
  status: InvoiceStatus;
  method: string;
  payerName: string | null;
  referenceCode: string | null;
  paidAt: Date | null;
  receiptUrl: string | null;
  note: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  plan?: { id: string; nameFa: string; monthlyPrice: number } | null;
  bankAccount?: BankAccountRow | null;
}

function toInvoiceDto(row: InvoiceRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    months: row.months,
    amount: row.amount,
    status: row.status,
    method: row.method,
    payerName: row.payerName,
    referenceCode: row.referenceCode,
    paidAt: row.paidAt?.toISOString() ?? null,
    receiptUrl: row.receiptUrl,
    note: row.note,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    plan: row.plan
      ? { id: row.plan.id, nameFa: row.plan.nameFa, monthlyPrice: row.plan.monthlyPrice }
      : null,
    bankAccount: row.bankAccount ? toBankAccountDto(row.bankAccount) : null,
  };
}
