import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, formatClock } from '@/ui/shell/clockReadout.model';

describe('formatClock — the header date readout (Ideas2 §6)', () => {
  it('reads the opening moment as Year 1, Day 1, 00:00', () => {
    expect(formatClock({ hours: 0, day: 1 }).text).toBe('Year 1 · Day 1 · 00:00');
  });

  it('derives the hour and minute from accumulated fractional hours', () => {
    // Day 3, 14.5 hours in → 14:30 on day 3.
    const r = formatClock({ hours: 2 * 24 + 14.5, day: 3 });
    expect(r.hour).toBe(14);
    expect(r.minute).toBe(30);
    expect(r.text).toBe('Year 1 · Day 3 · 14:30');
  });

  it('rolls into year 2 after a full 360-day year', () => {
    const firstOfYear2 = formatClock({ hours: DAYS_PER_YEAR * 24, day: DAYS_PER_YEAR + 1 });
    expect(firstOfYear2.year).toBe(2);
    expect(firstOfYear2.dayOfYear).toBe(1);
  });

  it('keeps day-of-year within [1, DAYS_PER_YEAR]', () => {
    const lastOfYear1 = formatClock({ hours: 0, day: DAYS_PER_YEAR });
    expect(lastOfYear1.year).toBe(1);
    expect(lastOfYear1.dayOfYear).toBe(DAYS_PER_YEAR);
  });
});
