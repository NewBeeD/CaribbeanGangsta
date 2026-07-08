/**
 * Loop 1 — the deal engine: buy low / sell high / dodge heat, in REAL DOLLARS
 * (design/01 §2), with a displayed bust probability that is *exactly* the number
 * the RNG rolls against (design/01 §0.3 fairness; GDD §8). Failure returns a
 * *scene key*, never an error — the narrative layer (Prompt 13) renders it.
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
 * Route economics: a location's `distanceFromSource` widens the sell margin,
 * strongly for cocaine (the margin engine) and weakly for weed — the mechanical
 * reason international routes feel like a paradigm shift (design/01 §2).
 *
 * Storage note: buys/sells target a stash (`stashId`, default the home stash). A
 * bust seizes the staked cash + product at THAT stash only (design/07 §1). Real
 * multi-stash capacity is owned by Prompt 06; a placeholder cap guards buys here.
 */

import { restoreRng, type Rng } from './rng';
import { PRODUCT_IDS, type ProductId } from './config/countries';
import { getProduct } from './config/products';
import {
  LOCATION_IDS,
  SOURCE_LOCATION,
  getLocation,
  type LocationId,
} from './config/locations';
import type { GameState, Inventory, Stash } from './state';

// --- Live market state (drifts each active tick) -----------------------------

/**
 * A market's live price multiplier around its base. `factor` is the current
 * multiplier (live price = base × factor); `prevFactor` is last cycle's, so a
 * trend arrow can be derived without storing history (design/07 §1).
 */
export interface MarketState {
  readonly factor: number;
  readonly prevFactor: number;
}

/** Live prices for every location × product. Always fully populated. */
export type Markets = Readonly<
  Record<LocationId, Readonly<Record<ProductId, MarketState>>>
>;

/** Fresh markets: every price at its base (factor 1, flat trend). */
export function createInitialMarkets(): Markets {
  const markets = {} as Record<LocationId, Record<ProductId, MarketState>>;
  for (const loc of LOCATION_IDS) {
    const perProduct = {} as Record<ProductId, MarketState>;
    for (const product of PRODUCT_IDS) {
      perProduct[product] = { factor: 1, prevFactor: 1 };
    }
    markets[loc] = perProduct;
  }
  return markets;
}

// --- Tuning constants (v1 hypotheses; Prompt 26 centralizes) -----------------

/** Bust probability is always clamped into this window (design/01 §2). */
export const BUST_MIN = 0.03;
export const BUST_MAX = 0.6;

// Weights of each input to the displayed bust probability (design/01 §2:
// f(heat, location risk, crew skill, product tier)). Chosen so the clamp is
// reachable from both ends: a calm, skilled low-tier deal floors at 3%; a hot,
// unskilled high-tier deal ceils at 60%.
const BUST_BASE = 0.05;
const HEAT_WEIGHT = 0.35;
const LOCATION_WEIGHT = 0.15;
const TIER_WEIGHT = 0.12;
const QTY_WEIGHT = 0.1;
const CREW_WEIGHT = 0.15;
/** Quantity at which the size term saturates its weight. */
const QTY_FULL_RISK = 100;
/** Heat is a 0..100 meter (design/01 §4). */
const HEAT_MAX = 100;
/** Buying is quieter than selling: buy heat is scaled down from the per-unit rate. */
const BUY_HEAT_FACTOR = 0.5;
/** Placeholder per-stash unit cap until Prompt 06 owns real storage capacity. */
export const DEFAULT_STASH_CAPACITY = 1000;
/** Flag set once a deal has been banked this run (loss-sequencing hook, Prompt 24). */
export const DEAL_WIN_FLAG = 'dealWinBanked';

// --- Market pricing ----------------------------------------------------------

export type PriceTrend = 'up' | 'down' | 'flat';

