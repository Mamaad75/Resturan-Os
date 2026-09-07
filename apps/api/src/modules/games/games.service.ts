import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type GameSession } from '@prisma/client';
import {
  DEFAULT_GAME_RULES,
  gameLevel,
  type GameKind,
  type GameProfile,
  type GameRules,
  type GameView,
} from '@restaurant-os/types';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import {
  PRISMA,
  type PrismaService,
  type PrismaTransaction,
} from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { PlansService } from '../plans/plans.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { newGame, moveGame, publicState, type GameState } from './game.engine';

const DAY = 86400000;
// A day starts at midnight in Iran, independent of the server timezone.
function dayStart() {
  return new Date(Math.floor((Date.now() + 12600000) / DAY) * DAY - 12600000);
}
function view(row: GameSession): GameView {
  return {
    id: row.id,
    kind: row.kind as GameKind,
    revision: row.revision,
    finished: row.finished,
    score: row.score,
    awardedPoints: row.awardedPoints,
    expiresAt: row.expiresAt.toISOString(),
    ...publicState(row.state as unknown as GameState),
  };
}

@Injectable()
export class GamesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly plans: PlansService,
  ) {}

  async rules(
    tenantId: string,
    tx: PrismaTransaction | PrismaService = this.prisma,
  ): Promise<GameRules> {
    const row = await tx.gameProgram.findUnique({ where: { tenantId } });
    if (!row) return { ...DEFAULT_GAME_RULES };
    const {
      isEnabled,
      dailyLimit,
      pointsPerWin,
      couponCost,
      couponMaxDiscount,
      couponMinOrder,
    } = row;
    return {
      isEnabled,
      dailyLimit,
      pointsPerWin,
      couponCost,
      couponMaxDiscount,
      couponMinOrder,
    };
  }
  async save(ctx: RequestContext, input: GameRules) {
    if (input.isEnabled) {
      await this.plans.requireFeature(ctx.tenantId, 'couponsEnabled');
      if (!(await this.loyalty.rules(ctx.tenantId)).isEnabled)
        throw AppException.validation('ابتدا باشگاه مشتریان را فعال کنید.');
    }
    await this.prisma.gameProgram.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...input },
      update: input,
    });
    return this.rules(ctx.tenantId);
  }
  private async order(token: string) {
    const order = await runAsSystem('games: resolve bearer order token', () =>
      this.prisma.order.findUnique({
        where: { trackingToken: token },
        include: { branch: { include: { restaurant: true } }, tenant: true },
      }),
    );
    if (!order || !order.tenant.isActive) throw AppException.notFound('سفارش');
    return order;
  }
  private eligible(order: {
    status: string;
    paymentStatus: string;
    customerId: string | null;
    customerPhone: string | null;
    completedAt: Date | null;
    total: number;
  }) {
    return (
      order.status === 'COMPLETED' &&
      order.paymentStatus === 'PAID' &&
      order.total > 0 &&
      !!order.customerId &&
      !!order.customerPhone &&
      !!order.completedAt &&
      order.completedAt.getTime() > Date.now() - 7 * DAY
    );
  }
  private playerHash(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key ?? ''))
      throw AppException.unauthenticated('کلید بازیکن معتبر نیست.');
    return createHash('sha256').update(key).digest('hex');
  }
  private async progress(
    tx: PrismaTransaction | PrismaService,
    tenantId: string,
    customerId: string,
    playerKeyHash: string,
  ) {
    const [earned, spent] = await Promise.all([
      tx.gameSession.aggregate({
        where: { tenantId, customerId, playerKeyHash, finished: true },
        _sum: { score: true, awardedPoints: true },
      }),
      tx.loyaltyEntry.aggregate({
        where: {
          tenantId,
          customerId,
          type: 'GAME_REDEEM',
          gamePlayerKeyHash: playerKeyHash,
        },
        _sum: { points: true },
      }),
    ]);
    return {
      xp: earned._sum.score ?? 0,
      points: Math.max(
        0,
        (earned._sum.awardedPoints ?? 0) + (spent._sum.points ?? 0),
      ),
    };
  }
  async profile(token: string, playerKey: string): Promise<GameProfile> {
    const playerKeyHash = this.playerHash(playerKey);
    const order = await this.order(token);
    const { tenantId, customerId } = order;
    const [
      rules,
      loyaltyRules,
      customer,
      sessions,
      today,
      coupons,
      entitlement,
      progress,
    ] = await Promise.all([
      this.rules(tenantId),
      this.loyalty.rules(tenantId),
      customerId
        ? this.prisma.customer.findFirst({
            where: { id: customerId, tenantId },
          })
        : null,
      this.prisma.gameSession.findMany({
        where: { tenantId, orderId: order.id, playerKeyHash },
        orderBy: { createdAt: 'asc' },
      }),
      customerId
        ? this.prisma.gameSession.count({
            where: { tenantId, customerId, createdAt: { gte: dayStart() } },
          })
        : 0,
      customerId && order.customerPhone
        ? this.prisma.coupon.findMany({
            where: {
              tenantId,
              rewardCustomerPhone: order.customerPhone,
              rewardPlayerKeyHash: playerKeyHash,
              isActive: true,
              usageCount: 0,
              endsAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        : [],
      this.plans.entitlements(tenantId),
      customerId && order.customerPhone
        ? this.progress(this.prisma, tenantId, customerId, playerKeyHash)
        : { xp: 0, points: 0 },
    ]);
    const enabled =
      rules.isEnabled &&
      loyaltyRules.isEnabled &&
      entitlement.writable &&
      entitlement.features.couponsEnabled;
    const eligible = enabled && this.eligible(order);
    return {
      restaurantName: order.branch.restaurant.name,
      slug: order.branch.restaurant.slug,
      enabled,
      eligible,
      reason: !enabled
        ? 'پاداش بازی در این رستوران فعال نیست؛ می‌توانید تمرینی بازی کنید.'
        : !eligible
          ? 'پاداش تا ۷ روز پس از تکمیل و پرداخت سفارشِ دارای شماره همراه فعال است.'
          : null,
      xp: progress.xp,
      level: gameLevel(progress.xp),
      points: Math.min(customer?.loyaltyPoints ?? 0, progress.points),
      remainingToday: Math.max(0, rules.dailyLimit - today),
      rules,
      sessions: sessions.map(view),
      coupons: coupons.map((c) => ({
        code: c.code,
        value: c.value,
        maxDiscount: c.maxDiscount,
        minOrderTotal: c.minOrderTotal,
        endsAt: c.endsAt?.toISOString() ?? null,
      })),
    };
  }
  /** Serializes all sessions and reward claims for this customer. Never trusts an ID supplied by a guest. */
  private async withPlayer<T>(
    token: string,
    work: (
      tx: PrismaTransaction,
      order: Awaited<ReturnType<GamesService['order']>> & {
        customerId: string;
      },
      rules: GameRules,
    ) => Promise<T>,
  ) {
    const resolved = await this.order(token);
    const entitlement = await this.plans.entitlements(resolved.tenantId);
    if (!entitlement.writable || !entitlement.features.couponsEnabled)
      throw AppException.forbidden(
        'اشتراک این رستوران امکان پاداش بازی ندارد.',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${resolved.id}::uuid AND "tenantId" = ${resolved.tenantId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirstOrThrow({
        where: { id: resolved.id, tenantId: resolved.tenantId },
        include: { branch: { include: { restaurant: true } }, tenant: true },
      });
      if (!this.eligible(order) || !order.customerId || !order.tenant.isActive)
        throw AppException.forbidden(
          'این سفارش شرایط دریافت پاداش بازی را ندارد.',
        );
      await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${order.customerId}::uuid AND "tenantId" = ${order.tenantId}::uuid FOR UPDATE`;
      const rules = await this.rules(order.tenantId, tx);
      if (
        !rules.isEnabled ||
        !(await this.loyalty.rules(order.tenantId, tx)).isEnabled
      )
        throw AppException.forbidden('پاداش بازی غیرفعال است.');
      return work(tx, { ...order, customerId: order.customerId }, rules);
    });
  }
  async start(token: string, kind: GameKind, playerKey: string) {
    const playerKeyHash = this.playerHash(playerKey);
    return this.withPlayer(token, async (tx, order, rules) => {
      const { tenantId, customerId } = order;
      const existing = await tx.gameSession.findFirst({
        where: { tenantId, orderId: order.id, kind },
      });
      if (existing) {
        if (existing.playerKeyHash !== playerKeyHash)
          throw AppException.forbidden('این نوبت متعلق به بازیکن دیگری است.');
        return view(existing);
      }
      const used = await tx.gameSession.count({
        where: { tenantId, customerId, createdAt: { gte: dayStart() } },
      });
      if (used >= rules.dailyLimit)
        throw AppException.validation(
          'سهمیه بازی پاداش‌دار امروز تمام شده است.',
        );
      return view(
        await tx.gameSession.create({
          data: {
            tenantId,
            customerId,
            orderId: order.id,
            kind,
            playerKeyHash,
            state: newGame(kind) as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 10 * 60000),
          },
        }),
      );
    });
  }
  async move(
    token: string,
    id: string,
    dto: { revision: number; value: number },
    playerKey: string,
  ) {
    const playerKeyHash = this.playerHash(playerKey);
    return this.withPlayer(token, async (tx, order, rules) => {
      const row = await tx.gameSession.findFirst({
        where: {
          id,
          tenantId: order.tenantId,
          orderId: order.id,
          customerId: order.customerId,
          playerKeyHash,
        },
      });
      if (!row) throw AppException.notFound('بازی');
      // Duplicate network retries are harmless; stale clients receive the authoritative state.
      if (row.finished || dto.revision < row.revision) return view(row);
      if (dto.revision !== row.revision)
        throw AppException.conflict(
          'وضعیت بازی تغییر کرده است؛ دوباره بارگذاری کنید.',
        );
      if (row.expiresAt.getTime() <= Date.now())
        throw AppException.validation('زمان این نوبت بازی تمام شده است.');
      let state: GameState;
      try {
        state = moveGame(row.state as unknown as GameState, dto.value);
      } catch (e) {
        if (e instanceof RangeError) throw AppException.validation(e.message);
        throw e;
      }
      const points = state.finished
        ? Math.floor((rules.pointsPerWin * state.score) / 60)
        : 0;
      if (state.finished && state.score > 0) {
        await tx.customer.update({
          where: { tenantId: order.tenantId, id: order.customerId },
          data: { gameXp: { increment: state.score } },
        });
        await this.loyalty.gameMovement(tx, {
          tenantId: order.tenantId,
          customerId: order.customerId,
          points,
          note: `بازی ${row.kind} • ${row.id}`,
        });
      }
      return view(
        await tx.gameSession.update({
          where: { id, tenantId: order.tenantId },
          data: {
            state: state as unknown as Prisma.InputJsonValue,
            revision: { increment: 1 },
            finished: state.finished,
            score: state.score,
            awardedPoints: points,
          },
        }),
      );
    });
  }
  async reward(token: string, requestId: string, playerKey: string) {
    const playerKeyHash = this.playerHash(playerKey);
    return this.withPlayer(token, async (tx, order, rules) => {
      const existing = await tx.coupon.findFirst({
        where: {
          tenantId: order.tenantId,
          rewardRequestId: requestId,
          rewardPlayerKeyHash: playerKeyHash,
          rewardCustomerPhone: order.customerPhone,
        },
      });
      if (existing) return { code: existing.code };
      const customer = await tx.customer.findFirstOrThrow({
        where: { id: order.customerId, tenantId: order.tenantId },
      });
      const progress = await this.progress(
        tx,
        order.tenantId,
        order.customerId,
        playerKeyHash,
      );
      const level = gameLevel(progress.xp);
      if (level < 2)
        throw AppException.validation('برای دریافت کد تخفیف به سطح ۲ برسید.');
      if (Math.min(customer.loyaltyPoints, progress.points) < rules.couponCost)
        throw AppException.validation('امتیاز کافی برای دریافت کد ندارید.');
      const coupon = await tx.coupon.create({
        data: {
          tenantId: order.tenantId,
          code: `PLAY${randomBytes(8).toString('hex').toUpperCase()}`,
          type: 'PERCENTAGE',
          value: Math.min(1000, 500 + (level - 2) * 100),
          maxDiscount: rules.couponMaxDiscount,
          minOrderTotal: rules.couponMinOrder,
          usageLimit: 1,
          perCustomerLimit: 1,
          endsAt: new Date(Date.now() + 7 * DAY),
          rewardCustomerPhone: order.customerPhone,
          rewardRequestId: requestId,
          rewardPlayerKeyHash: playerKeyHash,
          rewardPointsCost: rules.couponCost,
          description: `پاداش بازی سطح ${level}`,
        },
      });
      await this.loyalty.gameMovement(tx, {
        tenantId: order.tenantId,
        customerId: order.customerId,
        points: -rules.couponCost,
        note: `کد پاداش ${coupon.code}`,
        gamePlayerKeyHash: playerKeyHash,
      });
      return { code: coupon.code };
    });
  }
}
