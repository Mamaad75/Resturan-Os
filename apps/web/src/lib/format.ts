import {
  formatIranianMobile,
  formatMoney,
  groupDigits,
  toPersianDigits,
  type Currency,
} from '@restaurant-os/types';
import { format as formatJalali } from 'date-fns-jalali';

export {
  formatIranianMobile,
  formatMoney,
  groupDigits,
  toPersianDigits,
  toLatinDigits,
  normalizeIranianMobile,
} from '@restaurant-os/types';

const TEHRAN_TZ = 'Asia/Tehran';

/** Converts an instant to the equivalent wall-clock Date in Tehran. */
function toTehran(value: string | Date): Date {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
}

/** "۱۴۰۵/۰۶/۰۳" - Persian (Jalali) calendar date. */
export function formatDateFa(value: string | Date): string {
  return toPersianDigits(formatJalali(toTehran(value), 'yyyy/MM/dd'));
}

/** "۳ شهریور ۱۴۰۵" */
export function formatDateLongFa(value: string | Date): string {
  return toPersianDigits(formatJalali(toTehran(value), 'd MMMM yyyy'));
}

/** "۱۴:۳۵" - Tehran wall clock. */
export function formatTimeFa(value: string | Date): string {
  return toPersianDigits(formatJalali(toTehran(value), 'HH:mm'));
}

/** "۳ شهریور ۱۴۰۵ • ۱۴:۳۵" */
export function formatDateTimeFa(value: string | Date): string {
  return `${formatDateLongFa(value)} • ${formatTimeFa(value)}`;
}

/** "۱۲ دقیقه پیش" - relative time for order cards and audit rows. */
export function formatRelativeFa(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 45) return 'همین الان';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${toPersianDigits(days)} روز پیش`;
  return formatDateFa(date);
}

/** Minutes elapsed, rendered for the kitchen ticket timer. */
export function elapsedMinutes(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

export function formatElapsedFa(value: string | Date): string {
  const minutes = elapsedMinutes(value);
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  return `${toPersianDigits(hours)}:${toPersianDigits(String(minutes % 60).padStart(2, '0'))}`;
}

/** Compact money for dashboard tiles: "۱۲٫۴ میلیون تومان". */
export function formatMoneyCompact(amount: number, currency: Currency = 'IRT'): string {
  const unit = currency === 'IRT' ? 'تومان' : 'ریال';
  if (Math.abs(amount) >= 1_000_000_000) {
    return `${toPersianDigits((amount / 1_000_000_000).toFixed(1))} میلیارد ${unit}`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `${toPersianDigits((amount / 1_000_000).toFixed(1))} میلیون ${unit}`;
  }
  return formatMoney(amount, currency);
}

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${toPersianDigits(Math.abs(value).toFixed(1))}٪`.replace('+', '+');
}

export { type Currency };
