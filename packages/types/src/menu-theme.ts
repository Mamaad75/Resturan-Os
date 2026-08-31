import { MenuTemplate, MENU_TEMPLATE_SPECS, menuTemplateSpec } from './menu-templates';

/**
 * The customer menu's full appearance, as data.
 *
 * Every knob the customizer exposes lives here, and the renderer reads only
 * from here. That is what keeps the menu from becoming a pile of per-template
 * conditionals: a template is just a named set of these values, and the owner's
 * edits are the same values with different contents.
 *
 * Every field is required in the resolved form. The API stores a partial and
 * `resolveTheme` fills the gaps from the preset, so adding a knob never breaks
 * a theme somebody saved last month.
 */

export type ThemeProductLayout = 'list' | 'grid' | 'gallery' | 'text';
export type ThemeImageRatio = 'square' | 'wide' | 'portrait';
export type ThemeCardStyle = 'flat' | 'outlined' | 'raised' | 'glass';
export type ThemeRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';
export type ThemeSpacing = 'compact' | 'comfortable' | 'airy';
export type ThemeWidth = 'narrow' | 'standard' | 'wide';
export type ThemeNavStyle = 'chips' | 'underline' | 'pills' | 'dropdown';
export type ThemeHeadingStyle = 'rule' | 'ornament' | 'block' | 'plain';
export type ThemePriceStyle = 'inline' | 'loud' | 'badge';
export type ThemeBadgeStyle = 'soft' | 'solid' | 'outline';
export type ThemeButtonShape = 'rounded' | 'pill' | 'square';
export type ThemeButtonSize = 'sm' | 'md' | 'lg';
export type ThemeLogoPlacement = 'start' | 'center' | 'hidden';
export type ThemeFontFamily =
  | 'vazirmatn'
  | 'vazirmatn-tight'
  | 'system'
  | 'serif'
  | 'mono';
export type ThemeFontSize = 'sm' | 'md' | 'lg';
export type ThemeFontWeight = 'normal' | 'medium' | 'bold';

export interface ThemeColors {
  /** Page background. */
  background: string;
  /** Card and panel surface. */
  surface: string;
  /** Primary body text. */
  text: string;
  /** Secondary text: descriptions, meta. */
  textMuted: string;
  /** Buttons, active states, prices. */
  primary: string;
  /** Supporting accent: badges, highlights. */
  secondary: string;
  /** Borders and rules. */
  border: string;
}

export interface ThemeTypography {
  headlineFont: ThemeFontFamily;
  bodyFont: ThemeFontFamily;
  baseSize: ThemeFontSize;
  headlineWeight: ThemeFontWeight;
  headingStyle: ThemeHeadingStyle;
}

export interface ThemeLayout {
  productLayout: ThemeProductLayout;
  imageRatio: ThemeImageRatio;
  cardStyle: ThemeCardStyle;
  radius: ThemeRadius;
  cardSpacing: ThemeSpacing;
  sectionSpacing: ThemeSpacing;
  containerWidth: ThemeWidth;
  categoryNav: ThemeNavStyle;
}

export interface ThemeProductCard {
  showImage: boolean;
  showDescription: boolean;
  priceStyle: ThemePriceStyle;
  badgeStyle: ThemeBadgeStyle;
  showAddButton: boolean;
  showShadow: boolean;
  showBorder: boolean;
}

export interface ThemeHeader {
  showCover: boolean;
  logoPlacement: ThemeLogoPlacement;
  showTagline: boolean;
  showBranchInfo: boolean;
  showStatusBadges: boolean;
  stickyCategoryNav: boolean;
}

export interface ThemeButtons {
  shape: ThemeButtonShape;
  size: ThemeButtonSize;
  weight: ThemeFontWeight;
}

export interface ThemeFooter {
  show: boolean;
  text: string | null;
  /** Hiding the FoodOS credit is a paid feature; enforced server-side. */
  showPlatformCredit: boolean;
}

export interface MenuThemeConfig {
  colors: ThemeColors;
  typography: ThemeTypography;
  layout: ThemeLayout;
  productCard: ThemeProductCard;
  header: ThemeHeader;
  buttons: ThemeButtons;
  footer: ThemeFooter;
  /** Featured-products strip at the top of the menu. */
  showFeaturedRail: boolean;
}

