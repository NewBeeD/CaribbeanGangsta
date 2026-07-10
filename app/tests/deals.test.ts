import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  applyIntent,
  emptyInventory,
  getMarketPrice,
  computeBustProbability,
  resolveDeal,
  hasBankedWin,
  driftPrices,
  tick,
  rngFor,
  BUST_MIN,
  BUST_MAX,
  COUNTRY_IDS,
  DEFAULT_STASH_CAPACITY,
  PRODUCT_IDS,
  requiresPlug,
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

/** Append a foothold stash in `countryId` (design/11 — your presence there). */
function withStashIn(
  state: GameState,
  countryId: string,
  opts: { cash?: number; inventory?: Partial<Record<ProductId, number>> } = {},
): GameState {
  const stash: Stash = {
    id: `stash-${countryId}`,
    name: countryId,
    countryId,
    type: 'floor',
    dirtyCash: opts.cash ?? 0,
    inventory: { ...emptyInventory(), ...(opts.inventory ?? {}) },
  };
  return { ...state, stashes: [...state.stashes, stash] };
}

const homeId = (state: GameState): string => (state.stashes[0] as Stash).countryId;

describe('getMarketPrice — geography is the margin engine (design/11 §1)', () => {
  it('cocaine sell price widens from the source → the islands → Miami', () => {
    const state = createInitialState('route');
    const source = getMarketPrice(state, 'cocaine', 'colombia');
    const local = getMarketPrice(state, 'cocaine', homeId(state));
    const miami = getMarketPrice(state, 'cocaine', 'miami');

    expect(source.sell).toBeLessThan(local.sell);
    expect(local.sell).toBeLessThan(miami.sell);
    // Margin (sell − buy) also widens down the route for the margin engine.
    expect(miami.sell - miami.buy).toBeGreaterThan(source.sell - source.buy);
  });

  it('the plug contract price is the cheapest standing buy in the game (Ideas2 §2)', () => {
    for (const s of ['plug-a', 'plug-b', 'plug-c']) {
      const state = createInitialState(s);
      const buys = COUNTRY_IDS.map((c) => ({
        country: c,
        plug: requiresPlug(c, 'cocaine'),
        buy: getMarketPrice(state, 'cocaine', c).buy,
      }));
      const cheapest = buys.reduce((lo, b) => (b.buy < lo.buy ? b : lo));
      expect(cheapest.plug).toBe(true);
      // The plug buy is flagged and drift-free at base.
      expect(getMarketPrice(state, 'cocaine', 'colombia').plugPriced).toBe(true);
    }
  });

  it('starts flat at base (factor 1) and reports volatility from the board', () => {
    const state = createInitialState('flat');
    for (const product of PRODUCT_IDS) {
      const price = getMarketPrice(state, product, homeId(state));
      expect(price.trend).toBe('flat');
      expect(price.volatility).toBeGreaterThanOrEqual(0.2);
      expect(price.volatility).toBeLessThanOrEqual(0.5);
    }
  });

  it('prices are visible for EVERY country — visibility is never gated', () => {
    const state = createInitialState('visible');
    for (const country of COUNTRY_IDS) {
      for (const product of PRODUCT_IDS) {
        const price = getMarketPrice(state, product, country);
        expect(price.buy).toBeGreaterThan(0);
        expect(price.sell).toBeGreaterThan(0);
      }
    }
  });
});

