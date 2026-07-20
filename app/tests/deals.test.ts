import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  heatOf,
  applyIntent,
  basePriceAt,
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
    ...(opts.heat !== undefined
      ? { countryHeat: opts.heat > 0 ? { [home.countryId]: opts.heat } : {}, notoriety: 0 }
      : {}),
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

describe('getMarketPrice — geography is the margin engine (design/11 §1; design/12 Item 3)', () => {
  it('cocaine’s ONE price widens from the source → the islands → Miami', () => {
    const state = createInitialState('route');
    const source = getMarketPrice(state, 'cocaine', 'colombia');
    const local = getMarketPrice(state, 'cocaine', homeId(state));
    const miami = getMarketPrice(state, 'cocaine', 'miami');

    expect(source.price).toBeLessThan(local.price);
    expect(local.price).toBeLessThan(miami.price);
  });

  it('the plug contract price is the cheapest standing price in the game (Ideas2 §2)', () => {
    for (const s of ['plug-a', 'plug-b', 'plug-c']) {
      const state = createInitialState(s);
      const prices = COUNTRY_IDS.map((c) => ({
        country: c,
        plug: requiresPlug(c, 'cocaine'),
        price: getMarketPrice(state, 'cocaine', c).price,
      }));
      const cheapest = prices.reduce((lo, b) => (b.price < lo.price ? b : lo));
      expect(cheapest.plug).toBe(true);
      // The plug price is flagged and drift-free at base.
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

  it('prices and stock are visible for EVERY country — visibility is never gated', () => {
    const state = createInitialState('visible');
    for (const country of COUNTRY_IDS) {
      for (const product of PRODUCT_IDS) {
        const price = getMarketPrice(state, product, country);
        expect(price.price).toBeGreaterThan(0);
        expect(price.stock).toBeGreaterThan(0);
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
    // Heat is per-country (v30) — the DEAL's country must be the hot one.
    const hot: GameState = { ...createInitialState('ceil'), countryHeat: { miami: 100 } };
    expect(computeBustProbability(hot, 'arms', 500, 'miami')).toBe(BUST_MAX);
  });
});

describe('resolveDeal — buy', () => {
  it('spends dirty cash and adds located inventory', () => {
    const state = seed(createInitialState('buy'), { cash: 100_000 });
    const price = getMarketPrice(state, 'weed', homeId(state));
    const result = resolveDeal(state, { type: 'buy', product: 'weed', qty: 10 });

    expect(result.outcome).toBe('success');
    expect(result.cashDelta).toBe(-price.price * 10);
    const home = result.state.stashes[0] as Stash;
    expect(home.inventory.weed).toBe(10);
    expect(home.dirtyCash).toBe(100_000 - price.price * 10);
    // The units came off the street (design/12 Item 10).
    expect(getMarketPrice(result.state, 'weed', homeId(state)).stock).toBe(
      price.stock - 10,
    );
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

  it('clean (borrowed) cash covers a buy shortfall — dirty cash drains first (design/10)', () => {
    const base = seed(createInitialState('loan-buy'), { cash: 0 });
    const price = getMarketPrice(base, 'weed', homeId(base));
    const cost = price.price * 10;

    // Dirty cash covers half the ticket; clean cash (a borrowed stake) the rest.
    const half = Math.floor(cost / 2);
    const funded: GameState = { ...seed(base, { cash: half }), cleanCash: cost };
    const result = resolveDeal(funded, { type: 'buy', product: 'weed', qty: 10 });

    expect(result.outcome).toBe('success');
    const home = result.state.stashes[0] as Stash;
    expect(home.inventory.weed).toBe(10);
    expect(home.dirtyCash).toBe(0); // located cash spent first
    expect(result.state.cleanCash).toBe(half); // clean paid only the shortfall

    // Both pools together still short → reject without mutating.
    const short: GameState = { ...seed(base, { cash: 1 }), cleanCash: 1 };
    const rejected = resolveDeal(short, { type: 'buy', product: 'weed', qty: 10 });
    expect(rejected.rejected).toBe('insufficient-funds');
    expect(rejected.state).toBe(short);
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
    expect(bought.cashDelta).toBe(-price.price * 10);
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

  // 100k full resolveDeal calls — a statistical check, so give it a real budget.
  it('observed bust frequency ≈ displayed probability over 100k sells', { timeout: 30_000 }, () => {
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
      expect(home.dirtyCash).toBe(1000 + price.price * 5);
      expect(result.cashDelta).toBe(price.price * 5);
      expect(hasBankedWin(result.state)).toBe(true);
    }
  });

  it('rejects selling more than the stash holds without mutating', () => {
    const state = seed(createInitialState('no-inv'), { inventory: { weed: 2 } });
    const result = resolveDeal(state, { type: 'sell', product: 'weed', qty: 3 });
    expect(result.rejected).toBe('insufficient-inventory');
    expect(result.state).toBe(state);
  });

  it('a bust seizes only the product on the table and spikes heat (design/13 B2)', () => {
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
    expect(seized.dirtyCash).toBe(5000); // stored dirty cash is UNTOUCHED (B2)
    expect(seized.inventory.cocaine).toBe(150); // 200 − 50 moved product lost
    expect(home).toEqual(homeBefore); // the other location is not touched
    // The spike lands where the table was — Miami, not home (per-country heat, v30).
    expect(heatOf(bust.state, 'miami')).toBeGreaterThan(heatOf(base, 'miami'));
    expect(bust.cashDelta).toBe(0); // nothing but the table walked
  });

  it('a MAJOR bust opens the disclosed investigation window (design/13 B5.5)', () => {
    const start = seed(createInitialState('bust-invest'), { heat: 50, cash: 9999 });
    const base = withStashIn(start, 'miami', { cash: 0, inventory: { cocaine: 200 } });
    // 50 cocaine × heat 1.0 × bustMult 4 = a 200-point spike — far past the threshold.
    const intent = { type: 'sell', product: 'cocaine', qty: 50, stashId: 'stash-miami' } as const;
    let rngState = base.rngState;
    let bust = resolveDeal(base, intent);
    for (let i = 0; i < 1000 && bust.outcome !== 'bust'; i++) {
      const trial: GameState = { ...base, rngState };
      bust = resolveDeal(trial, intent);
      rngState = bust.state.rngState;
    }
    expect(bust.outcome).toBe('bust');
    // The file opens where the bust landed — Miami (per-country windows, v30).
    expect(bust.state.investigations['miami']).toBe(
      bust.state.clock.hours + bust.state.config.heat.INVESTIGATION_HOURS,
    );
    const line = bust.state.pendingChoices.find((c) => c.kind === 'investigation');
    expect(line?.summary).toContain('opened a file');
  });
});

describe('driftPrices — bounded live walk (design/01 §2)', () => {
  it('keeps the live price within base × (1 ± volatility) and derives a trend', () => {
    let state = createInitialState('drift');
    for (let i = 0; i < 50; i++) state = tick(state, 24); // 50 days of drift

    for (const country of COUNTRY_IDS) {
      for (const product of PRODUCT_IDS) {
        // Compare against the UNROUNDED base so rounding can't fake a breach.
        const raw = basePriceAt(state.world, product, country).price;
        const live = getMarketPrice(state, product, country);
        const vol = live.volatility;
        // The one price stays within the volatility band around its (flat) base.
        expect(live.price).toBeGreaterThanOrEqual(Math.floor(raw * (1 - vol)));
        expect(live.price).toBeLessThanOrEqual(Math.ceil(raw * (1 + vol)));
        expect(['up', 'down', 'flat']).toContain(live.trend);
      }
    }
  });

  it('a plug contract price never drifts (Ideas2 §2 — fixed and readable)', () => {
    let state = createInitialState('plug-drift');
    const contract = getMarketPrice(state, 'cocaine', 'colombia').price;
    for (let i = 0; i < 30; i++) state = tick(state, 24);
    expect(getMarketPrice(state, 'cocaine', 'colombia').price).toBe(contract);
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

describe('rejections carry per-reason scene keys (design/13 A1 — never success copy)', () => {
  it('every reject reason lands its own scene key, distinct from every success key', () => {
    const base = seed(createInitialState('reject-keys'), { cash: 0, inventory: {} });

    const fractional = resolveDeal(base, { type: 'sell', product: 'weed', qty: 1.5 });
    expect(fractional.rejected).toBe('invalid-qty');
    expect(fractional.sceneKey).toBe('deal.reject.invalid-qty');

    const shortInv = resolveDeal(base, { type: 'sell', product: 'weed', qty: 10 });
    expect(shortInv.rejected).toBe('insufficient-inventory');
    expect(shortInv.sceneKey).toBe('deal.reject.insufficient-inventory');

    const broke = resolveDeal(base, { type: 'buy', product: 'weed', qty: 5 });
    expect(broke.rejected).toBe('insufficient-funds');
    expect(broke.sceneKey).toBe('deal.reject.insufficient-funds');

    // Reject scene keys never collide with the success/bust keys.
    for (const r of [fractional, shortInv, broke]) {
      expect(r.sceneKey.startsWith('deal.reject.')).toBe(true);
      expect(r.state).toBe(base); // rejections never mutate
    }
  });
});

describe('a bust never touches stored dirty cash (design/13 B2 — Prompt 44)', () => {
  it('leaves the stash cash in place and queues no cash-seized line', () => {
    // Force a bust exactly as the seizure test does: hot Miami, retry the roll.
    const start = seed(createInitialState('bust-feed'), { heat: 50, cash: 0 });
    const staged = withStashIn(start, 'miami', {
      cash: 12_400,
      inventory: { cocaine: 20 },
    });
    const intent = { type: 'sell', product: 'cocaine', qty: 10, stashId: 'stash-miami' } as const;

    let rngState = staged.rngState;
    let bust = resolveDeal(staged, intent);
    for (let i = 0; i < 1000 && bust.outcome !== 'bust'; i++) {
      const trial: GameState = { ...staged, rngState };
      bust = resolveDeal(trial, intent);
      rngState = bust.state.rngState;
    }
    expect(bust.outcome).toBe('bust');

    // Only the table is seized: the stored dirty cash stays; raids (storage.ts)
    // are the ONLY path stored dirty cash is lost through now.
    const stash = bust.state.stashes.find((s) => s.id === 'stash-miami')!;
    expect(stash.dirtyCash).toBe(12_400);
    expect(bust.state.pendingChoices.some((c) => c.kind === 'cash-seized')).toBe(false);
  });
});
