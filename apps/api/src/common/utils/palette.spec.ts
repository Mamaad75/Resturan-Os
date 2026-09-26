import {
  BRAND_SWATCHES,
  configMode,
  isLightColor,
  luminance,
  paletteFromBrand,
  readableAccent,
} from '@restaurant-os/types';

/**
 * Building a whole palette from one colour.
 *
 * This is the question a café owner is actually asked - "what colour is your
 * sign?" - so the answer has to be safe for every colour they might give,
 * including the ones that would be unreadable if taken literally.
 */
describe('paletteFromBrand', () => {
  it('builds a light palette that is light', () => {
    const palette = paletteFromBrand('#0d7666', 'light');
    expect(isLightColor(palette.background)).toBe(true);
    expect(isLightColor(palette.surface)).toBe(true);
    // Text has to go the other way, or the menu is white on white.
    expect(isLightColor(palette.text)).toBe(false);
  });

  it('builds a dark palette that is dark', () => {
    const palette = paletteFromBrand('#0d7666', 'dark');
    expect(isLightColor(palette.background)).toBe(false);
    expect(isLightColor(palette.text)).toBe(true);
  });

  it('keeps a brand colour that is already readable', () => {
    expect(paletteFromBrand('#0d7666', 'light').primary).toBe('#0d7666');
  });

  it('darkens a pale brand colour asked for on paper', () => {
    // Someone types the pale mint from their napkins.
    const palette = paletteFromBrand('#bfe9df', 'light');
    expect(palette.primary).not.toBe('#bfe9df');
    expect(luminance(palette.primary)).toBeLessThan(luminance('#bfe9df'));
  });

  it('lightens a near-black brand colour asked for on charcoal', () => {
    const palette = paletteFromBrand('#101010', 'dark');
    expect(luminance(palette.primary)).toBeGreaterThan(luminance('#101010'));
  });

  it('derives the secondary as a shade of the primary, not a new hue', () => {
    const palette = paletteFromBrand('#b4460f', 'light');
    expect(palette.secondary).not.toBe(palette.primary);
    // Darker on paper, so it reads as the same colour with more weight.
    expect(luminance(palette.secondary)).toBeLessThan(luminance(palette.primary));
  });

  it('gives every shipped swatch a readable palette in both modes', () => {
    for (const swatch of BRAND_SWATCHES) {
      for (const mode of ['light', 'dark'] as const) {
        const palette = paletteFromBrand(swatch.hex, mode);
        const gap = Math.abs(
          luminance(palette.primary) - luminance(palette.background),
        );
        expect(gap).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  it('survives a colour that is not a colour', () => {
    // The customizer has a free text field; this must not produce NaN.
    const palette = paletteFromBrand('not-a-colour', 'light');
    expect(palette.background).toBe('#fafaf7');
    expect(typeof palette.primary).toBe('string');
  });

  it('reads back as the mode it was built for', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = paletteFromBrand('#1d4ed8', mode);
      const config = {
        colors: palette,
      } as Parameters<typeof configMode>[0];
      expect(configMode(config)).toBe(mode);
    }
  });
});

describe('readableAccent', () => {
  it('leaves a colour alone when it already has separation', () => {
    expect(readableAccent('#0d7666', 'light')).toBe('#0d7666');
  });

  it('moves a colour towards the readable side, never past white or black', () => {
    const light = readableAccent('#ffffff', 'light');
    expect(luminance(light)).toBeLessThan(1);
    const dark = readableAccent('#000000', 'dark');
    expect(luminance(dark)).toBeGreaterThan(0);
  });
});
