export type GameKind = 'MEMORY' | 'MATH';

export interface GameRules {
  isEnabled: boolean;
  dailyLimit: number;
  pointsPerWin: number;
  couponCost: number;
  couponMaxDiscount: number;
  couponMinOrder: number;
}

export const DEFAULT_GAME_RULES: GameRules = {
  isEnabled: false,
  dailyLimit: 2,
  pointsPerWin: 10,
  couponCost: 50,
  couponMaxDiscount: 20_000,
  couponMinOrder: 100_000,
};

export interface GameView {
  id: string;
  kind: GameKind;
  revision: number;
  finished: boolean;
  score: number;
  awardedPoints: number;
  expiresAt: string;
  cards?: (number | null)[];
  matched?: number[];
  turns?: number;
  question?: { a: number; b: number; operation: '+' | '-'; index: number };
}

export interface GameProfile {
  restaurantName: string;
  slug: string;
  enabled: boolean;
  eligible: boolean;
  reason: string | null;
  xp: number;
  level: number;
  points: number;
  remainingToday: number;
  rules: GameRules;
  sessions: GameView[];
  coupons: {
    code: string;
    endsAt: string | null;
    value: number;
    maxDiscount: number | null;
    minOrderTotal: number;
  }[];
}

/** XP is lifetime game progress; redeeming wallet points does not lower it. */
export function gameLevel(xp: number): number {
  return Math.min(20, 1 + Math.floor(Math.max(0, xp) / 100));
}
