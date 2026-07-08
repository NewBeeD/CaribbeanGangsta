import { describe, expect, it } from 'vitest';
import { createInitialState, tick, settleOffline, type GameState } from '@/engine';

describe('tick — clock advancement', () => {
  it('accumulates in-game hours and derives day/week', () => {
    const start = createInitialState('clock');
    expect(start.clock).toEqual({ hours: 0, day: 1, week: 1 });

    const afterHalfDay = tick(start, 12);
    expect(afterHalfDay.clock).toEqual({ hours: 12, day: 1, week: 1 });

    const afterOneDay = tick(afterHalfDay, 12);
    expect(afterOneDay.clock).toEqual({ hours: 24, day: 2, week: 1 });

    const afterOneWeek = tick(start, 24 * 7);
    expect(afterOneWeek.clock).toEqual({ hours: 168, day: 8, week: 2 });
  });

  it('is a no-op at dt=0 and rejects negative dt', () => {
    const start = createInitialState('clock2');
    expect(tick(start, 0)).toBe(start);
    expect(() => tick(start, -1)).toThrow();
  });

  it('does not mutate its input', () => {
    const start = createInitialState('immut');
    const before = structuredClone(start);
    tick(start, 50);
    expect(start).toEqual(before);
  });
});

/** A run carrying active loan-shark debt, to prove offline never advances it. */
function withActiveDebt(state: GameState): GameState {
  return {
    ...state,
    debt: {
      lenderId: 'papa-cass',
      principal: 5000,
      rate: 0.2,
      accruedInterest: 0,
      dueDay: state.clock.day + 14,
      ladderRung: 0,
      active: true,
    },
  };
}

describe('settleOffline — frozen/safe (GDD §6; design/10 §4.2)', () => {
  it('never increases debt and never ends the run, for any hours away', () => {
    const base = withActiveDebt(createInitialState('offline'));
    for (const hours of [1, 12, 24, 100, 1000, 10_000]) {
      const { state: settled } = settleOffline(base, hours);
      expect(settled.debt.principal).toBeLessThanOrEqual(base.debt.principal);
      expect(settled.runStatus).not.toBe('dead');
      expect(settled.runStatus).not.toBe('prison');
      // Frozen: heat never rises while away.
      expect(settled.heat).toBeLessThanOrEqual(base.heat);
    }
  });

  it('does not advance the in-game clock (the world is frozen while away)', () => {
    const base = createInitialState('frozen');
    const { state: settled } = settleOffline(base, 48);
    expect(settled.clock).toEqual(base.clock);
  });

  it('is a no-op at 0 hours and rejects negative hours', () => {
    const base = createInitialState('offline0');
    expect(settleOffline(base, 0).state).toBe(base);
    expect(() => settleOffline(base, -5)).toThrow();
  });
});
