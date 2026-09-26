/**
 * Starter menus.
 *
 * A new restaurant used to land on an empty menu with three empty headings,
 * and the first thing it had to do was type twenty items. These are the items
 * an Iranian café, restaurant or fast-food shop almost certainly sells, priced
 * in the right order of magnitude for Toman, so the owner edits and deletes
 * rather than starting from nothing.
 *
 * Prices are a starting point, not a recommendation: every one is meant to be
 * changed, which is why they are round numbers rather than plausible-looking
 * ones a tired owner might leave as-is.
 */

export interface StarterProduct {
  nameFa: string;
  /** Latin name for receipts and search. */
  name: string;
  price: number;
  descriptionFa?: string;
  preparationMinutes?: number;
}

export interface StarterCategory {
  nameFa: string;
  products: StarterProduct[];
}

const CAFE: StarterCategory[] = [
  {
    nameFa: 'نوشیدنی گرم',
    products: [
      { nameFa: 'اسپرسو', name: 'Espresso', price: 55_000, preparationMinutes: 3 },
      { nameFa: 'آمریکانو', name: 'Americano', price: 65_000, preparationMinutes: 3 },
      { nameFa: 'کاپوچینو', name: 'Cappuccino', price: 85_000, preparationMinutes: 5 },
      { nameFa: 'لاته', name: 'Cafe Latte', price: 90_000, preparationMinutes: 5 },
      { nameFa: 'موکا', name: 'Mocha', price: 105_000, preparationMinutes: 6 },
      { nameFa: 'هات چاکلت', name: 'Hot Chocolate', price: 95_000, preparationMinutes: 5 },
      { nameFa: 'چای سیاه', name: 'Black Tea', price: 35_000, preparationMinutes: 4 },
      { nameFa: 'دمنوش', name: 'Herbal Tea', price: 45_000, preparationMinutes: 5 },
    ],
  },
  {
    nameFa: 'نوشیدنی سرد',
    products: [
      { nameFa: 'آیس لاته', name: 'Iced Latte', price: 95_000, preparationMinutes: 4 },
      { nameFa: 'آیس آمریکانو', name: 'Iced Americano', price: 75_000, preparationMinutes: 3 },
      { nameFa: 'فراپه', name: 'Frappe', price: 120_000, preparationMinutes: 6 },
      { nameFa: 'لیموناد', name: 'Lemonade', price: 75_000, preparationMinutes: 4 },
      { nameFa: 'آب پرتقال طبیعی', name: 'Fresh Orange Juice', price: 95_000, preparationMinutes: 4 },
      { nameFa: 'میلک‌شیک وانیل', name: 'Vanilla Milkshake', price: 115_000, preparationMinutes: 5 },
      { nameFa: 'نوشابه', name: 'Soft Drink', price: 30_000, preparationMinutes: 1 },
      { nameFa: 'آب معدنی', name: 'Mineral Water', price: 15_000, preparationMinutes: 1 },
    ],
  },
  {
    nameFa: 'دسر و کیک',
    products: [
      { nameFa: 'چیزکیک', name: 'Cheesecake', price: 130_000 },
      { nameFa: 'براونی', name: 'Brownie', price: 110_000 },
      { nameFa: 'تیرامیسو', name: 'Tiramisu', price: 140_000 },
      { nameFa: 'کیک شکلاتی', name: 'Chocolate Cake', price: 120_000 },
      { nameFa: 'کروسان', name: 'Croissant', price: 85_000 },
    ],
  },
  {
    nameFa: 'صبحانه',
    products: [
      { nameFa: 'املت', name: 'Omelette', price: 150_000, preparationMinutes: 12 },
      { nameFa: 'نیمرو', name: 'Fried Eggs', price: 120_000, preparationMinutes: 10 },
      { nameFa: 'پنیر و گردو', name: 'Cheese and Walnut', price: 140_000, preparationMinutes: 6 },
      { nameFa: 'تست آووکادو', name: 'Avocado Toast', price: 185_000, preparationMinutes: 10 },
    ],
  },
];

