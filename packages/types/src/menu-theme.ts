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

/*
 * The two neutral bases every preset starts from.
 *
 * Both are warm rather than blue-grey, because food photography sits badly on
 * a cold surface, and neither carries gold: the accent is a per-preset choice
 * and the owner's first edit, not a house style baked into the neutrals.
 */
const LIGHT: ThemeColors = {
  background: '#FAFAF7',
  surface: '#FFFFFF',
  text: '#1A1A18',
  textMuted: '#5B5B56',
  primary: '#0D7666',
  secondary: '#0A5A4E',
  border: '#E5E4DE',
};

const DARK: ThemeColors = {
  background: '#141517',
  surface: '#1C1E21',
  text: '#F0F1EF',
  textMuted: '#A4A6A3',
  primary: '#2DB29A',
  secondary: '#186054',
  border: '#2D3034',
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
  [MenuTemplate.CLASSIC]: baseConfig(LIGHT),

  [MenuTemplate.TRADITIONAL]: {
    ...baseConfig({ ...LIGHT, primary: '#B4460F', secondary: '#7C2D12' }),
    typography: {
      headlineFont: 'serif',
      bodyFont: 'vazirmatn',
      baseSize: 'md',
      headlineWeight: 'bold',
      headingStyle: 'ornament',
    },
    layout: {
      ...baseConfig(LIGHT).layout,
      radius: 'sm',
      productLayout: 'list',
      categoryNav: 'pills',
    },
  },

  [MenuTemplate.CAFE]: {
    ...baseConfig({ ...DARK, primary: '#C2925F', secondary: '#7A5236' }),
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

/**
 * Scopes tenant CSS to the menu container.
 *
 * Every selector is prefixed with `#foodos-menu`, so a rule the restaurant
 * wrote cannot reach the admin shell, another tenant's page, or anything
 * outside their own menu - even if they wrote `body { display: none }`.
 * The validation layer has already rejected script-bearing constructs; this is
 * the containment half of the same job.
 */
export function scopeCustomCss(css: string | null | undefined): string {
  if (!css) return '';
  const SCOPE = '#foodos-menu';

  return (
    css
      // Strip comments first so a commented-out brace cannot confuse the split.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}')
      .map((block) => {
        const [rawSelector, ...rest] = block.split('{');
        if (rest.length === 0) return '';
        const body = rest.join('{').trim();
        if (!body) return '';

        const selectors = rawSelector
          .split(',')
          .map((selector) => selector.trim())
          .filter(Boolean)
          .map((selector) => {
            // An at-rule keeps its own syntax; its inner rules are already
            // scoped because the whole block sits inside the scoped sheet.
            if (selector.startsWith('@')) return selector;
            // Targeting the page itself means targeting the menu container.
            if (/^(html|body|:root)$/i.test(selector)) return SCOPE;
            return `${SCOPE} ${selector}`;
          });

        return `${selectors.join(', ')} { ${body} }`;
      })
      .filter(Boolean)
      .join('\n')
  );
}

/* ------------------------------------------------------------------ */
/* Colour mode                                                         */
/* ------------------------------------------------------------------ */

/** "#0D7666" -> "13 118 102", the channel form the design tokens expect. */
export function hexToRgbChannels(hex: string): string | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

function channels(hex: string): [number, number, number] | null {
  const raw = hexToRgbChannels(hex);
  if (!raw) return null;
  const [r, g, b] = raw.split(' ').map(Number);
  return [r, g, b];
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = channels(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Whether a colour reads as light, which decides the token set to use. */
export function isLightColor(hex: string): boolean {
  return luminance(hex) > 0.5;
}

/** Which mode a theme's own palette already is. */
export function configMode(config: MenuThemeConfig): ThemeMode {
  return isLightColor(config.colors.background) ? 'light' : 'dark';
}

export type ThemeMode = 'dark' | 'light';

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Move a colour toward white (amount > 0) or black (amount < 0). */
function shift(hex: string, amount: number): string {
  const rgb = channels(hex);
  if (!rgb) return hex;
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(
    rgb[0] + (target - rgb[0]) * t,
    rgb[1] + (target - rgb[1]) * t,
    rgb[2] + (target - rgb[2]) * t,
  );
}

/**
 * The neutral ramp for each mode.
 *
 * Deliberately fixed rather than derived: a restaurant picks a brand colour,
 * not seven greys, and letting the greys drift per-tenant is how a menu ends
 * up with unreadable body text.
 */
const NEUTRALS: Record<ThemeMode, Omit<ThemeColors, 'primary' | 'secondary'>> = {
  dark: {
    background: '#141517',
    surface: '#1c1e21',
    text: '#f0f1ef',
    textMuted: '#a4a6a3',
    border: '#2d3034',
  },
  light: {
    background: '#fafaf7',
    surface: '#ffffff',
    text: '#1a1a18',
    textMuted: '#5b5b56',
    border: '#e5e4de',
  },
};

/**
 * Re-render a theme in the requested light/dark mode.
 *
 * The brand colours survive the switch - a guest flipping to light mode is
 * asking for a readable page, not for a different restaurant. Only the neutral
 * ramp is replaced, and the accent is nudged if it would fail against the new
 * background: a pale gold that reads well on charcoal is unreadable on white.
 *
 * Returns the config untouched when it is already in the requested mode, so
 * the restaurant's own hand-picked palette is never second-guessed.
 */
/*
 * Accents carry price text, not just fills, so they need real separation from
 * the background. A pale sand that reads well on charcoal is washed out on
 * white at anything less than this.
 */
const MIN_ACCENT_GAP = 0.45;

/**
 * An accent nudged until it can be read on the given mode's background.
 *
 * Shared by the mode switch and by the palette builder, so a colour chosen in
 * the customizer and the same colour after a guest flips to dark mode are
 * treated by one rule rather than two that drift apart.
 */
export function readableAccent(hex: string, mode: ThemeMode): string {
  const backgroundLum = luminance(NEUTRALS[mode].background);
  if (Math.abs(luminance(hex) - backgroundLum) >= MIN_ACCENT_GAP) return hex;
  return mode === 'light' ? shift(hex, -0.35) : shift(hex, 0.35);
}

/**
 * A whole palette from one colour.
 *
 * The customizer's seven colour fields are the right tool for someone who
 * knows what a surface token is, and the wrong first question for a café owner
 * who knows their sign is green. This turns that one answer into a coherent
 * palette: the fixed neutral ramp for the mode, the brand colour nudged until
 * it is readable on it, and a deeper shade of the same hue for the secondary.
 *
 * The owner can still edit any of the seven afterwards - this writes values,
 * it does not lock them.
 */
export function paletteFromBrand(brand: string, mode: ThemeMode): ThemeColors {
  const primary = readableAccent(brand, mode);
  return {
    ...NEUTRALS[mode],
    primary,
    // A shade rather than a second hue: two unrelated accents is how a menu
    // starts looking like a fairground.
    secondary: shift(primary, mode === 'light' ? -0.25 : 0.25),
  };
}

/**
 * Brand colours offered as swatches.
 *
 * A short list of colours that are readable in both modes and that a
 * restaurant plausibly already owns, because an empty colour picker is a
 * worse question than five good answers.
 */
export const BRAND_SWATCHES: Array<{ hex: string; labelFa: string }> = [
  { hex: '#0d7666', labelFa: 'سبز' },
  { hex: '#b4460f', labelFa: 'نارنجی سوخته' },
  { hex: '#7a5236', labelFa: 'قهوه‌ای' },
  { hex: '#b91c3c', labelFa: 'قرمز' },
  { hex: '#1d4ed8', labelFa: 'آبی' },
  { hex: '#6d28d9', labelFa: 'بنفش' },
  { hex: '#57534e', labelFa: 'خاکستری' },
];

export function applyColorMode(
  config: MenuThemeConfig,
  mode: ThemeMode,
): MenuThemeConfig {
  if (configMode(config) === mode) return config;

  return {
    ...config,
    colors: {
      ...NEUTRALS[mode],
      primary: readableAccent(config.colors.primary, mode),
      secondary: readableAccent(config.colors.secondary, mode),
    },
  };
}
