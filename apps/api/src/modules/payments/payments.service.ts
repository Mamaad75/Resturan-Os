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
import type { PaymentProvider } from './payment.provider';
import { SandboxPaymentProvider } from './providers/sandbox.provider';
import { ZarinpalPaymentProvider } from './providers/zarinpal.provider';

/** The single platform-gateway config row lives at this sentinel id. */
const PLATFORM_PAYMENT_CONFIG_ID = '00000000-0000-0000-0000-000000000001';

/** How a given restaurant is set up to take ONLINE payments right now. */
interface TenantOnlineConfig {
  provider: PaymentProvider | null;
  mode: 'OFF' | 'PLATFORM' | 'OWN';
  /** Platform commission in basis points (0 for OWN / OFF). */
  commissionBps: number;
  settleMinHours: number;
  settleMaxHours: number;
}

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
   * Builds the ONLINE gateway for one restaurant from its saved configuration
   * (DB), not from process env. This is what makes the superadmin/owner gateway
   * settings actually take effect. A gateway in sandbox mode resolves to the
   * Sandbox provider so the flow can be exercised before a real gateway exists.
   */
  private buildOnlineProvider(
    providerName: string | null | undefined,
    credentials: Record<string, string>,
    sandbox: boolean,
  ): PaymentProvider | null {
    if (sandbox) return new SandboxPaymentProvider();
    const name = (providerName ?? '').trim().toLowerCase();
    if (name === 'zarinpal') {
      const merchantId = credentials.merchant_id ?? credentials.merchantId ?? '';
      if (merchantId) return new ZarinpalPaymentProvider(merchantId);
    }
    // Unknown / unconfigured provider: online is simply unavailable.
    return null;
  }

  private asCreds(value: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = String(v ?? '');
      }
    }
    return out;
  }

  /** Resolves the ONLINE gateway + commission for a restaurant, from the DB. */
  private async resolveTenantOnline(tenantId: string): Promise<TenantOnlineConfig> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId },
      select: {
        onlinePaymentMode: true,
        ownPaymentProvider: true,
        ownPaymentCredentials: true,
        ownPaymentSandbox: true,
      },
    });
    const mode = (restaurant?.onlinePaymentMode ?? 'OFF') as TenantOnlineConfig['mode'];

    if (!restaurant || mode === 'OFF') {
      return { provider: null, mode: 'OFF', commissionBps: 0, settleMinHours: 0, settleMaxHours: 0 };
    }

    if (mode === 'OWN') {
      const provider = this.buildOnlineProvider(
        restaurant.ownPaymentProvider,
        this.asCreds(restaurant.ownPaymentCredentials),
        restaurant.ownPaymentSandbox,
      );
      return { provider, mode: 'OWN', commissionBps: 0, settleMinHours: 0, settleMaxHours: 0 };
    }

    // PLATFORM: use the platform's shared gateway, when it is enabled.
    const platform = await runAsSystem('payments: platform gateway config', () =>
      this.prisma.platformPaymentConfig.findUnique({
        where: { id: PLATFORM_PAYMENT_CONFIG_ID },
      }),
    );
    if (!platform || !platform.enabled) {
      return { provider: null, mode: 'PLATFORM', commissionBps: platform?.commissionBps ?? 400, settleMinHours: platform?.settleMinHours ?? 1, settleMaxHours: platform?.settleMaxHours ?? 48 };
    }
    const provider = this.buildOnlineProvider(
      platform.provider,
      this.asCreds(platform.credentials),
      platform.sandbox,
    );
    return {
      provider,
      mode: 'PLATFORM',
      commissionBps: platform.commissionBps,
      settleMinHours: platform.settleMinHours,
      settleMaxHours: platform.settleMaxHours,
    };
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

    // Cash / card terminal settle in person via the manual provider; ONLINE is
    // routed to whatever gateway this restaurant has configured in the DB.
    let provider: PaymentProvider | null;
    if (input.method === PaymentMethod.ONLINE) {
      provider = (await this.resolveTenantOnline(ctx.tenantId)).provider;
    } else {
      provider = this.providers.manual;
    }
    if (!provider) {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        'درگاه پرداخت آنلاین برای این رستوران فعال نیست.',
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
    // The callback is anonymous: the gateway reference is what identifies the
    // payment, and therefore the tenant.
    const payment = await runAsSystem('gateway callback lookup by reference', () =>
      this.prisma.payment.findFirst({
        where: { providerRef },
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

    // Rebuild the gateway from the paying restaurant's own configuration.
    const online = await this.resolveTenantOnline(payment.order.tenantId);
    if (!online.provider) {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        'درگاه پرداخت آنلاین برای این رستوران فعال نیست.',
        503,
      );
    }

    const verification = await online.provider.verifyPayment({
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

      // Money taken through the platform gateway is owed back to the
      // restaurant minus commission; record what the platform must settle.
      if (online.mode === 'PLATFORM') {
        const existing = await this.prisma.platformSettlement.findUnique({
          where: { paymentId: payment.id },
          select: { id: true },
        });
        if (!existing) {
          const gross = payment.amount;
          const commissionAmount = Math.round((gross * online.commissionBps) / 10_000);
          const dueAt = new Date(now.getTime() + online.settleMaxHours * 3_600_000);
          const eligibleAt = new Date(now.getTime() + online.settleMinHours * 3_600_000);
          await this.prisma.platformSettlement.create({
            data: {
              tenantId: payment.order.tenantId,
              orderId: payment.orderId,
              paymentId: payment.id,
              grossAmount: gross,
              commissionBps: online.commissionBps,
              commissionAmount,
              netAmount: gross - commissionAmount,
              status: 'PENDING',
              eligibleAt,
              dueAt,
            },
          });
        }
      }
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
      !payment.provider || payment.provider === this.providers.manual.name
        ? this.providers.manual
        : (await this.resolveTenantOnline(ctx.tenantId)).provider ?? this.providers.manual;
    const result = await provider.refund({
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

  /* ------------------------------------------------------------------ */
  /* Customer-facing (anonymous, by tracking token)                      */
  /* ------------------------------------------------------------------ */

  /** What a customer may do to pay this order: which methods, how much is left. */
  async getPublicPayOptions(token: string) {
    const order = await runAsSystem('public pay options: order', () =>
      this.prisma.order.findUnique({
        where: { trackingToken: token },
        select: {
          tenantId: true,
          orderNumber: true,
          total: true,
          paidTotal: true,
          paymentStatus: true,
        },
      }),
    );
    if (!order) throw AppException.notFound('سفارش');

    const restaurant = await runAsSystem('public pay options: restaurant', () =>
      this.prisma.restaurant.findFirst({
        where: { tenantId: order.tenantId },
        select: {
          payCashEnabled: true,
          payCardOnSiteEnabled: true,
          onlinePaymentMode: true,
        },
      }),
    );
    const online = await this.resolveTenantOnline(order.tenantId);

    return {
      orderNumber: order.orderNumber,
      total: order.total,
      paidTotal: order.paidTotal,
      outstanding: Math.max(0, order.total - order.paidTotal),
      paymentStatus: order.paymentStatus,
      methods: {
        cash: restaurant?.payCashEnabled ?? false,
        cardOnSite: restaurant?.payCardOnSiteEnabled ?? false,
        online: (restaurant?.onlinePaymentMode ?? 'OFF') !== 'OFF' && online.provider !== null,
      },
    };
  }

  /**
   * Starts an online payment a customer initiated from the tracking page. The
   * money is only captured once the gateway callback verifies it, exactly like
   * the staff-initiated flow.
   */
  async startPublicOnlinePayment(token: string): Promise<{ redirectUrl: string | null }> {
    const order = await runAsSystem('public online pay: order', () =>
      this.prisma.order.findUnique({
        where: { trackingToken: token },
        select: {
          id: true,
          tenantId: true,
          orderNumber: true,
          total: true,
          paidTotal: true,
          currency: true,
          customerPhone: true,
        },
      }),
    );
    if (!order) throw AppException.notFound('سفارش');

    const outstanding = order.total - order.paidTotal;
    if (outstanding <= 0) {
      throw new AppException(
        ApiErrorCode.ORDER_ALREADY_PAID,
        'این سفارش قبلاً به‌طور کامل تسویه شده است.',
        409,
      );
    }

    const online = await this.resolveTenantOnline(order.tenantId);
    if (!online.provider) {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        'درگاه پرداخت آنلاین برای این رستوران فعال نیست.',
        503,
      );
    }

    let providerResult;
    try {
      providerResult = await online.provider.createPayment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: outstanding,
        currency: order.currency,
        method: PaymentMethod.ONLINE,
        description: `سفارش #${order.orderNumber}`,
        customerPhone: order.customerPhone,
        callbackUrl: this.config.payment.callbackUrl,
      });
    } catch {
      throw new AppException(
        ApiErrorCode.PAYMENT_PROVIDER_ERROR,
        'ارتباط با درگاه پرداخت برقرار نشد. لطفاً دوباره تلاش کنید.',
        502,
      );
    }

    await runAsSystem('public online pay: create pending payment', () =>
      this.prisma.payment.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          recordedById: null,
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PENDING,
          amount: outstanding,
          currency: order.currency,
          provider: online.provider!.name,
          providerRef: providerResult.providerRef,
          providerMeta: (providerResult.raw ?? undefined) as never,
        },
      }),
    );

    return { redirectUrl: providerResult.redirectUrl };
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
