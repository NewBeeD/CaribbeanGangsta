/**
 * The World Market screen's view-model (Prompt 31; design/11 §1–§2; Ideas2 §2/§3
 * — "just like Drug Lords 2, there should be a market to see drug prices across
 * all regions"). PURE read selectors that turn the `GameState` into the price
 * board the screen renders. The screen composes these; it authors NO economic
 * math (README UI rule) — every number is `getMarketPrice` / `plugQuote`
 * verbatim, so what's shown is exactly what a deal there would execute at.
 *
 * Open access (Ideas.md): EVERY country's prices show from minute one. An
 * un-traded cell reads "no market" (inert — Ideas2 §5 regional cultures); a
 * plug-gated cell shows the standing contract price with the intro cost
 * (Ideas2 §2 — a pure money gate, never a hidden menu).
 */

import {
  COUNTRIES,
  PRODUCTS,
  getMarketPrice,
  hasPlug,
  isTraded,
  plugQuote,
  productDisplayName,
  requiresPlug,
  stashUnits,
  type GameState,
  type PlugQuote,
  type PriceTrend,
  type ProductId,
} from '@/engine';

/** One country's price line for the selected product — a row on the world board. */
export interface BoardRow {
  readonly countryId: string;
  readonly countryName: string;
  /** THE live price — `getMarketPrice` verbatim (always computable; buys and
   * sells both execute at it — design/12 Item 3). */
  readonly price: number;
  /** Whole units the street here can supply right now (design/12 Item 10). */
  readonly stock: number;
  readonly trend: PriceTrend;
  /** Whether the product TRADES here — an un-traded row is inert ("no market"). */
  readonly traded: boolean;
  /** Whether buying here needs the plug you don't hold yet (Ideas2 §2). */
  readonly plugGated: boolean;
  /** Whether the buy side is a plug's fixed contract price (drift-free). */
  readonly plugPriced: boolean;
  /** The one-time intro cost when `plugGated` (money is the only gate). */
  readonly plugCost: number;
  /** Stashes the player holds here — presence is what lets a deal execute. */
  readonly presence: number;
}

/** The product's shelf name (the run's strain for `exotic`). */
export function productName(state: GameState, product: ProductId): string {
  return productDisplayName(state.world, product);
}

/** Every product on the roster, for the board's product picker. */
export function boardProducts(state: GameState): readonly { id: ProductId; name: string }[] {
  return PRODUCTS.map((p) => ({ id: p.id, name: productName(state, p.id) }));
}

/**
 * The world board for one product: every country's live price, in roster order
 * — numbers identical to `getMarketPrice` (the fairness spot-check anchor).
 */
export function boardRows(state: GameState, product: ProductId): readonly BoardRow[] {
  return COUNTRIES.map((c) => {
    const price = getMarketPrice(state, product, c.id);
    const gatedProduct = requiresPlug(c.id, product);
    return {
      countryId: c.id,
      countryName: c.name,
      price: price.price,
      stock: price.stock,
      trend: price.trend,
      traded: isTraded(c.id, product),
      plugGated: gatedProduct && !hasPlug(state, c.id),
      plugPriced: price.plugPriced,
      plugCost: gatedProduct ? (plugQuote(state, c.id)?.cost ?? 0) : 0,
      presence: state.stashes.filter((s) => s.countryId === c.id).length,
    };
  });
}

/** The selected country's detail: culture, risk, presence, and its plug quote. */
export interface CountryDetail {
  readonly countryId: string;
  readonly name: string;
  /** Baseline seizure exposure of dealing here — an input to shown bust odds. */
  readonly risk: number;
  /** The regional culture: what trades here, under this run's shelf names. */
  readonly traded: readonly { id: ProductId; name: string }[];
  /** The player's stashes here (presence = where a deal can execute). */
  readonly presence: readonly { id: string; name: string; units: number }[];
  /** The standing plug quote, when this country IS a true source. */
  readonly plug: PlugQuote | null;
  readonly hooks: readonly string[];
}

export function countryDetail(state: GameState, countryId: string): CountryDetail | null {
  const country = COUNTRIES.find((c) => c.id === countryId);
  if (!country) return null;
  return {
    countryId: country.id,
    name: country.name,
    risk: country.risk,
    traded: country.traded.map((id) => ({ id, name: productName(state, id) })),
    presence: state.stashes
      .filter((s) => s.countryId === country.id)
      .map((s) => ({ id: s.id, name: s.name, units: stashUnits(s) })),
    plug: plugQuote(state, countryId),
    hooks: country.openingHooks,
  };
}

/** Prose scene for a plug-purchase outcome, keyed by the engine's scene key. */
export interface PlugScene {
  readonly tone: 'default' | 'win' | 'bust';
  readonly text: string;
}

export const PLUG_SCENES: Readonly<Record<string, PlugScene>> = {
  'plug.connected': {
    tone: 'win',
    text: 'A handshake in a back room, a phone number that answers to your name now. The price list just changed.',
  },
  'plug.reject': {
    tone: 'default',
    text: 'The meeting doesn’t happen. Come back when the money’s real.',
  },
};

export function plugSceneFor(sceneKey: string): PlugScene {
  return PLUG_SCENES[sceneKey] ?? { tone: 'default', text: 'The meeting ends.' };
}

/**
 * The widest cross-country spread on the board right now: the best "buy here,
 * sell there" pair among TRADED markets — under the one-price economy
 * (design/12 Item 3) this is the price gap between two countries, the whole
 * margin engine. Buys exclude plug-gated sources you haven't unlocked (the
 * board never suggests a move you can't execute). The session-end hook's
 * "one more day" signal (GDD §11).
 */
export interface MarketSpread {
  readonly product: ProductId;
  readonly productName: string;
  readonly buyCountry: string;
  readonly buyCountryName: string;
  readonly sellCountry: string;
  readonly sellCountryName: string;
  /** The price at the buy end / the sell end (one number per country). */
  readonly buy: number;
  readonly sell: number;
  /** Sell/buy multiple (2 = doubles your money before costs). */
  readonly multiple: number;
}

export function widestSpread(state: GameState): MarketSpread | null {
  let best: MarketSpread | null = null;
  for (const p of PRODUCTS) {
    let cheapest: BoardRow | null = null;
    let dearest: BoardRow | null = null;
    for (const row of boardRows(state, p.id)) {
      if (!row.traded) continue;
      if (!row.plugGated && (cheapest === null || row.price < cheapest.price)) {
        cheapest = row;
      }
      if (dearest === null || row.price > dearest.price) dearest = row;
    }
    if (!cheapest || !dearest || cheapest.price <= 0) continue;
    const multiple = dearest.price / cheapest.price;
    if (best === null || multiple > best.multiple) {
      best = {
        product: p.id,
        productName: productName(state, p.id),
        buyCountry: cheapest.countryId,
        buyCountryName: cheapest.countryName,
        sellCountry: dearest.countryId,
        sellCountryName: dearest.countryName,
        buy: cheapest.price,
        sell: dearest.price,
        multiple,
      };
    }
  }
  return best;
}
