import { Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  CouponType,
  formatMoney,
  toPersianDigits,
  type CouponDto,
  type CouponPreview,
} from '@restaurant-os/types';
import type {
  CreateCouponInput,
  UpdateCouponInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService, type PrismaTransaction } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';

/** Outcome of evaluating a coupon against a specific cart. */
export interface CouponEvaluation {
  valid: boolean;
  couponId: string | null;
  code: string;
  discount: number;
  description: string | null;
  reason: string | null;
}

@Injectable()
export class CouponsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Evaluation - the part that must never be trusted to the client      */
  /* ------------------------------------------------------------------ */

  /**
   * Decides whether a code applies to a cart, and for how much.
   *
   * Runs inside the order transaction when an order is created, so the usage
   * count it checks is the same one it will increment - two customers racing
   * for the last redemption cannot both win.
   */
  async evaluate(
    client: PrismaService | PrismaTransaction,
    tenantId: string,
    code: string,
    subtotal: number,
    customerPhone?: string | null,
  ): Promise<CouponEvaluation> {
    const normalized = code.trim().replace(/\s+/g, '').toUpperCase();
    const reject = (reason: string): CouponEvaluation => ({
      valid: false,
      couponId: null,
      code: normalized,
      discount: 0,
      description: null,
      reason,
    });

    const coupon = await client.coupon.findFirst({
      where: { tenantId, code: normalized },
    });

    if (!coupon) return reject('کد تخفیف معتبر نیست.');
    if (!coupon.isActive) return reject('این کد تخفیف غیرفعال است.');

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      return reject('این کد تخفیف هنوز فعال نشده است.');
    }
    if (coupon.endsAt && coupon.endsAt < now) {
      return reject('مهلت استفاده از این کد تخفیف به پایان رسیده است.');
    }

    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      return reject('ظرفیت استفاده از این کد تخفیف تکمیل شده است.');
    }

    if (subtotal < coupon.minOrderTotal) {
      return reject(
        `این کد برای سفارش‌های بالای ${formatMoney(coupon.minOrderTotal)} است.`,
      );
    }

    // Per-customer limits are keyed on phone, so they hold for guests too.
    if (coupon.perCustomerLimit != null && customerPhone) {
      const used = await client.couponRedemption.count({
        where: { tenantId, couponId: coupon.id, customerPhone },
      });
      if (used >= coupon.perCustomerLimit) {
        return reject(
          `شما قبلاً ${toPersianDigits(used)} بار از این کد استفاده کرده‌اید.`,
        );
      }
    }

    const discount = this.computeDiscount(coupon, subtotal);
    if (discount <= 0) return reject('این کد برای سبد فعلی تخفیفی ایجاد نمی‌کند.');

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discount,
      description: coupon.description,
      reason: null,
    };
  }

  /**
   * Percentage coupons are basis points and may be capped; fixed coupons can
   * never exceed the subtotal, so a large code cannot produce a negative bill.
   */
  private computeDiscount(
    coupon: { type: CouponType; value: number; maxDiscount: number | null },
    subtotal: number,
  ): number {
    const raw =
      coupon.type === CouponType.PERCENTAGE
        ? Math.round((subtotal * coupon.value) / 10_000)
        : coupon.value;

    const capped =
      coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw;

    return Math.max(0, Math.min(capped, subtotal));
  }

  /**
   * Atomically claims a redemption slot, then records it.
   *
   * The limit check in `evaluate()` is advisory only. Under PostgreSQL's
   * default READ COMMITTED isolation, ten concurrent orders all read
   * `usageCount = 0`, all conclude there is room, and all redeem - a
   * "first 3 customers" campaign gets honoured ten times.
   *
   * The claim below is a single conditional UPDATE, so the limit is enforced
   * by the database rather than by a read-then-write in application code.
   * Losing transactions get zero affected rows and throw, which rolls back the
   * whole order. Taking the coupon row lock first also serialises the
   * per-customer check that follows: by the time a waiting transaction
   * proceeds, the winner has committed and its redemption is visible.
   */
  async redeem(
    tx: PrismaTransaction,
    args: {
      tenantId: string;
      couponId: string;
      orderId: string;
      customerId: string | null;
      customerPhone: string | null;
      amount: number;
    },
  ): Promise<void> {
    const claimed = await tx.$executeRaw`
      UPDATE "coupons"
         SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
       WHERE "id" = ${args.couponId}::uuid
         AND "tenantId" = ${args.tenantId}::uuid
         AND "isActive" = true
         AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
    `;

    if (claimed === 0) {
      throw AppException.validation('ظرفیت استفاده از این کد تخفیف تکمیل شده است.', {
        couponCode: ['ظرفیت استفاده از این کد تخفیف تکمیل شده است.'],
      });
    }

    // Re-check the per-customer limit now that the row lock has serialised us
    // behind any concurrent redemption of the same coupon.
    if (args.customerPhone) {
      const coupon = await tx.coupon.findFirstOrThrow({
        where: { id: args.couponId, tenantId: args.tenantId },
        select: { perCustomerLimit: true },
      });
      if (coupon.perCustomerLimit != null) {
        const used = await tx.couponRedemption.count({
          where: {
            tenantId: args.tenantId,
            couponId: args.couponId,
            customerPhone: args.customerPhone,
          },
        });
        if (used >= coupon.perCustomerLimit) {
          throw AppException.validation(
            `شما قبلاً ${toPersianDigits(used)} بار از این کد استفاده کرده‌اید.`,
            {
              couponCode: [
                `شما قبلاً ${toPersianDigits(used)} بار از این کد استفاده کرده‌اید.`,
              ],
            },
          );
        }
      }
    }

    await tx.couponRedemption.create({
      data: {
        tenantId: args.tenantId,
        couponId: args.couponId,
        orderId: args.orderId,
        customerId: args.customerId,
        customerPhone: args.customerPhone,
        amount: args.amount,
      },
    });
  }

  /** Customer-facing preview, before an order exists. */
  async preview(
    tenantId: string,
    code: string,
    subtotal: number,
    phone?: string | null,
  ): Promise<CouponPreview> {
    const result = await this.evaluate(this.prisma, tenantId, code, subtotal, phone);
    return {
      valid: result.valid,
      code: result.code,
      discount: result.discount,
      description: result.description,
      reason: result.reason,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Admin CRUD                                                          */
  /* ------------------------------------------------------------------ */

  async list(ctx: RequestContext): Promise<CouponDto[]> {
    const rows = await this.prisma.coupon.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });

    // One grouped query rather than a per-coupon sum.
    const spend = await this.prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: { tenantId: ctx.tenantId },
      _sum: { amount: true },
    });
    const spendByCoupon = new Map(
      spend.map((row) => [row.couponId, row._sum.amount ?? 0]),
    );

    return rows.map((row) => this.toDto(row, spendByCoupon.get(row.id) ?? 0));
  }

  async create(ctx: RequestContext, input: CreateCouponInput): Promise<CouponDto> {
    await this.plans.requireFeature(ctx.tenantId, 'couponsEnabled');

    const clash = await this.prisma.coupon.findFirst({
      where: { tenantId: ctx.tenantId, code: input.code },
      select: { id: true },
    });
    if (clash) throw AppException.conflict('کد تخفیف با این عنوان قبلاً ساخته شده است.');

    const created = await this.prisma.coupon.create({
      data: {
        tenantId: ctx.tenantId,
        code: input.code,
        type: input.type,
        value: input.value,
        description: input.description ?? null,
        minOrderTotal: input.minOrderTotal,
        maxDiscount: input.maxDiscount ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        usageLimit: input.usageLimit ?? null,
        perCustomerLimit: input.perCustomerLimit ?? null,
        isActive: input.isActive,
      },
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'Coupon',
      entityId: created.id,
      metadata: { code: created.code, type: created.type, value: created.value },
    });
    return this.toDto({ ...created, _count: { redemptions: 0 } }, 0);
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateCouponInput,
  ): Promise<CouponDto> {
    const existing = await this.prisma.coupon.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('کد تخفیف');

    const updated = await this.prisma.coupon.update({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.minOrderTotal !== undefined
          ? { minOrderTotal: input.minOrderTotal }
          : {}),
        ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount } : {}),
        ...(input.startsAt !== undefined
          ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
          : {}),
        ...(input.endsAt !== undefined
          ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
          : {}),
        ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
        ...(input.perCustomerLimit !== undefined
          ? { perCustomerLimit: input.perCustomerLimit }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { _count: { select: { redemptions: true } } },
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'Coupon',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });

    const spend = await this.prisma.couponRedemption.aggregate({
      where: { tenantId: ctx.tenantId, couponId: id },
      _sum: { amount: true },
    });
    return this.toDto(updated, spend._sum.amount ?? 0);
  }

  async remove(ctx: RequestContext, id: string) {
    const existing = await this.prisma.coupon.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!existing) throw AppException.notFound('کد تخفیف');

    // A redeemed coupon is part of order history; deactivate rather than delete
    // so past orders keep a valid reference.
    if (existing._count.redemptions > 0) {
      await this.prisma.coupon.update({
        where: { id, tenantId: ctx.tenantId },
        data: { isActive: false },
      });
      this.audit.record({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'Coupon',
        entityId: id,
        metadata: { deactivatedInsteadOfDeleted: true, code: existing.code },
      });
      return { deleted: false, deactivated: true };
    }

    await this.prisma.coupon.delete({ where: { id, tenantId: ctx.tenantId } });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.DELETE,
      entity: 'Coupon',
      entityId: id,
      metadata: { code: existing.code },
    });
    return { deleted: true, deactivated: false };
  }

  private toDto(
    row: {
      id: string;
      code: string;
      type: CouponType;
      value: number;
      description: string | null;
      minOrderTotal: number;
      maxDiscount: number | null;
      startsAt: Date | null;
      endsAt: Date | null;
      usageLimit: number | null;
      usageCount: number;
      perCustomerLimit: number | null;
      isActive: boolean;
      createdAt: Date;
      _count?: { redemptions: number };
    },
    totalDiscountGiven: number,
  ): CouponDto {
    const now = new Date();
    const exhausted = row.usageLimit != null && row.usageCount >= row.usageLimit;
    const inWindow =
      (!row.startsAt || row.startsAt <= now) && (!row.endsAt || row.endsAt >= now);

    return {
      id: row.id,
      code: row.code,
      type: row.type,
      value: row.value,
      description: row.description,
      minOrderTotal: row.minOrderTotal,
      maxDiscount: row.maxDiscount,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      usageLimit: row.usageLimit,
      usageCount: row.usageCount,
      perCustomerLimit: row.perCustomerLimit,
      isActive: row.isActive,
      isRedeemable: row.isActive && inWindow && !exhausted,
      totalDiscountGiven,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
