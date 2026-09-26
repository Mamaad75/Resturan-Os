'use client';

import {
  applyColorMode,
  hexToRgbChannels,
  type MenuThemeConfig,
} from '@restaurant-os/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useThemeMode } from '@/features/theme/theme-context';
import { themeService } from '@/services';

/**
 * The owner's panel, wearing the palette they designed for their menu.
 *
 * A restaurant that spent an afternoon choosing its colours should not then log
 * into somebody else's product. This takes the published menu theme and
 * applies its *colours* to the app shell - and only its colours. The layout
 * knobs (two-column products, airy spacing, ornamented headings) are decisions
 * about a menu; a sales report is not a menu, and inheriting those would make
 * the panel worse, not more personal.
 *
 * Applied as a stylesheet on :root rather than inline on a wrapper, because the
 * page background is painted by `body` and a wrapper cannot reach it.
 */
export function PanelTheme() {
  const { mode, chosen } = useThemeMode();

  const query = useQuery({
    queryKey: ['menu-theme', 'panel'],
    queryFn: () => themeService.get(),
    // The panel's palette is not something that changes while you work.
    staleTime: 10 * 60_000,
    // Every role can read the theme, but a failure here must never be the
    // reason somebody cannot see their orders.
    retry: false,
  });

  const config: MenuThemeConfig | null = useMemo(() => {
    const published = query.data?.config;
    if (!published) return null;
    // A viewer who flipped the day/night switch gets their choice; everyone
    // else gets the restaurant's own palette, exactly as the menu behaves.
    return chosen ? applyColorMode(published, mode) : published;
  }, [query.data, chosen, mode]);

  useEffect(() => {
    if (!config) return;

    const css = panelVariables(config);
    if (!css) return;

    const style = document.createElement('style');
    style.dataset.panelTheme = '1';
    style.textContent = `:root{${css}}`;
    document.head.append(style);
    return () => style.remove();
  }, [config]);

  return null;
}

/**
 * The colour half of a menu theme, as custom properties.
 *
 * A colour that will not parse is left out rather than defaulted: a palette
 * that is half the restaurant's and half ours is worse than ours.
 */
function panelVariables(config: MenuThemeConfig): string {
  const { colors } = config;
  const pairs: Array<[string, string | null]> = [
    ['--canvas', hexToRgbChannels(colors.background)],
    ['--surface', hexToRgbChannels(colors.surface)],
    ['--surface-raised', hexToRgbChannels(colors.surface)],
    ['--surface-sunken', hexToRgbChannels(colors.background)],
    ['--ink', hexToRgbChannels(colors.text)],
    ['--ink-muted', hexToRgbChannels(colors.textMuted)],
    ['--ink-subtle', hexToRgbChannels(colors.textMuted)],
    ['--line', hexToRgbChannels(colors.border)],
    ['--line-strong', hexToRgbChannels(colors.border)],
    ['--brand', hexToRgbChannels(colors.primary)],
    ['--brand-bright', hexToRgbChannels(colors.primary)],
    ['--brand-dim', hexToRgbChannels(colors.secondary)],
  ];

  return pairs
    .filter((pair): pair is [string, string] => pair[1] !== null)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
}
