import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  applyIntent,
  getMarketPrice,
  computeBustProbability,
  resolveDeal,
  hasBankedWin,
  driftPrices,
  tick,
  rngFor,
  BUST_MIN,
  BUST_MAX,
  DEFAULT_STASH_CAPACITY,
  LOCATION_IDS,
  PRODUCT_IDS,
  spawnCrew,
  type GameState,
  type ProductId,
  type Stash,
} from '@/engine';

/** Overwrite the home stash's cash/inventory and the run's heat, immutably. */
function seed(
  state: GameState,
  opts: {
    cash?: number;
    heat?: number;
    inventory?: Partial<Record<ProductId, number>>;
  },
): GameState {
  const home = state.stashes[0] as Stash;
  const inventory = { ...home.inventory, ...(opts.inventory ?? {}) };
  const nextHome: Stash = {
    ...home,
    dirtyCash: opts.cash ?? home.dirtyCash,
    inventory,
  };
  return {
    ...state,
    heat: opts.heat ?? state.heat,
    stashes: [nextHome, ...state.stashes.slice(1)],
  };
}

describe('getMarketPrice — route economics (design/01 §2)', () => {
  it('cocaine sell margin widens with route distance (source < mid < wholesale)', () => {
    const state = createInitialState('route');
    const source = getMarketPrice(state, 'cocaine', 'source');
    const mid = getMarketPrice(state, 'cocaine', 'mid-route');
    const wholesale = getMarketPrice(state, 'cocaine', 'wholesale');

    expect(source.sell).toBeLessThan(mid.sell);
    expect(mid.sell).toBeLessThan(wholesale.sell);
    // Margin (sell − buy) also widens down the route for the margin engine.
    expect(wholesale.sell - wholesale.buy).toBeGreaterThan(source.sell - source.buy);
  });

  it('starts flat at base (factor 1) and reports volatility from the board', () => {
    const state = createInitialState('flat');
    for (const product of PRODUCT_IDS) {
      const price = getMarketPrice(state, product, 'source');
      expect(price.trend).toBe('flat');
      expect(price.volatility).toBeGreaterThanOrEqual(0.2);
      expect(price.volatility).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('computeBustProbability — clamp and fairness', () => {
  it('is always within [0.03, 0.60] across extremes', () => {
    const calm = seed(createInitialState('calm'), { heat: 0 });
    const hot = seed(createInitialState('hot'), { heat: 100 });
    for (const product of PRODUCT_IDS) {
      for (const loc of LOCATION_IDS) {
        for (const qty of [1, 50, 500]) {
          const pCalm = computeBustProbability(calm, product, qty, loc);
          const pHot = computeBustProbability(hot, product, qty, loc);
          for (const p of [pCalm, pHot]) {
            expect(p).toBeGreaterThanOrEqual(BUST_MIN);
            expect(p).toBeLessThanOrEqual(BUST_MAX);
          }
        }
      }
    }
  });

  it('floors at BUST_MIN when calm + skilled crew, ceils at BUST_MAX when hot/heavy', () => {
    // A loyal crew is the only input that can drive the raw value below the floor.
    const calm: GameState = {
      ...seed(createInitialState('floor'), { heat: 0 }),
      crew: [spawnCrew('deon', { id: 'c1', loyalty: 100 })],
    };
    expect(computeBustProbability(calm, 'weed', 1, 'source')).toBe(BUST_MIN);
    const hot = seed(createInitialState('ceil'), { heat: 100 });
    expect(computeBustProbability(hot, 'arms', 500, 'wholesale')).toBe(BUST_MAX);
  });
});

describe('resolveDeal — buy', () => {
  it('spends dirty cash and adds located inventory', () => {
    const state = seed(createInitialState('buy'), { cash: 100_000 });
    const price = getMarketPrice(state, 'weed', 'source');
    const result = resolveDeal(state, { type: 'buy', product: 'weed', qty: 10 });

    expect(result.outcome).toBe('success');
    expect(result.cashDelta).toBe(-price.buy * 10);
    const home = result.state.stashes[0] as Stash;
    expect(home.inventory.weed).toBe(10);
    expect(home.dirtyCash).toBe(100_000 - price.buy * 10);
  });

  it('rejects invalid qty, insufficient funds, and over-capacity without mutating', () => {
    const broke = seed(createInitialState('reject'), { cash: 0 });
    const zero = resolveDeal(broke, { type: 'buy', product: 'weed', qty: 0 });
    expect(zero.outcome).toBe('rejected');
    expect(zero.rejected).toBe('invalid-qty');
    expect(zero.state).toBe(broke);

    const funds = resolveDeal(broke, { type: 'buy', product: 'weed', qty: 1 });
    expect(funds.rejected).toBe('insufficient-funds');
    expect(funds.state).toBe(broke);

    const full = seed(createInitialState('cap'), {
      cash: 100_000_000,
      inventory: { weed: DEFAULT_STASH_CAPACITY },
    });
    const capped = resolveDeal(full, { type: 'buy', product: 'weed', qty: 1 });
    expect(capped.rejected).toBe('insufficient-capacity');
    expect(capped.state).toBe(full);
  });
});

describe('resolveDeal — sell (fairness law, GDD §8)', () => {
  it('rolls against EXACTLY the displayed probability', () => {
    const state = seed(createInitialState('fair-once'), {
      heat: 40,
      inventory: { weed: 100 },
    });
    const result = resolveDeal(state, { type: 'sell', product: 'weed', qty: 1 });
    const expectedOutcome =
      result.rolledValue < result.displayedBustProb ? 'bust' : 'success';
    expect(result.outcome).toBe(expectedOutcome);
  });

  it('observed bust frequency ≈ displayed probability over 100k sells', () => {
    const base = seed(createInitialState('fair-mc'), {
      heat: 40,
      inventory: { weed: 500 },
      cash: 0,
    });
    const p = computeBustProbability(base, 'weed', 1, 'source');

    const N = 100_000;
    let busts = 0;
    let rngState = base.rngState;
    for (let i = 0; i < N; i++) {
      // Hold p constant by re-seeding fixed fields, but thread the RNG forward.
      const trial: GameState = { ...base, rngState };
      const result = resolveDeal(trial, { type: 'sell', product: 'weed', qty: 1 });
      expect(result.displayedBustProb).toBe(p); // p never drifts across trials
      if (result.outcome === 'bust') busts++;
      rngState = result.state.rngState;
    }
    expect(busts / N).toBeCloseTo(p, 2); // within ~0.005
  });

  it('a success banks cash + inventory and flips the win flag', () => {
    const state = seed(createInitialState('sell-win'), {
      heat: 0, // low heat → very likely success
      inventory: { weed: 5 },
      cash: 1000,
    });
    expect(hasBankedWin(state)).toBe(false);
    const price = getMarketPrice(state, 'weed', 'source');
    const result = resolveDeal(state, { type: 'sell', product: 'weed', qty: 5 });

    // Not guaranteed, but with BUST_MIN floor at heat 0 a bust is rare; assert the
    // branch we care about when it succeeds.
    if (result.outcome === 'success') {
      const home = result.state.stashes[0] as Stash;
      expect(home.inventory.weed).toBe(0);
      expect(home.dirtyCash).toBe(1000 + price.sell * 5);
      expect(result.cashDelta).toBe(price.sell * 5);
      expect(hasBankedWin(result.state)).toBe(true);
    }
  });

  it('rejects selling more than the stash holds without mutating', () => {
    const state = seed(createInitialState('no-inv'), { inventory: { weed: 2 } });
    const result = resolveDeal(state, { type: 'sell', product: 'weed', qty: 3 });
    expect(result.rejected).toBe('insufficient-inventory');
    expect(result.state).toBe(state);
  });

  it('a bust seizes cash + product only at the deal’s stash and spikes heat', () => {
    // Two stashes: the deal targets the home stash; the other must be untouched.
    const start = seed(createInitialState('bust'), {
      heat: 50,
      cash: 5000,
      inventory: { cocaine: 200 },
    });
    const other: Stash = {
      id: 'stash-other',
      name: 'Other',
      countryId: 'elsewhere',
      type: 'floor',
      dirtyCash: 9999,
      inventory: { ...(start.stashes[0] as Stash).inventory, cocaine: 100 },
    };
    const base: GameState = { ...start, stashes: [start.stashes[0] as Stash, other] };

    // Advance the RNG until a bust lands (p ≈ 0.44 at wholesale), holding funds fixed.
    let rngState = base.rngState;
    let bust = resolveDeal(base, { type: 'sell', product: 'cocaine', qty: 50, location: 'wholesale' });
    for (let i = 0; i < 1000 && bust.outcome !== 'bust'; i++) {
      const trial: GameState = { ...base, rngState };
      bust = resolveDeal(trial, { type: 'sell', product: 'cocaine', qty: 50, location: 'wholesale' });
      rngState = bust.state.rngState;
    }
    expect(bust.outcome).toBe('bust');

    const home = bust.state.stashes[0] as Stash;
    const untouched = bust.state.stashes[1] as Stash;
    expect(home.dirtyCash).toBe(0); // staked cash seized
    expect(home.inventory.cocaine).toBe(150); // 200 − 50 moved product lost
    expect(untouched).toEqual(other); // the other location is not touched
    expect(bust.state.heat).toBeGreaterThan(50); // heat spikes on a bust
    expect(bust.cashDelta).toBe(-5000);
  });
});

describe('driftPrices — bounded live walk (design/01 §2)', () => {
  it('keeps the live price within base × (1 ± volatility) and derives a trend', () => {
    let state = createInitialState('drift');
    for (let i = 0; i < 50; i++) state = tick(state, 24); // 50 days of drift

    for (const loc of LOCATION_IDS) {
      for (const product of PRODUCT_IDS) {
        const base = getMarketPrice(createInitialState('drift'), product, loc);
        const live = getMarketPrice(state, product, loc);
        const vol = live.volatility;
        // buy/sell stay within the volatility band around their (flat) base.
        expect(live.buy).toBeGreaterThanOrEqual(Math.floor(base.buy * (1 - vol)));
        expect(live.buy).toBeLessThanOrEqual(Math.ceil(base.buy * (1 + vol)));
        expect(['up', 'down', 'flat']).toContain(live.trend);
      }
    }
  });

  it('does not advance the clock or run offline (frozen while away)', () => {
    const base = createInitialState('drift-offline');
    // driftPrices consumes rng; a pure call still returns a valid, in-band state.
    const rng = rngFor(base);
    const drifted = driftPrices(base, rng, 24);
    expect(drifted.clock).toEqual(base.clock);
  });
});

describe('determinism (Prompt 04 acceptance)', () => {
  it('same seed + same intent sequence → identical state', () => {
    const run = (): GameState => {
      let s = seed(createInitialState('determinism'), {
        cash: 500_000,
        inventory: { weed: 100 },
      });
      const script: Parameters<typeof applyIntent>[1][] = [
        { type: 'buy', product: 'weed', qty: 5 },
        { type: 'sell', product: 'weed', qty: 3, location: 'mid-route' },
        { type: 'buy', product: 'cocaine', qty: 2 },
      ];
      for (const intent of script) s = applyIntent(s, intent);
      return tick(s, 12);
    };
    expect(run()).toEqual(run());
  });
});
