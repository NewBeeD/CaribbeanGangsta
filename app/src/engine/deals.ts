/**
 * Loop 1 — the deal engine: buy low / sell high / dodge heat, in REAL DOLLARS
 * (design/01 §2; design/11), with a displayed bust probability that is *exactly*
 * the number the RNG rolls against (design/01 §0.3 fairness; GDD §8). Failure
 * returns a *scene key*, never an error — the narrative layer (Prompt 13)
 * renders it.
 *
 * The fairness law is the whole point: `computeBustProbability` produces the
 * number shown to the player, and `resolveDeal` rolls one draw from the run's
 * RNG and busts iff `roll < that same number`. No hidden modifier is ever
 * applied after the odds are displayed (prompt guardrail).
 *
 * Purity/determinism (prompts/README.md): all randomness routes through the
 * serialized `state.rngState` (restored via `./rng`, snapshot written back), so
 * a save/load round-trip reproduces every roll. No `Math.random`, no wall clock.
 *
 * Market model (design/11 §1; design/12 Items 3+10): every COUNTRY is a market
 * with ONE price per product — buys and sells both execute at
 * `world.basePriceAt` (geography: compound region-distance stretch from the
 * product's source × the country's per-run demand character) times this
 * country's live drift factor. Margin comes from MOVING product, never from
 * flipping in place. A deal executes at the target stash's country — your
 * foothold is your presence there (Prompt 16's territory model; the travel/
 * shipment layer is Prompt 30). Prices for every country are always computable
 * (the world market board, Ideas2 §3); *execution* is bounded by the country's
 * `traded` culture (Ideas2 §5), at a true source by the plug (Ideas2 §2 —
 * `plugs.ts`), and by the market's finite STOCK pool (design/12 Item 10 —
 * shown on the board, depleted by buys, restocked by active play).
 *
 * Storage note: buys/sells target a stash (`stashId`, default the home stash). A
 * bust seizes the staked cash + product at THAT stash only (design/07 §1).
 */

import { restoreRng, type Rng } from './rng';
import {
  COUNTRY_IDS,
  PRODUCT_IDS,
  findCountry,
  getCountry,
  isTraded,
  requiresPlug,
  type ProductId,
} from './config/countries';
import { getProduct } from './config/products';
import { HEAT_MAX } from './config/heat';
import { getStashType } from './config/stashes';
import { DEFAULT_GAME_CONFIG, type MarketsTuning } from './config';
import { basePriceAt } from './world';
import { addHeat } from './heat';
import { splitCharge, type GameState, type Inventory, type Stash } from './state';

// --- Live market state (drifts each active tick) -----------------------------

/**
 * A market's live state: `factor` is the current price multiplier around its
 * base (live price = base × factor); `prevFactor` is last cycle's, so a trend
 * arrow can be derived without storing history (design/07 §1); `stock` is the
 * units available on the street (design/12 Item 10 — finite supply; fractional
 * internally, floored wherever it's shown or enforced).
 */
export interface MarketState {
  readonly factor: number;
  readonly prevFactor: number;
  readonly stock: number;
}

/** Live prices for every country × product. Always fully populated. */
export type Markets = Readonly<
  Record<string, Readonly<Record<ProductId, MarketState>>>
>;

/** The country-size scale on a market's stock: its demand-bias midpoint —
 * big sinks run deep books (design/12 Item 10). */
function stockScale(countryId: string): number {
  const country = getCountry(countryId);
  return (country.demandBias.min + country.demandBias.max) / 2;
}

/**
 * The stock CEILING for one market: the seed band's max under the country's
 * size scale, times the source multiplier at a plug source (a source IS a deep
 * book). Restocking never fills past this; recomputable, so it is never stored.
 */
export function stockCapFor(
  countryId: string,
  product: ProductId,
  tuning: MarketsTuning = DEFAULT_GAME_CONFIG.markets,
): number {
  const plugDepth = requiresPlug(countryId, product) ? tuning.PLUG_STOCK_MULTIPLIER : 1;
  return Math.round(tuning.STOCK_SEED_BAND.max * stockScale(countryId) * plugDepth);
}

/**
 * Fresh markets: every price at its base (factor 1, flat trend), every stock
 * pool seeded from the config band × country size, plug sources running
 * `PLUG_STOCK_MULTIPLIER` deep (design/12 Item 10). Consumes `rng` — callers
 * seeding a run pass a dedicated fork so the draw can't desync other streams.
 */
