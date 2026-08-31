/**
 * Every business day boundary in this system is an Asia/Tehran boundary, not a
 * UTC one. A "today's revenue" figure that silently used UTC would be wrong by
 * three and a half hours for every restaurant on the platform.
 */
export const TEHRAN_TZ = 'Asia/Tehran';

/** Parts of an instant as seen in Tehran. */
export function tehranParts(date: Date, timeZone: string = TEHRAN_TZ) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some ICU versions.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of the zone from UTC, in minutes, at the given instant. */
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = tehranParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Builds the UTC instant for a given wall-clock time in the zone. Resolved in
 * two passes so it stays correct if Iran ever reintroduces DST.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone: string = TEHRAN_TZ,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset1 = zoneOffsetMinutes(guess, timeZone);
  const adjusted = new Date(guess.getTime() - offset1 * 60_000);
  const offset2 = zoneOffsetMinutes(adjusted, timeZone);
  if (offset2 === offset1) return adjusted;
  return new Date(guess.getTime() - offset2 * 60_000);
}

/** `[startOfDay, startOfNextDay)` in UTC for the Tehran day containing `date`. */
export function tehranDayRange(
  date: Date = new Date(),
  timeZone: string = TEHRAN_TZ,
): { from: Date; to: Date } {
  const { year, month, day } = tehranParts(date, timeZone);
  const from = zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Range covering the last `days` Tehran days, ending at the end of today. */
export function tehranRangeForDays(
  days: number,
  reference: Date = new Date(),
  timeZone: string = TEHRAN_TZ,
): { from: Date; to: Date } {
  const today = tehranDayRange(reference, timeZone);
  return { from: addDays(today.from, -(days - 1)), to: today.to };
}

/** Resolves a report preset into a concrete UTC range. */
export function resolveReportRange(
  preset: 'today' | 'yesterday' | 'week' | 'month' | 'custom',
  from?: string,
  to?: string,
  reference: Date = new Date(),
  timeZone: string = TEHRAN_TZ,
): { from: Date; to: Date } {
  const today = tehranDayRange(reference, timeZone);
  switch (preset) {
    case 'today':
      return today;
    case 'yesterday':
      return { from: addDays(today.from, -1), to: today.from };
    case 'week':
      return { from: addDays(today.from, -6), to: today.to };
    case 'month':
      return { from: addDays(today.from, -29), to: today.to };
    case 'custom': {
      if (!from || !to) return today;
      // A bare `YYYY-MM-DD` is interpreted as a Tehran wall-clock day.
      const start = parseRangeBoundary(from, timeZone, false);
      const end = parseRangeBoundary(to, timeZone, true);
      return { from: start, to: end };
    }
  }
}

function parseRangeBoundary(value: string, timeZone: string, exclusiveEnd: boolean): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const start = zonedTimeToUtc(Number(y), Number(m), Number(d), 0, 0, 0, timeZone);
    return exclusiveEnd ? addDays(start, 1) : start;
  }
  return new Date(value);
}

/**
 * First instant of the current Tehran calendar month, in UTC.
 *
 * Plan allowances reset on the Tehran month boundary, not the UTC one: a
 * restaurant's month ends when their month ends.
 */
export function tehranMonthStart(now: Date = new Date(), timeZone = TEHRAN_TZ): Date {
  const parts = tehranParts(now, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, 1, 0, 0, 0, timeZone);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 60_000);
}
