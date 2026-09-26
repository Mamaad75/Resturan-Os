import { dealDeck } from '@restaurant-os/types';
import {
  closeTestApp,
  createTestApp,
  login,
  resetDatabase,
  seedTenant,
  type TestContext,
  type TestTenant,
} from './harness';

/**
 * The two-player game.
 *
 * Winning hands out a discount code, and the game is played entirely in the
 * browser, so what matters here is the boundary: a result that could not have
 * come from a real game is refused, a session is spent exactly once, and the
 * cooldown holds.
 */
describe('Memory Duel', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;
  const phone = '09121234567';

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'duel');
    token = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  async function enableDuel(overrides: Record<string, unknown> = {}) {
    await ctx
      .http()
      .put('/api/game')
      .set('Authorization', `Bearer ${token}`)
      .send({
        isEnabled: true,
        model: 'ARCADE',
        config: {
          spinEnabled: false,
          spin: {
            segments: [
              { label: 'پوچ', weight: 1, rewardType: 'NONE', rewardValue: 0 },
              { label: '۱۰٪', weight: 1, rewardType: 'PERCENTAGE', rewardValue: 10 },
            ],
            cooldownHours: 24,
            scorePerPlay: 10,
          },
          kitchenRushEnabled: false,
          kitchenRush: {
            durationSeconds: 120,
            lives: 4,
            scorePerCorrect: 25,
            comboStep: 4,
            feverThreshold: 8,
            cooldownHours: 24,
            scorePerPlay: 25,
            itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سالاد'],
            rewards: [
              {
                label: '۱۰٪ تخفیف',
                minScore: 900,
                rewardType: 'PERCENTAGE',
                rewardValue: 10,
                minOrderTotal: 0,
                expiryDays: 14,
              },
            ],
          },
          memoryDuelEnabled: true,
          memoryDuel: {
            pairs: 6,
            cooldownHours: 0,
            scorePerPlay: 20,
            itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سیب‌زمینی', 'سالاد', 'نوشیدنی'],
            reward: {
              label: '۱۰٪ تخفیف برنده',
              rewardType: 'PERCENTAGE',
              rewardValue: 10,
              minOrderTotal: 0,
              expiryDays: 7,
            },
            rewardOnDraw: false,
            ...overrides,
          },
        },
      })
      .expect(200);
  }

  function start() {
    return ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/game/memory-duel/start`)
      .send({ phone, name: 'مهمان' });
  }

  function finish(body: Record<string, unknown>) {
    return ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/game/memory-duel/finish`)
      .send({ phone, ...body });
  }

  describe('dealing a board', () => {
    beforeAll(() => enableDuel());

    it('returns a seed and only the labels the board uses', async () => {
      const response = await start().expect(200);
      const session = response.body.data;
      expect(session.sessionToken).toMatch(/^[a-f0-9]{48}$/);
      expect(session.pairs).toBe(6);
      expect(session.itemLabels).toHaveLength(6);
      expect(typeof session.seed).toBe('number');
    });

    it('deals a board the server can reproduce from the seed', async () => {
      const session = (await start().expect(200)).body.data;
      const deck = dealDeck(session.seed, session.pairs);
      expect(deck).toHaveLength(12);
      // Twelve cards, six items, each appearing exactly twice.
      for (let item = 0; item < 6; item += 1) {
        expect(deck.filter((card) => card.item === item)).toHaveLength(2);
      }
    });

    it('resumes a duel in progress rather than re-dealing it', async () => {
      const first = (await start().expect(200)).body.data;
      const second = (await start().expect(200)).body.data;
      expect(second.sessionToken).toBe(first.sessionToken);
      expect(second.resumes).toBe(true);
    });

    it('shows the duel in the public game state', async () => {
      const response = await ctx
        .http()
        .get(`/api/public/restaurants/${tenant.restaurantSlug}/game`)
        .query({ phone })
        .expect(200);
      expect(response.body.data.memoryDuel.enabled).toBe(true);
      expect(response.body.data.memoryDuel.pairs).toBe(6);
    });
  });

  describe('submitting a result', () => {
    beforeAll(() => enableDuel());

    it('refuses a result that does not account for every pair', async () => {
      const session = (await start().expect(200)).body.data;
      await finish({
        sessionToken: session.sessionToken,
        scoreOne: 3,
        scoreTwo: 2,
        turns: 10,
        durationMs: 30_000,
      }).expect(422);
    });

    it('refuses a game played faster than a person can tap', async () => {
      const session = (await start().expect(200)).body.data;
      await finish({
        sessionToken: session.sessionToken,
        scoreOne: 4,
        scoreTwo: 2,
        turns: 10,
        durationMs: 200,
      }).expect(422);
    });

    it('refuses fewer turns than there are pairs', async () => {
      const session = (await start().expect(200)).body.data;
      await finish({
        sessionToken: session.sessionToken,
        scoreOne: 6,
        scoreTwo: 0,
        turns: 3,
        durationMs: 30_000,
      }).expect(422);
    });

    it('refuses a session token nobody was issued', async () => {
      await finish({
        sessionToken: 'a'.repeat(48),
        scoreOne: 4,
        scoreTwo: 2,
        turns: 10,
        durationMs: 30_000,
      }).expect(422);
    });

    it('awards the winner a coupon', async () => {
      const session = (await start().expect(200)).body.data;
      const response = await finish({
        sessionToken: session.sessionToken,
        scoreOne: 4,
        scoreTwo: 2,
        turns: 11,
        durationMs: 45_000,
      }).expect(200);

      expect(response.body.data.winner).toBe(1);
      expect(response.body.data.couponCode).toMatch(/^DUEL-/);
    });

    it('cannot submit the same duel twice', async () => {
      const session = (await start().expect(200)).body.data;
      const body = {
        sessionToken: session.sessionToken,
        scoreOne: 2,
        scoreTwo: 4,
        turns: 11,
        durationMs: 45_000,
      };
      await finish(body).expect(200);
      await finish(body).expect(422);
    });
  });

  describe('a draw', () => {
    it('pays nothing unless the owner said it should', async () => {
      await enableDuel({ rewardOnDraw: false });
      const session = (await start().expect(200)).body.data;
      const response = await finish({
        sessionToken: session.sessionToken,
        scoreOne: 3,
        scoreTwo: 3,
        turns: 12,
        durationMs: 50_000,
      }).expect(200);

      expect(response.body.data.winner).toBe(0);
      expect(response.body.data.couponCode).toBeNull();
    });

    it('pays when the owner said it should', async () => {
      await enableDuel({ rewardOnDraw: true });
      const session = (await start().expect(200)).body.data;
      const response = await finish({
        sessionToken: session.sessionToken,
        scoreOne: 3,
        scoreTwo: 3,
        turns: 12,
        durationMs: 50_000,
      }).expect(200);

      expect(response.body.data.couponCode).toMatch(/^DUEL-/);
    });
  });

  describe('when the owner has not switched it on', () => {
    it('refuses to deal a board', async () => {
      await enableDuel();
      await ctx
        .http()
        .put('/api/game')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isEnabled: true,
          model: 'ARCADE',
          config: {
            spinEnabled: true,
            spin: {
              segments: [
                { label: 'پوچ', weight: 1, rewardType: 'NONE', rewardValue: 0 },
                { label: '۱۰٪', weight: 1, rewardType: 'PERCENTAGE', rewardValue: 10 },
              ],
              cooldownHours: 24,
              scorePerPlay: 10,
            },
            kitchenRushEnabled: false,
            kitchenRush: {
              durationSeconds: 120,
              lives: 4,
              scorePerCorrect: 25,
              comboStep: 4,
              feverThreshold: 8,
              cooldownHours: 24,
              scorePerPlay: 25,
              itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سالاد'],
              rewards: [
                {
                  label: '۱۰٪ تخفیف',
                  minScore: 900,
                  rewardType: 'PERCENTAGE',
                  rewardValue: 10,
                  minOrderTotal: 0,
                  expiryDays: 14,
                },
              ],
            },
            memoryDuelEnabled: false,
            memoryDuel: {
              pairs: 6,
              cooldownHours: 0,
              scorePerPlay: 20,
              itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سیب‌زمینی', 'سالاد', 'نوشیدنی'],
              reward: null,
              rewardOnDraw: false,
            },
          },
        })
        .expect(200);

      await start().expect(404);
    });
  });
});
