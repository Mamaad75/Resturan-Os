import {
  resolveReportRange,
  tehranDayRange,
  tehranParts,
  tehranRangeForDays,
  zonedTimeToUtc,
} from './time.util';

describe('Tehran time utilities', () => {
  it('reads wall-clock parts in Tehran, not UTC', () => {
    // 2026-08-25T21:00:00Z is already the 26th in Tehran (UTC+03:30).
    const parts = tehranParts(new Date('2026-08-25T21:00:00.000Z'));
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(8);
    expect(parts.day).toBe(26);
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(30);
  });

  it('builds the UTC instant for a Tehran wall-clock time', () => {
    const utc = zonedTimeToUtc(2026, 8, 25, 0, 0, 0);
    expect(utc.toISOString()).toBe('2026-08-24T20:30:00.000Z');
  });

  it('bounds a Tehran business day, not a UTC one', () => {
    const { from, to } = tehranDayRange(new Date('2026-08-25T10:00:00.000Z'));
    expect(from.toISOString()).toBe('2026-08-24T20:30:00.000Z');
    expect(to.toISOString()).toBe('2026-08-25T20:30:00.000Z');
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('puts a late-evening Tehran order in the right business day', () => {
    // 23:00 Tehran on the 25th is 19:30Z on the 25th.
    const instant = new Date('2026-08-25T19:30:00.000Z');
    const { from, to } = tehranDayRange(instant);
    expect(instant.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(instant.getTime()).toBeLessThan(to.getTime());
    expect(tehranParts(from).day).toBe(25);
  });

  it('spans exactly N days for a multi-day range', () => {
    const { from, to } = tehranRangeForDays(7, new Date('2026-08-25T10:00:00.000Z'));
    expect((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)).toBe(7);
  });

  describe('resolveReportRange', () => {
    const reference = new Date('2026-08-25T10:00:00.000Z');

    it('resolves today', () => {
      const range = resolveReportRange('today', undefined, undefined, reference);
      expect(range.from.toISOString()).toBe('2026-08-24T20:30:00.000Z');
    });

    it('resolves yesterday as the preceding Tehran day', () => {
      const range = resolveReportRange('yesterday', undefined, undefined, reference);
      expect(range.from.toISOString()).toBe('2026-08-23T20:30:00.000Z');
      expect(range.to.toISOString()).toBe('2026-08-24T20:30:00.000Z');
    });

    it('treats a bare date as a Tehran day and makes the end exclusive', () => {
      const range = resolveReportRange(
        'custom',
        '2026-08-01',
        '2026-08-03',
        reference,
      );
      expect(range.from.toISOString()).toBe('2026-07-31T20:30:00.000Z');
      // The end date is inclusive for the user, exclusive in the query.
      expect(range.to.toISOString()).toBe('2026-08-03T20:30:00.000Z');
    });

    it('falls back to today when a custom range is incomplete', () => {
      const range = resolveReportRange('custom', undefined, undefined, reference);
      expect(range.from.toISOString()).toBe('2026-08-24T20:30:00.000Z');
    });
  });
});