export function createInitialMarkets(
  rng: Rng,
  tuning: MarketsTuning = DEFAULT_GAME_CONFIG.markets,
): Markets {
  const markets = {} as Record<string, Record<ProductId, MarketState>>;
  for (const countryId of COUNTRY_IDS) {
    const perProduct = {} as Record<ProductId, MarketState>;
    for (const product of PRODUCT_IDS) {
      const plugDepth = requiresPlug(countryId, product)
        ? tuning.PLUG_STOCK_MULTIPLIER
        : 1;
      const stock = Math.round(
        rng.float(tuning.STOCK_SEED_BAND.min, tuning.STOCK_SEED_BAND.max) *
          stockScale(countryId) *
          plugDepth,
      );
      perProduct[product] = { factor: 1, prevFactor: 1, stock };
    }
    markets[countryId] = perProduct;
  }
  return markets;
}

// --- Tuning (v1 hypotheses; Prompt 26 centralized into config/deals.ts) ------
// The live numbers are read from `state.config.deals` (the injected tuning);
// the module re-exports the v1 defaults for the existing engine surface.

export { BUST_MIN, BUST_MAX, DEFAULT_STASH_CAPACITY } from './config/deals';

/** Flag set once a deal has been banked this run (loss-sequencing hook, Prompt 24). */
export const DEAL_WIN_FLAG = 'dealWinBanked';

// --- Market pricing ----------------------------------------------------------

export type PriceTrend = 'up' | 'down' | 'flat';

