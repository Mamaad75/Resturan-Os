/**
 * Working out what a regular always orders.
 *
 * A café has customers who order the same thing every morning, and making them
 * rebuild that basket from the menu each time is the kind of small friction
 * that decides whether they open the QR menu at all. This is the rule that
 * decides what "the usual" is, kept free of Prisma so it can be tested against
 * the awkward histories real customers have.
 */

export interface HistoricLine {
  /** Null once the product has been deleted from the menu. */
  productId: string | null;
  quantity: number;
  modifierOptionIds: string[];
}

export interface HistoricOrder {
  id: string;
  placedAt: Date;
  lines: HistoricLine[];
}

export interface UsualOrder {
  /** How many of the considered orders were this exact basket. */
  repeatCount: number;
  /** The last time it was ordered, which is also where the lines come from. */
  lastOrderedAt: Date;
  lines: HistoricLine[];
}

/**
 * A basket's identity.
 *
 * Order of the lines is irrelevant - two coffees and a croissant is the same
 * basket whichever was tapped first - so both the lines and each line's
 * modifiers are sorted before they are joined. Quantity is part of the
 * identity: one coffee and three coffees are different habits.
 */
export function basketSignature(lines: HistoricLine[]): string {
  return lines
    .map(
      (line) =>
        `${line.productId}*${line.quantity}+${[...line.modifierOptionIds]
          .sort()
          .join('.')}`,
    )
    .sort()
    .join('|');
}

/**
 * The basket to offer at the top of the menu.
 *
 * The most frequently repeated basket wins; ties go to whichever was ordered
 * most recently, because a habit someone has moved on from is not their usual.
 * Orders carrying a deleted product are skipped entirely rather than partially
 * offered: "your usual, minus the thing you actually came for" is worse than
 * showing nothing.
 *
 * A single past order is still returned, with `repeatCount` of one, so the
 * caller can offer it as "your last order" instead of "your usual" - that is a
 * wording decision, not a different query.
 */
export function pickUsualOrder(orders: HistoricOrder[]): UsualOrder | null {
  const usable = orders.filter(
    (order) =>
      order.lines.length > 0 &&
      order.lines.every((line) => line.productId != null && line.quantity > 0),
  );
  if (usable.length === 0) return null;

  const groups = new Map<string, { count: number; latest: HistoricOrder }>();
  for (const order of usable) {
    const signature = basketSignature(order.lines);
    const existing = groups.get(signature);
    if (!existing) {
      groups.set(signature, { count: 1, latest: order });
      continue;
    }
    existing.count += 1;
    if (order.placedAt > existing.latest.placedAt) existing.latest = order;
  }

  let best: { count: number; latest: HistoricOrder } | null = null;
  for (const group of groups.values()) {
    if (
      !best ||
      group.count > best.count ||
      (group.count === best.count &&
        group.latest.placedAt > best.latest.placedAt)
    ) {
      best = group;
    }
  }
  if (!best) return null;

  return {
    repeatCount: best.count,
    lastOrderedAt: best.latest.placedAt,
    lines: best.latest.lines,
  };
}
