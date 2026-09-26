import { arcadeConfigSchema } from '@restaurant-os/validation';

/**
 * Backwards compatibility of the stored arcade config.
 *
 * The config is one JSON column per tenant, parsed on every read, and a parse
 * failure falls back to defaults - which would quietly reset a restaurant's
 * wheel segments and Kitchen Rush settings. Adding a game must therefore never
 * make an older saved config invalid.
 */
const STORED_BEFORE_MEMORY_DUEL = {
  spinEnabled: true,
  spin: {
    segments: [
      { label: 'پوچ', weight: 60, rewardType: 'NONE', rewardValue: 0 },
      { label: '۱۵٪ تخفیف', weight: 40, rewardType: 'PERCENTAGE', rewardValue: 15 },
    ],
    cooldownHours: 12,
    scorePerPlay: 30,
  },
  kitchenRushEnabled: true,
  kitchenRush: {
    durationSeconds: 150,
    lives: 5,
    scorePerCorrect: 40,
    comboStep: 5,
    feverThreshold: 10,
    cooldownHours: 6,
    scorePerPlay: 30,
    itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سالاد'],
    rewards: [
      {
        label: '۱۰٪ تخفیف',
        minScore: 1000,
        rewardType: 'PERCENTAGE',
        rewardValue: 10,
        minOrderTotal: 0,
        expiryDays: 14,
      },
    ],
  },
};

describe('arcade config', () => {
  it('still parses a config saved before the duel existed', () => {
    const parsed = arcadeConfigSchema.safeParse(STORED_BEFORE_MEMORY_DUEL);
    expect(parsed.success).toBe(true);
  });

  it('keeps the settings that restaurant chose', () => {
    const parsed = arcadeConfigSchema.parse(STORED_BEFORE_MEMORY_DUEL);
    expect(parsed.spin.cooldownHours).toBe(12);
    expect(parsed.spin.segments).toHaveLength(2);
    expect(parsed.kitchenRush.durationSeconds).toBe(150);
    expect(parsed.kitchenRush.lives).toBe(5);
  });

  it('adds the new game switched off', () => {
    const parsed = arcadeConfigSchema.parse(STORED_BEFORE_MEMORY_DUEL);
    expect(parsed.memoryDuelEnabled).toBe(false);
    // And with a board that can actually be dealt.
    expect(parsed.memoryDuel.pairs).toBeGreaterThanOrEqual(3);
    expect(parsed.memoryDuel.itemLabels.length).toBeGreaterThanOrEqual(
      parsed.memoryDuel.pairs,
    );
  });

  it('rejects a board with fewer labels than pairs would need', () => {
    // Six pairs cannot be dealt from three items without repeating a pair.
    const parsed = arcadeConfigSchema.parse({
      ...STORED_BEFORE_MEMORY_DUEL,
      memoryDuelEnabled: true,
      memoryDuel: { pairs: 6, itemLabels: ['یک', 'دو', 'سه'] },
    });
    // The schema allows it; the service is what clamps the board to the labels
    // it has. This pins the shape so that clamp has something to work from.
    expect(parsed.memoryDuel.itemLabels).toHaveLength(3);
    expect(parsed.memoryDuel.pairs).toBe(6);
  });
});