export interface MarketPrice {
  /** THE price — buys and sells both execute at this number (design/12 Item 3). */
  readonly price: number;
  readonly trend: PriceTrend;
  readonly volatility: number;
  /** True when this is a plug's fixed contract price (drift-free). */
  readonly plugPriced: boolean;
  /** Whole units available on the street right now (design/12 Item 10). */
  readonly stock: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function marketStateFor(
  state: GameState,
  countryId: string,
  product: ProductId,
): MarketState {
  const atCountry = state.markets[countryId];
  if (!atCountry) throw new Error(`market: unknown country "${countryId}"`);
  const market = atCountry[product];
  if (!market) throw new Error(`market: unknown product "${product}"`);
  return market;
}

/**
 * The current LIVE price for `product` at `countryId` — the ONE number both a
 * buy and a sell execute at (design/12 Item 3): the geographic base
 * (`world.basePriceAt`) times this country's live drift factor. The trend
 * arrow is derived from the last drift cycle. A plug's contract price does NOT
 * drift — fixed and readable (Ideas2 §2). `stock` is the street pool the board
 * shows and buys are bounded by (design/12 Item 10 — never a hidden cap).
 */
export function getMarketPrice(
  state: GameState,
  product: ProductId,
  countryId: string,
): MarketPrice {
  const base = basePriceAt(state.world, product, countryId, state.config.products.PRODUCTS);
  const market = marketStateFor(state, countryId, product);

  const trend: PriceTrend =
    market.factor > market.prevFactor
      ? 'up'
      : market.factor < market.prevFactor
        ? 'down'
        : 'flat';

  return {
    price: Math.round(base.plugPriced ? base.price : base.price * market.factor),
    trend,
    volatility: base.volatility,
    plugPriced: base.plugPriced,
    stock: Math.floor(market.stock),
  };
}

/**
 * Advance every market by one drift step of `dtHours`: a bounded random walk of
 * the price factor within `[1 − volatility, 1 + volatility]`, so the live price
 * never leaves its documented `base × (1 ± volatility)` band (design/01 §2). A
 * drained stock pool biases the walk UP (scarcity pricing, design/12 Item 10) —
 * a drift pressure, deliberately not an instant repricing, so buying can never
 * pump the number you immediately sell back at; the clamp still rules. The
 * previous factor is retained for the trend arrow. Consumes `rng` and writes its
 * advanced snapshot back into the returned state (the run's single stream).
 *
 * Registered as an ACTIVE-only tick step (clock.ts): the world is frozen while
 * the player is away, so prices neither drift nor punish absence (GDD §6).
 */
export function driftPrices(state: GameState, rng: Rng, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const dtScale = Math.min(dtHours, 24) / 24; // one full step per in-game day
  const scarcityWeight = state.config.markets.SCARCITY_PRICE_WEIGHT;

  const markets = {} as Record<string, Record<ProductId, MarketState>>;
  for (const countryId of COUNTRY_IDS) {
    const perProduct = {} as Record<ProductId, MarketState>;
    for (const product of PRODUCT_IDS) {
      const vol = basePriceAt(
        state.world,
        product,
        countryId,
        state.config.products.PRODUCTS,
      ).volatility;
      const current = marketStateFor(state, countryId, product);
      const cap = stockCapFor(countryId, product, state.config.markets);
      const drained = cap > 0 ? clamp(1 - current.stock / cap, 0, 1) : 0;
      const delta = (rng.float(-vol, vol) + scarcityWeight * drained) * dtScale;
      const factor = clamp(current.factor + delta, 1 - vol, 1 + vol);
      perProduct[product] = { ...current, factor, prevFactor: current.factor };
    }
    markets[countryId] = perProduct;
  }

  return { ...state, markets, rngState: rng.getState() };
}

/**
 * Refill every market's stock pool by `RESTOCK_PER_DAY × days played`, capped
 * at its seed ceiling (design/12 Item 10). Deterministic — no randomness.
 * Registered as an ACTIVE-only tick step right after `price-drift` (clock.ts):
 * the street re-ups over play time, never while the world is frozen offline.
 */
export function restockMarkets(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const tuning = state.config.markets;
  const refill = tuning.RESTOCK_PER_DAY * (dtHours / 24);
  if (refill <= 0) return state;

  const markets = {} as Record<string, Record<ProductId, MarketState>>;
  for (const countryId of COUNTRY_IDS) {
    const perProduct = {} as Record<ProductId, MarketState>;
    for (const product of PRODUCT_IDS) {
      const current = marketStateFor(state, countryId, product);
      const cap = stockCapFor(countryId, product, tuning);
      perProduct[product] = { ...current, stock: Math.min(cap, current.stock + refill) };
    }
    markets[countryId] = perProduct;
  }
  return { ...state, markets };
}

/** Replace one market's stock pool (immutably), leaving its factors alone. */
function withMarketStock(
  state: GameState,
  countryId: string,
  product: ProductId,
  stock: number,
): GameState {
  const atCountry = state.markets[countryId];
  if (!atCountry) return state;
  const market = atCountry[product];
  if (!market) return state;
  return {
    ...state,
    markets: {
      ...state.markets,
      [countryId]: { ...atCountry, [product]: { ...market, stock } },
    },
  };
}

// --- Bust probability (the fairness contract) --------------------------------

/** Crew competence, 0..1 — lowers bust odds. Empty crew ⇒ 0 (Prompt 08 owns). */
function crewSkill(state: GameState): number {
  if (state.crew.length === 0) return 0;
  const meanLoyalty =
    state.crew.reduce((sum, c) => sum + c.loyalty, 0) / state.crew.length;
  return clamp(meanLoyalty / 100, 0, 1);
}

/**
 * The bust probability shown to the player AND rolled against — one number, no
 * hidden second modifier (design/01 §0.3; GDD §8). `f(heat, country risk, crew
 * skill, product tier)` plus a size term, clamped to `[BUST_MIN, BUST_MAX]`.
 */
export function computeBustProbability(
  state: GameState,
  product: ProductId,
  qty: number,
  countryId: string,
): number {
  const d = state.config.deals;
  const cfg = getProduct(product, state.config.products.PRODUCTS);
  const country = getCountry(countryId);
  const heatN = clamp(state.heat / HEAT_MAX, 0, 1);
  const qtyN = clamp(qty / d.BUST_QTY_FULL_RISK, 0, 1);

  const raw =
    d.BUST_BASE +
    heatN * d.BUST_HEAT_WEIGHT +
    country.risk * d.BUST_LOCATION_WEIGHT +
    cfg.tierRisk * d.BUST_TIER_WEIGHT +
    qtyN * d.BUST_QTY_WEIGHT -
    crewSkill(state) * d.BUST_CREW_WEIGHT;

  return clamp(raw, d.BUST_MIN, d.BUST_MAX);
}

/**
 * Whether at least one deal has been banked this run. Onboarding (Prompt 24)
 * reads this to keep the first deals guaranteed-survivable, so real bust risk
 * only begins once competence is established (design/01 §2, loss sequencing).
 */
export function hasBankedWin(state: GameState): boolean {
  return state.flags[DEAL_WIN_FLAG] === true;
}

// --- Deal resolution ---------------------------------------------------------

export type DealOutcome = 'success' | 'bust' | 'rejected';

export type RejectReason =
  | 'invalid-qty'
  | 'insufficient-funds'
  | 'insufficient-inventory'
  | 'insufficient-capacity'
  | 'no-stash'
  /** The product has no market at the stash's country (Ideas2 §5). */
  | 'not-traded'
  /** Buying at a TRUE SOURCE requires the plug intro (Ideas2 §2; plugs.ts). */
  | 'no-plug'
  /** The street can't supply that many units right now (design/12 Item 10 —
   * the pool is shown on the board, so the clamp is never a surprise). */
  | 'no-supply';

/**
 * The result of resolving a deal. `outcome` extends the prompt's
 * `'success' | 'bust'` sketch with `'rejected'` for validation failures, which
 * leave `state` untouched (criteria: rejected deals never mutate state).
 * `displayedBustProb` is the number shown pre-commit; `rolledValue` is the RNG
 * draw compared against it (bust iff `rolledValue < displayedBustProb`).
 */
export interface DealResult {
  readonly state: GameState;
  readonly outcome: DealOutcome;
  readonly displayedBustProb: number;
  readonly rolledValue: number;
  readonly cashDelta: number;
  /** Narrative scene key for Prompt 13 (never a raw error string). */
  readonly sceneKey: string;
  /** Present only when `outcome === 'rejected'`. */
  readonly rejected?: RejectReason;
}

export interface BuyIntent {
  readonly type: 'buy';
  readonly product: ProductId;
  readonly qty: number;
  /** Which stash holds/receives the goods; defaults to the home stash. The deal
   * executes at this stash's COUNTRY market (design/11 §1). */
  readonly stashId?: string;
}

export interface SellIntent {
  readonly type: 'sell';
  readonly product: ProductId;
  readonly qty: number;
  readonly stashId?: string;
}

export type DealIntent = BuyIntent | SellIntent;

function stashUnits(stash: Stash): number {
  return PRODUCT_IDS.reduce((sum, id) => sum + (stash.inventory[id] ?? 0), 0);
}

/** Resolve the deal's target stash (explicit id, else the home stash). */
function targetStash(state: GameState, stashId: string | undefined): Stash | null {
  if (stashId !== undefined) {
    return state.stashes.find((s) => s.id === stashId) ?? null;
  }
  return state.stashes[0] ?? null;
}

function withStash(state: GameState, next: Stash): GameState {
  return {
    ...state,
    stashes: state.stashes.map((s) => (s.id === next.id ? next : s)),
  };
}

function adjustInventory(inv: Inventory, product: ProductId, delta: number): Inventory {
  return { ...inv, [product]: (inv[product] ?? 0) + delta };
}

/** Bank peak trackers after a deal (design/01 §7 — score banks from peaks). */
function bankPeaks(state: GameState): GameState {
  const dirty = state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
  const netWorth = dirty + state.cleanCash;
  const empireSize = state.stashes.length + state.fronts.length + state.crew.length;
  const { highScore } = state;
  return {
    ...state,
    highScore: {
      peakNetWorth: Math.max(highScore.peakNetWorth, netWorth),
      peakCleanCash: Math.max(highScore.peakCleanCash, state.cleanCash),
      peakEmpireSize: Math.max(highScore.peakEmpireSize, empireSize),
    },
  };
}

function reject(state: GameState, reason: RejectReason): DealResult {
  return {
    state,
    outcome: 'rejected',
    displayedBustProb: 0,
    rolledValue: Number.NaN,
    cashDelta: 0,
    sceneKey: 'deal.reject',
    rejected: reason,
  };
}

/** Validate the stash's country carries this product's market (Ideas2 §5). */
function marketCountryFor(stash: Stash, product: ProductId): string | null {
  const country = findCountry(stash.countryId);
  if (!country || !isTraded(country.id, product)) return null;
  return country.id;
}

function resolveBuy(state: GameState, intent: BuyIntent): DealResult {
  const { product, qty } = intent;
  if (!Number.isInteger(qty) || qty <= 0) return reject(state, 'invalid-qty');

  const stash = targetStash(state, intent.stashId);
  if (!stash) return reject(state, 'no-stash');
  const countryId = marketCountryFor(stash, product);
  if (!countryId) return reject(state, 'not-traded');
  // A true source sells to CONNECTIONS, not walk-ins (Ideas2 §2). The plug is a
  // pure money gate — buyable from minute one (plugs.ts), never a hidden flag.
  if (requiresPlug(countryId, product) && !state.plugs.includes(countryId)) {
    return reject(state, 'no-plug');
  }

  const price = getMarketPrice(state, product, countryId);
  // Finite supply (design/12 Item 10): the street can only sell what it holds.
  // The pool is on the board ("~N on the street"), so this is never a surprise.
  if (qty > price.stock) return reject(state, 'no-supply');
  const cost = price.price * qty;
  // Buys draw on the stash's dirty cash first, then CLEAN cash covers the
  // shortfall — borrowed capital (which lands clean, design/10) must be able to
  // buy the shipment it was taken out for, not just fronts (the come-up hook).
  const charge = splitCharge(state, stash, cost);
  if (!charge) return reject(state, 'insufficient-funds');
  const capacity = getStashType(stash.type, state.config.stashes.STASH_TYPES).capacity;
  if (stashUnits(stash) + qty > capacity) {
    return reject(state, 'insufficient-capacity');
  }

  const nextStash: Stash = {
    ...stash,
    dirtyCash: stash.dirtyCash - charge.fromDirty,
    inventory: adjustInventory(stash.inventory, product, qty),
  };
  const cfg = getProduct(product, state.config.products.PRODUCTS);
  let next = withStash(state, nextStash);
  next = { ...next, cleanCash: next.cleanCash - charge.fromClean };
  // The units came OFF the street (design/12 Item 10).
  const pool = marketStateFor(state, countryId, product).stock;
  next = withMarketStock(next, countryId, product, Math.max(0, pool - qty));
  next = addHeat(next, cfg.heatPerUnit * qty * state.config.deals.BUY_HEAT_FACTOR, 'deal.buy');
  next = bankPeaks(next);

  return {
    state: next,
    outcome: 'success',
    displayedBustProb: 0, // buys don't roll a bust (only sells/moves do)
    rolledValue: 1,
    cashDelta: -cost,
    sceneKey: 'deal.buy.success',
  };
}

function resolveSell(state: GameState, intent: SellIntent): DealResult {
  const { product, qty } = intent;
  if (!Number.isInteger(qty) || qty <= 0) return reject(state, 'invalid-qty');

  const stash = targetStash(state, intent.stashId);
  if (!stash) return reject(state, 'no-stash');
  const countryId = marketCountryFor(stash, product);
  if (!countryId) return reject(state, 'not-traded');
  if ((stash.inventory[product] ?? 0) < qty) {
    return reject(state, 'insufficient-inventory');
  }

  const cfg = getProduct(product, state.config.products.PRODUCTS);
  const price = getMarketPrice(state, product, countryId);
  const displayedBustProb = computeBustProbability(state, product, qty, countryId);

  // The fairness roll: ONE draw, bust iff it lands under the displayed number.
  const rng = restoreRng(state.rngState);
  const rolledValue = rng.next();
  const busted = rolledValue < displayedBustProb;
  const rolled = { ...state, rngState: rng.getState() };

  if (busted) {
    // Seizure hits only THIS stash: lose the product moved + the staked (dirty)
    // cash held here; other stashes are untouched (design/07 §1).
    const seizedCash = stash.dirtyCash;
    const bustedStash: Stash = {
      ...stash,
      dirtyCash: 0,
      inventory: adjustInventory(stash.inventory, product, -qty),
    };
    let next = withStash(rolled, bustedStash);
    next = addHeat(next, cfg.heatPerUnit * qty * cfg.bustHeatMultiplier, 'deal.bust');
    next = bankPeaks(next);
    return {
      state: next,
      outcome: 'bust',
      displayedBustProb,
      rolledValue,
      cashDelta: -seizedCash,
      sceneKey: 'deal.sell.bust',
    };
  }

  const proceeds = price.price * qty;
  const soldStash: Stash = {
    ...stash,
    dirtyCash: stash.dirtyCash + proceeds,
    inventory: adjustInventory(stash.inventory, product, -qty),
  };
  let next = withStash(rolled, soldStash);
  // A fraction of what you moved re-enters the street's pool (design/12 Item 10).
  const pool = marketStateFor(state, countryId, product).stock;
  const cap = stockCapFor(countryId, product, state.config.markets);
  next = withMarketStock(
    next,
    countryId,
    product,
    Math.min(cap, pool + qty * state.config.markets.SELL_RESTOCK_FRACTION),
  );
  next = addHeat(next, cfg.heatPerUnit * qty, 'deal.sell');
  next = { ...next, flags: { ...next.flags, [DEAL_WIN_FLAG]: true } };
  next = bankPeaks(next);
  return {
    state: next,
    outcome: 'success',
    displayedBustProb,
    rolledValue,
    cashDelta: proceeds,
    sceneKey: 'deal.sell.success',
  };
}

/**
 * Resolve a buy or sell against `state`: validate market / plug / funds /
 * inventory / capacity (rejecting without mutation), roll the bust check for
 * sells, and apply the cash + inventory + heat changes. Returns the new state
 * plus the scene key and the fairness numbers the UI shows. Pure and
 * deterministic.
 */
export function resolveDeal(state: GameState, intent: DealIntent): DealResult {
  return intent.type === 'buy'
    ? resolveBuy(state, intent)
    : resolveSell(state, intent);
}