/** A saved theme: which preset it started from, plus the owner's overrides. */
export interface MenuThemeDto {
  preset: MenuTemplate;
  /** Fully resolved config a renderer can use directly. */
  config: MenuThemeConfig;
  /** Only the fields the owner actually changed, for "reset to preset". */
  overrides: DeepPartial<MenuThemeConfig>;
  customCss: string | null;
  hasDraft: boolean;
  publishedAt: string | null;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/* ------------------------------------------------------------------ */
/* Preset defaults                                                     */
/* ------------------------------------------------------------------ */

const DARK: ThemeColors = {
  background: '#0B0B0D',
  surface: '#131316',
  text: '#F5F5F4',
  textMuted: '#A1A1AA',
  primary: '#C9A24B',
  secondary: '#8A6F33',
  border: '#26262C',
};

const LIGHT: ThemeColors = {
  background: '#FAFAF9',
  surface: '#FFFFFF',
  text: '#18181B',
  textMuted: '#52525B',
  primary: '#A17C2A',
  secondary: '#D6BD85',
  border: '#E4E4E7',
};

function baseConfig(colors: ThemeColors): MenuThemeConfig {
  return {
    colors: { ...colors },
    typography: {
      headlineFont: 'vazirmatn',
      bodyFont: 'vazirmatn',
      baseSize: 'md',
      headlineWeight: 'bold',
      headingStyle: 'rule',
    },
    layout: {
      productLayout: 'list',
      imageRatio: 'square',
      cardStyle: 'outlined',
      radius: 'md',
      cardSpacing: 'comfortable',
      sectionSpacing: 'comfortable',
      containerWidth: 'standard',
      categoryNav: 'chips',
    },
    productCard: {
      showImage: true,
      showDescription: true,
      priceStyle: 'inline',
      badgeStyle: 'soft',
      showAddButton: true,
      showShadow: false,
      showBorder: true,
    },
    header: {
      showCover: true,
      logoPlacement: 'start',
      showTagline: true,
      showBranchInfo: true,
      showStatusBadges: true,
      stickyCategoryNav: true,
    },
    buttons: { shape: 'rounded', size: 'md', weight: 'medium' },
    footer: { show: true, text: null, showPlatformCredit: true },
    showFeaturedRail: true,
  };
}

/**
 * The five shipped presets, expressed in the same shape an owner edits.
 *
 * These are the starting designs, not a separate rendering path - picking a
 * preset simply loads these values, and every one of them stays editable.
 */
export const MENU_THEME_PRESETS: Record<MenuTemplate, MenuThemeConfig> = {
  [MenuTemplate.CLASSIC]: baseConfig(DARK),

  [MenuTemplate.TRADITIONAL]: {
    ...baseConfig({ ...DARK, primary: '#C2410C', secondary: '#7C2D12' }),
    typography: {
      headlineFont: 'serif',
      bodyFont: 'vazirmatn',
      baseSize: 'md',
      headlineWeight: 'bold',
      headingStyle: 'ornament',
    },
    layout: {
      ...baseConfig(DARK).layout,
      radius: 'sm',
      productLayout: 'list',
      categoryNav: 'pills',
    },
  },

  [MenuTemplate.CAFE]: {
    ...baseConfig({ ...DARK, primary: '#0F766E', secondary: '#134E4A' }),
    typography: {
      headlineFont: 'vazirmatn-tight',
      bodyFont: 'vazirmatn',
      baseSize: 'md',
      headlineWeight: 'medium',
      headingStyle: 'plain',
    },
    layout: {
      ...baseConfig(DARK).layout,
      productLayout: 'grid',
      radius: 'lg',
      cardSpacing: 'airy',
      sectionSpacing: 'airy',
      categoryNav: 'chips',
    },
    productCard: { ...baseConfig(DARK).productCard, showShadow: true },
    showFeaturedRail: false,
  },

  [MenuTemplate.FASTFOOD]: {
    ...baseConfig({ ...LIGHT, primary: '#DC2626', secondary: '#991B1B' }),
    typography: {
      headlineFont: 'vazirmatn',
      bodyFont: 'vazirmatn',
      baseSize: 'lg',
      headlineWeight: 'bold',
      headingStyle: 'block',
    },
    layout: {
      ...baseConfig(LIGHT).layout,
      productLayout: 'gallery',
      imageRatio: 'wide',
      radius: 'lg',
      cardSpacing: 'compact',
      sectionSpacing: 'compact',
      categoryNav: 'pills',
    },
    productCard: {
      ...baseConfig(LIGHT).productCard,
      priceStyle: 'loud',
      badgeStyle: 'solid',
      showShadow: true,
    },
    buttons: { shape: 'pill', size: 'lg', weight: 'bold' },
  },

  [MenuTemplate.MINIMAL]: {
    ...baseConfig({ ...LIGHT, primary: '#57534E', secondary: '#A8A29E' }),
    typography: {
      headlineFont: 'vazirmatn-tight',
      bodyFont: 'vazirmatn',
      baseSize: 'md',
      headlineWeight: 'medium',
      headingStyle: 'plain',
    },
    layout: {
      ...baseConfig(LIGHT).layout,
      productLayout: 'text',
      cardStyle: 'flat',
      radius: 'none',
      cardSpacing: 'airy',
      sectionSpacing: 'airy',
      containerWidth: 'narrow',
      categoryNav: 'underline',
    },
    productCard: {
      ...baseConfig(LIGHT).productCard,
      showImage: false,
      showAddButton: false,
      showBorder: false,
    },
    header: { ...baseConfig(LIGHT).header, showCover: false },
    showFeaturedRail: false,
  },
};

export function presetConfig(preset: string | null | undefined): MenuThemeConfig {
  return MENU_THEME_PRESETS[menuTemplateSpec(preset).id];
}

/**
 * Preset defaults + the owner's overrides, merged one level into each section.
 *
 * A missing section or a missing knob falls back to the preset, so a theme
 * saved before a knob existed keeps rendering and simply picks up the new
 * default.
 */
export function resolveTheme(
  preset: string | null | undefined,
  overrides: DeepPartial<MenuThemeConfig> | null | undefined,
): MenuThemeConfig {
  const base = presetConfig(preset);
  if (!overrides) return base;

  return {
    colors: { ...base.colors, ...clean(overrides.colors) },
    typography: { ...base.typography, ...clean(overrides.typography) },
    layout: { ...base.layout, ...clean(overrides.layout) },
    productCard: { ...base.productCard, ...clean(overrides.productCard) },
    header: { ...base.header, ...clean(overrides.header) },
    buttons: { ...base.buttons, ...clean(overrides.buttons) },
    footer: { ...base.footer, ...clean(overrides.footer) },
    showFeaturedRail: overrides.showFeaturedRail ?? base.showFeaturedRail,
  };
}

/** Drops undefined keys so they never shadow a preset value with `undefined`. */
function clean<T extends object>(value: DeepPartial<T> | undefined): Partial<T> {
  if (!value) return {};
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key] = v;
  }
  return out as Partial<T>;
}

/** Only the fields that actually differ from the preset. */
export function diffFromPreset(
  preset: string | null | undefined,
  config: MenuThemeConfig,
): DeepPartial<MenuThemeConfig> {
  const base = presetConfig(preset);
  const out: Record<string, unknown> = {};

  for (const section of Object.keys(base) as Array<keyof MenuThemeConfig>) {
    const baseValue = base[section];
    const nextValue = config[section];
    if (typeof baseValue !== 'object' || baseValue === null) {
      if (baseValue !== nextValue) out[section] = nextValue;
      continue;
    }
    const changed: Record<string, unknown> = {};
    const baseSection = baseValue as unknown as Record<string, unknown>;
    const nextSection = nextValue as unknown as Record<string, unknown>;
    for (const key of Object.keys(baseSection)) {
      if (baseSection[key] !== nextSection[key]) changed[key] = nextSection[key];
    }
    if (Object.keys(changed).length > 0) out[section] = changed;
  }
  return out as DeepPartial<MenuThemeConfig>;
}

export { MENU_TEMPLATE_SPECS };
