import { describe, expect, it } from 'vitest';
import {
  STREET_SALE_PER_CREW_PER_DAY,
  bookStreetStock,
  createInitialState,
  recruit,
  streetStep,
  tick,
  type GameState,
} from '@/engine';

/** A run with one crew member and `units` rocks already on the corners. */
function onCorners(seed: string, units: number, bookedUnitPrice: number): GameState {
  const state = recruit(createInitialState(seed), 'deon').state;
  return { ...state, streetStock: { units, bookedUnitPrice } };
}

const homeCash = (state: GameState): number => state.stashes[0]!.dirtyCash;

describe('street teams — the crack corner drip (design/12 Item 5d; Prompt 34)', () => {
  it('drips rock back as dirty cash + corner heat over active time', () => {
    const state = onCorners('drip', 100, 1000);
    const rate = STREET_SALE_PER_CREW_PER_DAY * state.crew.length; // one member
    const cashBefore = homeCash(state);

    const next = streetStep(state, 24, 'active'); // one in-game day
    expect(next.streetStock.units).toBe(100 - rate);
    expect(homeCash(next)).toBe(cashBefore + rate * 1000);
    expect(next.heat).toBeGreaterThan(state.heat); // corners are loud
  });

  it('sells through to empty and clears the booked price', () => {
    const state = onCorners('empty', 5, 1200);
    const next = streetStep(state, 24 * 10, 'active'); // far more time than stock
    expect(next.streetStock.units).toBe(0);
    expect(next.streetStock.bookedUnitPrice).toBe(0);
    expect(homeCash(next)).toBe(homeCash(state) + 5 * 1200);
  });

  it('is frozen offline — the crew’s hustle never runs while away (GDD §6)', () => {
    const state = onCorners('froze', 100, 1000);
    expect(streetStep(state, 48, 'offline')).toBe(state);
  });

  it('no crew ⇒ no sell-through (the rate scales with crew)', () => {
    const state: GameState = {
      ...createInitialState('nocrew'),
      streetStock: { units: 50, bookedUnitPrice: 900 },
    };
    expect(streetStep(state, 24, 'active')).toBe(state);
  });

  it('books rock at a units-weighted average price across cooks', () => {
    const base = createInitialState('book');
    const s1 = bookStreetStock(base, 10, 1000);
    expect(s1.streetStock).toEqual({ units: 10, bookedUnitPrice: 1000 });

    const s2 = bookStreetStock(s1, 30, 2000);
    expect(s2.streetStock.units).toBe(40);
    expect(s2.streetStock.bookedUnitPrice).toBeCloseTo((10 * 1000 + 30 * 2000) / 40);
  });

  it('runs as an active tick step (street-sales) in the clock pipeline', () => {
    const state = onCorners('tick', 40, 800);
    const cashBefore = homeCash(state);
    const next = tick(state, 24);
    expect(next.streetStock.units).toBeLessThan(40);
    expect(homeCash(next)).toBeGreaterThan(cashBefore);
  });
});
