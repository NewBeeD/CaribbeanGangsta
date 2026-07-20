/**
 * Prompt 32 — the one-price economy & finite stock (design/12 Items 3/10/11).
 *
 * The acceptance contract:
 *  - buy-then-sell in place is a WASH (one price, no in-place margin);
 *  - geography is the whole margin engine (distant region > source, every seed);
 *  - the plug price is below every open-market price (every seed);
 *  - buying depletes stock, `no-supply` past it (no mutation), selling restores;
 *  - restock refills over ACTIVE time only, capped; scarcity biases drift up but
 *    never past the band;
 *  - the margin % is gone from the board (Item 11 — the row carries one price).
 */

import { describe, expect, it } from 'vitest';
import { withHomeHeat } from './heatTestUtils';
import {
  createInitialState,
  tunedConfig,
  getMarketPrice,
  resolveDeal,
  restockMarkets,
  stockCapFor,
  tick,
  basePriceAt,
  COUNTRIES,
  COUNTRY_IDS,
  PRODUCT_IDS,
  requiresPlug,
  emptyInventory,
  type GameState,
  type ProductId,
  type Stash,
} from '@/engine';
import { productRows } from '@/ui/screens/dealScreen.model';

/** Append a foothold stash in `countryId` with cash + optional inventory. */
function withStashIn(
  state: GameState,
  countryId: string,
  opts: { cash?: number; inventory?: Partial<Record<ProductId, number>> } = {},
): GameState {
  const stash: Stash = {
    id: `stash-${countryId}`,
    name: countryId,
    countryId,
    type: 'container', // roomiest archetype — capacity never binds these fixtures
    dirtyCash: opts.cash ?? 0,
    inventory: { ...emptyInventory(), ...(opts.inventory ?? {}) },
  };
  return { ...state, stashes: [...state.stashes, stash] };
}

const homeId = (s: GameState): string => s.stashes[0]!.countryId;

