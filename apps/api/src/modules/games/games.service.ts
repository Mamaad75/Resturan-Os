import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import {
  ApiErrorCode,
  CouponType,
  duelWinner,
  isPlausibleDuel,
} from '@restaurant-os/types';
import {
  arcadeConfigSchema,
  kitchenRushConfigSchema,
  spinConfigSchema,
  type ArcadeConfigInput,
  type FinishKitchenRushInput,
  type FinishMemoryDuelInput,
  type KitchenRushConfigInput,
  type MemoryDuelConfigInput,
  type PlayGameInput,
  type SpinConfigInput,
  type SpinSegmentInput,
  type UpdateGameConfigInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { RestaurantsService } from '../restaurants/restaurants.service';

const DEFAULT_SPIN_CONFIG: SpinConfigInput = {
  segments: [
    { label: '۱۰٪ تخفیف', weight: 3, rewardType: 'PERCENTAGE', rewardValue: 10, minOrderTotal: 0, expiryDays: 14 },
    { label: 'پوچ!', weight: 5, rewardType: 'NONE', rewardValue: 0, minOrderTotal: 0, expiryDays: 14 },
    { label: '۲۰٪ تخفیف', weight: 1, rewardType: 'PERCENTAGE', rewardValue: 20, minOrderTotal: 0, expiryDays: 14 },
    { label: 'یک نوشیدنی رایگان', weight: 1, rewardType: 'FIXED', rewardValue: 50000, minOrderTotal: 100000, expiryDays: 14 },
  ],
  cooldownHours: 24,
  scorePerPlay: 10,
};

const DEFAULT_KITCHEN_RUSH_CONFIG: KitchenRushConfigInput = {
  durationSeconds: 120,
  lives: 4,
  scorePerCorrect: 25,
  comboStep: 4,
  feverThreshold: 8,
  cooldownHours: 24,
  scorePerPlay: 25,
  itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سیب‌زمینی', 'سالاد', 'نوشیدنی', 'کیک', 'ساندویچ'],
  rewards: [
    { label: '۵٪ تخفیف', minScore: 900, rewardType: 'PERCENTAGE', rewardValue: 5, minOrderTotal: 0, expiryDays: 14 },
    { label: '۱۰٪ تخفیف', minScore: 1800, rewardType: 'PERCENTAGE', rewardValue: 10, minOrderTotal: 0, expiryDays: 14 },
    { label: '۲۰٪ تخفیف', minScore: 3200, rewardType: 'PERCENTAGE', rewardValue: 20, minOrderTotal: 0, expiryDays: 14 },
  ],
};

const DEFAULT_MEMORY_DUEL_CONFIG: MemoryDuelConfigInput = {
  pairs: 6,
  cooldownHours: 24,
  scorePerPlay: 20,
  itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سیب‌زمینی', 'سالاد', 'نوشیدنی'],
  reward: {
    label: '۱۰٪ تخفیف برندهٔ دوئل',
    rewardType: 'PERCENTAGE',
    rewardValue: 10,
    minOrderTotal: 0,
    expiryDays: 7,
  },
  rewardOnDraw: false,
};

const DEFAULT_ARCADE_CONFIG: ArcadeConfigInput = {
  spinEnabled: true,
  spin: DEFAULT_SPIN_CONFIG,
  kitchenRushEnabled: true,
  kitchenRush: DEFAULT_KITCHEN_RUSH_CONFIG,
  // Off until an owner turns it on: see the schema's note.
  memoryDuelEnabled: false,
  memoryDuel: DEFAULT_MEMORY_DUEL_CONFIG,
};

/**
 * How many pairs this board actually has.
 *
 * An owner can ask for six pairs and then delete labels until only four
 * remain; dealing six from four would put the same picture on two different
 * pairs, which makes the game unwinnable rather than hard. The board follows
 * the labels.
 */
function duelPairs(cfg: MemoryDuelConfigInput): number {
  return Math.max(3, Math.min(cfg.pairs, cfg.itemLabels.length));
}

function levelFor(score: number): number {
  return 1 + Math.floor(score / 100);
}

function pickWeighted(segments: SpinSegmentInput[]): { seg: SpinSegmentInput; index: number } {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);
  let cursor = randomInt(total) + 1;
  for (let i = 0; i < segments.length; i += 1) {
    cursor -= segments[i].weight;
    if (cursor <= 0) return { seg: segments[i], index: i };
  }
  return { seg: segments[segments.length - 1], index: segments.length - 1 };
}

