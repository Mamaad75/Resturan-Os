import { addMonths, invoiceAmount } from './billing.service';

/**
 * The two pure pieces of billing arithmetic.
 *
 * Both decide what a customer is charged and until when, so they are pinned
 * rather than left to be discovered by a restaurant that lost a month.
 */
describe('addMonths', () => {
  const at = (iso: string) => new Date(iso);

  it('moves forward by whole months', () => {
    expect(addMonths(at('2026-03-15T10:00:00Z'), 1).getMonth()).toBe(3);
    expect(addMonths(at('2026-03-15T10:00:00Z'), 3).getMonth()).toBe(5);
  });

  it('rolls the year over', () => {
    const next = addMonths(at('2026-11-10T00:00:00Z'), 3);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(1);
  });

  it('clamps to the last day when the target month is shorter', () => {
    // 31 January + 1 month is the end of February, never 3 March.
    const next = addMonths(new Date(2026, 0, 31), 1);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it('clamps to 29 February in a leap year', () => {
    const next = addMonths(new Date(2028, 0, 31), 1);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(29);
  });

  it('keeps the day of month when the target month is long enough', () => {
    const next = addMonths(new Date(2026, 0, 15), 1);
    expect(next.getDate()).toBe(15);
  });

  it('never moves backwards', () => {
    for (let months = 1; months <= 24; months += 1) {
      const from = new Date(2026, 0, 31);
      expect(addMonths(from, months).getTime()).toBeGreaterThan(from.getTime());
    }
  });

  it('leaves the source date alone', () => {
    const from = new Date(2026, 0, 31);
    const before = from.getTime();
    addMonths(from, 5);
    expect(from.getTime()).toBe(before);
  });
});

describe('invoiceAmount', () => {
  it('multiplies the monthly price by the period', () => {
    expect(invoiceAmount(990_000, 1)).toBe(990_000);
    expect(invoiceAmount(990_000, 12)).toBe(11_880_000);
  });

  it('handles a free plan', () => {
    expect(invoiceAmount(0, 6)).toBe(0);
  });
});
