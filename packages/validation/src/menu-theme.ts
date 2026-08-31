import { z } from 'zod';
import { MENU_TEMPLATES } from '@restaurant-os/types';
import { hexColorSchema, optionalText } from './primitives';

/**
 * The theme configuration, validated field by field.
 *
 * Every value is a closed enum or a hex colour - nothing here is free text
 * that reaches the browser unescaped. That is deliberate: the config is
 * rendered into inline styles on a public page, so an open string field would
 * be a style-injection vector.
 */

const enumOf = <T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.enum(values, { errorMap: () => ({ message: `${label} معتبر نیست.` }) });

export const themeColorsSchema = z
  .object({
    background: hexColorSchema,
    surface: hexColorSchema,
    text: hexColorSchema,
    textMuted: hexColorSchema,
    primary: hexColorSchema,
    secondary: hexColorSchema,
    border: hexColorSchema,
  })
  .partial();

export const themeTypographySchema = z
  .object({
    headlineFont: enumOf(
      ['vazirmatn', 'vazirmatn-tight', 'system', 'serif', 'mono'],
      'فونت تیتر',
    ),
    bodyFont: enumOf(
      ['vazirmatn', 'vazirmatn-tight', 'system', 'serif', 'mono'],
      'فونت متن',
    ),
    baseSize: enumOf(['sm', 'md', 'lg'], 'اندازه فونت'),
    headlineWeight: enumOf(['normal', 'medium', 'bold'], 'وزن تیتر'),
    headingStyle: enumOf(['rule', 'ornament', 'block', 'plain'], 'سبک تیتر'),
  })
  .partial();

export const themeLayoutSchema = z
  .object({
    productLayout: enumOf(['list', 'grid', 'gallery', 'text'], 'چیدمان محصول'),
    imageRatio: enumOf(['square', 'wide', 'portrait'], 'نسبت تصویر'),
    cardStyle: enumOf(['flat', 'outlined', 'raised', 'glass'], 'سبک کارت'),
    radius: enumOf(['none', 'sm', 'md', 'lg', 'full'], 'گردی گوشه'),
    cardSpacing: enumOf(['compact', 'comfortable', 'airy'], 'فاصله کارت‌ها'),
    sectionSpacing: enumOf(['compact', 'comfortable', 'airy'], 'فاصله بخش‌ها'),
    containerWidth: enumOf(['narrow', 'standard', 'wide'], 'عرض صفحه'),
    categoryNav: enumOf(['chips', 'underline', 'pills', 'dropdown'], 'ناوبری دسته'),
  })
  .partial();

export const themeProductCardSchema = z
  .object({
    showImage: z.boolean(),
    showDescription: z.boolean(),
    priceStyle: enumOf(['inline', 'loud', 'badge'], 'سبک قیمت'),
    badgeStyle: enumOf(['soft', 'solid', 'outline'], 'سبک برچسب'),
    showAddButton: z.boolean(),
    showShadow: z.boolean(),
    showBorder: z.boolean(),
  })
  .partial();

export const themeHeaderSchema = z
  .object({
    showCover: z.boolean(),
    logoPlacement: enumOf(['start', 'center', 'hidden'], 'جایگاه لوگو'),
    showTagline: z.boolean(),
    showBranchInfo: z.boolean(),
    showStatusBadges: z.boolean(),
    stickyCategoryNav: z.boolean(),
  })
  .partial();

export const themeButtonsSchema = z
  .object({
    shape: enumOf(['rounded', 'pill', 'square'], 'شکل دکمه'),
    size: enumOf(['sm', 'md', 'lg'], 'اندازه دکمه'),
    weight: enumOf(['normal', 'medium', 'bold'], 'وزن دکمه'),
  })
  .partial();

export const themeFooterSchema = z
  .object({
    show: z.boolean(),
    text: optionalText(160, 'متن فوتر'),
    showPlatformCredit: z.boolean(),
  })
  .partial();

export const menuThemeConfigSchema = z
  .object({
    colors: themeColorsSchema,
    typography: themeTypographySchema,
    layout: themeLayoutSchema,
    productCard: themeProductCardSchema,
    header: themeHeaderSchema,
    buttons: themeButtonsSchema,
    footer: themeFooterSchema,
    showFeaturedRail: z.boolean(),
  })
  .partial()
  .strict();
export type MenuThemeConfigInput = z.infer<typeof menuThemeConfigSchema>;

/**
 * Custom CSS.
 *
 * Rejects the constructs that turn a stylesheet into script execution or a
 * data-exfiltration channel. The renderer additionally scopes every rule to
 * the menu container, so even accepted CSS cannot reach the admin UI.
 */
export const customCssSchema = z
  .string()
  .max(20_000, 'CSS اختصاصی حداکثر ۲۰۰۰۰ کاراکتر است.')
  .refine((css) => !/<\s*\/?\s*(script|iframe|object|embed)/i.test(css), {
    message: 'استفاده از تگ HTML در CSS مجاز نیست.',
  })
  .refine((css) => !/javascript\s*:/i.test(css), {
    message: 'آدرس javascript: در CSS مجاز نیست.',
  })
  .refine((css) => !/expression\s*\(/i.test(css), {
    message: 'استفاده از expression() مجاز نیست.',
  })
  .refine((css) => !/@import/i.test(css), {
    message: 'استفاده از @import مجاز نیست.',
  })
  .refine((css) => !/behavior\s*:/i.test(css), {
    message: 'استفاده از behavior: مجاز نیست.',
  })
  .refine((css) => !/url\s*\(\s*['"]?\s*(data|javascript|vbscript)\s*:/i.test(css), {
    message: 'آدرس درون‌خطی در url() مجاز نیست.',
  });

export const updateMenuThemeSchema = z.object({
  preset: z.enum(MENU_TEMPLATES as [string, ...string[]]).optional(),
  config: menuThemeConfigSchema.optional(),
  customCss: z.union([customCssSchema, z.literal(''), z.null()]).optional(),
  /** Write straight to the live menu instead of the draft. */
  publish: z.boolean().optional(),
});
export type UpdateMenuThemeInput = z.infer<typeof updateMenuThemeSchema>;
