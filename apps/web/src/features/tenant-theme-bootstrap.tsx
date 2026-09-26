'use client';

import { applyColorMode, configMode } from '@restaurant-os/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { themeVariables } from '@/features/customer/theme-runtime';
import { useThemeMode } from '@/features/theme/theme-context';
import { themeService } from '@/services';

const TOKEN_KEYS = [
  '--canvas',
  '--surface',
  '--surface-raised',
  '--surface-sunken',
  '--ink',
  '--ink-muted',
  '--ink-subtle',
  '--ink-inverse',
  '--line',
  '--line-strong',
  '--brand',
  '--brand-bright',
  '--brand-dim',
  '--menu-radius',
  '--menu-gap',
  '--menu-section-gap',
  '--menu-container',
  '--menu-font-body',
  '--menu-font-headline',
  '--menu-font-size',
  '--menu-headline-weight',
  '--menu-headline-tracking',
] as const;

/**
 * Applies each restaurant's own appearance to every authenticated surface:
 * admin, POS and KDS. A staff member who explicitly uses the light/dark toggle
 * keeps the restaurant's brand colours while the neutral palette is converted
 * to the requested mode.
 */
export function TenantThemeBootstrap() {
  const { status } = useAuth();
  const { mode, chosen } = useThemeMode();
  const themeQuery = useQuery({
    queryKey: ['menu-theme'],
    queryFn: () => themeService.get(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });

  const resolved = useMemo(() => {
    if (!themeQuery.data) return null;
    const ownMode = configMode(themeQuery.data.config);
    const effectiveMode = chosen ? mode : ownMode;
    return {
      config: applyColorMode(themeQuery.data.config, effectiveMode),
      mode: effectiveMode,
    };
  }, [themeQuery.data, mode, chosen]);

  useEffect(() => {
    const root = document.documentElement;
    if (!resolved) return;

    const variables = themeVariables(resolved.config) as unknown as Record<string, string | number | undefined>;
    for (const key of TOKEN_KEYS) {
      const value = key === '--ink-inverse'
        ? (resolved.mode === 'light' ? '255 255 255' : '11 11 13')
        : variables[key];
      if (value !== undefined) root.style.setProperty(key, String(value));
    }

    if (variables.fontFamily) root.style.fontFamily = String(variables.fontFamily);
    if (variables.fontSize) root.style.fontSize = String(variables.fontSize);
    root.style.colorScheme = resolved.mode;
    root.dataset.restaurantTheme = '1';

    return () => {
      for (const key of TOKEN_KEYS) root.style.removeProperty(key);
      root.style.removeProperty('font-family');
      root.style.removeProperty('font-size');
      root.style.removeProperty('color-scheme');
      delete root.dataset.restaurantTheme;
    };
  }, [resolved]);

  return null;
}
