/**
 * The Deal screen's view-model (Prompt 15; design/11; design/12 Items 3/10/11).
 * PURE read selectors that turn the `GameState` into the numbers the screen
 * renders — the ONE price per product, street stock, holdings, clamped
 * quantities, and the fairness bust % — by calling engine functions.
 *
 * The screen composes these; it authors NO economic math itself (prompt guardrail
 * "no economic logic in the component"). Everything here is a thin wrapper over an
 * engine selector, so the numbers shown are exactly the numbers the engine will
 * act on — most importantly `sellBustProbability`, which is `computeBustProbability`
 * verbatim: the odds shown are the odds rolled (design/01 §0.3; GDD §8).
 *
 * Market model (design/11 §1): a deal executes at the target stash's COUNTRY
 * market. The board lists the products that TRADE there (Ideas2 §5 — the
 * regional culture); the run's exotic strain renders under its per-run shelf
 * name (`productDisplayName`).
 */

import {
  CONVERSION_RECIPES,
  PRODUCTS,
  computeBustProbability,
  convertBinding,
  effectiveCapacity,
  getCountry,
  getMarketPrice,
  hasPlug,
  isTraded,
  maxBatches,
  plugQuote,
  productDisplayName,
  requiresPlug,
  spendableAt,
  stashUnits,
  streetRevenuePerDay,
  type ConvertRejectReason,
  type GameState,
  type PriceTrend,
  type ProductId,
  type RecipeId,
  type Stash,
} from '@/engine';

/** Buy low or sell high — the two faces of the deal, one primary action each. */
export type DealMode = 'buy' | 'sell';

/** The run's home stash — the default buy/sell target (design/07 §1). */
export function homeStash(state: GameState): Stash {
  return state.stashes[0]!;
}

/** One choice on the market switcher: a stash you own = a market you stand in. */
export interface StashChoice {
  readonly id: string;
  readonly name: string;
  readonly marketName: string;
}

/**
 * Every stash as a market choice (Prompt 31 — the market switcher). The engine
 * already prices/validates by the stash's country (design/11 §1), so picking a
 * stash IS picking the market the board renders and the deal executes in.
 */
export function dealStashes(state: GameState): readonly StashChoice[] {
  return state.stashes.map((s) => ({
    id: s.id,
    name: s.name,
    marketName: getCountry(s.countryId).name,
  }));
}

/** The deal target for a picked stash id (falls back to the home stash). */
export function stashById(state: GameState, stashId: string | null): Stash {
  return state.stashes.find((s) => s.id === stashId) ?? homeStash(state);
}

/** The country market a deal at `stash` executes in (design/11 §1). */
export function marketCountryId(stash: Stash): string {
  return stash.countryId;
}

/** The market's display name for the screen header. */
export function marketName(stash: Stash): string {
  return getCountry(stash.countryId).name;
}

/**
 * Arms are OFF the drug board (design/12 Item 1): they trade only on the Arms
 * page (a broker market with its own tiers/heat). They stay a `ProductId` (state
 * & shipments reuse everything), so the board filters them by id.
 */

/** One product's row for the deal board: THE live price (buys and sells both
 * execute at it — design/12 Item 3; no margin % exists, Item 11), trend,
 * street stock, holdings. */
export interface ProductRow {
  readonly id: ProductId;
  readonly name: string;
  /** The one number a deal here executes at, either direction. */
  readonly price: number;
  readonly trend: PriceTrend;
  /** Whole units the street can supply right now (design/12 Item 10). */
  readonly stock: number;
  /** Units of this product currently held in the target stash. */
  readonly held: number;
  /**
   * True when buying here needs the plug you don't hold yet (Ideas2 §2 — a
   * true source sells to connections). Selling stays open; the buy gate reads
   * as prose with the intro price, never a locked row.
   */
  readonly plugGated: boolean;
  /** The one-time intro cost when `plugGated` (money is the only gate). */
  readonly plugCost: number;
}

function productRow(state: GameState, product: ProductId, stash: Stash): ProductRow {
  const countryId = marketCountryId(stash);
  const price = getMarketPrice(state, product, countryId);
  const plugGated = requiresPlug(countryId, product) && !hasPlug(state, countryId);
  return {
    id: product,
    name: productDisplayName(state.world, product),
    price: price.price,
    trend: price.trend,
    stock: price.stock,
    // Whole units only — a fractional holding (from idle production) floors to the
    // sellable integer, so "You hold N" matches what a sell can actually move.
    held: Math.floor(stash.inventory[product] ?? 0),
    plugGated,
    plugCost: plugGated ? (plugQuote(state, countryId)?.cost ?? 0) : 0,
  };
}

