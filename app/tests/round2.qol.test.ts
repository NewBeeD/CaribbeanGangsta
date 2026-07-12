import { describe, expect, it } from 'vitest';
import {
  CREW_CARRY_PER_MEMBER,
  COUNTRIES,
  START_COUNTRIES,
  createInitialState,
  effectiveCapacity,
  getMarketPrice,
  stashCapacity,
  type CrewMember,
  type GameState,
  type Stash,
} from '@/engine';
import { productRows } from '@/ui/screens/dealScreen.model';

/** Append `n` throwaway crew members — effectiveCapacity only reads the count. */
function withCrew(state: GameState, n: number): GameState {
  const crew = Array.from({ length: n }, (_, i) => ({ id: `c${i}` })) as unknown as CrewMember[];
  return { ...state, crew };
}

describe('effectiveCapacity — crew-scaled carry (design/12 Item 4)', () => {
  it('grows linearly with the crew: base + CREW_CARRY_PER_MEMBER × crew.length', () => {
    const state = createInitialState('cap-linear');
    const home = state.stashes[0]!;
    const base = stashCapacity(home);

    expect(effectiveCapacity(state, home)).toBe(base); // no crew → archetype base
    expect(effectiveCapacity(withCrew(state, 1), home)).toBe(base + CREW_CARRY_PER_MEMBER);
    expect(effectiveCapacity(withCrew(state, 5), home)).toBe(base + 5 * CREW_CARRY_PER_MEMBER);
  });

  it('a larger crew lets a stash actually hold more product (no hard max)', () => {
    const state = createInitialState('cap-hold');
    const home = state.stashes[0]!;
    const solo = effectiveCapacity(state, home);
    const crewed = effectiveCapacity(withCrew(state, 10), home);
    expect(crewed).toBeGreaterThan(solo);
  });
});

describe('one price table per country (design/12 Item 7)', () => {
  it('two stashes in the SAME country see identical board prices', () => {
    const state = createInitialState('same-country');
    const home = state.stashes[0]!;
    // A second stash standing in the very same country.
    const twin: Stash = { ...home, id: 'stash-twin', name: 'Twin' };
    const withTwin: GameState = { ...state, stashes: [home, twin] };

    const rowsA = productRows(withTwin, home);
    const rowsB = productRows(withTwin, twin);
    expect(rowsB.map((r) => r.price)).toEqual(rowsA.map((r) => r.price));
  });

  it('the raw market price is keyed by country, not by stash', () => {
    const state = createInitialState('per-country');
    const country = state.stashes[0]!.countryId;
    const a = getMarketPrice(state, 'cocaine', country).price;
    const b = getMarketPrice(state, 'cocaine', country).price;
    expect(a).toBe(b);
  });
});

describe('more countries (design/12 Item 9)', () => {
  const NEW_IDS = [
    'jamaica',
    'trinidad',
    'bahamas',
    'hispaniola',
    'panama',
    'venezuela',
    'new-york',
    'london',
  ] as const;

  it('adds the new roster, all reachable but never start-eligible', () => {
    const ids = new Set(COUNTRIES.map((c) => c.id));
    for (const id of NEW_IDS) {
      expect(ids.has(id)).toBe(true);
      expect(COUNTRIES.find((c) => c.id === id)!.startEligible).toBe(false);
    }
  });

  it('leaves the start-eligible roster Caribbean-only (unchanged)', () => {
    expect(START_COUNTRIES.every((c) => c.region === 'caribbean')).toBe(true);
    expect(START_COUNTRIES.map((c) => c.id).sort()).toEqual([
      'marigot-bay',
      'port-lazaro',
      'puerto-verde',
      'san-cristo',
    ]);
  });

  it('every new country trades something, has hooks, and prices from any run', () => {
    const state = createInitialState('new-countries');
    for (const id of NEW_IDS) {
      const country = COUNTRIES.find((c) => c.id === id)!;
      expect(country.traded.length).toBeGreaterThan(0);
      expect(country.openingHooks.length).toBeGreaterThanOrEqual(2);
      // A market exists for every traded product (no throw, positive price).
      for (const product of country.traded) {
        expect(getMarketPrice(state, product, id).price).toBeGreaterThan(0);
      }
    }
  });
});
