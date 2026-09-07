import { Inject, Injectable } from '@nestjs/common';
import { LoyaltyEntryType } from '@prisma/client';
import type {
  AdjustPointsInput,
  LoyaltyProgramInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import {
  PRISMA,
  type PrismaService,
  type PrismaTransaction,
} from '../../prisma/prisma.service';
import {
  DEFAULT_LOYALTY_RULES,
  pointsEarned,
  quoteRedemption,
  tierFor,
  type LoyaltyRules,
} from './loyalty.math';

/**
 * The extended client's transaction type, which is what the tenant-isolation
 * guard wraps. Using Prisma's own TransactionClient here would type-check but
 * accept a client with the guard stripped off.
 */
type Tx = PrismaTransaction;

/**
 * The points scheme.
 *
 * Every balance change goes through `record`, which writes a ledger line and
 * moves the cached balance in the same statement. Nothing else is allowed to
 * touch `customer.loyaltyPoints`: a balance that cannot be explained line by
 * line is a balance a restaurant cannot defend at the counter.
 */
@Injectable()
export class LoyaltyService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------ program */

  async rules(tenantId: string, tx?: Tx): Promise<LoyaltyRules> {
    const client = tx ?? this.prisma;
    const row = await client.loyaltyProgram.findUnique({ where: { tenantId } });
    if (!row) return DEFAULT_LOYALTY_RULES;
    return {
      isEnabled: row.isEnabled,
      pointsPerThousand: row.pointsPerThousand,
      tomanPerPoint: row.tomanPerPoint,
      minRedeemPoints: row.minRedeemPoints,
      maxRedeemBps: row.maxRedeemBps,
      welcomePoints: row.welcomePoints,
      expiryDays: row.expiryDays,
    };
  }

  async getProgram(ctx: RequestContext) {
    return this.rules(ctx.tenantId);
  }

  async saveProgram(ctx: RequestContext, input: LoyaltyProgramInput) {
    const data = {
      isEnabled: input.isEnabled,
      pointsPerThousand: input.pointsPerThousand,
      tomanPerPoint: input.tomanPerPoint,
      minRedeemPoints: input.minRedeemPoints,
      maxRedeemBps: input.maxRedeemBps,
      welcomePoints: input.welcomePoints,
      expiryDays: input.expiryDays ?? null,
    };
    await this.prisma.loyaltyProgram.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...data },
      update: data,
    });
    return this.rules(ctx.tenantId);
  }

  /* ------------------------------------------------------------- ledger */

  /**
   * Write one ledger line and move the balance with it.
   *
   * Takes the transaction client so a point movement lands or fails with the
   * order that caused it. A balance that survived a rolled-back order would be
   * points out of thin air.
   */
  private async record(
    tx: Tx,
    args: {
      tenantId: string;
      customerId: string;
      orderId?: string | null;
      type: LoyaltyEntryType;
      points: number;
      note?: string | null;
      createdByUserId?: string | null;
    },
  ) {
    if (args.points === 0) return null;

    const changed = await tx.customer.updateMany({
      where: { id: args.customerId, tenantId: args.tenantId, ...(args.points < 0 ? { loyaltyPoints: { gte: -args.points } } : {}) },
      data: { loyaltyPoints: { increment: args.points } },
    });
    if (changed.count !== 1) throw AppException.validation('موجودی امتیاز کافی نیست.');
    const customer = await tx.customer.findFirstOrThrow({
      where: { id: args.customerId, tenantId: args.tenantId },
      select: { loyaltyPoints: true },
    });

    return tx.loyaltyEntry.create({
      data: {
        tenantId: args.tenantId,
        customerId: args.customerId,
        orderId: args.orderId ?? null,
        type: args.type,
        points: args.points,
        balanceAfter: customer.loyaltyPoints,
        note: args.note ?? null,
        createdByUserId: args.createdByUserId ?? null,
      },
    });
  }

  /**
   * What a customer may redeem on an order, priced by the current rules.
   *
   * Called by the order pipeline before anything is written, so the discount
   * the customer is shown and the points the ledger takes come from one place.
   */
  async quote(
    tx: Tx,
    tenantId: string,
    args: { customerId: string | null; requestedPoints: number; orderTotal: number },
  ) {
    if (!args.customerId || args.requestedPoints <= 0) {
      return { points: 0, discount: 0, reason: null };
    }
    const rules = await this.rules(tenantId, tx);
    const customer = await tx.customer.findFirst({
      where: { id: args.customerId, tenantId },
      select: { loyaltyPoints: true },
    });
    if (!customer) return { points: 0, discount: 0, reason: null };

    return quoteRedemption(rules, {
      requestedPoints: args.requestedPoints,
      balance: customer.loyaltyPoints,
      orderTotal: args.orderTotal,
    });
  }

  /** Take the points an order redeemed. Called inside the order transaction. */
  async spend(
    tx: Tx,
    args: { tenantId: string; customerId: string; orderId: string; points: number },
  ) {
    if (args.points <= 0) return;
    await this.record(tx, {
      tenantId: args.tenantId,
      customerId: args.customerId,
      orderId: args.orderId,
      type: LoyaltyEntryType.REDEEM,
      points: -args.points,
      note: 'استفاده در سفارش',
    });
  }

  /** Game awards and coupon spends share the same wallet and append-only ledger. */
  async gameMovement(tx: Tx, args: { tenantId: string; customerId: string; points: number; note: string }) {
    return this.record(tx, { ...args, type: args.points > 0 ? LoyaltyEntryType.GAME_EARN : LoyaltyEntryType.GAME_REDEEM });
  }

  /** First order from this phone number, if the scheme offers a welcome bonus. */
  async grantWelcome(
    tx: Tx,
    args: { tenantId: string; customerId: string; isFirstOrder: boolean },
  ) {
    if (!args.isFirstOrder) return;
    const rules = await this.rules(args.tenantId, tx);
    if (!rules.isEnabled || rules.welcomePoints <= 0) return;
    await this.record(tx, {
      tenantId: args.tenantId,
      customerId: args.customerId,
      type: LoyaltyEntryType.EARN,
      points: rules.welcomePoints,
      note: 'هدیه خوش‌آمدگویی',
    });
  }

  /**
   * Award points for a completed order.
   *
   * Earned on completion rather than on placement: points for an order that
   * was later cancelled would have to be clawed back from a balance the
   * customer may already have spent.
   */
  async earnForOrder(
    tx: Tx,
    args: {
      tenantId: string;
      customerId: string | null;
      orderId: string;
      eligibleSpend: number;
    },
  ) {
    if (!args.customerId) return 0;

    // Idempotent: completing an order twice must not pay twice.
    const already = await tx.loyaltyEntry.findFirst({
      where: {
        tenantId: args.tenantId,
        orderId: args.orderId,
        type: LoyaltyEntryType.EARN,
      },
      select: { id: true },
    });
    if (already) return 0;

    const rules = await this.rules(args.tenantId, tx);
    const points = pointsEarned(rules, args.eligibleSpend);
    if (points <= 0) return 0;

    await this.record(tx, {
      tenantId: args.tenantId,
      customerId: args.customerId,
      orderId: args.orderId,
      type: LoyaltyEntryType.EARN,
      points,
      note: 'خرید',
    });
    return points;
  }

  /**
   * Undo an order's point movements when it is cancelled.
   *
   * Both directions: points it earned are taken back, and points it spent are
   * returned. A customer who cancels should be exactly where they started.
   */
  async reverseForOrder(
    tx: Tx,
    args: { tenantId: string; customerId: string | null; orderId: string },
  ) {
    if (!args.customerId) return;

    const entries = await tx.loyaltyEntry.findMany({
      where: {
        tenantId: args.tenantId,
        orderId: args.orderId,
        type: { in: [LoyaltyEntryType.EARN, LoyaltyEntryType.REDEEM] },
      },
      select: { points: true },
    });
    const net = entries.reduce((sum, entry) => sum + entry.points, 0);
    if (net === 0) return;

    await this.record(tx, {
      tenantId: args.tenantId,
      customerId: args.customerId,
      orderId: args.orderId,
      type: LoyaltyEntryType.REVERSAL,
      points: -net,
      note: 'برگشت به دلیل لغو سفارش',
    });
  }

  /* -------------------------------------------------------------- admin */

  /** A customer's balance, tier and recent history. */
  async customerSummary(ctx: RequestContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: ctx.tenantId },
      select: { id: true, loyaltyPoints: true, totalSpent: true },
    });
    if (!customer) throw AppException.notFound('مشتری');

    const [rules, entries] = await Promise.all([
      this.rules(ctx.tenantId),
      this.prisma.loyaltyEntry.findMany({
        where: { tenantId: ctx.tenantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          type: true,
          points: true,
          balanceAfter: true,
          note: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      points: customer.loyaltyPoints,
      pointsValue: customer.loyaltyPoints * rules.tomanPerPoint,
      tier: tierFor(customer.totalSpent),
      entries: entries.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** Manual correction, always with a reason attached. */
  async adjust(ctx: RequestContext, customerId: string, input: AdjustPointsInput) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: ctx.tenantId },
      select: { id: true, loyaltyPoints: true },
    });
    if (!customer) throw AppException.notFound('مشتری');

    if (customer.loyaltyPoints + input.points < 0) {
      throw AppException.validation('موجودی امتیاز نمی‌تواند منفی شود.', {
        points: [`حداکثر ${customer.loyaltyPoints} امتیاز قابل کسر است.`],
      });
    }

    await this.prisma.$transaction((tx) =>
      this.record(tx, {
        tenantId: ctx.tenantId,
        customerId,
        type: LoyaltyEntryType.ADJUST,
        points: input.points,
        note: input.note,
        createdByUserId: ctx.userId,
      }),
    );
    return this.customerSummary(ctx, customerId);
  }
}