/**
 * The no-plug reject reason as PROSE (Prompt 31) — the same fact the engine's
 * `no-plug` rejection enforces, told in-world with the price of fixing it.
 */
export function plugGateProse(row: ProductRow, countryName: string): string {
  const cost = `$${Math.round(row.plugCost).toLocaleString('en-US')}`;
  return `${countryName} doesn’t sell ${row.name.toLowerCase()} to strangers — ${cost} buys the introduction.`;
}

/**
 * The deal board: every product TRADED at this stash's country, in canonical
 * order (Ideas2 §5 — regional cultures; meth never fronts on an island corner).
 * Everything listed is dealable from minute one (Ideas.md — Drug Lord 2 open
 * access): the buy price is the gate, not a progression flag.
 */
export function productRows(state: GameState, stash: Stash): readonly ProductRow[] {
  return PRODUCTS.filter(
    (p) => p.id !== 'arms' && isTraded(stash.countryId, p.id),
  ).map((p) => productRow(state, p.id, stash));
}

/**
 * Most units of `product` the stash can BUY here: affordable, capacity-bounded
 * AND supply-bounded (design/12 Item 10 — the street's pool is on the board,
 * so the clamp is never a surprise). Affordability spans the stash's dirty
 * cash PLUS the run's clean cash (`spendableAt`) — a borrowed stake spends
 * anywhere (design/10).
 */
export function maxBuyQty(state: GameState, product: ProductId, stash: Stash): number {
  const price = getMarketPrice(state, product, marketCountryId(stash));
  const affordable =
    price.price > 0 ? Math.floor(spendableAt(state, stash) / price.price) : 0;
  const capacityLeft = effectiveCapacity(state, stash) - stashUnits(stash);
  return Math.max(0, Math.min(affordable, capacityLeft, price.stock));
}

/** Most units of `product` the stash can SELL: exactly what it holds, floored to
 * whole units (you can't sell a fractional kilo — the sub-unit remainder waits). */
export function maxSellQty(product: ProductId, stash: Stash): number {
  return Math.floor(stash.inventory[product] ?? 0);
}

/**
 * Which limit pins the buy MAX right now, told in-world (design/12 Item 4 —
 * the QtyInput note names the binding constraint so a clamp is never a surprise).
 * `null` when nothing is buyable. Mirrors the `min(cash, stock, capacity)` in
 * `maxBuyQty`, reporting the tightest.
 */
export function buyBoundLabel(
  state: GameState,
  product: ProductId,
  stash: Stash,
): string | null {
  const price = getMarketPrice(state, product, marketCountryId(stash));
  const affordable = price.price > 0 ? Math.floor(spendableAt(state, stash) / price.price) : 0;
  const capacityLeft = effectiveCapacity(state, stash) - stashUnits(stash);
  const max = Math.max(0, Math.min(affordable, capacityLeft, price.stock));
  if (max <= 0) return null;
  if (max === affordable) return 'all your cash covers';
  if (max === capacityLeft) return 'all this stash can hold';
  return "all the street's holding";
}

/** Ceiling on a stepper for the current mode (affordable/capacity vs held). */
export function maxQty(
  mode: DealMode,
  state: GameState,
  product: ProductId,
  stash: Stash,
): number {
  return mode === 'buy'
    ? maxBuyQty(state, product, stash)
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
  stash: Stash,
): number {
  return computeBustProbability(state, product, qty, marketCountryId(stash));
}

/** The default product the screen opens on: the first one held, else the first traded. */
export function defaultProduct(state: GameState | null): ProductId {
  if (!state) return PRODUCTS[0]!.id;
  const stash = homeStash(state);
  const traded = PRODUCTS.filter(
    (p) => p.id !== 'arms' && isTraded(stash.countryId, p.id),
  );
  const held = traded.find((p) => (stash.inventory[p.id] ?? 0) > 0);
  return (held ?? traded[0] ?? PRODUCTS[0]!).id;
}

/** Open in sell mode when there's product to move, otherwise in buy mode. */
export function defaultMode(state: GameState | null, product: ProductId): DealMode {
  if (!state) return 'buy';
  return (homeStash(state).inventory[product] ?? 0) > 0 ? 'sell' : 'buy';
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
  // Rejections (design/13 A1): every `RejectReason` maps to its OWN line — a
  // rejected deal must never fall through to copy that reads like success.
  'deal.reject.invalid-qty': {
    tone: 'default',
    text: 'No deal — that’s not a number anyone counts in. Whole units only.',
  },
  'deal.reject.insufficient-funds': {
    tone: 'default',
    text: 'No deal — you can’t cover it. The cash on hand doesn’t reach the price.',
  },
  'deal.reject.insufficient-inventory': {
    tone: 'default',
    text: 'No deal — you don’t hold that much here. Nothing changed hands.',
  },
  'deal.reject.insufficient-capacity': {
    tone: 'default',
    text: 'No deal — this stash can’t hold the load. Make room or move some weight first.',
  },
  'deal.reject.no-stash': {
    tone: 'default',
    text: 'No deal — nowhere to work out of. You need a stash on this ground.',
  },
  'deal.reject.not-traded': {
    tone: 'default',
    text: 'No deal — nobody moves that product on these corners. Wrong market.',
  },
  'deal.reject.no-plug': {
    tone: 'default',
    text: 'No deal — the source doesn’t sell to strangers. Buy the introduction first.',
  },
  'deal.reject.no-supply': {
    tone: 'default',
    text: 'No deal — the street can’t supply that many right now. Wait for the re-up.',
  },
};

