import {
  STARTER_MENUS,
  starterItemCount,
  type StarterMenuKey,
} from './starter-menus';

/**
 * The menu a new restaurant starts with.
 *
 * Signup used to leave an owner staring at empty headings. These fixtures are
 * the first thing a new customer sees, so they are checked for the mistakes
 * that would actually embarrass the product: a missing price, a duplicate
 * item, a category with nothing in it.
 */
const KEYS: StarterMenuKey[] = ['cafe', 'restaurant', 'fastfood'];

describe('starter menus', () => {
  it('covers all three business types', () => {
    for (const key of KEYS) {
      expect(STARTER_MENUS[key].length).toBeGreaterThan(0);
    }
  });

  it('gives every business enough to open with', () => {
    for (const key of KEYS) {
      expect(starterItemCount(key)).toBeGreaterThanOrEqual(20);
    }
  });

  it('never ships an empty category', () => {
    for (const key of KEYS) {
      for (const category of STARTER_MENUS[key]) {
        expect(category.products.length).toBeGreaterThan(0);
      }
    }
  });

  it('prices everything above zero', () => {
    for (const key of KEYS) {
      for (const category of STARTER_MENUS[key]) {
        for (const product of category.products) {
          expect(product.price).toBeGreaterThan(0);
          expect(Number.isInteger(product.price)).toBe(true);
        }
      }
    }
  });

  it('keeps prices in a sane Toman range', () => {
    // A four-digit price means someone typed Rial by mistake; eight digits
    // means a stray zero. Both would be visible to a guest on day one.
    for (const key of KEYS) {
      for (const category of STARTER_MENUS[key]) {
        for (const product of category.products) {
          expect(product.price).toBeGreaterThanOrEqual(10_000);
          expect(product.price).toBeLessThanOrEqual(2_000_000);
        }
      }
    }
  });

  it('names every item in both scripts', () => {
    for (const key of KEYS) {
      for (const category of STARTER_MENUS[key]) {
        for (const product of category.products) {
          expect(product.nameFa.trim().length).toBeGreaterThan(0);
          expect(product.name.trim().length).toBeGreaterThan(0);
          // The Latin name is what a receipt and a search box use.
          expect(/^[\x20-\x7E]+$/.test(product.name)).toBe(true);
        }
      }
    }
  });

  it('does not repeat an item inside one business type', () => {
    for (const key of KEYS) {
      const names = STARTER_MENUS[key].flatMap((category) =>
        category.products.map((product) => product.nameFa),
      );
      // Soft drinks legitimately appear once per menu, never twice.
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('does not repeat a category inside one business type', () => {
    for (const key of KEYS) {
      const names = STARTER_MENUS[key].map((category) => category.nameFa);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('keeps prep times plausible where they are given', () => {
    for (const key of KEYS) {
      for (const category of STARTER_MENUS[key]) {
        for (const product of category.products) {
          if (product.preparationMinutes == null) continue;
          expect(product.preparationMinutes).toBeGreaterThan(0);
          expect(product.preparationMinutes).toBeLessThanOrEqual(60);
        }
      }
    }
  });

  it('gives a cafe drinks and a restaurant main courses', () => {
    const cafeNames = STARTER_MENUS.cafe.flatMap((c) =>
      c.products.map((p) => p.nameFa),
    );
    expect(cafeNames).toContain('اسپرسو');

    const restaurantNames = STARTER_MENUS.restaurant.flatMap((c) =>
      c.products.map((p) => p.nameFa),
    );
    expect(restaurantNames).toContain('قورمه سبزی');

    const fastFoodNames = STARTER_MENUS.fastfood.flatMap((c) =>
      c.products.map((p) => p.nameFa),
    );
    expect(fastFoodNames).toContain('همبرگر');
  });
});
