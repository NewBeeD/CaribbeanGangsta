/**
 * Presenter for the live header date readout (Ideas2 §6). Pure formatting over
 * the engine's `Clock` — the UI shows time, it never advances it (the store's
 * live loop owns that). `year`/`dayOfYear` are DERIVED here for display; the
 * engine clock still tracks only accumulated hours + day/week, so no schema
 * change is needed to surface years. Promote `year` into the engine only if a
 * system needs to key off it.
 */

/** In-game calendar: 12 clean 30-day months make a 360-day year. */
export const DAYS_PER_YEAR = 360;

export interface ClockReadout {
  /** 1-based in-game year. */
  readonly year: number;
  /** 1-based day within the current year (1..DAYS_PER_YEAR). */
  readonly dayOfYear: number;
  /** Hour of day, 0..23. */
  readonly hour: number;
  /** Minute of hour, 0..59. */
  readonly minute: number;
  /** Compact label, e.g. "Year 1 · Day 42 · 14:30". */
  readonly text: string;
}

/** Format an engine `Clock` (accumulated hours + 1-based day) for display. */
export function formatClock(clock: { readonly hours: number; readonly day: number }): ClockReadout {
  const year = Math.floor((clock.day - 1) / DAYS_PER_YEAR) + 1;
  const dayOfYear = ((clock.day - 1) % DAYS_PER_YEAR) + 1;
  const whole = Math.floor(clock.hours);
  const hour = ((whole % 24) + 24) % 24;
  const minute = Math.floor((clock.hours - whole) * 60);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return {
    year,
    dayOfYear,
    hour,
    minute,
    text: `Year ${year} · Day ${dayOfYear} · ${hh}:${mm}`,
  };
}
