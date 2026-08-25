/**
 * Realistic Persian demo data for کافه رُز.
 *
 * Prices are in Toman, the unit Iranian menus actually quote.
 */

export interface SeedModifierOption {
  name: string;
  nameFa: string;
  priceDelta: number;
}

export interface SeedModifierGroup {
  name: string;
  nameFa: string;
  type: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: SeedModifierOption[];
}

export interface SeedProduct {
  name: string;
  nameFa: string;
  description: string;
  descriptionFa: string;
  price: number;
  discountPrice?: number;
  isFeatured?: boolean;
  isAvailable?: boolean;
  preparationMinutes: number;
  calories?: number;
  modifierGroups?: SeedModifierGroup[];
}

export interface SeedCategory {
  name: string;
  nameFa: string;
  description: string;
  products: SeedProduct[];
}

const SIZE_GROUP: SeedModifierGroup = {
  name: 'Size',
  nameFa: 'اندازه',
  type: 'SINGLE',
  isRequired: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: 'Small', nameFa: 'کوچک', priceDelta: 0 },
    { name: 'Medium', nameFa: 'متوسط', priceDelta: 15_000 },
    { name: 'Large', nameFa: 'بزرگ', priceDelta: 30_000 },
  ],
};

const MILK_GROUP: SeedModifierGroup = {
  name: 'Milk',
  nameFa: 'نوع شیر',
  type: 'SINGLE',
  isRequired: false,
  minSelect: 0,
  maxSelect: 1,
  options: [
    { name: 'Whole milk', nameFa: 'شیر پرچرب', priceDelta: 0 },
    { name: 'Low fat milk', nameFa: 'شیر کم‌چرب', priceDelta: 0 },
    { name: 'Oat milk', nameFa: 'شیر جو دوسر', priceDelta: 25_000 },
    { name: 'Almond milk', nameFa: 'شیر بادام', priceDelta: 30_000 },
  ],
};