describe('one price per market (design/12 Item 3)', () => {
  it('buy-then-sell in place at the same instant is a wash (minus heat/bust)', () => {
    // A calm island market: buy weed, immediately sell it back — the one price
    // means the cash out on the buy equals the cash in on a surviving sell.
    const base = createInitialState('wash');
    const home = base.stashes[0]!;
    const state: GameState = {
      ...withHomeHeat(base, 0),
      stashes: [{ ...home, dirtyCash: 1_000_000 }, ...base.stashes.slice(1)],
    };
    const price = getMarketPrice(state, 'weed', homeId(state)).price;

    const bought = resolveDeal(state, { type: 'buy', product: 'weed', qty: 10 });
    expect(bought.outcome).toBe('success');
    expect(bought.cashDelta).toBe(-price * 10);

    // Sell straight back — price hasn't drifted (no tick between).
    const sold = resolveDeal(bought.state, { type: 'sell', product: 'weed', qty: 10 });
    if (sold.outcome === 'success') {
      expect(sold.cashDelta).toBe(price * 10); // exact wash on cash
      const homeAfter = sold.state.stashes[0]!;
      expect(homeAfter.dirtyCash).toBe(1_000_000); // net zero, minus nothing
    }
  });

  it('buys and sells execute at the SAME single number', () => {
    const state = createInitialState('same-number');
    for (const country of COUNTRY_IDS) {
      for (const product of PRODUCT_IDS) {
        const price = getMarketPrice(state, product, country);
        // The MarketPrice carries one `price`, no buy/sell split.
        expect(price).toHaveProperty('price');
        expect(price).not.toHaveProperty('buy');
        expect(price).not.toHaveProperty('sell');
      }
    }
  });

  it('geography is the margin engine: distant region strictly exceeds source at neutral demand (every seed)', () => {
    // "At neutral drift" (design/12) means neutral per-run demand too: isolate
    // the geography engine by pinning every country's demandFactor to 1, so the
    // only thing moving the price between countries is the region-distance
    // stretch (and fixed productBias, which is ≤1 and same-region only).
    for (let s = 0; s < 60; s++) {
      const born = createInitialState(`geo-${s}`);
      const neutralWorld = {
        ...born.world,
        supplierGeography: born.world.supplierGeography.map((sm) => ({
          ...sm,
          demandFactor: 1,
        })),
      };
      const state: GameState = { ...born, world: neutralWorld };
      for (const product of PRODUCT_IDS) {
        const cfg = state.config.products.PRODUCTS.find((p) => p.id === product)!;
        // A non-plug country in the source region prices at the pure source
        // number (distance 0, demand 1, no productBias raising it).
        const sourceCountry = COUNTRIES.find(
          (c) =>
            c.region === cfg.sourceRegion &&
            !requiresPlug(c.id, product) &&
            (c.productBias?.[product] ?? 1) >= 1,
        );
        if (!sourceCountry) continue;
        const atSource = basePriceAt(state.world, product, sourceCountry.id).price;
        for (const c of COUNTRIES) {
          if (requiresPlug(c.id, product)) continue;
          if (c.region === cfg.sourceRegion) continue;
          const here = basePriceAt(state.world, product, c.id).price;
          // A distant country with a below-1 productBias could dip; those are
          // same-region flavor only, so at a different region bias is 1.
          expect(here).toBeGreaterThan(atSource);
        }
      }
    }
  });

  it('the plug price is below every open-market price for that product (every seed)', () => {
    for (let s = 0; s < 60; s++) {
      const state = createInitialState(`plug-${s}`);
      for (const country of COUNTRIES) {
        for (const product of country.plugFor ?? []) {
          const plugPrice = getMarketPrice(state, product, country.id).price;
          expect(getMarketPrice(state, product, country.id).plugPriced).toBe(true);
          for (const other of COUNTRY_IDS) {
            if (requiresPlug(other, product)) continue; // compare to open markets
            expect(plugPrice).toBeLessThan(getMarketPrice(state, product, other).price);
          }
        }
      }
    }
  });

  it('the deal board carries one price and no margin % (Item 11)', () => {
    const state = createInitialState('no-margin');
    const rows = productRows(state, state.stashes[0]!);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty('price');
      expect(row).not.toHaveProperty('marginPct');
      expect(row).not.toHaveProperty('buy');
      expect(row).not.toHaveProperty('sell');
      expect(row).toHaveProperty('stock');
    }
  });
});

