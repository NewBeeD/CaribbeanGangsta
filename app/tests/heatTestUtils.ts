/**
 * Per-country heat test helpers (heat redesign "B"; v30). The old suites pinned
 * one global `state.heat` — these give the per-country analogues: pin the HOME
 * country's local meter (with zero notoriety, home is then the hottest country,
 * so global tier/dots read exactly that value), read it back, or sum the whole
 * map for "did anything get hotter/colder" assertions.
 */

import { heatOf, homeCountryId, type GameState } from '@/engine';

/** Pin the HOME country's local heat, zeroing notoriety (immutably). */
export function withHomeHeat<S extends GameState>(state: S, heat: number): S {
  return {
    ...state,
    countryHeat: heat > 0 ? { [homeCountryId(state)]: heat } : {},
    notoriety: 0,
  };
}

/** The HOME country's local heat. */
export function homeHeat(state: GameState): number {
  return heatOf(state, homeCountryId(state));
}

/** Sum of every country's local heat plus notoriety — "total attention". */
export function totalHeat(state: GameState): number {
  return Object.values(state.countryHeat).reduce((sum, h) => sum + h, 0) + state.notoriety;
}