const BURGER_EXTRAS: SeedModifierGroup = {
  name: 'Extras',
  nameFa: 'افزودنی‌ها',
  type: 'MULTIPLE',
  isRequired: false,
  minSelect: 0,
  maxSelect: 4,
  options: [
    { name: 'Extra cheese', nameFa: 'پنیر اضافه', priceDelta: 35_000 },
    { name: 'Extra sauce', nameFa: 'سس اضافه', priceDelta: 12_000 },
    { name: 'Grilled mushroom', nameFa: 'قارچ گریل', priceDelta: 40_000 },
    { name: 'Beef bacon', nameFa: 'ژامبون گوشت', priceDelta: 55_000 },
  ],
};

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: 'Burgers',
    nameFa: 'برگر',
    description: 'برگرهای دست‌ساز با نان بریوش تازه',
    products: [
      {
        name: 'Signature Burger',
        nameFa: 'برگر ویژه',
        description: 'House special beef burger with smoked sauce',
        descriptionFa:
          'برگر گوشت گوساله ۱۸۰ گرمی، پنیر چدار، سس مخصوص سرآشپز و نان بریوش',
        price: 385_000,
        isFeatured: true,
        preparationMinutes: 18,
        calories: 720,
        modifierGroups: [BURGER_EXTRAS],
      },
      {
        name: 'Cheeseburger',
        nameFa: 'چیزبرگر',
        description: 'Classic beef burger with double cheddar',
        descriptionFa: 'برگر گوشت گوساله با دو لایه پنیر چدار، خیارشور و کاهو',
        price: 320_000,
        discountPrice: 285_000,
        preparationMinutes: 15,
        calories: 650,
        modifierGroups: [BURGER_EXTRAS],
      },
      {
        name: 'Chicken Burger',
        nameFa: 'برگر مرغ',
        description: 'Crispy chicken fillet burger',
        descriptionFa: 'فیله مرغ سوخاری ترد، سس سیر و مایونز، کاهو و گوجه',
        price: 295_000,
        preparationMinutes: 16,
        calories: 590,
        modifierGroups: [BURGER_EXTRAS],
      },
      {
        name: 'Mushroom Burger',
        nameFa: 'قارچ برگر',
        description: 'Beef burger topped with sauteed mushrooms',
        descriptionFa: 'برگر گوشت با قارچ سوته و پنیر موزارلا',
        price: 345_000,
        preparationMinutes: 18,
        calories: 690,
      },
    ],
  },
  {
    name: 'Pasta',
    nameFa: 'پاستا',
    description: 'پاستاهای ایتالیایی با سس تازه',
    products: [
      {
        name: 'Alfredo Pasta',
        nameFa: 'پاستا آلفردو',
        description: 'Creamy alfredo with grilled chicken',
        descriptionFa: 'پاستا فتوچینی با سس خامه‌ای آلفردو، مرغ گریل و پنیر پارمزان',
        price: 365_000,
        isFeatured: true,
        preparationMinutes: 20,
        calories: 780,
      },
      {
        name: 'Pasta Bolognese',
        nameFa: 'پاستا بولونز',
        description: 'Slow cooked beef ragu',
        descriptionFa: 'پاستا با سس گوشت چرخ‌کرده، رب گوجه و ریحان تازه',
        price: 340_000,
        preparationMinutes: 22,
        calories: 810,
      },
      {
        name: 'Pesto Pasta',
        nameFa: 'پاستا پستو',
        description: 'Basil pesto with pine nuts',
        descriptionFa: 'پاستا با سس پستوی ریحان، مغز کاج و پنیر پارمزان',
        price: 315_000,
        preparationMinutes: 18,
        calories: 690,
      },
    ],
  },
  {
    name: 'Hot Drinks',
    nameFa: 'نوشیدنی گرم',
    description: 'قهوه‌های تخصصی با دانه‌های تازه رست‌شده',
    products: [
      {
        name: 'Cappuccino',
        nameFa: 'کاپوچینو',
        description: 'Espresso with steamed milk foam',
        descriptionFa: 'اسپرسو با شیر بخارپز و فوم مخملی',
        price: 145_000,
        isFeatured: true,
        preparationMinutes: 6,
        calories: 120,
        modifierGroups: [SIZE_GROUP, MILK_GROUP],
      },
      {
        name: 'Latte',
        nameFa: 'لاته',
        description: 'Smooth espresso with steamed milk',
        descriptionFa: 'اسپرسو با شیر بخارپز و لایه‌ای نازک از فوم',
        price: 155_000,
        preparationMinutes: 6,
        calories: 190,
        modifierGroups: [SIZE_GROUP, MILK_GROUP],
      },
      {
        name: 'Espresso',
        nameFa: 'اسپرسو',
        description: 'Double shot of house blend',
        descriptionFa: 'دو شات اسپرسو از ترکیب مخصوص کافه رُز',
        price: 95_000,
        preparationMinutes: 4,
        calories: 10,
      },
      {
        name: 'Hot Chocolate',
        nameFa: 'هات چاکلت',
        description: 'Belgian dark chocolate',
        descriptionFa: 'شکلات تلخ بلژیکی با شیر داغ و خامه',
        price: 175_000,
        preparationMinutes: 7,
        calories: 340,
        modifierGroups: [SIZE_GROUP],
      },
    ],
  },
  {
    name: 'Cold Drinks',
    nameFa: 'نوشیدنی سرد',
    description: 'نوشیدنی‌های خنک و تازه',
    products: [
      {
        name: 'Lemonade',
        nameFa: 'لیموناد',
        description: 'Fresh lemon with mint',
        descriptionFa: 'آبلیموی تازه با نعناع و آب گازدار',
        price: 135_000,
        preparationMinutes: 5,
        calories: 150,
        modifierGroups: [SIZE_GROUP],
      },
      {
        name: 'Iced Latte',
        nameFa: 'آیس لاته',
        description: 'Chilled espresso with milk',
        descriptionFa: 'اسپرسو سرد با شیر و یخ',
        price: 165_000,
        preparationMinutes: 5,
        calories: 180,
        modifierGroups: [SIZE_GROUP, MILK_GROUP],
      },
      {
        name: 'Iced Americano',
        nameFa: 'آیس آمریکانو',
        description: 'Espresso over ice water',
        descriptionFa: 'اسپرسو با آب سرد و یخ فراوان',
        price: 125_000,
        preparationMinutes: 4,
        calories: 15,
        modifierGroups: [SIZE_GROUP],
      },
      {
        name: 'Mojito',
        nameFa: 'موهیتو',
        description: 'Virgin mojito with lime and mint',
        descriptionFa: 'موهیتو بدون الکل با لیمو، نعناع و سودا',
        price: 185_000,
        preparationMinutes: 6,
        calories: 210,
      },
    ],
  },
  {
    name: 'Desserts',
    nameFa: 'دسر',
    description: 'دسرهای خانگی روزانه',
    products: [
      {
        name: 'Cheesecake',
        nameFa: 'چیزکیک',
        description: 'New York style with berry coulis',
        descriptionFa: 'چیزکیک نیویورکی با سس توت‌فرنگی تازه',
        price: 225_000,
        isFeatured: true,
        preparationMinutes: 3,
        calories: 430,
      },
      {
        name: 'Brownie',
        nameFa: 'براونی',
        description: 'Warm chocolate brownie with ice cream',
        descriptionFa: 'براونی شکلاتی گرم با یک اسکوپ بستنی وانیلی',
        price: 195_000,
        preparationMinutes: 8,
        calories: 520,
      },
      {
        name: 'Saffron Ice Cream',
        nameFa: 'بستنی زعفرانی',
        description: 'Traditional Persian saffron ice cream',
        descriptionFa: 'بستنی سنتی زعفرانی با خامه و پسته',
        price: 165_000,
        preparationMinutes: 3,
        calories: 380,
      },
      {
        name: 'Carrot Cake',
        nameFa: 'کیک هویج',
        description: 'Spiced carrot cake with cream cheese',
        descriptionFa: 'کیک هویج و گردو با فراستینگ پنیر خامه‌ای',
        price: 185_000,
        isAvailable: false,
        preparationMinutes: 3,
        calories: 410,
      },
    ],
  },
];

