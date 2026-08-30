import type { MenuLayout, MenuTemplateSpec } from '@restaurant-os/types';

/**
 * Turns a template descriptor into the class names the customer menu uses.
 *
 * Kept apart from the component so the admin preview and the live menu share
 * one interpretation of a template - a preview that renders from different
 * rules is worse than no preview.
 */
export interface TemplateStyles {
  /** The layout these styles were resolved for - may differ from the spec. */
  layout: MenuLayout;
  /** Grid/stack wrapper around the products of one category. */
  productList: string;
  /** The card itself. */
  card: string;
  /** Corner rounding for cards and images. */
  radius: string;
  /** Space between category sections. */
  section: string;
  /** Category heading. */
  heading: string;
  /** Price text. */
  price: string;
  /** Category chip in the sticky rail. */
  chipActive: string;
  chipIdle: string;
}

const RADIUS = {
  sharp: 'rounded-md',
  soft: 'rounded-2xl',
  round: 'rounded-3xl',
} as const;

const DENSITY = {
  compact: { list: 'gap-2', section: 'pt-6' },
  comfortable: { list: 'gap-3', section: 'pt-8' },
  airy: { list: 'gap-4', section: 'pt-10' },
} as const;

const HEADING = {
  // The gold hairline the design system already ships.
  rule: 'gold-rule mb-4 text-lg font-bold text-ink',
  // Centred, letterspaced, with a rule either side - the tea-house treatment.
  ornament: 'menu-ornament mb-5 text-center text-xl font-bold tracking-wide text-ink',
  // A solid accent bar, which is what a fast-food board looks like.
  block:
    'mb-4 inline-block rounded-lg bg-gold px-3 py-1.5 text-base font-extrabold text-ink-inverse',
  plain: 'mb-4 text-lg font-semibold tracking-tight text-ink',
} as const;

/**
 * The layout a section actually renders with.
 *
 * A photo-led template with no photos is a wall of empty frames - the worst
 * possible first impression for a restaurant that has just signed up and not
 * uploaded anything yet. Those sections fall back to the list, which needs no
 * image to look finished. Everything else about the template - colour,
 * heading, corners, price weight, density - still applies, so the owner's
 * choice is not silently discarded.
 */
export function effectiveLayout(
  spec: MenuTemplateSpec,
  sectionHasPhotos: boolean,
): MenuLayout {
  const needsPhotos = spec.layout === 'grid' || spec.layout === 'gallery';
  return needsPhotos && !sectionHasPhotos ? 'list' : spec.layout;
}

export function templateStyles(
  spec: MenuTemplateSpec,
  layout: MenuLayout = spec.layout,
): TemplateStyles {
  const radius = RADIUS[spec.radius];
  const density = DENSITY[spec.density];

  const productList =
    layout === 'grid'
      ? `grid grid-cols-2 ${density.list}`
      : layout === 'text'
        ? 'divide-y divide-line'
        : `flex flex-col ${density.list}`;

  const card =
    layout === 'text'
      ? 'flex w-full items-baseline gap-3 py-4 text-start'
      : layout === 'grid' || layout === 'gallery'
        ? `group flex w-full flex-col overflow-hidden border border-line bg-surface text-start ${radius}`
        : `group flex w-full gap-4 border border-line bg-surface p-3 text-start ${radius}`;

  return {
    layout,
    productList,
    card,
    radius,
    section: `${density.section} scroll-mt-32`,
    heading: HEADING[spec.heading],
    price:
      spec.price === 'loud'
        ? 'text-lg font-extrabold text-gold'
        : 'font-semibold text-gold',
    chipActive:
      spec.heading === 'block'
        ? 'bg-gold font-bold text-ink-inverse'
        : 'bg-gold text-ink-inverse',
    chipIdle: 'bg-surface-raised text-ink-muted hover:text-ink',
  };
}

/** "#C9A24B" -> "201 162 75", the channel form the CSS tokens expect. */
export function hexToRgbChannels(hex: string): string | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}
