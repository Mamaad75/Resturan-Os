export { scopeCustomCss } from '@restaurant-os/types';
import type {
  MenuThemeConfig,
  ThemeFontFamily,
  ThemeRadius,
  ThemeSpacing,
} from '@restaurant-os/types';
import type { CSSProperties } from 'react';

/**
 * Turns a theme config into the CSS variables and class names the menu renders
 * with.
 *
 * One function, one place. The live menu and the admin preview both call it,
 * so a preview cannot drift from what a guest sees - and adding a knob means
 * editing here rather than hunting through JSX.
 */

const FONT_STACK: Record<ThemeFontFamily, string> = {
  vazirmatn: "'Vazirmatn Variable', Vazirmatn, system-ui, sans-serif",
  'vazirmatn-tight': "'Vazirmatn Variable', Vazirmatn, system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  // No web font is loaded for these: the two families Vazirmatn ships cover
  // Persian, and a serif request falls back to whatever the device has rather
  // than blocking first paint on a download.
  serif: "'Iranian Serif', Georgia, 'Times New Roman', serif",
  mono: "'Vazir Code', ui-monospace, SFMono-Regular, monospace",
};

const RADIUS_PX: Record<ThemeRadius, string> = {
  none: '0px',
  sm: '6px',
  md: '16px',
  lg: '24px',
  full: '32px',
};

const GAP: Record<ThemeSpacing, string> = {
  compact: '0.5rem',
  comfortable: '0.75rem',
  airy: '1rem',
};

const SECTION_GAP: Record<ThemeSpacing, string> = {
  compact: '1.5rem',
  comfortable: '2rem',
  airy: '2.75rem',
};

const CONTAINER: Record<MenuThemeConfig['layout']['containerWidth'], string> = {
  narrow: '32rem',
  standard: '48rem',
  wide: '64rem',
};

const BASE_SIZE: Record<MenuThemeConfig['typography']['baseSize'], string> = {
  sm: '0.875rem',
  md: '1rem',
  lg: '1.0625rem',
};

const WEIGHT: Record<MenuThemeConfig['typography']['headlineWeight'], string> = {
  normal: '400',
  medium: '600',
  bold: '800',
};

/** "#C9A24B" -> "201 162 75", the channel form the design tokens expect. */
export function hexToRgbChannels(hex: string): string | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/**
 * The theme as CSS custom properties.
 *
 * Overriding the existing design tokens (`--canvas`, `--gold`, ...) rather than
 * inventing a parallel set means every component already in the menu picks the
 * theme up without being rewritten.
 */
export function themeVariables(config: MenuThemeConfig): CSSProperties {
  const channels = (hex: string, fallback: string) =>
    hexToRgbChannels(hex) ?? fallback;

  return {
    '--canvas': channels(config.colors.background, '11 11 13'),
    '--surface': channels(config.colors.surface, '19 19 22'),
    '--surface-raised': channels(config.colors.surface, '26 26 31'),
    '--surface-sunken': channels(config.colors.background, '8 8 10'),
    '--ink': channels(config.colors.text, '245 245 244'),
    '--ink-muted': channels(config.colors.textMuted, '161 161 170'),
    '--ink-subtle': channels(config.colors.textMuted, '113 113 122'),
    '--line': channels(config.colors.border, '38 38 44'),
    '--line-strong': channels(config.colors.border, '56 56 64'),
    '--gold': channels(config.colors.primary, '201 162 75'),
    '--gold-bright': channels(config.colors.primary, '227 193 113'),
    '--gold-dim': channels(config.colors.secondary, '138 111 51'),
    // Menu-specific knobs the components below read.
    '--menu-radius': RADIUS_PX[config.layout.radius],
    '--menu-gap': GAP[config.layout.cardSpacing],
    '--menu-section-gap': SECTION_GAP[config.layout.sectionSpacing],
    '--menu-container': CONTAINER[config.layout.containerWidth],
    '--menu-font-body': FONT_STACK[config.typography.bodyFont],
    '--menu-font-headline': FONT_STACK[config.typography.headlineFont],
    '--menu-font-size': BASE_SIZE[config.typography.baseSize],
    '--menu-headline-weight': WEIGHT[config.typography.headlineWeight],
    '--menu-headline-tracking':
      config.typography.headlineFont === 'vazirmatn-tight' ? '-0.02em' : '0',
    fontFamily: FONT_STACK[config.typography.bodyFont],
    fontSize: BASE_SIZE[config.typography.baseSize],
  } as CSSProperties;
}

