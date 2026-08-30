/**
 * Menu templates.
 *
 * A restaurant picks how its customer menu looks, not just what colour it is.
 * The template is a small descriptor rather than a stylesheet: the customer
 * menu and the admin preview both render from this one object, so what an
 * owner sees while choosing is what a guest gets after scanning.
 *
 * Adding a template means adding an entry here. Nothing else in the API needs
 * to change - the value travels as a plain string.
 */

export const MenuTemplate = {
  /** The default: dark, gold, list rows with a square thumbnail. */
  CLASSIC: 'CLASSIC',
  /** Warm Persian tea-house feel: saffron and terracotta, ornamented headings. */
  TRADITIONAL: 'TRADITIONAL',
  /** Third-wave coffee shop: moody, two-column, photography-led. */
  CAFE: 'CAFE',
  /** High-energy fast food: bright, chunky, big photos and loud prices. */
  FASTFOOD: 'FASTFOOD',
  /** Typographic and quiet: no photos in the list, generous whitespace. */
  MINIMAL: 'MINIMAL',
} as const;
export type MenuTemplate = (typeof MenuTemplate)[keyof typeof MenuTemplate];

export const MENU_TEMPLATES = Object.values(MenuTemplate) as MenuTemplate[];

/** How the product list is arranged. */
export type MenuLayout =
  /** Full-width rows, text leading, thumbnail trailing. */
  | 'list'
  /** Two columns of photo-topped cards. */
  | 'grid'
  /** One tall photo card per product. */
  | 'gallery'
  /** Text only - name, description, price, hairline between rows. */
  | 'text';

/** Treatment of the category heading. */
export type MenuHeading = 'rule' | 'ornament' | 'block' | 'plain';

export interface MenuTemplateSpec {
  id: MenuTemplate;
  labelFa: string;
  descriptionFa: string;
  layout: MenuLayout;
  heading: MenuHeading;
  /** Corner rounding, in the same three steps the design system uses. */
  radius: 'sharp' | 'soft' | 'round';
  /** Vertical rhythm of the list. */
  density: 'compact' | 'comfortable' | 'airy';
  /** Whether the hero strip of featured products is worth showing. */
  showFeaturedRail: boolean;
  /** Price sizing: `loud` is the fast-food treatment. */
  price: 'inline' | 'loud';
  /** Applied when the owner picks the template; they can still override it. */
  defaultAccent: string;
  defaultTheme: 'dark' | 'light';
}

export const MENU_TEMPLATE_SPECS: Record<MenuTemplate, MenuTemplateSpec> = {
  [MenuTemplate.CLASSIC]: {
    id: MenuTemplate.CLASSIC,
    labelFa: 'کلاسیک',
    descriptionFa: 'تیره و آراسته، با عکس کوچک کنار هر آیتم. مناسب اغلب رستوران‌ها.',
    layout: 'list',
    heading: 'rule',
    radius: 'soft',
    density: 'comfortable',
    showFeaturedRail: true,
    price: 'inline',
    defaultAccent: '#C9A24B',
    defaultTheme: 'dark',
  },
  [MenuTemplate.TRADITIONAL]: {
    id: MenuTemplate.TRADITIONAL,
    labelFa: 'سنتی ایرانی',
    descriptionFa: 'گرم و زعفرانی با تیتر تزئینی. مناسب چلوکبابی، سفره‌خانه و بیرون‌بر سنتی.',
    layout: 'list',
    heading: 'ornament',
    radius: 'sharp',
    density: 'comfortable',
    showFeaturedRail: true,
    price: 'inline',
    defaultAccent: '#C2410C',
    defaultTheme: 'dark',
  },
  [MenuTemplate.CAFE]: {
    id: MenuTemplate.CAFE,
    labelFa: 'کافه',
    descriptionFa: 'دو ستونی و عکس‌محور. مناسب کافه تخصصی و براکفست.',
    layout: 'grid',
    heading: 'plain',
    radius: 'round',
    density: 'airy',
    showFeaturedRail: false,
    price: 'inline',
    defaultAccent: '#0F766E',
    defaultTheme: 'dark',
  },
  [MenuTemplate.FASTFOOD]: {
    id: MenuTemplate.FASTFOOD,
    labelFa: 'فست‌فود',
    descriptionFa: 'روشن و پرانرژی با عکس بزرگ و قیمت درشت. مناسب برگر، پیتزا و ساندویچ.',
    layout: 'gallery',
    heading: 'block',
    radius: 'round',
    density: 'compact',
    showFeaturedRail: true,
    price: 'loud',
    defaultAccent: '#DC2626',
    defaultTheme: 'light',
  },
  [MenuTemplate.MINIMAL]: {
    id: MenuTemplate.MINIMAL,
    labelFa: 'مینیمال',
    descriptionFa: 'بدون عکس، فقط تایپوگرافی و فضای خالی. مناسب منوی کوتاه و فاین‌داینینگ.',
    layout: 'text',
    heading: 'plain',
    radius: 'sharp',
    density: 'airy',
    showFeaturedRail: false,
    price: 'inline',
    defaultAccent: '#57534E',
    defaultTheme: 'light',
  },
};

export function menuTemplateSpec(value: string | null | undefined): MenuTemplateSpec {
  const key = (value ?? '') as MenuTemplate;
  return MENU_TEMPLATE_SPECS[key] ?? MENU_TEMPLATE_SPECS[MenuTemplate.CLASSIC];
}