function availability(lastPlayedAt: Date | null, cooldownHours: number) {
  const nextPlayAt =
    lastPlayedAt && cooldownHours > 0
      ? new Date(lastPlayedAt.getTime() + cooldownHours * 3_600_000)
      : null;
  const canPlay = !nextPlayAt || nextPlayAt.getTime() <= Date.now();
  return {
    canPlay,
    nextPlayAt: nextPlayAt && !canPlay ? nextPlayAt.toISOString() : null,
  };
}

@Injectable()
export class GamesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  /* --------------------------------------------------------------- admin */

  async getConfig(ctx: RequestContext) {
    const game = await this.prisma.game.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!game) {
      return { isEnabled: false, model: 'ARCADE' as const, config: DEFAULT_ARCADE_CONFIG };
    }
    return {
      isEnabled: game.isEnabled,
      model: 'ARCADE' as const,
      config: this.arcadeFromStored(game.model, game.config, game.isEnabled),
    };
  }

  async updateConfig(ctx: RequestContext, input: UpdateGameConfigInput) {
    const arcade = this.arcadeFromInput(input);
    const game = await this.prisma.game.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        isEnabled: input.isEnabled,
        model: 'ARCADE',
        config: arcade as object,
      },
      update: {
        isEnabled: input.isEnabled,
        model: 'ARCADE',
        config: arcade as object,
      },
    });
    return {
      isEnabled: game.isEnabled,
      model: 'ARCADE' as const,
      config: arcade,
    };
  }

  async recentPlays(ctx: RequestContext) {
    const rows = await this.prisma.gamePlay.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { player: { select: { phone: true, name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      phone: row.player.phone,
      name: row.player.name,
      model: row.model,
      label: row.label?.includes('::') ? row.label.split('::')[1] : row.label,
      couponCode: row.couponCode,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /* -------------------------------------------------------------- public */

  async getPublicState(slug: string, phone?: string) {
    const { tenantId } = await this.restaurants.findPublicBySlug(slug);
    return this.resolveState(tenantId, phone);
  }

  async getStateByToken(token: string) {
    const order = await this.resolveOrderByToken(token);
    return this.resolveState(order.tenantId, order.phone ?? undefined);
  }

  private async resolveState(tenantId: string, phone?: string) {
    return runAsSystem('game: public state', async () => {
      const game = await this.prisma.game.findUnique({ where: { tenantId } });
      if (!game || !game.isEnabled) return { enabled: false as const };

      const arcade = this.arcadeFromStored(game.model, game.config, game.isEnabled);
      if (
        !arcade.spinEnabled &&
        !arcade.kitchenRushEnabled &&
        !arcade.memoryDuelEnabled
      ) {
        return { enabled: false as const };
      }

      const player = phone
        ? await this.prisma.gamePlayer.findUnique({
            where: { tenantId_phone: { tenantId, phone } },
            select: { id: true, score: true, level: true, playsCount: true },
          })
        : null;

      const [lastSpin, lastRush, lastDuel] = player
        ? await Promise.all([
            this.lastPlayAt(player.id, 'SPIN'),
            this.lastPlayAt(player.id, 'KITCHEN_RUSH'),
            this.lastPlayAt(player.id, 'MEMORY_DUEL'),
          ])
        : [null, null, null];

      const spinAvailability = availability(lastSpin, arcade.spin.cooldownHours);
      const rushAvailability = availability(lastRush, arcade.kitchenRush.cooldownHours);
      const duelAvailability = availability(lastDuel, arcade.memoryDuel.cooldownHours);

      return {
        enabled: true as const,
        player: player
          ? { score: player.score, level: player.level, playsCount: player.playsCount }
          : null,
        spin: {
          enabled: arcade.spinEnabled,
          cooldownHours: arcade.spin.cooldownHours,
          ...spinAvailability,
          segments: arcade.spin.segments.map((segment) => ({ label: segment.label })),
        },
        kitchenRush: {
          enabled: arcade.kitchenRushEnabled,
          cooldownHours: arcade.kitchenRush.cooldownHours,
          ...rushAvailability,
          durationSeconds: arcade.kitchenRush.durationSeconds,
          lives: arcade.kitchenRush.lives,
          scorePerCorrect: arcade.kitchenRush.scorePerCorrect,
          comboStep: arcade.kitchenRush.comboStep,
          feverThreshold: arcade.kitchenRush.feverThreshold,
          itemLabels: arcade.kitchenRush.itemLabels,
          rewards: arcade.kitchenRush.rewards.map((reward) => ({
            label: reward.label,
            minScore: reward.minScore,
          })),
        },
        memoryDuel: {
          enabled: arcade.memoryDuelEnabled,
          cooldownHours: arcade.memoryDuel.cooldownHours,
          ...duelAvailability,
          pairs: duelPairs(arcade.memoryDuel),
          rewardLabel: arcade.memoryDuel.reward?.label ?? null,
          rewardOnDraw: arcade.memoryDuel.rewardOnDraw,
        },
      };
    });
  }

  async play(slug: string, input: PlayGameInput) {
    const { tenantId } = await this.restaurants.findPublicBySlug(slug);
    return this.playSpinForTenant(tenantId, input.phone, input.name ?? null);
  }

  async playByToken(token: string, fallbackPhone?: string, name?: string | null) {
    const order = await this.resolveOrderByToken(token);
    const phone = order.phone ?? fallbackPhone;
    if (!phone) throw AppException.validation('برای بازی، شمارهٔ موبایل لازم است.');
    return this.playSpinForTenant(order.tenantId, phone, name ?? order.name ?? null);
  }

  private async resolveOrderByToken(token: string) {
    const order = await runAsSystem('game: resolve order token', () =>
      this.prisma.order.findUnique({
        where: { trackingToken: token },
        select: { tenantId: true, customerPhone: true, customerName: true },
      }),
    );
    if (!order) throw AppException.notFound('سفارش');
    return { tenantId: order.tenantId, phone: order.customerPhone, name: order.customerName };
  }

  private async playSpinForTenant(tenantId: string, phone: string, name: string | null) {
    return runAsSystem('game: wheel spin', async () => {
      const game = await this.prisma.game.findUnique({ where: { tenantId } });
      if (!game || !game.isEnabled) throw AppException.notFound('گردونه شانس');
      const arcade = this.arcadeFromStored(game.model, game.config, game.isEnabled);
      if (!arcade.spinEnabled) throw AppException.notFound('گردونه شانس');

      const player = await this.prisma.gamePlayer.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        create: { tenantId, phone, name },
        update: name ? { name } : {},
      });

      const lastPlayedAt = await this.lastPlayAt(player.id, 'SPIN');
      this.assertCooldown(lastPlayedAt, arcade.spin.cooldownHours, 'گردونه');
      return this.playSpin(tenantId, arcade.spin, player);
    });
  }

  /* ------------------------------------------------------- kitchen rush */

  async startKitchenRushByToken(token: string) {
    const order = await this.resolveOrderByToken(token);
    if (!order.phone) throw AppException.validation('برای بازی، شمارهٔ موبایل لازم است.');
    return this.startKitchenRushForTenant(order.tenantId, order.phone, order.name ?? null);
  }

  async finishKitchenRushByToken(token: string, input: FinishKitchenRushInput) {
    const order = await this.resolveOrderByToken(token);
    if (!order.phone) throw AppException.validation('برای بازی، شمارهٔ موبایل لازم است.');
    return this.finishKitchenRushForTenant(order.tenantId, order.phone, input);
  }

  async startKitchenRush(slug: string, input: PlayGameInput) {
    const { tenantId } = await this.restaurants.findPublicBySlug(slug);
    return this.startKitchenRushForTenant(tenantId, input.phone, input.name ?? null);
  }

  async finishKitchenRush(slug: string, phone: string, input: FinishKitchenRushInput) {
    const { tenantId } = await this.restaurants.findPublicBySlug(slug);
    if (!phone) throw AppException.validation('برای بازی، شمارهٔ موبایل لازم است.');
    return this.finishKitchenRushForTenant(tenantId, phone, input);
  }

  private async startKitchenRushForTenant(tenantId: string, phone: string, name: string | null) {
    return runAsSystem('game: kitchen rush start', async () => {
      const game = await this.prisma.game.findUnique({ where: { tenantId } });
      if (!game || !game.isEnabled) throw AppException.notFound('Kitchen Rush');
      const arcade = this.arcadeFromStored(game.model, game.config, game.isEnabled);
      if (!arcade.kitchenRushEnabled) throw AppException.notFound('Kitchen Rush');
      const cfg = arcade.kitchenRush;

      const player = await this.prisma.gamePlayer.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        create: { tenantId, phone, name },
        update: name ? { name } : {},
      });

      const lastPlayedAt = await this.lastPlayAt(player.id, 'KITCHEN_RUSH');
      this.assertCooldown(lastPlayedAt, cfg.cooldownHours, 'Kitchen Rush');

      const now = new Date();
      await this.prisma.gameSession.updateMany({
        where: {
          playerId: player.id,
          model: 'KITCHEN_RUSH',
          finishedAt: null,
          expiresAt: { lt: now },
        },
        data: { finishedAt: now, metadata: { abandoned: true } },
      });

      const live = await this.prisma.gameSession.findFirst({
        where: {
          playerId: player.id,
          model: 'KITCHEN_RUSH',
          finishedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { startedAt: 'desc' },
      });
      if (live) return this.sessionDto(live, cfg, true);

      const token = randomBytes(24).toString('hex');
      const seed = randomBytes(4).readUInt32BE(0) & 0x7fffffff;
      const expiresAt = new Date(now.getTime() + (cfg.durationSeconds + 45) * 1000);
      const session = await this.prisma.gameSession.create({
        data: {
          tenantId,
          playerId: player.id,
          model: 'KITCHEN_RUSH',
          token,
          seed,
          startedAt: now,
          expiresAt,
        },
      });
      return this.sessionDto(session, cfg, false);
    });
  }

  private async finishKitchenRushForTenant(
    tenantId: string,
    phone: string,
    input: FinishKitchenRushInput,
  ) {
    return runAsSystem('game: kitchen rush finish', async () => {
      const game = await this.prisma.game.findUnique({ where: { tenantId } });
      if (!game || !game.isEnabled) throw AppException.notFound('Kitchen Rush');
      const arcade = this.arcadeFromStored(game.model, game.config, game.isEnabled);
      if (!arcade.kitchenRushEnabled) throw AppException.notFound('Kitchen Rush');
      const cfg = arcade.kitchenRush;

      const session = await this.prisma.gameSession.findUnique({
        where: { token: input.sessionToken },
        include: { player: true },
      });
      if (
        !session ||
        session.tenantId !== tenantId ||
        session.player.phone !== phone ||
        session.model !== 'KITCHEN_RUSH'
      ) {
        throw AppException.validation('نشست بازی معتبر نیست.');
      }
      if (session.finishedAt) throw AppException.validation('این نشست قبلاً ثبت شده است.');

      const now = new Date();
      if (session.expiresAt.getTime() < now.getTime()) {
        throw AppException.validation('زمان این بازی تمام شده است.');
      }

      const elapsed = Math.max(0, now.getTime() - session.startedAt.getTime());
      const claimedDuration = Math.max(0, input.durationMs);
      if (claimedDuration > (cfg.durationSeconds + 10) * 1000 || claimedDuration > elapsed + 5000) {
        throw AppException.validation('زمان ثبت‌شدهٔ بازی معتبر نیست.');
      }
      if (claimedDuration < cfg.durationSeconds * 650 && input.mistakes < cfg.lives) {
        throw AppException.validation('بازی زودتر از حد مجاز پایان یافته است.');
      }
      if (input.comboMax > input.correct) throw AppException.validation('Combo بازی معتبر نیست.');
      const maxCorrect = Math.ceil((cfg.durationSeconds * 1000) / 220) + 8;
      if (input.correct > maxCorrect) throw AppException.validation('تعداد پاسخ‌های بازی معتبر نیست.');
      // Combo can reach x3 and Fever doubles it, so a legitimate correct item
      // may be worth up to x6 of scorePerCorrect.
      const maxScore = input.correct * cfg.scorePerCorrect * 6;
      if (input.score > maxScore) throw AppException.validation('امتیاز بازی معتبر نیست.');

      const reward = cfg.rewards
        .slice()
        .sort((a, b) => b.minScore - a.minScore)
        .find((entry) => input.score >= entry.minScore) ?? null;

      let couponCode: string | null = null;
      let couponId: string | null = null;
      if (reward) {
        const minted = await this.mintReward(tenantId, reward, 'RUSH');
        couponCode = minted.code;
        couponId = minted.id;
      }

      const progressDelta = Math.min(1000, cfg.scorePerPlay + Math.floor(input.score / 250));
      const newScore = session.player.score + progressDelta;
      const updated = await this.prisma.gameSession.updateMany({
        where: { id: session.id, finishedAt: null },
        data: {
          finishedAt: now,
          score: input.score,
          correct: input.correct,
          mistakes: input.mistakes,
          comboMax: input.comboMax,
          metadata: { durationMs: input.durationMs },
        },
      });
      if (updated.count !== 1) throw AppException.validation('این نشست قبلاً ثبت شده است.');

      await this.prisma.gamePlayer.update({
        where: { id: session.playerId },
        data: {
          score: newScore,
          level: levelFor(newScore),
          playsCount: { increment: 1 },
          lastPlayAt: now,
        },
      });
      await this.prisma.gamePlay.create({
        data: {
          tenantId,
          playerId: session.playerId,
          model: 'KITCHEN_RUSH',
          scoreDelta: progressDelta,
          rewardType: reward?.rewardType ?? null,
          rewardValue: reward?.rewardValue ?? null,
          couponId,
          couponCode,
          label: reward ? `Kitchen Rush: ${reward.label}` : `Kitchen Rush: ${input.score} امتیاز`,
        },
      });

      return {
        model: 'KITCHEN_RUSH' as const,
        runScore: input.score,
        score: newScore,
        level: levelFor(newScore),
        correct: input.correct,
        mistakes: input.mistakes,
        comboMax: input.comboMax,
        reward: reward
          ? {
              label: reward.label,
              rewardType: reward.rewardType,
              rewardValue: reward.rewardValue,
              couponCode,
              minOrderTotal: reward.minOrderTotal,
              expiryDays: reward.expiryDays,
            }
          : null,
      };
    });
  }

  /* ------------------------------------------------------------ helpers */

  private arcadeFromInput(input: UpdateGameConfigInput): ArcadeConfigInput {
    if (input.model === 'ARCADE') return arcadeConfigSchema.parse(input.config);
    if (input.model === 'SPIN') {
      return {
        ...DEFAULT_ARCADE_CONFIG,
        spinEnabled: input.isEnabled,
        spin: spinConfigSchema.parse(input.config),
      };
    }
    if (input.model === 'KITCHEN_RUSH') {
      return {
        ...DEFAULT_ARCADE_CONFIG,
        spinEnabled: true,
        kitchenRushEnabled: input.isEnabled,
        kitchenRush: this.upgradeRush(kitchenRushConfigSchema.parse(input.config)),
      };
    }
    // Legacy THRESHOLD / LEADERBOARD rows are no longer the active UI. Keep
    // the restaurant's games available by migrating to the two-game arcade.
    return DEFAULT_ARCADE_CONFIG;
  }

  private arcadeFromStored(model: string, config: unknown, isEnabled: boolean): ArcadeConfigInput {
    if (model === 'ARCADE') {
      const parsed = arcadeConfigSchema.safeParse(config);
      return parsed.success ? parsed.data : DEFAULT_ARCADE_CONFIG;
    }
    if (model === 'SPIN') {
      const parsed = spinConfigSchema.safeParse(config);
      return {
        ...DEFAULT_ARCADE_CONFIG,
        spinEnabled: isEnabled,
        spin: parsed.success ? parsed.data : DEFAULT_SPIN_CONFIG,
        kitchenRushEnabled: true,
      };
    }
    if (model === 'KITCHEN_RUSH') {
      const parsed = kitchenRushConfigSchema.safeParse(config);
      return {
        ...DEFAULT_ARCADE_CONFIG,
        spinEnabled: true,
        kitchenRushEnabled: isEnabled,
        kitchenRush: parsed.success ? this.upgradeRush(parsed.data) : DEFAULT_KITCHEN_RUSH_CONFIG,
      };
    }
    return DEFAULT_ARCADE_CONFIG;
  }

  private upgradeRush(config: KitchenRushConfigInput): KitchenRushConfigInput {
    // The first v2 build shipped with a 90-second default. Existing restaurants
    // that still have that default get the longer 120-second game automatically;
    // explicit values above 90 are respected.
    return config.durationSeconds === 90 ? { ...config, durationSeconds: 120, lives: Math.max(4, config.lives) } : config;
  }

  /* --------------------------------------------------------- memory duel */

  async startMemoryDuelByToken(token: string) {
    const order = await this.resolveOrderByToken(token);
    if (!order.phone) throw AppException.validation('برای بازی، شمارهٔ موبایل لازم است.');
    return this.startMemoryDuelForTenant(order.tenantId, order.phone, order.name ?? null);
  }

  async finishMemoryDuelByToken(token: string, input: FinishMemoryDuelInput) {
    const order = await this.resolveOrderByToken(token);
    if (!order.phone) throw AppException.validation('برای بازی، شمارهٔ موبایل لازم است.');
    return this.finishMemoryDuelForTenant(order.tenantId, order.phone, input);
  }

  async startMemoryDuel(slug: string, input: PlayGameInput) {
    const { tenantId } = await this.restaurants.findPublicBySlug(slug);
    return this.startMemoryDuelForTenant(tenantId, input.phone, input.name ?? null);
  }

  async finishMemoryDuel(slug: string, phone: string, input: FinishMemoryDuelInput) {
    const { tenantId } = await this.restaurants.findPublicBySlug(slug);
    if (!phone) throw AppException.validation('برای بازی، شمارهٔ موبایل لازم است.');
    return this.finishMemoryDuelForTenant(tenantId, phone, input);
  }

  /**
   * Deals a board.
   *
   * The seed is the whole contract with the browser: the same seed deals the
   * same table on both sides, so a submitted result can be checked against a
   * board the server can reproduce rather than taken on trust.
   */
  private async startMemoryDuelForTenant(
    tenantId: string,
    phone: string,
    name: string | null,
  ) {
    return runAsSystem('game: memory duel start', async () => {
      const game = await this.prisma.game.findUnique({ where: { tenantId } });
      if (!game || !game.isEnabled) throw AppException.notFound('دوئل حافظه');
      const arcade = this.arcadeFromStored(game.model, game.config, game.isEnabled);
      if (!arcade.memoryDuelEnabled) throw AppException.notFound('دوئل حافظه');
      const cfg = arcade.memoryDuel;
      const pairs = duelPairs(cfg);

      const player = await this.prisma.gamePlayer.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        create: { tenantId, phone, name },
        update: name ? { name } : {},
      });

      const lastPlayedAt = await this.lastPlayAt(player.id, 'MEMORY_DUEL');
      this.assertCooldown(lastPlayedAt, cfg.cooldownHours, 'دوئل حافظه');

      const now = new Date();
      await this.prisma.gameSession.updateMany({
        where: {
          playerId: player.id,
          model: 'MEMORY_DUEL',
          finishedAt: null,
          expiresAt: { lt: now },
        },
        data: { finishedAt: now, metadata: { abandoned: true } },
      });

      // A duel already in progress is resumed rather than re-dealt: two people
      // who reloaded the page should find their board, not a new one.
      const live = await this.prisma.gameSession.findFirst({
        where: {
          playerId: player.id,
          model: 'MEMORY_DUEL',
          finishedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { startedAt: 'desc' },
      });
      if (live) return this.duelSessionDto(live, cfg, pairs, true);

      const token = randomBytes(24).toString('hex');
      const seed = randomBytes(4).readUInt32BE(0) & 0x7fffffff;
      const session = await this.prisma.gameSession.create({
        data: {
          tenantId,
          playerId: player.id,
          model: 'MEMORY_DUEL',
          token,
          seed,
          // Generous: this is a game two people play between courses, and
          // being timed out mid-duel is worse than a stale row.
          expiresAt: new Date(now.getTime() + 20 * 60_000),
        },
      });
      return this.duelSessionDto(session, cfg, pairs, false);
    });
  }

  private async finishMemoryDuelForTenant(
    tenantId: string,
    phone: string,
    input: FinishMemoryDuelInput,
  ) {
    return runAsSystem('game: memory duel finish', async () => {
      const game = await this.prisma.game.findUnique({ where: { tenantId } });
      if (!game || !game.isEnabled) throw AppException.notFound('دوئل حافظه');
      const arcade = this.arcadeFromStored(game.model, game.config, game.isEnabled);
      if (!arcade.memoryDuelEnabled) throw AppException.notFound('دوئل حافظه');
      const cfg = arcade.memoryDuel;
      const pairs = duelPairs(cfg);

      const session = await this.prisma.gameSession.findUnique({
        where: { token: input.sessionToken },
        include: { player: true },
      });
      if (
        !session ||
        session.tenantId !== tenantId ||
        session.player.phone !== phone ||
        session.model !== 'MEMORY_DUEL'
      ) {
        throw AppException.validation('نشست بازی معتبر نیست.');
      }
      if (session.finishedAt) throw AppException.validation('این نشست قبلاً ثبت شده است.');

      const now = new Date();
      if (session.expiresAt.getTime() < now.getTime()) {
        throw AppException.validation('زمان این بازی تمام شده است.');
      }

      /*
       * A hot-seat game is played entirely in the browser, so the honest claim
       * is not that this result is true but that it is possible: every pair
       * accounted for, more turns than pairs, and no faster than two people
       * can tap. The elapsed time on the session is the outer bound.
       */
      const elapsed = Math.max(0, now.getTime() - session.startedAt.getTime());
      const result = {
        pairs,
        scoreOne: input.scoreOne,
        scoreTwo: input.scoreTwo,
        turns: input.turns,
        durationMs: input.durationMs,
      };
      if (!isPlausibleDuel(result, { maxDurationMs: elapsed + 5_000 })) {
        throw AppException.validation('نتیجهٔ بازی معتبر نیست.');
      }

      const winner = duelWinner(input.scoreOne, input.scoreTwo);
      const paysOut = winner !== 0 || cfg.rewardOnDraw;

      let couponCode: string | null = null;
      let couponId: string | null = null;
      if (cfg.reward && paysOut) {
        const minted = await this.mintReward(tenantId, cfg.reward, 'DUEL');
        couponCode = minted.code;
        couponId = minted.id;
      }

      const newScore = session.player.score + cfg.scorePerPlay;
      const updated = await this.prisma.gameSession.updateMany({
        where: { id: session.id, finishedAt: null },
        data: {
          finishedAt: now,
          score: Math.max(input.scoreOne, input.scoreTwo),
          correct: pairs,
          mistakes: 0,
          comboMax: 0,
          metadata: {
            durationMs: input.durationMs,
            turns: input.turns,
            scoreOne: input.scoreOne,
            scoreTwo: input.scoreTwo,
            winner,
          },
        },
      });
      // Lost the race with another tab submitting the same duel.
      if (updated.count !== 1) throw AppException.validation('این نشست قبلاً ثبت شده است.');

      await this.prisma.gamePlayer.update({
        where: { id: session.playerId },
        data: {
          score: newScore,
          level: levelFor(newScore),
          playsCount: { increment: 1 },
          lastPlayAt: now,
        },
      });
      await this.prisma.gamePlay.create({
        data: {
          tenantId,
          playerId: session.playerId,
          model: 'MEMORY_DUEL',
          scoreDelta: cfg.scorePerPlay,
          rewardType: couponCode ? (cfg.reward?.rewardType ?? null) : null,
          rewardValue: couponCode ? (cfg.reward?.rewardValue ?? null) : null,
          couponId,
          couponCode,
          label: cfg.reward?.label ?? null,
        },
      });

      return {
        winner,
        scoreOne: input.scoreOne,
        scoreTwo: input.scoreTwo,
        couponCode,
        rewardLabel: couponCode ? (cfg.reward?.label ?? null) : null,
        playerScore: newScore,
        level: levelFor(newScore),
      };
    });
  }

  private duelSessionDto(
    session: { token: string; seed: number; expiresAt: Date },
    cfg: MemoryDuelConfigInput,
    pairs: number,
    resumes: boolean,
  ) {
    return {
      sessionToken: session.token,
      seed: session.seed,
      pairs,
      // Only the labels the board will actually use.
      itemLabels: cfg.itemLabels.slice(0, pairs),
      rewardLabel: cfg.reward?.label ?? null,
      rewardOnDraw: cfg.rewardOnDraw,
      expiresAt: session.expiresAt.toISOString(),
      resumes,
    };
  }

  private async lastPlayAt(
    playerId: string,
    model: 'SPIN' | 'KITCHEN_RUSH' | 'MEMORY_DUEL',
  ) {
    const play = await this.prisma.gamePlay.findFirst({
      where: { playerId, model },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return play?.createdAt ?? null;
  }

  private assertCooldown(lastPlayedAt: Date | null, cooldownHours: number, gameName: string) {
    const state = availability(lastPlayedAt, cooldownHours);
    if (!state.canPlay) {
      throw new AppException(
        ApiErrorCode.RATE_LIMITED,
        `هنوز نوبت بعدی ${gameName} نرسیده است.`,
        429,
      );
    }
  }

  private sessionDto(
    session: { token: string; seed: number; startedAt: Date; expiresAt: Date },
    cfg: KitchenRushConfigInput,
    resumes: boolean,
  ) {
    return {
      sessionToken: session.token,
      seed: session.seed,
      durationSeconds: cfg.durationSeconds,
      lives: cfg.lives,
      scorePerCorrect: cfg.scorePerCorrect,
      comboStep: cfg.comboStep,
      feverThreshold: cfg.feverThreshold,
      itemLabels: cfg.itemLabels,
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      resumes,
    };
  }

  private async bumpPlayer(playerId: string, delta: number, prevScore: number) {
    const newScore = prevScore + delta;
    await this.prisma.gamePlayer.update({
      where: { id: playerId },
      data: {
        score: newScore,
        level: levelFor(newScore),
        playsCount: { increment: 1 },
        lastPlayAt: new Date(),
      },
    });
    return newScore;
  }

  private async playSpin(
    tenantId: string,
    cfg: SpinConfigInput,
    player: { id: string; score: number },
  ) {
    const { seg, index } = pickWeighted(cfg.segments);

    let couponCode: string | null = null;
    let couponId: string | null = null;
    if (seg.rewardType === 'PERCENTAGE' || seg.rewardType === 'FIXED') {
      const minted = await this.mintReward(
        tenantId,
        {
          rewardType: seg.rewardType,
          rewardValue: seg.rewardValue,
          minOrderTotal: seg.minOrderTotal,
          expiryDays: seg.expiryDays,
          label: seg.label,
        },
        'SPIN',
      );
      couponId = minted.id;
      couponCode = minted.code;
    }

    const newScore = await this.bumpPlayer(player.id, cfg.scorePerPlay, player.score);
    await this.prisma.gamePlay.create({
      data: {
        tenantId,
        playerId: player.id,
        model: 'SPIN',
        scoreDelta: cfg.scorePerPlay,
        rewardType: seg.rewardType,
        rewardValue: seg.rewardType === 'NONE' ? null : seg.rewardValue,
        couponId,
        couponCode,
        label: seg.label,
      },
    });

    return {
      model: 'SPIN' as const,
      segmentIndex: index,
      label: seg.label,
      rewardType: seg.rewardType,
      rewardValue: seg.rewardType === 'NONE' ? 0 : seg.rewardValue,
      couponCode,
      minOrderTotal: seg.minOrderTotal,
      expiryDays: seg.expiryDays,
      score: newScore,
      level: levelFor(newScore),
    };
  }

  private async mintReward(
    tenantId: string,
    reward: {
      rewardType: 'PERCENTAGE' | 'FIXED';
      rewardValue: number;
      minOrderTotal: number;
      expiryDays: number;
      label: string;
    },
    prefix: string,
  ) {
    const type = reward.rewardType === 'PERCENTAGE' ? CouponType.PERCENTAGE : CouponType.FIXED;
    const value = reward.rewardType === 'PERCENTAGE' ? reward.rewardValue * 100 : reward.rewardValue;
    const now = new Date();
    const endsAt = new Date(now.getTime() + reward.expiryDays * 86_400_000);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`;
      try {
        return await this.prisma.coupon.create({
          data: {
            tenantId,
            code,
            type,
            value,
            description: `جایزهٔ بازی: ${reward.label}`,
            minOrderTotal: reward.minOrderTotal,
            startsAt: now,
            endsAt,
            usageLimit: 1,
            perCustomerLimit: 1,
            isActive: true,
          },
          select: { id: true, code: true },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') continue;
        throw error;
      }
    }
    throw new AppException(ApiErrorCode.INTERNAL_ERROR, 'ساخت کد تخفیف ناموفق بود.', 500);
  }
}
