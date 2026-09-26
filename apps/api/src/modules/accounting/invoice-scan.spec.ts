import { coerceNumbers, extractJson } from './invoice-scan.service';
import {
  buildReview,
  normaliseUnit,
  parsePersianNumber,
  scannedInvoiceSchema,
  toLatinDigits,
} from './invoice-scan.types';

/**
 * Reading a photographed invoice.
 *
 * The reply comes from a language model looking at a phone photo of, often,
 * handwriting. Everything below exists because that reply cannot be trusted:
 * a misread digit here becomes a wrong stock level and a wrong cost, so the
 * parsing is pinned against the shapes such a reply actually takes.
 */
describe('toLatinDigits', () => {
  it('converts Persian digits', () => {
    expect(toLatinDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
  });

  it('converts Arabic-Indic digits', () => {
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('leaves Persian words alone', () => {
    expect(toLatinDigits('شیر ۲ لیتر')).toBe('شیر 2 لیتر');
  });
});

describe('parsePersianNumber', () => {
  it('reads a plain number through unchanged', () => {
    expect(parsePersianNumber(1250)).toBe(1250);
  });

  it('reads Persian digits with a Persian thousands mark', () => {
    expect(parsePersianNumber('۱٬۲۵۰٬۰۰۰')).toBe(1_250_000);
  });

  it('reads a Latin thousands separator', () => {
    expect(parsePersianNumber('1,250,000')).toBe(1_250_000);
  });

  it('reads a Persian decimal mark', () => {
    expect(parsePersianNumber('۱۲٫۵')).toBe(12.5);
  });

  it('strips a trailing currency word', () => {
    expect(parsePersianNumber('۴۵۰۰۰ تومان')).toBe(45_000);
  });

  it('returns null for something unreadable', () => {
    expect(parsePersianNumber('نامشخص')).toBeNull();
    expect(parsePersianNumber('')).toBeNull();
    expect(parsePersianNumber(null)).toBeNull();
    expect(parsePersianNumber({})).toBeNull();
  });

  it('never returns NaN or Infinity', () => {
    for (const input of ['.', '-', '--', '...', 'abc']) {
      const value = parsePersianNumber(input);
      expect(value === null || Number.isFinite(value)).toBe(true);
    }
  });
});

describe('normaliseUnit', () => {
  it('maps the Persian units a supplier writes', () => {
    expect(normaliseUnit('کیلو')).toBe('KG');
    expect(normaliseUnit('کیلوگرم')).toBe('KG');
    expect(normaliseUnit('لیتر')).toBe('L');
    expect(normaliseUnit('عدد')).toBe('UNIT');
    expect(normaliseUnit('بسته')).toBe('PACK');
    expect(normaliseUnit('کارتن')).toBe('BOX');
  });

  it('defaults to UNIT when nothing was written', () => {
    expect(normaliseUnit(null)).toBe('UNIT');
    expect(normaliseUnit('  ')).toBe('UNIT');
  });

  it('keeps an unrecognised unit rather than inventing one', () => {
    // A supplier selling by "طاقه" must not silently become "each".
    expect(normaliseUnit('طاقه')).toBe('طاقه');
  });
});

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('reads an object inside a markdown fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('reads an object wrapped in commentary', () => {
    expect(extractJson('Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('returns null rather than throwing on malformed output', () => {
    expect(extractJson('not json at all')).toBeNull();
    expect(extractJson('{"a":')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('coerceNumbers', () => {
  it('turns Persian numeric strings into numbers', () => {
    const out = coerceNumbers({
      statedTotal: '۱٬۰۰۰٬۰۰۰',
      lines: [{ name: 'شیر', quantity: '۲۴', unitCost: '۳۸٬۰۰۰' }],
    }) as { statedTotal: number; lines: Array<{ quantity: number; unitCost: number }> };

    expect(out.statedTotal).toBe(1_000_000);
    expect(out.lines[0].quantity).toBe(24);
    expect(out.lines[0].unitCost).toBe(38_000);
  });

  it('drops a line whose numbers could not be read', () => {
    const out = coerceNumbers({
      lines: [
        { name: 'خوب', quantity: '۲', unitCost: '۱۰۰' },
        { name: 'ناخوانا', quantity: 'نامشخص', unitCost: '۱۰۰' },
      ],
    }) as { lines: unknown[] };
    expect(out.lines).toHaveLength(1);
  });

  it('nulls an unreadable total instead of guessing', () => {
    const out = coerceNumbers({ statedTotal: 'ناخوانا', lines: [] }) as {
      statedTotal: number | null;
    };
    expect(out.statedTotal).toBeNull();
  });

  it('survives a reply that is not an object', () => {
    expect(coerceNumbers(null)).toBeNull();
    expect(coerceNumbers('text')).toBe('text');
  });
});

describe('buildReview', () => {
  const base = {
    supplierName: 'پخش بهاران',
    invoiceNumber: 'F-1042',
    lines: [
      { name: 'دانه قهوه', unit: 'کیلو', quantity: 5, unitCost: 900_000 },
      { name: 'شیر', unit: 'لیتر', quantity: 24, unitCost: 38_000 },
    ],
  };

  it('computes the total from the lines, not from the model', () => {
    const review = buildReview({ ...base, statedTotal: 999 });
    expect(review.computedTotal).toBe(5 * 900_000 + 24 * 38_000);
  });

  it('reports how far the printed total disagrees', () => {
    const correct = 5 * 900_000 + 24 * 38_000;
    expect(buildReview({ ...base, statedTotal: correct }).totalMismatch).toBe(0);
    // A misread digit in one line is exactly what this is here to surface.
    expect(buildReview({ ...base, statedTotal: correct + 50_000 }).totalMismatch).toBe(
      50_000,
    );
  });

  it('reports no mismatch when the invoice printed no total', () => {
    expect(buildReview(base).totalMismatch).toBeNull();
  });

  it('normalises the units on the way through', () => {
    const review = buildReview(base);
    expect(review.lines.map((line) => line.unit)).toEqual(['KG', 'L']);
  });

  it('rounds costs to whole Toman', () => {
    const review = buildReview({
      lines: [{ name: 'x', quantity: 2, unitCost: 12_500.4 }],
    });
    expect(review.lines[0].unitCost).toBe(12_500);
    expect(Number.isInteger(review.computedTotal)).toBe(true);
  });
});

describe('scannedInvoiceSchema', () => {
  it('accepts a well-formed reply', () => {
    const result = scannedInvoiceSchema.safeParse({
      supplierName: 'x',
      lines: [{ name: 'شیر', quantity: 2, unitCost: 1000 }],
      confidence: 0.9,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a line with no name', () => {
    const result = scannedInvoiceSchema.safeParse({
      lines: [{ name: '', quantity: 1, unitCost: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative or zero quantity', () => {
    for (const quantity of [0, -1]) {
      const result = scannedInvoiceSchema.safeParse({
        lines: [{ name: 'x', quantity, unitCost: 1 }],
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects an absurd amount rather than stocking it', () => {
    const result = scannedInvoiceSchema.safeParse({
      lines: [{ name: 'x', quantity: 1, unitCost: 1e15 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty line list, which the caller treats as "not an invoice"', () => {
    expect(scannedInvoiceSchema.safeParse({ lines: [] }).success).toBe(true);
  });
});
