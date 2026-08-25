import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiErrorCode,
  AuditAction,
  PaymentMethod,
  PaymentStatus,
  TableStatus,
  formatMoney,
  type PaymentDto,
} from '@restaurant-os/types';
import type {
  CreatePaymentInput,
  RefundPaymentInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import {
  DomainEvent,
  type PaymentRecordedEvent,
} from '../../events/domain-events';
import {
  PRISMA,
  type PrismaService,
  type PrismaTransaction,
} from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { AuditService } from '../audit/audit.service';
import {
  createPaymentProviders,
  type PaymentProviderRegistry,
} from './payment-provider.factory';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: PaymentProviderRegistry;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {
    this.providers = createPaymentProviders(config);
    this.logger.log(
      `Payment providers: manual + ${this.providers.online?.name ?? 'no online gateway'}`,
    );
  }

  /**
   * Records a payment against an order.
   *
   * Cash and card settle immediately through the manual provider. Online
   * payments are created as PENDING and only become PAID once the gateway
   * callback verifies them, so an abandoned redirect never marks an order paid.
   */
  async recordPayment(
    ctx: RequestContext,
    orderId: string,
    input: CreatePaymentInput,
  ): Promise<{ payment: PaymentDto; redirectUrl: string | null; order: { paidTotal: number; total: number; paymentStatus: PaymentStatus } }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      select: {
        id: true,
        branchId: true,
        tableId: true,
        orderNumber: true,
        total: true,
        paidTotal: true,
        currency: true,
        paymentStatus: true,
        customerId: true,
        customerPhone: true,
      },
    });
    if (!order) throw AppException.notFound('سفارش');
    if (ctx.branchId && order.branchId !== ctx.branchId) {
      throw AppException.forbidden('این سفارش متعلق به شعبه شما نیست.');
    }

    const outstanding = order.total - order.paidTotal;
    if (outstanding <= 0) {
      throw new AppException(
        ApiErrorCode.ORDER_ALREADY_PAID,
        'این سفارش قبلاً به‌طور کامل تسویه شده است.',
        409,
      );
    }

    // Default to settling the whole remaining balance.
    const amount = input.amount ?? outstanding;
    if (amount > outstanding) {
      throw new AppException(
        ApiErrorCode.PAYMENT_AMOUNT_MISMATCH,
        `مبلغ پرداخت (${formatMoney(amount)}) از مانده سفارش (${formatMoney(outstanding)}) بیشتر است.`,
        422,
      );
    }
    if (amount <= 0) {
      throw AppException.validation('مبلغ پرداخت باید بزرگ‌تر از صفر باشد.');
    }

    const provider = this.providers.forMethod(input.method);
    if (!provider) {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        'درگاه پرداخت آنلاین پیکربندی نشده است.',
        503,
      );
    }

    let providerResult;
    try {
      providerResult = await provider.createPayment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount,
        currency: order.currency,
        method: input.method,
        description: `سفارش #${order.orderNumber}`,
        customerPhone: order.customerPhone,
        callbackUrl: this.config.payment.callbackUrl,
      });
    } catch (error) {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        'ارتباط با درگاه پرداخت برقرار نشد. لطفاً دوباره تلاش کنید.',
        502,
      );
    }

    const now = new Date();
    const settled = providerResult.settled;

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: ctx.tenantId,
          orderId: order.id,
          recordedById: ctx.userId,
          method: input.method,
          status: settled ? PaymentStatus.PAID : PaymentStatus.PENDING,
          amount,
          currency: order.currency,
          provider: provider.name,
          providerRef: providerResult.providerRef,
          providerMeta: (providerResult.raw ?? undefined) as never,
          reference: input.reference ?? null,
          note: input.note ?? null,
          paidAt: settled ? now : null,
        },
      });

      const updatedOrder = settled
        ? await applySettledPayment(tx, ctx.tenantId, order.id, amount)
        : { paidTotal: order.paidTotal, total: order.total, paymentStatus: order.paymentStatus };

      return { payment, updatedOrder };
    });

    if (settled) {
      // A fully paid table is no longer waiting on the counter.
      if (order.tableId && result.updatedOrder.paymentStatus === PaymentStatus.PAID) {
        await this.prisma.restaurantTable.updateMany({
          where: {
            id: order.tableId,
            tenantId: ctx.tenantId,
            status: TableStatus.WAITING_PAYMENT,
          },
          data: { status: TableStatus.OCCUPIED },
        });
      }

      const event: PaymentRecordedEvent = {
        tenantId: ctx.tenantId,
        branchId: order.branchId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: result.payment.id,
        method: input.method,
        status: PaymentStatus.PAID,
        amount,
        paidTotal: result.updatedOrder.paidTotal,
        orderTotal: order.total,
        customerId: order.customerId,
        occurredAt: now,
      };
      this.events.emit(DomainEvent.PAYMENT_RECORDED, event);
    }

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: result.payment.id,
      metadata: {
        orderNumber: order.orderNumber,
        method: input.method,
        amount,
        settled,
      },
    });

    return {
      payment: toPaymentDto(result.payment),
      redirectUrl: providerResult.redirectUrl,
      order: result.updatedOrder,
    };
  }

  /**
   * Called when the customer returns from an online gateway. Verification is
   * what actually captures the money, so this is the only path that can turn
   * an ONLINE payment into PAID.
   */
  async verifyOnlinePayment(
    providerRef: string,
    payload?: Record<string, unknown>,
  ): Promise<{ verified: boolean; orderId: string | null; trackingToken: string | null }> {
    const provider = this.providers.online;
    if (!provider) {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        'درگاه پرداخت آنلاین پیکربندی نشده است.',
        503,
      );
    }

    // The callback is anonymous: the gateway reference is what identifies the
    // payment, and therefore the tenant.
    const payment = await runAsSystem('gateway callback lookup by reference', () =>
      this.prisma.payment.findFirst({
        where: { providerRef, provider: provider.name },
        include: {
          order: {
            select: {
              id: true,
              branchId: true,
              tenantId: true,
              orderNumber: true,
              total: true,
              trackingToken: true,
              customerId: true,
              tableId: true,
            },
          },
        },
      }),
    );
    if (!payment) throw AppException.notFound('تراکنش');

    if (payment.status === PaymentStatus.PAID) {
      // Gateways retry callbacks; verifying twice must be harmless.
      return {
        verified: true,
        orderId: payment.orderId,
        trackingToken: payment.order.trackingToken,
      };
    }

    const verification = await provider.verifyPayment({
      providerRef,
      amount: payment.currency === 'IRT' ? payment.amount * 10 : payment.amount,
      payload,
    });

    const now = new Date();
    await runAsSystem('gateway callback settlement', async () => {
      if (!verification.verified) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            note: verification.error?.slice(0, 300) ?? null,
            providerMeta: (verification.raw ?? undefined) as never,
          },
        });
        return;
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: now,
          reference: verification.referenceId,
          providerMeta: (verification.raw ?? undefined) as never,
        },
      });
      await this.prisma.$transaction((tx) =>
        applySettledPayment(tx, payment.order.tenantId, payment.orderId, payment.amount),
      );
    });

    if (verification.verified) {
      const event: PaymentRecordedEvent = {
        tenantId: payment.order.tenantId,
        branchId: payment.order.branchId,
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        paymentId: payment.id,
        method: PaymentMethod.ONLINE,
        status: PaymentStatus.PAID,
        amount: payment.amount,
        paidTotal: payment.amount,
        orderTotal: payment.order.total,
        customerId: payment.order.customerId,
        occurredAt: now,
      };
      this.events.emit(DomainEvent.PAYMENT_RECORDED, event);
    }

    return {
      verified: verification.verified,
      orderId: payment.orderId,
      trackingToken: payment.order.trackingToken,
    };
  }

  async refund(ctx: RequestContext, orderId: string, input: RefundPaymentInput) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: input.paymentId, orderId, tenantId: ctx.tenantId },
      include: { order: { select: { branchId: true, orderNumber: true } } },
    });
    if (!payment) throw AppException.notFound('تراکنش');
    if (payment.status !== PaymentStatus.PAID) {
      throw new AppException(
        ApiErrorCode.PAYMENT_INVALID_STATE,
        'فقط تراکنش‌های پرداخت‌شده قابل استرداد هستند.',
        409,
      );
    }

    const refundable = payment.amount - payment.refundAmount;
    const amount = input.amount ?? refundable;
    if (amount <= 0 || amount > refundable) {
      throw new AppException(
        ApiErrorCode.PAYMENT_AMOUNT_MISMATCH,
        `مبلغ قابل استرداد ${formatMoney(refundable)} است.`,
        422,
      );
    }

    const provider =
      payment.provider === this.providers.online?.name
        ? this.providers.online
        : this.providers.manual;
    const result = await provider!.refund({
      providerRef: payment.providerRef ?? payment.id,
      amount,
      reason: input.reason,
    });
    if (!result.refunded) {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        result.error ?? 'استرداد توسط درگاه انجام نشد.',
        502,
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextRefundAmount = payment.refundAmount + amount;
      const payments = await tx.payment.update({
        where: { id: payment.id, tenantId: ctx.tenantId },
        data: {
          refundAmount: nextRefundAmount,
          refundedAt: now,
          status:
            nextRefundAmount >= payment.amount
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PAID,
          note: input.reason ?? payment.note,
        },
      });
      await recomputeOrderPayment(tx, ctx.tenantId, orderId);
      return payments;
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.PAYMENT,
      entity: 'Payment',
      entityId: payment.id,
      metadata: {
        refundAmount: amount,
        orderNumber: payment.order.orderNumber,
        reason: input.reason,
      },
    });
    return toPaymentDto(updated);
  }

  async listForOrder(ctx: RequestContext, orderId: string): Promise<PaymentDto[]> {
    const rows = await this.prisma.payment.findMany({
      where: { orderId, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toPaymentDto);
  }
}

/* -------------------------------------------------------------------- */
/* Transaction helpers                                                   */
/* -------------------------------------------------------------------- */

/** Adds a settled amount to the order and recomputes its payment status. */
async function applySettledPayment(
  tx: PrismaTransaction,
  tenantId: string,
  orderId: string,
  amount: number,
) {
  const order = await tx.order.update({
    where: { id: orderId, tenantId },
    data: { paidTotal: { increment: amount } },
    select: { paidTotal: true, total: true },
  });

  const paymentStatus =
    order.paidTotal >= order.total ? PaymentStatus.PAID : PaymentStatus.PENDING;

  await tx.order.update({
    where: { id: orderId, tenantId },
    data: { paymentStatus },
  });

  return { paidTotal: order.paidTotal, total: order.total, paymentStatus };
}

/** Recomputes paidTotal from the payment rows - used after a refund. */
async function recomputeOrderPayment(
  tx: PrismaTransaction,
  tenantId: string,
  orderId: string,
) {
  const payments = await tx.payment.findMany({
    where: { orderId, tenantId },
    select: { amount: true, refundAmount: true, status: true },
  });

  const paidTotal = payments
    .filter((p) => p.status === PaymentStatus.PAID || p.status === PaymentStatus.REFUNDED)
    .reduce((sum, p) => sum + (p.amount - p.refundAmount), 0);

  const order = await tx.order.findFirstOrThrow({
    where: { id: orderId, tenantId },
    select: { total: true },
  });

  const hasRefund = payments.some((p) => p.status === PaymentStatus.REFUNDED);
  const paymentStatus =
    paidTotal >= order.total
      ? PaymentStatus.PAID
      : hasRefund && paidTotal === 0
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PENDING;

  await tx.order.update({
    where: { id: orderId, tenantId },
    data: { paidTotal, paymentStatus },
  });
}

function toPaymentDto(row: {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  provider: string | null;
  providerRef: string | null;
  paidAt: Date | null;
  createdAt: Date;
}): PaymentDto {
  return {
    id: row.id,
    orderId: row.orderId,
    method: row.method,
    status: row.status,
    amount: row.amount,
    provider: row.provider,
    providerRef: row.providerRef,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
