import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ApiErrorCode } from '@restaurant-os/types';
import type { ReferralProgramInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import { customerFromTrackingToken } from '../../common/utils/guest-identity';
import type { RequestContext } from '../../common/types/request-context';
import {
  PRISMA,
  type PrismaService,
  type PrismaTransaction,
} from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import {
  codeFromBytes,
  isWellFormedCode,
  normaliseCode,
  rewardDiscount,
  rewardsEarned,
  type PricedLine,
  type RewardType,
} from './referral.math';

/** The invitation as the guest sees it. */
export interface ReferralPanelDto {
  isActive: boolean;
  code: string | null;
  /** Friends who have ordered with this code. */
  invitedCount: number;
  invitesRequired: number;
  /** What the inviter gets, in words the guest can read. */
  rewardLabelFa: string;
  /** What the friend gets, or null when the invitation is one-sided. */
  friendRewardLabelFa: string | null;
  termsFa: string | null;
  rewards: Array<{
    id: string;
    labelFa: string;
    expiresAt: string;
    /** Set for a free-product reward, so the menu can point at the item. */
    productId: string | null;
  }>;
}

/**
 * "Invite a friend."
 *
 * The owner decides what it is worth - a percentage, an amount, or a named
 * drink on the house - and the server decides what that is worth on a given
 * order. A reward is a row that can be spent exactly once, with its terms
 * copied onto it at the moment it is earned: an owner who makes the programme
 * less generous next week has not taken anything back from a customer who
 * already earned it, and cannot.
 *
 * A code identifies a customer, so like the usual order it is reached with a
 * tracking token the guest already holds rather than a phone number.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------- admin */

  async program(ctx: RequestContext) {
    const row = await this.prisma.referralProgram.findFirst({
      where: { tenantId: ctx.tenantId },
      include: {
        rewardProduct: { select: { id: true, nameFa: true } },
        friendRewardProduct: { select: { id: true, nameFa: true } },
      },
    });

    // Never created is the same shape as created-and-off, so the screen has
    // one state to render rather than two.
    if (!row) {
      return {
        isActive: false,
        rewardType: 'PERCENTAGE' as RewardType,
        rewardValue: 1_000,
        rewardProductId: null,
        rewardProductNameFa: null,
        invitesRequired: 1,
        friendRewardType: null,
        friendRewardValue: 0,
        friendRewardProductId: null,
        friendRewardProductNameFa: null,
        rewardValidDays: 30,
        termsFa: null,
        invitedTotal: 0,
        rewardsGranted: 0,
      };
    }

    const [invitedTotal, rewardsGranted] = await Promise.all([
      this.prisma.referral.count({ where: { tenantId: ctx.tenantId } }),
      this.prisma.referralReward.count({ where: { tenantId: ctx.tenantId } }),
    ]);

    return {
      isActive: row.isActive,
      rewardType: row.rewardType as RewardType,
      rewardValue: row.rewardValue,
      rewardProductId: row.rewardProductId,
      rewardProductNameFa: row.rewardProduct?.nameFa ?? null,
      invitesRequired: row.invitesRequired,
      friendRewardType: (row.friendRewardType as RewardType | null) ?? null,
      friendRewardValue: row.friendRewardValue,
      friendRewardProductId: row.friendRewardProductId,
      friendRewardProductNameFa: row.friendRewardProduct?.nameFa ?? null,
      rewardValidDays: row.rewardValidDays,
      termsFa: row.termsFa,
      invitedTotal,
      rewardsGranted,
    };
  }

  async saveProgram(ctx: RequestContext, input: ReferralProgramInput) {
    // A free drink has to name a drink, and it has to be one of ours.
    await this.assertRewardProduct(ctx.tenantId, input.rewardType, input.rewardProductId);
    if (input.friendRewardType) {
      await this.assertRewardProduct(
        ctx.tenantId,
        input.friendRewardType,
        input.friendRewardProductId,
      );
    }

    const data = {
      isActive: input.isActive,
      rewardType: input.rewardType,
      rewardValue: input.rewardValue ?? 0,
      rewardProductId: input.rewardProductId ?? null,
      invitesRequired: input.invitesRequired,
      friendRewardType: input.friendRewardType ?? null,
      friendRewardValue: input.friendRewardValue ?? 0,
      friendRewardProductId: input.friendRewardProductId ?? null,
      rewardValidDays: input.rewardValidDays,
      termsFa: input.termsFa ?? null,
    };

    await this.prisma.referralProgram.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...data },
      update: data,
    });
    return this.program(ctx);
  }

  private async assertRewardProduct(
    tenantId: string,
    type: RewardType,
    productId: string | null | undefined,
  ): Promise<void> {
    if (type !== 'FREE_PRODUCT') return;
    if (!productId) {
      throw AppException.validation('برای پاداش «محصول رایگان» یک آیتم انتخاب کنید.', {
        rewardProductId: ['انتخاب آیتم الزامی است.'],
      });
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true },
    });
    if (!product) throw AppException.notFound('محصول');
  }

  /* ---------------------------------------------------------------- guest */

  /** Who a guest is, from a tracking token of one of their own orders. */
  customerFor(tenantId: string, trackingToken: string): Promise<string | null> {
    return customerFromTrackingToken(this.prisma, tenantId, trackingToken);
  }

  /**
   * The invitation panel for one returning guest.
   *
   * Issues their code on first ask rather than at signup: most customers never
   * open this screen, and a table of codes nobody shared is just a table.
   */
  async panel(tenantId: string, customerId: string): Promise<ReferralPanelDto> {
    const program = await runAsSystem('referral panel: program', () =>
      this.prisma.referralProgram.findFirst({
        where: { tenantId },
        include: {
          rewardProduct: { select: { nameFa: true } },
          friendRewardProduct: { select: { nameFa: true } },
        },
      }),
    );

    if (!program?.isActive) {
      return {
        isActive: false,
        code: null,
        invitedCount: 0,
        invitesRequired: 0,
        rewardLabelFa: '',
        friendRewardLabelFa: null,
        termsFa: null,
        rewards: [],
      };
    }

    const code = await this.ensureCode(tenantId, customerId);

    const [invitedCount, rewards] = await Promise.all([
      runAsSystem('referral panel: invited count', () =>
        this.prisma.referral.count({
          where: { tenantId, referrerCustomerId: customerId },
        }),
      ),
      runAsSystem('referral panel: rewards', () =>
        this.prisma.referralReward.findMany({
          where: {
            tenantId,
            customerId,
            status: 'AVAILABLE',
            expiresAt: { gt: new Date() },
          },
          include: { product: { select: { nameFa: true } } },
          orderBy: { expiresAt: 'asc' },
        }),
      ),
    ]);

    return {
      isActive: true,
      code,
      invitedCount,
      invitesRequired: program.invitesRequired,
      rewardLabelFa: rewardLabel(
        program.rewardType as RewardType,
        program.rewardValue,
        program.rewardProduct?.nameFa ?? null,
      ),
      friendRewardLabelFa: program.friendRewardType
        ? rewardLabel(
            program.friendRewardType as RewardType,
            program.friendRewardValue,
            program.friendRewardProduct?.nameFa ?? null,
          )
        : null,
      termsFa: program.termsFa,
      rewards: rewards.map((reward) => ({
        id: reward.id,
        labelFa: rewardLabel(
          reward.type as RewardType,
          reward.value,
          reward.product?.nameFa ?? null,
        ),
        expiresAt: reward.expiresAt.toISOString(),
        productId: reward.productId,
      })),
    };
  }

  /**
   * A customer's code, created the first time it is needed.
   *
   * Collisions are handled by retrying rather than by trusting six random
   * characters to be unique forever: the unique index is the authority, and a
   * few thousand codes in one restaurant make a clash a matter of when.
   */
  private async ensureCode(tenantId: string, customerId: string): Promise<string> {
    const existing = await runAsSystem('referral code: existing', () =>
      this.prisma.referralCode.findFirst({
        where: { tenantId, customerId },
        select: { code: true },
      }),
    );
    if (existing) return existing.code;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = codeFromBytes(randomBytes(6));
      try {
        const created = await runAsSystem('referral code: issue', () =>
          this.prisma.referralCode.create({
            data: { tenantId, customerId, code },
            select: { code: true },
          }),
        );
        return created.code;
      } catch {
        // Either the code was taken or this customer raced themselves to a
        // code; both are answered by looking again.
        const found = await runAsSystem('referral code: after clash', () =>
          this.prisma.referralCode.findFirst({
            where: { tenantId, customerId },
            select: { code: true },
          }),
        );
        if (found) return found.code;
      }
    }
    throw new AppException(
      ApiErrorCode.INTERNAL_ERROR,
      'ساخت کد معرفی ممکن نشد. لطفاً دوباره تلاش کنید.',
      500,
    );
  }

  /* ------------------------------------------------------- order pricing */

  /**
   * Books an invitation and works out what this order's rewards are worth.
   *
   * Runs inside the order transaction, so the reward that priced the order is
   * the reward that gets marked as spent, and a rolled-back order leaves
   * neither. Everything is re-read here: the request names a code and a reward
   * id, never an amount.
   */
  async applyToOrder(
    tx: PrismaTransaction,
    args: {
      tenantId: string;
      customerId: string | null;
      orderId: string | null;
      referralCode: string | null | undefined;
      rewardId: string | null | undefined;
      lines: PricedLine[];
      discountableSubtotal: number;
    },
  ): Promise<{ discount: number; rewardId: string | null }> {
    const { tenantId, customerId, lines, discountableSubtotal } = args;
    if (!customerId) return { discount: 0, rewardId: null };

    const program = await tx.referralProgram.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!program) return { discount: 0, rewardId: null };

    let discount = 0;
    let usedRewardId: string | null = null;

    /*
     * Spending a reward the customer already holds. Selected by id because a
     * customer may hold several, and re-read so that a reward already spent on
     * another order cannot be spent again - the status check is inside the same
     * transaction as the write that consumes it.
     */
    if (args.rewardId) {
      const reward = await tx.referralReward.findFirst({
        where: {
          id: args.rewardId,
          tenantId,
          customerId,
          status: 'AVAILABLE',
          expiresAt: { gt: new Date() },
        },
      });
      if (reward) {
        discount = rewardDiscount(
          {
            type: reward.type as RewardType,
            value: reward.value,
            productId: reward.productId,
          },
          lines,
          discountableSubtotal,
        );
        if (discount > 0) {
          const consumed = await tx.referralReward.updateMany({
            where: { id: reward.id, tenantId, status: 'AVAILABLE' },
            data: {
              status: 'USED',
              usedAt: new Date(),
              usedOnOrderId: args.orderId,
            },
          });
          // Lost the race for this reward: charge full price rather than give
          // a discount that was already given.
          if (consumed.count === 0) discount = 0;
          else usedRewardId = reward.id;
        }
      }
    }

    return { discount, rewardId: usedRewardId };
  }

  /**
   * Records the invitation after the order exists.
   *
   * Separate from pricing because it needs the order's id, and because it must
   * not be able to fail the order: a friend's welcome discount is applied
   * during pricing, and this is the bookkeeping that follows.
   */
  async recordInvitation(
    tx: PrismaTransaction,
    args: {
      tenantId: string;
      customerId: string;
      orderId: string;
      referralCode: string;
    },
  ): Promise<void> {
    const { tenantId, customerId, orderId } = args;
    const code = normaliseCode(args.referralCode);
    if (!isWellFormedCode(code)) return;

    const program = await tx.referralProgram.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!program) return;

    const owner = await tx.referralCode.findFirst({
      where: { tenantId, code },
      select: { id: true, customerId: true },
    });
    // Unknown code, or their own: neither is an error worth failing an order
    // over, and neither earns anything.
    if (!owner || owner.customerId === customerId) return;

    // Already referred: the welcome is for new customers only.
    const already = await tx.referral.findFirst({
      where: { tenantId, invitedCustomerId: customerId },
      select: { id: true },
    });
    if (already) return;

    await tx.referral.create({
      data: {
        tenantId,
        codeId: owner.id,
        referrerCustomerId: owner.customerId,
        invitedCustomerId: customerId,
        orderId,
      },
    });

    // The friend's welcome, granted rather than applied: it lands on their
    // next order, because this one is what earned it.
    if (program.friendRewardType) {
      await this.grant(tx, {
        tenantId,
        customerId,
        role: 'FRIEND',
        type: program.friendRewardType as RewardType,
        value: program.friendRewardValue,
        productId: program.friendRewardProductId,
        validDays: program.rewardValidDays,
      });
    }

    // And the inviter, once enough friends have come.
    const invitedCount = await tx.referral.count({
      where: { tenantId, referrerCustomerId: owner.customerId },
    });
    const granted = await tx.referralReward.count({
      where: { tenantId, customerId: owner.customerId, role: 'REFERRER' },
    });
    const earned = rewardsEarned(invitedCount, program.invitesRequired);
    if (earned > granted) {
      await this.grant(tx, {
        tenantId,
        customerId: owner.customerId,
        role: 'REFERRER',
        type: program.rewardType as RewardType,
        value: program.rewardValue,
        productId: program.rewardProductId,
        validDays: program.rewardValidDays,
      });
    }
  }

  /**
   * Records which order a spent reward paid for.
   *
   * Separate from spending it because the reward is consumed while the order is
   * being priced - before the order row exists - and consuming it any later
   * would leave a window in which the same reward could pay for two orders.
   */
  async linkRewardToOrder(
    tx: PrismaTransaction,
    tenantId: string,
    rewardId: string,
    orderId: string,
  ): Promise<void> {
    await tx.referralReward.updateMany({
      where: { id: rewardId, tenantId },
      data: { usedOnOrderId: orderId },
    });
  }

  /** Terms are copied onto the reward, never referenced from the programme. */
  private async grant(
    tx: PrismaTransaction,
    args: {
      tenantId: string;
      customerId: string;
      role: 'REFERRER' | 'FRIEND';
      type: RewardType;
      value: number;
      productId: string | null;
      validDays: number;
    },
  ): Promise<void> {
    await tx.referralReward.create({
      data: {
        tenantId: args.tenantId,
        customerId: args.customerId,
        role: args.role,
        type: args.type,
        value: args.value,
        productId: args.productId,
        expiresAt: new Date(Date.now() + args.validDays * 86_400_000),
      },
    });
  }
}

/** One reward in words, used on every screen that mentions one. */
export function rewardLabel(
  type: RewardType,
  value: number,
  productNameFa: string | null,
): string {
  if (type === 'FREE_PRODUCT') {
    return productNameFa ? `${productNameFa} رایگان` : 'یک آیتم رایگان';
  }
  if (type === 'PERCENTAGE') {
    return `${Math.round(value / 100)}٪ تخفیف`;
  }
  return `${value.toLocaleString('fa-IR')} تومان تخفیف`;
}
