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
 * Invite a friend.
 *
 * Rewards are money, and the code that earns them is shared in public, so the
 * tests here are about the ways it could be gamed: inviting yourself, using a
 * code twice, spending one reward on two orders, and reading a stranger's
 * rewards with nothing but their phone number.
 */
describe('Referral programme', () => {
  let ctx: TestContext;
  let tenant: TestTenant;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    tenant = await seedTenant(ctx.prisma, 'referrals');
    token = await login(ctx, tenant, 'OWNER');
  });

  afterAll(async () => {
    await resetDatabase(ctx.prisma);
    await closeTestApp(ctx);
  });

  function saveProgram(body: Record<string, unknown>) {
    return ctx
      .http()
      .put('/api/referrals/program')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function panel(trackingToken: string) {
    return ctx
      .http()
      .get(`/api/public/restaurants/${tenant.restaurantSlug}/referral`)
      .query({ token: trackingToken });
  }

  /** Places an order for the given phone and returns its tracking token. */
  async function order(
    phone: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ trackingToken: string; discountTotal: number; orderId: string }> {
    const response = await ctx
      .http()
      .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'مشتری',
        customerPhone: phone,
        items: [{ productId: tenant.productId, quantity: 1, modifierOptionIds: [] }],
        ...extra,
      })
      .expect(201);
    return {
      trackingToken: response.body.data.trackingToken,
      discountTotal: response.body.data.order.discountTotal,
      orderId: response.body.data.order.id,
    };
  }

  describe('the terms', () => {
    it('starts switched off', async () => {
      const response = await ctx
        .http()
        .get('/api/referrals/program')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.data.isActive).toBe(false);
    });

    it('refuses a free-product reward with no product named', async () => {
      await saveProgram({
        isActive: true,
        rewardType: 'FREE_PRODUCT',
        invitesRequired: 1,
        rewardValidDays: 30,
      }).expect(422);
    });

    it('refuses a percentage reward of zero', async () => {
      await saveProgram({
        isActive: true,
        rewardType: 'PERCENTAGE',
        rewardValue: 0,
        invitesRequired: 1,
        rewardValidDays: 30,
      }).expect(422);
    });

    it('refuses a product belonging to another restaurant', async () => {
      const other = await seedTenant(ctx.prisma, 'referrals-other');
      await saveProgram({
        isActive: true,
        rewardType: 'FREE_PRODUCT',
        rewardProductId: other.productId,
        invitesRequired: 1,
        rewardValidDays: 30,
      }).expect(404);
    });

    it('saves a percentage programme with a welcome for the friend', async () => {
      const response = await saveProgram({
        isActive: true,
        rewardType: 'PERCENTAGE',
        rewardValue: 2_000,
        invitesRequired: 1,
        friendRewardType: 'FIXED',
        friendRewardValue: 50_000,
        rewardValidDays: 30,
        termsFa: 'فقط سفارش بیرون‌بر',
      }).expect(200);
      expect(response.body.data.isActive).toBe(true);
      expect(response.body.data.rewardValue).toBe(2_000);
    });
  });

  describe('the guest s code', () => {
    it('tells an unknown guest nothing', async () => {
      const response = await panel('a'.repeat(48)).expect(200);
      expect(response.body.data.isActive).toBe(false);
      expect(response.body.data.code).toBeNull();
    });

    it('issues a code on first ask and keeps it thereafter', async () => {
      const placed = await order('09121110001');
      const first = await panel(placed.trackingToken).expect(200);
      expect(first.body.data.code).toMatch(/^[A-Z0-9]{6}$/);

      const second = await panel(placed.trackingToken).expect(200);
      expect(second.body.data.code).toBe(first.body.data.code);
    });

    it('never issues a code containing a character people misread', async () => {
      const placed = await order('09121110002');
      const response = await panel(placed.trackingToken).expect(200);
      for (const confusable of ['O', '0', 'I', '1', 'L', 'S', '5', 'Z', '2']) {
        expect(response.body.data.code).not.toContain(confusable);
      }
    });
  });

  describe('accepting an invitation', () => {
    let inviterToken: string;
    let code: string;

    beforeAll(async () => {
      const placed = await order('09121112000');
      inviterToken = placed.trackingToken;
      const response = await panel(inviterToken).expect(200);
      code = response.body.data.code;
    });

    it('credits the inviter when a friend orders with the code', async () => {
      await order('09121113000', { referralCode: code });

      const response = await panel(inviterToken).expect(200);
      expect(response.body.data.invitedCount).toBe(1);
      // One invite was required, so the reward is already theirs.
      expect(response.body.data.rewards).toHaveLength(1);
      expect(response.body.data.rewards[0].labelFa).toContain('20');
    });

    it('grants the friend their welcome, for their next order', async () => {
      const friend = await order('09121114000', { referralCode: code });
      // The order that earned it is not discounted by it.
      expect(friend.discountTotal).toBe(0);

      const response = await panel(friend.trackingToken).expect(200);
      expect(response.body.data.rewards).toHaveLength(1);
    });

    it('ignores a code the guest has already been referred with', async () => {
      const friend = await order('09121115000', { referralCode: code });
      const before = await panel(inviterToken).expect(200);

      // Same person, second order, same code: no second invitation.
      await order('09121115000', { referralCode: code });
      const after = await panel(inviterToken).expect(200);
      expect(after.body.data.invitedCount).toBe(before.body.data.invitedCount);
      // And no second welcome for the friend either.
      const friendPanel = await panel(friend.trackingToken).expect(200);
      expect(friendPanel.body.data.rewards).toHaveLength(1);
    });

    it('ignores a guest using their own code', async () => {
      const before = await panel(inviterToken).expect(200);
      await order('09121112000', { referralCode: code });
      const after = await panel(inviterToken).expect(200);
      expect(after.body.data.invitedCount).toBe(before.body.data.invitedCount);
    });

    it('ignores a code nobody was ever issued', async () => {
      const placed = await order('09121116000', { referralCode: 'QQQQQQ' });
      // The order still goes through - a mistyped code is not a failed order.
      expect(placed.discountTotal).toBe(0);
    });

    it('refuses a code of an impossible length', async () => {
      await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type: 'TAKEAWAY',
          customerName: 'مشتری',
          customerPhone: '09121117000',
          referralCode: 'A'.repeat(40),
          items: [{ productId: tenant.productId, quantity: 1, modifierOptionIds: [] }],
        })
        .expect(422);
    });
  });

  describe('spending a reward', () => {
    let friendToken: string;
    let rewardId: string;

    beforeAll(async () => {
      const inviter = await order('09121118000');
      const inviterPanel = await panel(inviter.trackingToken).expect(200);
      const friend = await order('09121119000', {
        referralCode: inviterPanel.body.data.code,
      });
      friendToken = friend.trackingToken;
      const friendPanel = await panel(friendToken).expect(200);
      rewardId = friendPanel.body.data.rewards[0].id;
    });

    it('applies the reward the server priced, not one the request names', async () => {
      // A 50,000 welcome on a 200,000 order.
      const placed = await order('09121119000', { referralRewardId: rewardId });
      expect(placed.discountTotal).toBe(50_000);
    });

    it('cannot be spent twice', async () => {
      const placed = await order('09121119000', { referralRewardId: rewardId });
      expect(placed.discountTotal).toBe(0);
    });

    it('disappears from the panel once spent', async () => {
      const response = await panel(friendToken).expect(200);
      expect(
        response.body.data.rewards.some(
          (reward: { id: string }) => reward.id === rewardId,
        ),
      ).toBe(false);
    });

    it('refuses to let one customer spend another s reward', async () => {
      const inviter = await order('09121120000');
      const inviterPanel = await panel(inviter.trackingToken).expect(200);
      const victim = await order('09121121000', {
        referralCode: inviterPanel.body.data.code,
      });
      const victimReward = (await panel(victim.trackingToken).expect(200)).body.data
        .rewards[0].id;

      // A different phone, naming someone else's reward id.
      const thief = await order('09121122000', { referralRewardId: victimReward });
      expect(thief.discountTotal).toBe(0);

      // And the victim still has it.
      const after = await panel(victim.trackingToken).expect(200);
      expect(
        after.body.data.rewards.some(
          (reward: { id: string }) => reward.id === victimReward,
        ),
      ).toBe(true);
    });

    it('is worth nothing once it has expired', async () => {
      const inviter = await order('09121123000');
      const inviterPanel = await panel(inviter.trackingToken).expect(200);
      const friend = await order('09121124000', {
        referralCode: inviterPanel.body.data.code,
      });
      const expiring = (await panel(friend.trackingToken).expect(200)).body.data
        .rewards[0].id;

      await ctx.prisma.referralReward.update({
        where: { id: expiring },
        data: { expiresAt: new Date(Date.now() - 86_400_000) },
      });

      const placed = await order('09121124000', { referralRewardId: expiring });
      expect(placed.discountTotal).toBe(0);
    });
  });

  describe('a free product as the reward', () => {
    it('is worth the product, and only when it is on the order', async () => {
      await saveProgram({
        isActive: true,
        rewardType: 'PERCENTAGE',
        rewardValue: 1_000,
        invitesRequired: 1,
        friendRewardType: 'FREE_PRODUCT',
        // The harness coffee costs 100,000 and needs a size chosen.
        friendRewardProductId: tenant.modifierProductId,
        rewardValidDays: 30,
      }).expect(200);

      const inviter = await order('09121130000');
      const code = (await panel(inviter.trackingToken).expect(200)).body.data.code;
      const friend = await order('09121131000', { referralCode: code });
      const rewardId = (await panel(friend.trackingToken).expect(200)).body.data
        .rewards[0].id;

      // Without the coffee: worth nothing.
      const without = await order('09121131000', { referralRewardId: rewardId });
      expect(without.discountTotal).toBe(0);

      // With it: worth the coffee, at the price the menu charges today.
      const withCoffee = await ctx
        .http()
        .post(`/api/public/restaurants/${tenant.restaurantSlug}/orders`)
        .send({
          type: 'TAKEAWAY',
          customerName: 'مشتری',
          customerPhone: '09121131000',
          referralRewardId: rewardId,
          items: [
            {
              productId: tenant.modifierProductId,
              quantity: 1,
              modifierOptionIds: [tenant.modifierOptionId],
            },
          ],
        })
        .expect(201);
      // 100,000 coffee + 50,000 for the large size; the reward covers the unit.
      expect(withCoffee.body.data.order.discountTotal).toBe(150_000);
    });
  });

  describe('authorisation', () => {
    it('refuses to set the terms without a session', async () => {
      await ctx
        .http()
        .put('/api/referrals/program')
        .send({
          isActive: true,
          rewardType: 'PERCENTAGE',
          rewardValue: 1_000,
          invitesRequired: 1,
          rewardValidDays: 30,
        })
        .expect(401);
    });

    it('refuses a waiter the programme', async () => {
      const waiter = await login(ctx, tenant, 'WAITER');
      await ctx
        .http()
        .get('/api/referrals/program')
        .set('Authorization', `Bearer ${waiter}`)
        .expect(403);
    });
  });
});
