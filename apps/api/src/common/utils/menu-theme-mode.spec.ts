import {
  applyColorMode,
  configMode,
  isLightColor,
  luminance,
  presetConfig,
  type MenuThemeConfig,
} from '@restaurant-os/types';

/**
 * The guest-facing light/dark switch.
 *
 * These pin the two properties the switch is judged on: the restaurant's brand
 * colour survives the flip, and whatever survives stays readable against the
 * new background.
 */
describe('menu theme colour mode', () => {
  // CAFE is the shipped dark preset. CLASSIC, the default, is light - see the
  // assertion below, which is the one that would catch a palette drifting back
  // towards the dark-and-gold default this product deliberately left behind.
  const dark = presetConfig('CAFE');

  it('ships a light default preset', () => {
    const classic = presetConfig('CLASSIC');
    expect(configMode(classic)).toBe('light');
    expect(isLightColor(classic.colors.background)).toBe(true);
    expect(isLightColor(classic.colors.text)).toBe(false);
  });

  it('reads a dark preset as dark', () => {
    expect(configMode(dark)).toBe('dark');
    expect(isLightColor(dark.colors.background)).toBe(false);
  });

  it('returns the same object when already in the requested mode', () => {
    expect(applyColorMode(dark, 'dark')).toBe(dark);
  });

  it('swaps the neutral ramp when flipped to light', () => {
    const light = applyColorMode(dark, 'light');
    expect(configMode(light)).toBe('light');
    expect(isLightColor(light.colors.background)).toBe(true);
    expect(isLightColor(light.colors.surface)).toBe(true);
    // Text has to invert with it, or the menu is white on white.
    expect(isLightColor(light.colors.text)).toBe(false);
  });

  it('leaves everything but the colours alone', () => {
    const light = applyColorMode(dark, 'light');
    expect(light.layout).toEqual(dark.layout);
    expect(light.typography).toEqual(dark.typography);
    expect(light.header).toEqual(dark.header);
    expect(light.buttons).toEqual(dark.buttons);
    expect(light.footer).toEqual(dark.footer);
    expect(light.productCard).toEqual(dark.productCard);
  });

  it('keeps a brand accent that is already readable', () => {
    // Deep teal: dark enough to stand out on a pale background untouched.
    const config: MenuThemeConfig = {
      ...dark,
      colors: { ...dark.colors, primary: '#0f766e' },
    };
    expect(applyColorMode(config, 'light').colors.primary).toBe('#0f766e');
  });

  it('darkens an accent that would wash out on a light background', () => {
    // A pale sand that reads well on charcoal and vanishes on paper.
    const config: MenuThemeConfig = {
      ...dark,
      colors: { ...dark.colors, primary: '#e3c171' },
    };
    const primary = applyColorMode(config, 'light').colors.primary;
    expect(primary).not.toBe('#e3c171');
    expect(luminance(primary)).toBeLessThan(luminance('#e3c171'));
  });

  it('lightens an accent that would disappear on a dark background', () => {
    const lightConfig = applyColorMode(dark, 'light');
    const navyAccent: MenuThemeConfig = {
      ...lightConfig,
      colors: { ...lightConfig.colors, primary: '#101a3a' },
    };
    const primary = applyColorMode(navyAccent, 'dark').colors.primary;
    expect(luminance(primary)).toBeGreaterThan(luminance('#101a3a'));
  });

  it('always clears the readability bar it sets for itself', () => {
    // Every preset, both directions - no palette gets an unreadable accent.
    for (const preset of ['CLASSIC', 'TRADITIONAL', 'CAFE', 'FASTFOOD', 'MINIMAL']) {
      const base = presetConfig(preset);
      for (const mode of ['dark', 'light'] as const) {
        const next = applyColorMode(base, mode);
        if (configMode(base) === mode) continue;
        const gap = Math.abs(
          luminance(next.colors.primary) - luminance(next.colors.background),
        );
        expect(gap).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  it('round-trips back to a palette in the original mode', () => {
    const there = applyColorMode(dark, 'light');
    const back = applyColorMode(there, 'dark');
    expect(configMode(back)).toBe('dark');
  });
});