/**
 * Demo staff accounts.
 *
 * Passwords are documented in the README and every account is flagged
 * `mustChangePassword`, so the UI forces a change before real use.
 */
export const SEED_USERS = [
  {
    email: 'owner@caferoz.ir',
    fullName: 'سارا رضایی',
    phone: '09121110001',
    role: 'OWNER' as const,
    password: 'Owner12345',
    pinnedToBranch: false,
  },
  {
    email: 'manager@caferoz.ir',
    fullName: 'امیر کاظمی',
    phone: '09121110002',
    role: 'MANAGER' as const,
    password: 'Manager12345',
    pinnedToBranch: true,
  },
  {
    email: 'cashier@caferoz.ir',
    fullName: 'نگین مرادی',
    phone: '09121110003',
    role: 'CASHIER' as const,
    password: 'Cashier12345',
    pinnedToBranch: true,
  },
  {
    email: 'kitchen@caferoz.ir',
    fullName: 'رضا احمدی',
    phone: '09121110004',
    role: 'KITCHEN' as const,
    password: 'Kitchen12345',
    pinnedToBranch: true,
  },
  {
    email: 'waiter@caferoz.ir',
    fullName: 'مهدی نوری',
    phone: '09121110005',
    role: 'WAITER' as const,
    password: 'Waiter12345',
    pinnedToBranch: true,
  },
  {
    email: 'accountant@caferoz.ir',
    fullName: 'زهرا حسینی',
    phone: '09121110006',
    role: 'ACCOUNTANT' as const,
    password: 'Account12345',
    pinnedToBranch: true,
  },
];

/** Customers used to generate believable order history. */
export const SEED_CUSTOMERS = [
  { name: 'محمد تهرانی', phone: '09351234567' },
  { name: 'فاطمه کریمی', phone: '09122223344' },
  { name: 'علی صادقی', phone: '09309876543' },
  { name: 'مریم اسدی', phone: '09197778899' },
  { name: 'حسین رحیمی', phone: '09364445566' },
  { name: 'نرگس شریفی', phone: '09112223344' },
];

export const SEED_TABLE_COUNT = 36;

export const SEED_TABLE_ZONES = [
  { from: 1, to: 12, zone: 'سالن اصلی', capacity: 4 },
  { from: 13, to: 24, zone: 'طبقه دوم', capacity: 2 },
  { from: 25, to: 32, zone: 'تراس', capacity: 6 },
  { from: 33, to: 36, zone: 'اتاق خصوصی', capacity: 8 },
];