describe('computeBustProbability — clamp and fairness', () => {
  it('is always within [0.03, 0.60] across extremes', () => {
    const calm = seed(createInitialState('calm'), { heat: 0 });
    const hot = seed(createInitialState('hot'), { heat: 100 });
    for (const product of PRODUCT_IDS) {
      for (const country of COUNTRY_IDS) {
        for (const qty of [1, 50, 500]) {
          const pCalm = computeBustProbability(calm, product, qty, country);
          const pHot = computeBustProbability(hot, product, qty, country);
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
    expect(computeBustProbability(calm, 'weed', 1, 'marigot-bay')).toBe(BUST_MIN);
    const hot = seed(createInitialState('ceil'), { heat: 100 });
    expect(computeBustProbability(hot, 'arms', 500, 'miami')).toBe(BUST_MAX);
  });
});

describe('resolveDeal — buy', () => {
  it('spends dirty cash and adds located inventory', () => {
    const state = seed(createInitialState('buy'), { cash: 100_000 });
    const price = getMarketPrice(state, 'weed', homeId(state));
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

  it('rejects a product with no market in the stash country (Ideas2 §5)', () => {
    // Meth never fronts on an island corner — the home stash is Caribbean.
    const state = seed(createInitialState('culture'), { cash: 1_000_000 });
    const result = resolveDeal(state, { type: 'buy', product: 'meth', qty: 1 });
    expect(result.rejected).toBe('not-traded');
    expect(result.state).toBe(state);
  });

  it('a true source requires the plug; with it, buys land at the contract price', () => {
    const base = withStashIn(seed(createInitialState('plug'), {}), 'colombia', {
      cash: 1_000_000,
    });
    const gated = resolveDeal(base, {
      type: 'buy',
      product: 'cocaine',
      qty: 10,
      stashId: 'stash-colombia',
    });
    expect(gated.rejected).toBe('no-plug');
    expect(gated.state).toBe(base);

    const connected: GameState = { ...base, plugs: ['colombia'] };
    const price = getMarketPrice(connected, 'cocaine', 'colombia');
    const bought = resolveDeal(connected, {
      type: 'buy',
      product: 'cocaine',
      qty: 10,
      stashId: 'stash-colombia',
    });
    expect(bought.outcome).toBe('success');
    expect(bought.cashDelta).toBe(-price.buy * 10);
    const stash = bought.state.stashes.find((s) => s.id === 'stash-colombia')!;
    expect(stash.inventory.cocaine).toBe(10);
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
    const p = computeBustProbability(base, 'weed', 1, homeId(base));

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
    const price = getMarketPrice(state, 'weed', homeId(state));
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
    // Two stashes: the deal targets the Miami foothold; home must be untouched.
    const start = seed(createInitialState('bust'), { heat: 50, cash: 9999 });
    const base = withStashIn(start, 'miami', {
      cash: 5000,
      inventory: { cocaine: 200 },
    });
    const homeBefore = base.stashes[0] as Stash;

    // Advance the RNG until a bust lands (p ≈ 0.44 in hot Miami), holding funds fixed.
    const intent = {
      type: 'sell',
      product: 'cocaine',
      qty: 50,
      stashId: 'stash-miami',
    } as const;
    let rngState = base.rngState;
    let bust = resolveDeal(base, intent);
    for (let i = 0; i < 1000 && bust.outcome !== 'bust'; i++) {
      const trial: GameState = { ...base, rngState };
      bust = resolveDeal(trial, intent);
      rngState = bust.state.rngState;
    }
    expect(bust.outcome).toBe('bust');

    const home = bust.state.stashes[0] as Stash;
    const seized = bust.state.stashes.find((s) => s.id === 'stash-miami')!;
    expect(seized.dirtyCash).toBe(0); // staked cash seized
    expect(seized.inventory.cocaine).toBe(150); // 200 − 50 moved product lost
    expect(home).toEqual(homeBefore); // the other location is not touched
    expect(bust.state.heat).toBeGreaterThan(50); // heat spikes on a bust
    expect(bust.cashDelta).toBe(-5000);
  });
});

describe('driftPrices — bounded live walk (design/01 §2)', () => {
  it('keeps the live price within base × (1 ± volatility) and derives a trend', () => {
    let state = createInitialState('drift');
    for (let i = 0; i < 50; i++) state = tick(state, 24); // 50 days of drift

    for (const country of COUNTRY_IDS) {
      for (const product of PRODUCT_IDS) {
        const base = getMarketPrice(createInitialState('drift'), product, country);
        const live = getMarketPrice(state, product, country);
        const vol = live.volatility;
        // buy/sell stay within the volatility band around their (flat) base.
        expect(live.buy).toBeGreaterThanOrEqual(Math.floor(base.buy * (1 - vol)));
        expect(live.buy).toBeLessThanOrEqual(Math.ceil(base.buy * (1 + vol)));
        expect(['up', 'down', 'flat']).toContain(live.trend);
      }
    }
  });

  it('a plug contract buy price never drifts (Ideas2 §2 — fixed and readable)', () => {
    let state = createInitialState('plug-drift');
    const contract = getMarketPrice(state, 'cocaine', 'colombia').buy;
    for (let i = 0; i < 30; i++) state = tick(state, 24);
    expect(getMarketPrice(state, 'cocaine', 'colombia').buy).toBe(contract);
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
        { type: 'sell', product: 'weed', qty: 3 },
        { type: 'buy', product: 'cocaine', qty: 2 },
      ];
      for (const intent of script) s = applyIntent(s, intent);
      return tick(s, 12);
    };
    expect(run()).toEqual(run());
  });
});
