import { nextOccurrence } from './accounting.service';

/**
 * When a repeating cost next falls due.
 *
 * Rent on the 31st is the case that matters: a naive month addition rolls it
 * into March and quietly moves every later due date with it.
 */
describe('nextOccurrence', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d);

  it('returns nothing for a one-off bill', () => {
    expect(nextOccurrence('ONCE', at(2026, 0, 15))).toBeNull();
    expect(nextOccurrence('SOMETHING_ELSE', at(2026, 0, 15))).toBeNull();
  });

  it('adds a week', () => {
    const next = nextOccurrence('WEEKLY', at(2026, 0, 1));
    expect(next?.getDate()).toBe(8);
  });

  it('adds a month, a quarter and a year', () => {
    expect(nextOccurrence('MONTHLY', at(2026, 0, 15))?.getMonth()).toBe(1);
    expect(nextOccurrence('QUARTERLY', at(2026, 0, 15))?.getMonth()).toBe(3);
    expect(nextOccurrence('YEARLY', at(2026, 0, 15))?.getFullYear()).toBe(2027);
  });

  it('clamps rent due on the 31st to the end of a short month', () => {
    const next = nextOccurrence('MONTHLY', at(2026, 0, 31));
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(28);
  });

  it('clamps to 29 February in a leap year', () => {
    const next = nextOccurrence('MONTHLY', at(2028, 0, 31));
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(29);
  });

  it('rolls the year over', () => {
    const next = nextOccurrence('QUARTERLY', at(2026, 10, 10));
    expect(next?.getFullYear()).toBe(2027);
    expect(next?.getMonth()).toBe(1);
  });

  it('always moves forward', () => {
    for (const recurrence of ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']) {
      const from = at(2026, 0, 31);
      expect(nextOccurrence(recurrence, from)!.getTime()).toBeGreaterThan(
        from.getTime(),
      );
    }
  });

  it('leaves the source date alone', () => {
    const from = at(2026, 0, 31);
    const before = from.getTime();
    nextOccurrence('MONTHLY', from);
    expect(from.getTime()).toBe(before);
  });
});
