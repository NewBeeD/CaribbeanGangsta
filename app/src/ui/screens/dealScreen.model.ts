/**
 * The Deal screen's view-model (Prompt 15). PURE read selectors that turn the
 * `GameState` into the numbers the screen renders — prices, margins, holdings,
 * clamped quantities, and the fairness bust % — by calling engine functions.
 *
 * The screen composes these; it authors NO economic math itself (prompt guardrail
 * "no economic logic in the component"). Everything here is a thin wrapper over an
 * engine selector, so the numbers shown are exactly the numbers the engine will
 * act on — most importantly `sellBustProbability`, which is `computeBustProbability`
 * verbatim: the odds shown are the odds rolled (design/01 §0.3; GDD §8).
 */

import {
  PRODUCTS,
  SOURCE_LOCATION,
  computeBustProbability,
  getMarketPrice,
  getStashType,
  stashUnits,
  type GameState,
  type LocationId,
  type PriceTrend,
  type ProductId,
  type Stash,
} from '@/engine';

/** Buy low or sell high — the two faces of the deal, one primary action each. */
export type DealMode = 'buy' | 'sell';

/** The leg the home stash deals at; travel/route legs arrive with the map (Prompt 16). */
export const DEAL_LOCATION: LocationId = SOURCE_LOCATION;

/** The run's home stash — the default buy/sell target (design/07 §1). */
export function homeStash(state: GameState): Stash {
  return state.stashes[0]!;
}

/** Sell/buy margin as a whole percent of the buy price (0 when buy is free). */
export function marginPct(buy: number, sell: number): number {
  if (buy <= 0) return 0;
  return Math.round(((sell - buy) / buy) * 100);
}

/** One product's row for the deal board: live prices, trend, margin, holdings. */
export interface ProductRow {
  readonly id: ProductId;
  readonly name: string;
  readonly buy: number;
  readonly sell: number;
  readonly marginPct: number;
  readonly trend: PriceTrend;
  /** Units of this product currently held in the target stash. */
  readonly held: number;
}

function productRow(
  state: GameState,
  product: ProductId,
  location: LocationId,
  stash: Stash,
): ProductRow {
  const cfg = PRODUCTS.find((p) => p.id === product)!;
  const price = getMarketPrice(state, product, location);
  return {
    id: product,
    name: cfg.name,
    buy: price.buy,
    sell: price.sell,
    marginPct: marginPct(price.buy, price.sell),
    trend: price.trend,
    held: stash.inventory[product],
  };
}

/**
 * Every product's deal-board row, in canonical order. All products are on the
 * board from minute one (Ideas.md — Drug Lord 2 open access): the buy price is
 * the gate, not a progression flag.
 */
export function productRows(
  state: GameState,
  location: LocationId,
  stash: Stash,
): readonly ProductRow[] {
  return PRODUCTS.map((p) => productRow(state, p.id, location, stash));
}

/** Most units of `product` the stash can BUY here: affordable AND capacity-bounded. */
export function maxBuyQty(
  state: GameState,
  product: ProductId,
  location: LocationId,
  stash: Stash,
): number {
  const price = getMarketPrice(state, product, location);
  const affordable = price.buy > 0 ? Math.floor(stash.dirtyCash / price.buy) : 0;
  const capacityLeft = getStashType(stash.type).capacity - stashUnits(stash);
  return Math.max(0, Math.min(affordable, capacityLeft));
}

/** Most units of `product` the stash can SELL: exactly what it holds. */
export function maxSellQty(product: ProductId, stash: Stash): number {
  return stash.inventory[product];
}

/** Ceiling on a stepper for the current mode (affordable/capacity vs held). */
export function maxQty(
  mode: DealMode,
  state: GameState,
  product: ProductId,
  location: LocationId,
  stash: Stash,
): number {
  return mode === 'buy'
    ? maxBuyQty(state, product, location, stash)
    : maxSellQty(product, stash);
}

/** Clamp a requested quantity into `[1, max]` (0 when nothing is possible). */
export function clampQty(qty: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(Math.max(1, Math.round(qty)), max);
}

/**
 * The bust probability for a sell — `computeBustProbability` verbatim. This is
 * the SAME number `resolveDeal` rolls against; the RiskMeter renders it directly,
 * never a decorated copy (fairness law). Buys don't roll a bust (design/07 §1).
 */
export function sellBustProbability(
  state: GameState,
  product: ProductId,
  qty: number,
  location: LocationId,
): number {
  return computeBustProbability(state, product, qty, location);
}

/** The default product the screen opens on: the first one held, else the first. */
export function defaultProduct(state: GameState | null): ProductId {
  if (!state) return PRODUCTS[0]!.id;
  const stash = homeStash(state);
  const held = PRODUCTS.find((p) => stash.inventory[p.id] > 0);
  return (held ?? PRODUCTS[0]!).id;
}

/** Open in sell mode when there's product to move, otherwise in buy mode. */
export function defaultMode(state: GameState | null, product: ProductId): DealMode {
  if (!state) return 'buy';
  return homeStash(state).inventory[product] > 0 ? 'sell' : 'buy';
}

/** Outcome-scene copy keyed by the engine's scene key (failure is a scene, not a toast). */
export interface DealScene {
  readonly tone: 'default' | 'win' | 'bust';
  readonly who?: string;
  readonly text: string;
}

export const DEAL_SCENES: Readonly<Record<string, DealScene>> = {
  'deal.sell.success': {
    tone: 'win',
    who: 'The buyer',
    text: 'counts it twice, nods, gone.',
  },
  'deal.sell.bust': {
    tone: 'bust',
    text: "Blue lights hit the alley before the deal closed. You ran; the product didn't.",
  },
  'deal.buy.success': {
    tone: 'default',
    text: 'The package changes hands in a doorway. It’s yours now — and so is the risk.',
  },
};

/** Resolve outcome prose for a scene key, with a neutral fallback. */
export function sceneFor(sceneKey: string): DealScene {
  return DEAL_SCENES[sceneKey] ?? { tone: 'default', text: 'The deal is done.' };
}