const RESTAURANT: StarterCategory[] = [
  {
    nameFa: 'پیش‌غذا',
    products: [
      { nameFa: 'سالاد شیرازی', name: 'Shirazi Salad', price: 85_000, preparationMinutes: 6 },
      { nameFa: 'سالاد فصل', name: 'Garden Salad', price: 95_000, preparationMinutes: 6 },
      { nameFa: 'ماست و خیار', name: 'Mast-o Khiar', price: 70_000, preparationMinutes: 4 },
      { nameFa: 'ماست و موسیر', name: 'Mast-o Musir', price: 70_000, preparationMinutes: 4 },
      { nameFa: 'زیتون پرورده', name: 'Marinated Olives', price: 90_000, preparationMinutes: 4 },
      { nameFa: 'سوپ جو', name: 'Barley Soup', price: 95_000, preparationMinutes: 8 },
    ],
  },
  {
    nameFa: 'کباب',
    products: [
      { nameFa: 'چلو کباب کوبیده', name: 'Koobideh Kabab', price: 480_000, preparationMinutes: 25 },
      { nameFa: 'چلو جوجه کباب', name: 'Chicken Kabab', price: 450_000, preparationMinutes: 25 },
      { nameFa: 'چلو کباب برگ', name: 'Barg Kabab', price: 780_000, preparationMinutes: 30 },
      { nameFa: 'چلو کباب سلطانی', name: 'Soltani Kabab', price: 950_000, preparationMinutes: 30 },
      { nameFa: 'کباب بختیاری', name: 'Bakhtiari Kabab', price: 690_000, preparationMinutes: 28 },
    ],
  },
  {
    nameFa: 'خورش و غذای ایرانی',
    products: [
      { nameFa: 'قورمه سبزی', name: 'Ghormeh Sabzi', price: 420_000, preparationMinutes: 20 },
      { nameFa: 'قیمه', name: 'Gheymeh', price: 400_000, preparationMinutes: 20 },
      { nameFa: 'فسنجان', name: 'Fesenjan', price: 520_000, preparationMinutes: 20 },
      { nameFa: 'زرشک پلو با مرغ', name: 'Zereshk Polo ba Morgh', price: 430_000, preparationMinutes: 22 },
      { nameFa: 'باقالی پلو با ماهیچه', name: 'Baghali Polo ba Mahiche', price: 890_000, preparationMinutes: 30 },
    ],
  },
  {
    nameFa: 'نوشیدنی',
    products: [
      { nameFa: 'دوغ', name: 'Doogh', price: 45_000, preparationMinutes: 1 },
      { nameFa: 'نوشابه', name: 'Soft Drink', price: 30_000, preparationMinutes: 1 },
      { nameFa: 'آب معدنی', name: 'Mineral Water', price: 15_000, preparationMinutes: 1 },
      { nameFa: 'شربت سنتی', name: 'Traditional Sharbat', price: 60_000, preparationMinutes: 3 },
    ],
  },
];

const FAST_FOOD: StarterCategory[] = [
  {
    nameFa: 'برگر',
    products: [
      { nameFa: 'همبرگر', name: 'Hamburger', price: 280_000, preparationMinutes: 12 },
      { nameFa: 'چیزبرگر', name: 'Cheeseburger', price: 320_000, preparationMinutes: 12 },
      { nameFa: 'دوبل برگر', name: 'Double Burger', price: 450_000, preparationMinutes: 15 },
      { nameFa: 'قارچ برگر', name: 'Mushroom Burger', price: 360_000, preparationMinutes: 14 },
      { nameFa: 'چیکن برگر', name: 'Chicken Burger', price: 330_000, preparationMinutes: 14 },
    ],
  },
  {
    nameFa: 'پیتزا',
    products: [
      { nameFa: 'پیتزا مخصوص', name: 'Special Pizza', price: 480_000, preparationMinutes: 18 },
      { nameFa: 'پیتزا پپرونی', name: 'Pepperoni Pizza', price: 450_000, preparationMinutes: 18 },
      { nameFa: 'پیتزا مارگاریتا', name: 'Margherita Pizza', price: 380_000, preparationMinutes: 16 },
      { nameFa: 'پیتزا سبزیجات', name: 'Vegetable Pizza', price: 390_000, preparationMinutes: 16 },
    ],
  },
  {
    nameFa: 'سوخاری',
    products: [
      { nameFa: 'مرغ سوخاری دو تکه', name: 'Fried Chicken 2pc', price: 390_000, preparationMinutes: 18 },
      { nameFa: 'مرغ سوخاری سه تکه', name: 'Fried Chicken 3pc', price: 520_000, preparationMinutes: 20 },
      { nameFa: 'استریپس', name: 'Chicken Strips', price: 360_000, preparationMinutes: 15 },
    ],
  },
  {
    nameFa: 'ساندویچ',
    products: [
      { nameFa: 'هات داگ', name: 'Hot Dog', price: 220_000, preparationMinutes: 10 },
      { nameFa: 'فلافل', name: 'Falafel', price: 180_000, preparationMinutes: 10 },
      { nameFa: 'ژامبون تنوری', name: 'Baked Ham Sandwich', price: 300_000, preparationMinutes: 12 },
      { nameFa: 'رست بیف', name: 'Roast Beef', price: 380_000, preparationMinutes: 14 },
    ],
  },
  {
    nameFa: 'پیش‌غذا و نوشیدنی',
    products: [
      { nameFa: 'سیب‌زمینی سرخ‌کرده', name: 'French Fries', price: 150_000, preparationMinutes: 8 },
      { nameFa: 'سیب‌زمینی با پنیر', name: 'Cheese Fries', price: 200_000, preparationMinutes: 10 },
      { nameFa: 'نان سیر', name: 'Garlic Bread', price: 130_000, preparationMinutes: 8 },
      { nameFa: 'نوشابه', name: 'Soft Drink', price: 30_000, preparationMinutes: 1 },
      { nameFa: 'دوغ', name: 'Doogh', price: 45_000, preparationMinutes: 1 },
      { nameFa: 'آب معدنی', name: 'Mineral Water', price: 15_000, preparationMinutes: 1 },
    ],
  },
];

export const STARTER_MENUS = {
  cafe: CAFE,
  restaurant: RESTAURANT,
  fastfood: FAST_FOOD,
} as const;

export type StarterMenuKey = keyof typeof STARTER_MENUS;

/** Total items in a starter menu, for the signup screen's promise. */
export function starterItemCount(key: StarterMenuKey): number {
  return STARTER_MENUS[key].reduce(
    (sum, category) => sum + category.products.length,
    0,
  );
}