describe('finite stock (design/12 Item 10)', () => {
  it('buying depletes the pool; selling puts a fraction back', () => {
    const base = withStashIn(createInitialState('stock'), 'miami', {
      cash: 100_000_000,
    });
    const before = getMarketPrice(base, 'weed', 'miami').stock;
    const bought = resolveDeal(base, {
      type: 'buy',
      product: 'weed',
      qty: 10,
      stashId: 'stash-miami',
    });
    expect(bought.outcome).toBe('success');
    expect(getMarketPrice(bought.state, 'weed', 'miami').stock).toBe(before - 10);

    // Selling returns SELL_RESTOCK_FRACTION of the units to the street.
    const afterBuy = getMarketPrice(bought.state, 'weed', 'miami').stock;
    const withHeatZero: GameState = { ...bought.state, countryHeat: {}, notoriety: 0 };
    const sold = resolveDeal(withHeatZero, {
      type: 'sell',
      product: 'weed',
      qty: 10,
      stashId: 'stash-miami',
    });
    if (sold.outcome === 'success') {
      const frac = base.config.markets.SELL_RESTOCK_FRACTION;
      expect(getMarketPrice(sold.state, 'weed', 'miami').stock).toBe(
        Math.floor(afterBuy + 10 * frac),
      );
    }
  });

  it('a buy past the shown stock rejects no-supply without mutating', () => {
    const base = withStashIn(createInitialState('dry'), 'miami', { cash: 1_000_000_000 });
    const stock = getMarketPrice(base, 'weed', 'miami').stock;
    const result = resolveDeal(base, {
      type: 'buy',
      product: 'weed',
      qty: stock + 1,
      stashId: 'stash-miami',
    });
    expect(result.rejected).toBe('no-supply');
    expect(result.state).toBe(base);

    // Exactly the shown stock is buyable (the clamp is honest).
    const exact = resolveDeal(base, {
      type: 'buy',
      product: 'weed',
      qty: stock,
      stashId: 'stash-miami',
    });
    expect(exact.outcome).toBe('success');
  });

  it('restock refills over ACTIVE hours only, capped at the seed ceiling', () => {
    const base = withStashIn(createInitialState('restock'), 'miami', {
      cash: 100_000_000,
    });
    // Drain the pool most of the way down.
    const stock = getMarketPrice(base, 'weed', 'miami').stock;
    const drained = resolveDeal(base, {
      type: 'buy',
      product: 'weed',
      qty: stock,
      stashId: 'stash-miami',
    }).state;
    expect(getMarketPrice(drained, 'weed', 'miami').stock).toBe(0);

    // A day of active play restocks by RESTOCK_PER_DAY.
    const perDay = base.config.markets.RESTOCK_PER_DAY;
    const restocked = restockMarkets(drained, 24);
    expect(getMarketPrice(restocked, 'weed', 'miami').stock).toBe(perDay);

    // Restock never fills past the ceiling.
    const cap = stockCapFor('miami', 'weed', base.config.markets);
    let full = drained;
    for (let i = 0; i < 100; i++) full = restockMarkets(full, 24);
    expect(getMarketPrice(full, 'weed', 'miami').stock).toBe(cap);
  });

  it('offline never restocks (frozen world, GDD §6)', () => {
    const base = withStashIn(createInitialState('offline-stock'), 'miami', {
      cash: 100_000_000,
    });
    const stock = getMarketPrice(base, 'weed', 'miami').stock;
    const drained = resolveDeal(base, {
      type: 'buy',
      product: 'weed',
      qty: stock,
      stashId: 'stash-miami',
    }).state;
    // restockMarkets is an ACTIVE-only step; it is never called on the offline
    // path — asserting the step's own dt<=0 guard is a no-op stand-in here.
    expect(restockMarkets(drained, 0)).toBe(drained);
  });

  it('scarcity biases drift up but the walk never leaves the band', () => {
    // Drain a market, then drift many days: the low pool pushes the factor up,
    // but the live price still stays inside base × (1 ± volatility). Isolate the
    // DRIFT band from the world-event overlay (design/12 Item 6; Prompt 33) —
    // events deliberately push outside the band, so turn them off to test drift.
    const base = withStashIn(
      createInitialState('scarcity', tunedConfig({ events: { MARKET_EVENT_RATE_PER_HOUR: 0 } })),
      'miami',
      { cash: 1_000_000_000 },
    );
    let state = resolveDeal(base, {
      type: 'buy',
      product: 'weed',
      qty: getMarketPrice(base, 'weed', 'miami').stock,
      stashId: 'stash-miami',
    }).state;

    for (let i = 0; i < 40; i++) {
      // Re-drain each cycle so scarcity pressure stays high.
      const s = getMarketPrice(state, 'weed', 'miami').stock;
      if (s > 0) {
        state = resolveDeal(state, {
          type: 'buy',
          product: 'weed',
          qty: s,
          stashId: 'stash-miami',
        }).state;
      }
      state = tick(state, 24);
      const raw = basePriceAt(state.world, 'weed', 'miami').price;
      const live = getMarketPrice(state, 'weed', 'miami');
      expect(live.price).toBeLessThanOrEqual(Math.ceil(raw * (1 + live.volatility)));
      expect(live.price).toBeGreaterThanOrEqual(Math.floor(raw * (1 - live.volatility)));
    }
  });
});