export interface MarketPrice {
  readonly buy: number;
  readonly sell: number;
  readonly trend: PriceTrend;
  readonly volatility: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The run's resolved source price board for `product` (throws if absent). */
function boardFor(state: GameState, product: ProductId) {
  const board = state.world.priceBoards.find((b) => b.product === product);
  if (!board) throw new Error(`boardFor(): no price board for "${product}"`);
  return board;
}

function marketStateFor(
  state: GameState,
  location: LocationId,
  product: ProductId,
): MarketState {
  const atLocation = state.markets[location];
  if (!atLocation) throw new Error(`market: unknown location "${location}"`);
  const market = atLocation[product];
  if (!market) throw new Error(`market: unknown product "${product}"`);
  return market;
}

/**
 * The current LIVE buy/sell price for `product` at `location`: the resolved
 * source base, stretched by the leg's distance elasticity (cocaine widens hard),
 * then multiplied by the live drift factor. The trend arrow is derived from the
 * last drift cycle. This is exactly the price a deal executes at.
 */
export function getMarketPrice(
  state: GameState,
  product: ProductId,
  location: LocationId,
): MarketPrice {
  const cfg = getProduct(product);
  const loc = getLocation(location);
  const board = boardFor(state, product);
  const market = marketStateFor(state, location, product);

  const buyBase = board.buy * (1 + loc.distanceFromSource * cfg.buyDistanceElasticity);
  const sellBase =
    board.sell * (1 + loc.distanceFromSource * cfg.sellDistanceElasticity);

  const trend: PriceTrend =
    market.factor > market.prevFactor
      ? 'up'
      : market.factor < market.prevFactor
        ? 'down'
        : 'flat';

  return {
    buy: Math.round(buyBase * market.factor),
    sell: Math.round(sellBase * market.factor),
    trend,
    volatility: board.volatility,
  };
}

/**
 * Advance every market by one drift step of `dtHours`: a bounded random walk of
 * the price factor within `[1 − volatility, 1 + volatility]`, so the live price
 * never leaves its documented `base × (1 ± volatility)` band (design/01 §2). The
 * previous factor is retained for the trend arrow. Consumes `rng` and writes its
 * advanced snapshot back into the returned state (the run's single stream).
 *
 * Registered as an ACTIVE-only tick step (clock.ts): the world is frozen while
 * the player is away, so prices neither drift nor punish absence (GDD §6).
 */
export function driftPrices(state: GameState, rng: Rng, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const dtScale = Math.min(dtHours, 24) / 24; // one full step per in-game day

  const markets = {} as Record<LocationId, Record<ProductId, MarketState>>;
  for (const location of LOCATION_IDS) {
    const perProduct = {} as Record<ProductId, MarketState>;
    for (const product of PRODUCT_IDS) {
      const vol = boardFor(state, product).volatility;
      const current = marketStateFor(state, location, product);
      const delta = rng.float(-vol, vol) * dtScale;
      const factor = clamp(current.factor + delta, 1 - vol, 1 + vol);
      perProduct[product] = { factor, prevFactor: current.factor };
    }
    markets[location] = perProduct;
  }

  return { ...state, markets, rngState: rng.getState() };
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
 * hidden second modifier (design/01 §0.3; GDD §8). `f(heat, location risk, crew
 * skill, product tier)` plus a size term, clamped to `[BUST_MIN, BUST_MAX]`.
 */
export function computeBustProbability(
  state: GameState,
  product: ProductId,
  qty: number,
  location: LocationId,
): number {
  const cfg = getProduct(product);
  const loc = getLocation(location);
  const heatN = clamp(state.heat / HEAT_MAX, 0, 1);
  const qtyN = clamp(qty / QTY_FULL_RISK, 0, 1);

  const raw =
    BUST_BASE +
    heatN * HEAT_WEIGHT +
    loc.risk * LOCATION_WEIGHT +
    cfg.tierRisk * TIER_WEIGHT +
    qtyN * QTY_WEIGHT -
    crewSkill(state) * CREW_WEIGHT;

  return clamp(raw, BUST_MIN, BUST_MAX);
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
  | 'no-stash';

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
  /** Which market to deal into; defaults to the source leg. */
  readonly location?: LocationId;
  /** Which stash holds/receives the goods; defaults to the home stash. */
  readonly stashId?: string;
}

export interface SellIntent {
  readonly type: 'sell';
  readonly product: ProductId;
  readonly qty: number;
  readonly location?: LocationId;
  readonly stashId?: string;
}

export type DealIntent = BuyIntent | SellIntent;

function stashUnits(stash: Stash): number {
  return PRODUCT_IDS.reduce((sum, id) => sum + stash.inventory[id], 0);
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
  return { ...inv, [product]: inv[product] + delta };
}

function addHeat(state: GameState, delta: number): GameState {
  return { ...state, heat: clamp(state.heat + delta, 0, HEAT_MAX) };
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

function resolveBuy(state: GameState, intent: BuyIntent): DealResult {
  const { product, qty } = intent;
  if (!Number.isInteger(qty) || qty <= 0) return reject(state, 'invalid-qty');

  const location = intent.location ?? SOURCE_LOCATION;
  const stash = targetStash(state, intent.stashId);
  if (!stash) return reject(state, 'no-stash');

  const price = getMarketPrice(state, product, location);
  const cost = price.buy * qty;
  if (stash.dirtyCash < cost) return reject(state, 'insufficient-funds');
  if (stashUnits(stash) + qty > DEFAULT_STASH_CAPACITY) {
    return reject(state, 'insufficient-capacity');
  }

  const nextStash: Stash = {
    ...stash,
    dirtyCash: stash.dirtyCash - cost,
    inventory: adjustInventory(stash.inventory, product, qty),
  };
  const cfg = getProduct(product);
  let next = withStash(state, nextStash);
  next = addHeat(next, cfg.heatPerUnit * qty * BUY_HEAT_FACTOR);
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

  const location = intent.location ?? SOURCE_LOCATION;
  const stash = targetStash(state, intent.stashId);
  if (!stash) return reject(state, 'no-stash');
  if (stash.inventory[product] < qty) return reject(state, 'insufficient-inventory');

  const cfg = getProduct(product);
  const price = getMarketPrice(state, product, location);
  const displayedBustProb = computeBustProbability(state, product, qty, location);

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
    next = addHeat(next, cfg.heatPerUnit * qty * cfg.bustHeatMultiplier);
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

  const proceeds = price.sell * qty;
  const soldStash: Stash = {
    ...stash,
    dirtyCash: stash.dirtyCash + proceeds,
    inventory: adjustInventory(stash.inventory, product, -qty),
  };
  let next = withStash(rolled, soldStash);
  next = addHeat(next, cfg.heatPerUnit * qty);
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
 * Resolve a buy or sell against `state`: validate funds / inventory / capacity
 * (rejecting without mutation), roll the bust check for sells, and apply the
 * cash + inventory + heat changes. Returns the new state plus the scene key and
 * the fairness numbers the UI shows. Pure and deterministic.
 */
export function resolveDeal(state: GameState, intent: DealIntent): DealResult {
  return intent.type === 'buy'
    ? resolveBuy(state, intent)
    : resolveSell(state, intent);
}
