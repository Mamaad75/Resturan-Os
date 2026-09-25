import { z } from 'zod';

/**
 * What a scanned invoice is expected to contain.
 *
 * Kept as a schema rather than a type because the source is a language model
 * reading a photograph: the reply is parsed and rejected on its own merits,
 * never trusted because of where it came from.
 */
export const scannedInvoiceSchema = z.object({
  supplierName: z.string().trim().max(140).nullable().optional(),
  invoiceNumber: z.string().trim().max(40).nullable().optional(),
  /** ISO date if the model could read one. */
  purchasedAt: z.string().trim().max(40).nullable().optional(),
  lines: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(140),
        unit: z.string().trim().max(24).nullable().optional(),
        quantity: z.number().finite().positive().max(1_000_000),
        unitCost: z.number().finite().nonnegative().max(10_000_000_000),
      }),
    )
    .max(200),
  /** The invoice's own stated total, when it is printed on the page. */
  statedTotal: z.number().finite().nonnegative().max(1_000_000_000_000).nullable().optional(),
  /** The model's own confidence, 0-1. Low values steer the review screen. */
  confidence: z.number().min(0).max(1).nullable().optional(),
});
export type ScannedInvoice = z.infer<typeof scannedInvoiceSchema>;

/** Every line, plus what it costs, plus how far the arithmetic disagrees. */
export interface InvoiceReview extends ScannedInvoice {
  /** Sum of quantity x unitCost across the lines, computed here. */
  computedTotal: number;
  /**
   * Difference between the invoice's printed total and the computed one.
   * Null when the invoice did not state a total. A non-zero value is the
   * signal for "check this before saving".
   */
  totalMismatch: number | null;
}

/**
 * Persian digits, separators and units, normalised.
 *
 * A handwritten Iranian invoice mixes ۱۲۳ and 123, uses ٬ or , for thousands,
 * and writes "کیلو" where the system wants a unit code. Normalising here means
 * the rest of the pipeline only ever sees ordinary numbers.
 */
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    const a = ARABIC_DIGITS.indexOf(ch);
    out += p >= 0 ? String(p) : a >= 0 ? String(a) : ch;
  }
  return out;
}

/** "۱٬۲۵۰٫۵" -> 1250.5, and anything unreadable -> null. */
export function parsePersianNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  const cleaned = toLatinDigits(input)
    // Thousands separators used in Persian invoices, plus the decimal mark.
    .replace(/[٬,\s]/g, '')
    .replace(/[٫]/g, '.')
    .replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '-') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Common Persian unit words mapped to the codes inventory stores. */
const UNIT_WORDS: Array<[RegExp, string]> = [
  [/^(کیلو\s*گرم|کیلوگرم|کیلو|kg)$/i, 'KG'],
  [/^(گرم|g|gr)$/i, 'G'],
  [/^(لیتر|l|lit)$/i, 'L'],
  [/^(میلی\s*لیتر|میلی‌لیتر|ml)$/i, 'ML'],
  [/^(عدد|تا|واحد|pcs|pc|unit)$/i, 'UNIT'],
  [/^(بسته|پک|pack)$/i, 'PACK'],
  [/^(کارتن|carton|box|جعبه)$/i, 'BOX'],
  [/^(شانه)$/i, 'TRAY'],
];

export function normaliseUnit(input: string | null | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) return 'UNIT';
  for (const [pattern, code] of UNIT_WORDS) {
    if (pattern.test(raw)) return code;
  }
  // Unknown units are kept verbatim rather than forced into UNIT: a supplier
  // selling by "طاقه" should not silently become "each".
  return raw.slice(0, 24).toUpperCase();
}

/**
 * Turn a model reply into something a human can check.
 *
 * Every number is recomputed here. The model's own total is kept only to be
 * compared against the arithmetic, because a misread digit in one line is
 * exactly the error a review screen exists to catch.
 */
export function buildReview(parsed: ScannedInvoice): InvoiceReview {
  const lines = parsed.lines.map((line) => ({
    ...line,
    unit: normaliseUnit(line.unit),
    // Costs are whole Toman; a model that returns 12500.4 means 12500.
    unitCost: Math.round(line.unitCost),
  }));

  const computedTotal = lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * line.unitCost),
    0,
  );

  return {
    ...parsed,
    lines,
    computedTotal,
    totalMismatch:
      parsed.statedTotal == null
        ? null
        : Math.round(parsed.statedTotal) - computedTotal,
  };
}

/** What the model is asked to do. Kept here so it is reviewable as text. */
export const INVOICE_PROMPT = `You are reading a photographed purchase invoice from an Iranian restaurant or cafe supplier.
The invoice may be printed or handwritten, and is usually in Persian (Farsi).

Return ONLY a JSON object, with no markdown fence and no commentary, shaped:
{
  "supplierName": string | null,
  "invoiceNumber": string | null,
  "purchasedAt": string | null,
  "lines": [{ "name": string, "unit": string | null, "quantity": number, "unitCost": number }],
  "statedTotal": number | null,
  "confidence": number
}

Rules:
- "name" is the goods as written, in Persian. Do not translate it.
- "quantity" is how many units were bought. "unitCost" is the price of ONE unit.
- If the invoice shows only a line total, divide it by the quantity to get unitCost.
- Convert every Persian or Arabic numeral to a plain number. Remove thousands separators.
- Amounts are in Toman. If the invoice is clearly in Rial, divide by 10.
- "unit" is the unit as written (کیلو، عدد، بسته ...) or null if absent.
- "purchasedAt" is an ISO date (YYYY-MM-DD) if a Gregorian date is readable. If the
  date is Jalali, convert it to Gregorian. If unreadable, use null.
- "confidence" is your own 0-1 estimate of how reliably you read this image.
- Omit any row that is a subtotal, tax, discount or total - only real goods.
- If the image is not an invoice, return lines as an empty array and confidence 0.`;