/**
 * Resolve outcome prose for a scene key. The fallback is explicitly a
 * NOTHING-HAPPENED line (design/13 A1): an unmapped key must never render as if
 * the deal closed.
 */
export function sceneFor(sceneKey: string): DealScene {
  return DEAL_SCENES[sceneKey] ?? { tone: 'default', text: 'Nothing changed hands.' };
}

// --- Conversions — cook crack / press hash (Prompt 31; Ideas2 §4) --------------

/** One recipe's panel row: everything disclosed BEFORE commit (fairness). */
export interface ConversionRow {
  readonly id: RecipeId;
  readonly name: string;
  readonly fromName: string;
  readonly toName: string;
  /** Per-batch terms — the recipe config verbatim (config, not literals). */
  readonly fromQty: number;
  readonly toQty: number;
  readonly costPerBatch: number;
  readonly heatPerBatch: number;
  /** True when the output goes to the crew's corners, not the stash (Item 5). */
  readonly toStreet: boolean;
  /** The most batches this stash can run right now (units/cash/space/queue). */
  readonly max: number;
  /** Why `max` is 0, so the block reads honestly (design/12 Item 5a). `null` when runnable. */
  readonly binding: ConvertRejectReason | null;
  /** The completed-batch scene line (never a toast — design/05 §4). */
  readonly prose: string;
}

/**
 * Every recipe as a panel row for `stash` — shown whenever the stash holds any
 * of the input (a kitchen is always an option; `max` is the honest clamp).
 * Numbers are the recipe config verbatim; `max` is the engine's `maxBatches`,
 * exactly what `convert` will accept, and `binding` names the limit when it's 0.
 */
export function conversionRows(state: GameState, stash: Stash): readonly ConversionRow[] {
  return CONVERSION_RECIPES.filter((r) => (stash.inventory[r.from] ?? 0) > 0).map((r) => ({
    id: r.id,
    name: r.name,
    fromName: productDisplayName(state.world, r.from),
    toName: productDisplayName(state.world, r.to),
    fromQty: r.fromQty,
    toQty: r.toQty,
    costPerBatch: r.costPerBatch,
    heatPerBatch: r.heatPerBatch,
    toStreet: r.toStreet ?? false,
    max: maxBatches(state, r.id, stash),
    binding: convertBinding(state, r.id, stash),
    prose: r.prose,
  }));
}

/**
 * The reason a cook can't run right now, as PROSE — the same binding constraint
 * the engine reports, told in-world so the disabled button never mislabels a
 * space/cash/crew shortfall as missing product (design/12 Item 5a).
 */
export function conversionBlockedProse(
  reason: ConvertRejectReason,
  row: ConversionRow,
): string {
  switch (reason) {
    case 'insufficient-inventory':
      return `Not enough ${row.fromName.toLowerCase()} on hand`;
    case 'insufficient-funds':
      return 'Not enough cash for a batch';
    case 'no-crew':
      return 'No crew to work the corners';
    case 'insufficient-capacity':
      return row.toStreet ? 'Your crew’s corners are full' : 'No room in this stash';
    default:
      return 'Can’t run a batch right now';
  }
}

/** The crew's corner status: rocks on hand and the dirty cash they drip per day. */
export interface StreetStatus {
  /** Whole rocks the crew is currently holding to sell. */
  readonly units: number;
  /** Projected dirty cash the corners bring in per active day, rounded. */
  readonly perDay: number;
  /** True when there's product on the corners (show the status line). */
  readonly active: boolean;
}

/**
 * The street-team drip surfaced for the convert card (design/12 Item 5d):
 * "your crew is holding N rocks — ~$X/day coming back". Pure read over
 * `state.streetStock`; the number is the engine's own projection.
 */
export function streetStatus(state: GameState): StreetStatus {
  const units = Math.floor(state.streetStock.units);
  return { units, perDay: Math.round(streetRevenuePerDay(state)), active: units >= 1 };
}
