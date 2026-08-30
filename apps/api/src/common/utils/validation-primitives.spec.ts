import {
  createProductSchema,
  optionalIranianMobileSchema,
  optionalText,
  updateBrandingSchema,
  updateProductSchema,
} from '@restaurant-os/validation';
import { z } from 'zod';

/**
 * Partial updates.
 *
 * Every service distinguishes "field not sent" from "field explicitly
 * cleared" by checking `!== undefined`. That only works if an absent key
 * survives parsing as `undefined`, which depends on where `.optional()` sits
 * relative to the transform - a subtlety that silently wiped logos, covers and
 * taglines when it was the wrong way round.
 */
describe('optional field parsing', () => {
  const schema = z.object({ note: optionalText(50, 'یادداشت') });

  it('leaves an absent key undefined so a partial update skips it', () => {
    expect(schema.parse({})).toEqual({});
    expect('note' in schema.parse({})).toBe(false);
  });

  it('treats an explicit null as "clear this field"', () => {
    expect(schema.parse({ note: null })).toEqual({ note: null });
  });

  it('treats an empty or blank string as "clear this field"', () => {
    expect(schema.parse({ note: '' })).toEqual({ note: null });
    expect(schema.parse({ note: '   ' })).toEqual({ note: null });
  });

  it('trims a real value', () => {
    expect(schema.parse({ note: '  سلام  ' })).toEqual({ note: 'سلام' });
  });

  it('still enforces length and rejects markup', () => {
    expect(schema.safeParse({ note: 'x'.repeat(51) }).success).toBe(false);
    expect(schema.safeParse({ note: '<script>' }).success).toBe(false);
  });

  it('keeps a branding patch from wiping the fields it did not mention', () => {
    const parsed = updateBrandingSchema.parse({ menuTemplate: 'CAFE' });
    expect(parsed.menuTemplate).toBe('CAFE');
    // The keys the caller never sent must not appear at all.
    expect(parsed.logoUrl).toBeUndefined();
    expect(parsed.coverUrl).toBeUndefined();
    expect(parsed.tagline).toBeUndefined();
  });

  it('keeps a product patch from wiping the description or image', () => {
    const parsed = updateProductSchema.parse({ price: 120_000 });
    expect(parsed.price).toBe(120_000);
    expect(parsed.imageUrl).toBeUndefined();
    expect(parsed.descriptionFa).toBeUndefined();
  });

  it('still lets a product patch clear a field on purpose', () => {
    expect(updateProductSchema.parse({ imageUrl: null }).imageUrl).toBeNull();
  });

  it('defaults an omitted optional to null on create, where nothing exists yet', () => {
    const parsed = createProductSchema.parse({
      categoryId: '3f1d8c9e-2a6b-4c1d-9e5f-7a8b9c0d1e2f',
      name: 'Tea',
      nameFa: 'چای',
      price: 45_000,
    });
    expect(parsed.imageUrl ?? null).toBeNull();
  });
});

describe('optional mobile parsing', () => {
  const schema = z.object({ phone: optionalIranianMobileSchema });

  it('leaves an absent key undefined', () => {
    expect('phone' in schema.parse({})).toBe(false);
  });

  it('normalises the accepted formats', () => {
    for (const input of ['+98 912 123 4567', '00989121234567', '۰۹۱۲۱۲۳۴۵۶۷']) {
      expect(schema.parse({ phone: input })).toEqual({ phone: '09121234567' });
    }
  });

  it('clears on an empty value rather than erroring', () => {
    expect(schema.parse({ phone: '' })).toEqual({ phone: null });
    expect(schema.parse({ phone: null })).toEqual({ phone: null });
  });

  it('rejects a malformed number instead of silently dropping it', () => {
    expect(schema.safeParse({ phone: '0912' }).success).toBe(false);
    expect(schema.safeParse({ phone: '02188776655' }).success).toBe(false);
  });
});