/* ------------------------------------------------------------------ */
/* Class-name resolution                                               */
/* ------------------------------------------------------------------ */

export interface ThemeClasses {
  productList: string;
  card: string;
  cardInner: string;
  heading: string;
  price: string;
  chipActive: string;
  chipIdle: string;
  button: string;
  imageAspect: string;
}

const CARD_STYLE: Record<MenuThemeConfig['layout']['cardStyle'], string> = {
  flat: 'bg-transparent',
  outlined: 'bg-surface',
  raised: 'bg-surface shadow-lifted',
  glass: 'glass',
};

const IMAGE_ASPECT: Record<MenuThemeConfig['layout']['imageRatio'], string> = {
  square: 'aspect-square',
  wide: 'aspect-[16/9]',
  portrait: 'aspect-[3/4]',
};

const HEADING_STYLE: Record<MenuThemeConfig['typography']['headingStyle'], string> = {
  rule: 'gold-rule mb-4 text-lg',
  ornament: 'menu-ornament mb-5 text-center text-xl tracking-wide',
  block:
    'mb-4 inline-block rounded-lg bg-gold px-3 py-1.5 text-base text-ink-inverse',
  plain: 'mb-4 text-lg tracking-tight',
};

const BUTTON_SHAPE: Record<MenuThemeConfig['buttons']['shape'], string> = {
  rounded: 'rounded-xl',
  pill: 'rounded-full',
  square: 'rounded-none',
};

const BUTTON_SIZE: Record<MenuThemeConfig['buttons']['size'], string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-3 text-sm',
  lg: 'px-5 py-4 text-base',
};

const BUTTON_WEIGHT: Record<MenuThemeConfig['buttons']['weight'], string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  bold: 'font-bold',
};

export function themeClasses(config: MenuThemeConfig): ThemeClasses {
  const { layout, productCard, typography, buttons } = config;

  const productList =
    layout.productLayout === 'grid'
      ? 'grid grid-cols-2 gap-[var(--menu-gap)]'
      : layout.productLayout === 'text'
        ? 'divide-y divide-line'
        : 'flex flex-col gap-[var(--menu-gap)]';

  const surface = CARD_STYLE[layout.cardStyle];
  const border = productCard.showBorder ? 'border border-line' : 'border-0';
  const shadow = productCard.showShadow ? 'shadow-lifted' : '';

  const card =
    layout.productLayout === 'text'
      ? 'flex w-full items-baseline gap-3 py-4 text-start'
      : layout.productLayout === 'list'
        ? `group flex w-full gap-4 p-3 text-start ${surface} ${border} ${shadow}`
        : `group flex w-full flex-col overflow-hidden text-start ${surface} ${border} ${shadow}`;

  return {
    productList,
    card,
    cardInner: 'flex flex-1 flex-col gap-1 p-3',
    heading: `${HEADING_STYLE[typography.headingStyle]} text-ink`,
    price:
      productCard.priceStyle === 'loud'
        ? 'text-lg font-extrabold text-gold'
        : productCard.priceStyle === 'badge'
          ? 'inline-flex items-center rounded-lg bg-gold/15 px-2 py-0.5 font-bold text-gold'
          : 'font-semibold text-gold',
    chipActive:
      layout.categoryNav === 'underline'
        ? 'border-b-2 border-gold text-ink'
        : layout.categoryNav === 'pills'
          ? 'rounded-full bg-gold px-4 py-2 font-bold text-ink-inverse'
          : 'rounded-full bg-gold px-4 py-2 text-ink-inverse',
    chipIdle:
      layout.categoryNav === 'underline'
        ? 'border-b-2 border-transparent text-ink-muted hover:text-ink'
        : 'rounded-full bg-surface-raised px-4 py-2 text-ink-muted hover:text-ink',
    button: `${BUTTON_SHAPE[buttons.shape]} ${BUTTON_SIZE[buttons.size]} ${BUTTON_WEIGHT[buttons.weight]}`,
    imageAspect: IMAGE_ASPECT[layout.imageRatio],
  };
}
