import { describe, expect, it } from 'vitest';
import {
  heatOf,
  COUNTRIES,
  PLUG_MEETING_HEAT,
  applyIntent,
  buyPlug,
  createInitialState,
  hasPlug,
  plugQuote,
  plugQuotes,
  type GameState,
} from '@/engine';

const withCleanCash = (state: GameState, cleanCash: number): GameState => ({
  ...state,
  cleanCash,
});

describe('plug roster — the true sources (Ideas2 §2)', () => {
  it('Colombia sources coke; Mexico meth/fentanyl; the Golden Crescent heroin/hash', () => {
    const byId = new Map(COUNTRIES.map((c) => [c.id, c] as const));
    expect(byId.get('colombia')?.plugFor).toContain('cocaine');
    expect(byId.get('mexico')?.plugFor).toEqual(
      expect.arrayContaining(['meth', 'fentanyl']),
    );
    expect(byId.get('golden-crescent')?.plugFor).toEqual(
      expect.arrayContaining(['heroin', 'hash']),
    );
  });

  it('no START-ELIGIBLE island gates anything behind a plug (open access at home)', () => {
    // A run starts on a Caribbean home island; none may gate a product behind a
    // plug. Reachable non-start islands (e.g. Jamaica, the weed/exotic source in
    // design/12 Item 9) CAN be true sources — the home hand just never is.
    for (const country of COUNTRIES.filter((c) => c.startEligible)) {
      expect(country.plugFor ?? []).toHaveLength(0);
    }
  });

  it('every plug is quoted, priced, and visible from minute one (money is the gate)', () => {
    const state = createInitialState('quotes');
    const quotes = plugQuotes(state);
    expect(quotes.length).toBeGreaterThanOrEqual(3);
    for (const quote of quotes) {
      expect(quote.cost).toBeGreaterThan(0);
      expect(quote.products.length).toBeGreaterThan(0);
      expect(quote.connected).toBe(false);
      expect(quote.meetingHeat).toBe(PLUG_MEETING_HEAT);
    }
  });
});

describe('buyPlug — a pure money gate, never a roll or a time lock', () => {
  it('spends the clean-cash intro, records the connection, and takes the shown heat', () => {
    const cost = plugQuote(createInitialState('x'), 'colombia')!.cost;
    const state = withCleanCash(createInitialState('buy-plug'), cost + 500);
    const result = buyPlug(state, 'colombia');

    expect(result.ok).toBe(true);
    expect(result.cost).toBe(cost);
    expect(result.state.cleanCash).toBe(500);
    expect(hasPlug(result.state, 'colombia')).toBe(true);
    // The meeting's heat lands on the plug's country (per-country heat, v30).
    expect(heatOf(result.state, 'colombia')).toBe(heatOf(state, 'colombia') + PLUG_MEETING_HEAT);
    expect(plugQuote(result.state, 'colombia')?.connected).toBe(true);
  });

  it('rejects unknown countries, non-sources, repeats, and short funds without mutating', () => {
    const state = withCleanCash(createInitialState('plug-reject'), 1_000_000);

    const unknown = buyPlug(state, 'atlantis');
    expect(unknown.rejected).toBe('unknown-country');
    expect(unknown.state).toBe(state);

    const notOffered = buyPlug(state, 'miami');
    expect(notOffered.rejected).toBe('no-plug-offered');
    expect(notOffered.state).toBe(state);

    const broke = withCleanCash(state, 0);
    const unfunded = buyPlug(broke, 'colombia');
    expect(unfunded.rejected).toBe('insufficient-funds');
    expect(unfunded.state).toBe(broke);

    const connected = buyPlug(state, 'colombia').state;
    const repeat = buyPlug(connected, 'colombia');
    expect(repeat.rejected).toBe('already-connected');
    expect(repeat.state).toBe(connected);
  });

  it('dispatches through applyIntent deterministically', () => {
    const run = (): GameState => {
      const s = withCleanCash(createInitialState('plug-det'), 2_000_000);
      let next = applyIntent(s, { type: 'buyPlug', countryId: 'colombia' });
      next = applyIntent(next, { type: 'buyPlug', countryId: 'golden-crescent' });
      return next;
    };
    const end = run();
    expect(end).toEqual(run());
    expect(end.plugs).toEqual(['colombia', 'golden-crescent']);
  });
});
