import type { Currency, Money } from './index';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** "1250" -> "۱۲۵۰". Used across the UI, receipts and SMS bodies. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** "۱۲۵۰" -> "1250". Needed when parsing Persian input from forms. */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)),
    );
}

/** Thousands separator using the Persian grouping mark (U+066C). */
export function groupDigits(value: number, persian = true): string {
  const grouped = Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, persian ? '٬' : ',');
  const signed = value < 0 ? `-${grouped}` : grouped;
  return persian ? toPersianDigits(signed) : signed;
}

export const CURRENCY_LABEL_FA: Record<Currency, string> = {
  IRT: 'تومان',
  IRR: 'ریال',
};

/** "125000" -> "۱۲۵٬۰۰۰ تومان" */
export function formatMoney(
  amount: Money,
  currency: Currency = 'IRT',
  options: { persian?: boolean; withUnit?: boolean } = {},
): string {
  const { persian = true, withUnit = true } = options;
  const value = groupDigits(amount, persian);
  if (!withUnit) return value;
  return `${value} ${CURRENCY_LABEL_FA[currency]}`;
}

/**
 * Normalises Iranian mobile numbers to the canonical `09xxxxxxxxx` form.
 * Accepts `+989...`, `00989...`, `989...`, `9...` and Persian digits.
 * Returns `null` when the input is not a valid Iranian mobile number.
 */
export function normalizeIranianMobile(input: string): string | null {
  if (!input) return null;
  let digits = toLatinDigits(input).replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0098')) digits = digits.slice(4);
  else if (digits.startsWith('98')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^9\d{9}$/.test(digits)) return null;
  return `0${digits}`;
}

export function isValidIranianMobile(input: string): boolean {
  return normalizeIranianMobile(input) !== null;
}

/** "09121234567" -> "۰۹۱۲ ۱۲۳ ۴۵۶۷" for display. */
export function formatIranianMobile(input: string, persian = true): string {
  const normalized = normalizeIranianMobile(input);
  if (!normalized) return input;
  const pretty = `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
  return persian ? toPersianDigits(pretty) : pretty;
}

/** Masks the middle of a phone number for display in non-privileged contexts. */
export function maskMobile(input: string, persian = true): string {
  const normalized = normalizeIranianMobile(input);
  if (!normalized) return input;
  const masked = `${normalized.slice(0, 4)}***${normalized.slice(7)}`;
  return persian ? toPersianDigits(masked) : masked;
}
