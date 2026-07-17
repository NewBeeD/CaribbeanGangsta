/**
 * The arms trade — its own market, off the drug board (design/12 Item 1; Prompt
 * 35). Arms are gated behind a one-time BROKER intro (a pure money gate,
 * `config/arms.ts` `ARMS_BROKER_COST`), sold in TIERS (pistols → military) that
 * carry the heaviest heat in the game, and priced near-flat until a CONFLICT
 * EVENT (the item-6 event system, as arms `MarketEvent`s) spikes demand — that
 * spike is where arms money is made.
 *
 * Design faithfulness:
 *  - **Brokers, not shelves** — `armsBroker` unlocks the trade; until it's paid
 *    the page is visible with the intro priced in prose (the plug-gate pattern).
 *  - **The Iron River** — arms source from `north-america`; the base price
 *    stretches only modestly with geography (`ARMS_DISTANCE_ELASTICITY`).
 *  - **EUC paperwork = corruption tie-in** — a paid Customs Chief
 *    (`corruption.hasCustomsProtection`) cuts the seizure odds on an arms sale
 *    (`ARMS_CUSTOMS_SEIZURE_RELIEF`): paper is the product.
 *  - **Conflict spikes are loud** — selling into an up-event adds bonus heat.
 *
 * Purity/determinism (prompts/README.md): pure, immutable state in → new state
 * out. The one player-facing roll (an arms sale's bust check) draws from the
 * run's serialized `state.rngState` and writes the snapshot back — shown odds ARE
 * rolled odds (design/01 §0.3). Market drift/restock is the active-only
 * `arms-markets` tick step (clock.ts) and draws from an INDEPENDENT run-seeded
 * stream (like chaos / market events), so it never perturbs the main deal/raid
 * RNG. The world is frozen offline (GDD §6): arms never drift, restock, or heat
 * while the player is away.
 */

import { createRng, restoreRng, type Rng } from './rng';
import {
  COUNTRY_IDS,
  REGION_DISTANCE,
  getCountry,
  isTraded,
} from './config/countries';
import {
  WEAPON_TIER_IDS,
  getWeaponTier,
  type WeaponTierId,
} from './config/arms';
import { DEFAULT_GAME_CONFIG, type ArmsTuning } from './config';
import { HEAT_MAX } from './config/heat';
import { marketEventMultiplier, type MarketState } from './deals';
import { eventCoversCountry } from './marketEvents';
import { hasCustomsProtection } from './corruption';
import { addHeat } from './heat';
import { maybeOpenInvestigation } from './heatSources';
import { splitCharge, type GameState, type Stash } from './state';

// --- Types (arms reuse the drug market's live shape) --------------------------

/** An arms market's live state — the same `{ factor, prevFactor, stock }` shape
 * as a drug market (deals.ts): live price = base × factor, finite stock pool. */
export type ArmsMarketState = MarketState;

/** Live arms markets: every arms-trading country × weapon tier. */
export type ArmsMarkets = Readonly<
  Record<string, Readonly<Record<WeaponTierId, ArmsMarketState>>>
>;

/** The armory — units of each weapon tier the player is holding (a single
 * off-book arsenal at the broker's warehouse; arms don't scatter into stashes). */
export type Armory = Readonly<Record<WeaponTierId, number>>;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic string hash → float in [0,1) — RNG-free per-run base prices. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Whether arms trade at `countryId` — reuses the country's regional culture
 * (`traded` already lists `arms` where it moves; design/11 §1, design/12 Item 1). */
export function armsTraded(countryId: string): boolean {
  return isTraded(countryId, 'arms');
}

/** Every country arms can be dealt in (the regional arms culture). */
export const ARMS_COUNTRY_IDS: readonly string[] = COUNTRY_IDS.filter(armsTraded);

/** A market's country-size scale on its stock pool: its demand-bias midpoint. */
function stockScale(countryId: string): number {
  const c = getCountry(countryId);
  return (c.demandBias.min + c.demandBias.max) / 2;
}

/** The stock CEILING for one arms market (its seed max under the size scale).
 * Recomputable, so never stored — restocking never fills past it. */
export function armsStockCap(
  countryId: string,
  tuning: ArmsTuning = DEFAULT_GAME_CONFIG.arms,
): number {
  return Math.round(tuning.ARMS_STOCK_SEED_BAND.max * stockScale(countryId));
}

/**
 * Fresh arms markets — every tier in every arms-trading country at base price
 * (factor 1) with a seeded stock pool. Consumes `rng`; callers seeding a run
 * pass a dedicated fork so the draw can't desync other streams.
 */
export function createInitialArmsMarkets(
  rng: Rng,
  tuning: ArmsTuning = DEFAULT_GAME_CONFIG.arms,
): ArmsMarkets {
  const markets = {} as Record<string, Record<WeaponTierId, ArmsMarketState>>;
  for (const countryId of ARMS_COUNTRY_IDS) {
    const perTier = {} as Record<WeaponTierId, ArmsMarketState>;
    for (const tier of WEAPON_TIER_IDS) {
      const stock = Math.round(
        rng.float(tuning.ARMS_STOCK_SEED_BAND.min, tuning.ARMS_STOCK_SEED_BAND.max) *
          stockScale(countryId),
      );
      perTier[tier] = { factor: 1, prevFactor: 1, stock };
    }
    markets[countryId] = perTier;
  }
  return markets;
}

/** Total weapons held across all tiers — a quick arsenal readout. */
export function armorySize(armory: Armory): number {
  return WEAPON_TIER_IDS.reduce((sum, id) => sum + (armory[id] ?? 0), 0);
}

/**
 * Spend weapons from the armory for a turf-war battle — the arms system's COMBAT
 * use (design "Turf Wars Between Countries"). Arms are consumed win or lose, so
 * firepower is spent, not free. Each tier's request is clamped to what's on hand,
 * so a caller can never overdraw the arsenal; the returned `spent` is exactly how
 * many of each tier were committed (the shown = spent number). Pure.
 */
export function spendArmory(
  armory: Armory,
  request: Readonly<Partial<Record<WeaponTierId, number>>>,
): { readonly armory: Armory; readonly spent: Readonly<Record<WeaponTierId, number>> } {
  const next = {} as Record<WeaponTierId, number>;
  const spent = {} as Record<WeaponTierId, number>;
  for (const id of WEAPON_TIER_IDS) {
    const have = armory[id] ?? 0;
    const want = Math.max(0, Math.floor(request[id] ?? 0));
    const take = Math.min(have, want);
    spent[id] = take;
    next[id] = have - take;
  }
  return { armory: next, spent };
}

// --- Pricing ------------------------------------------------------------------

/**
 * The per-run SOURCE price for a weapon tier, $/unit — resolved deterministically
 * from the run's seed within the tier's band (RNG-free; the same run always reads
 * the same source price). This is the price at the Iron River origin; geography
 * and conflict stretch it from here.
 */
export function armsTierBasePrice(
  seed: string,
  tier: WeaponTierId,
  tuning: ArmsTuning = DEFAULT_GAME_CONFIG.arms,
): number {
  const band = getWeaponTier(tier, tuning.WEAPON_TIERS).price;
  return band.min + hash01(`${seed}::arms::${tier}`) * (band.max - band.min);
}

/** The country's per-run demand character (world geography), 1 if unknown. */
function demandFactor(state: GameState, countryId: string): number {
  return (
    state.world.supplierGeography.find((s) => s.countryId === countryId)?.demandFactor ?? 1
  );
}

/** Whether an active up-event (a conflict spike) covers arms at `countryId` —
 * drives the bonus heat on a sale and the "conflict" flag the UI shows. */
export function armsConflictActive(state: GameState, countryId: string): boolean {
  const hours = state.clock.hours;
  return state.marketEvents.some(
    (e) =>
      e.product === 'arms' &&
      e.direction === 'up' &&
      hours >= e.startHours &&
      hours < e.endHours &&
      eventCoversCountry(e, countryId),
  );
}

export type ArmsPriceTrend = 'up' | 'down' | 'flat';

export interface ArmsPrice {
  /** THE price — buys and sells both execute at this one number. */
  readonly price: number;
  readonly trend: ArmsPriceTrend;
  /** Whole units the broker's line can supply right now (finite stock). */
  readonly stock: number;
  /** True while a conflict event is spiking this market (the money window). */
  readonly conflict: boolean;
}

function armsMarketFor(
  state: GameState,
  countryId: string,
  tier: WeaponTierId,
): ArmsMarketState | null {
  return state.armsMarkets[countryId]?.[tier] ?? null;
}

/**
 * The live arms price for `tier` at `countryId`: the per-run source base
 * (`armsTierBasePrice`) stretched by geography from the Iron River and the
 * country's demand character, times the market's live drift factor, times the
 * conflict-event multiplier (the item-6 overlay, read at pricing time — a pure
 * function of the clock, like the drug board). `stock` is the pool a buy is
 * bounded by (shown on the page — never a hidden cap).
 */
export function getArmsPrice(
  state: GameState,
  tier: WeaponTierId,
  countryId: string,
): ArmsPrice {
  const tuning = state.config.arms;
  const country = getCountry(countryId);
  const market = armsMarketFor(state, countryId, tier);
  const base = armsTierBasePrice(state.seed, tier, tuning);
  const dist = REGION_DISTANCE[country.region][tuning.ARMS_SOURCE_REGION];
  const geo = Math.pow(1 + tuning.ARMS_DISTANCE_ELASTICITY, dist) * demandFactor(state, countryId);
  const factor = market?.factor ?? 1;
  const prev = market?.prevFactor ?? 1;
  const conflictMult = marketEventMultiplier(state, 'arms', countryId);

  const trend: ArmsPriceTrend = factor > prev ? 'up' : factor < prev ? 'down' : 'flat';
  return {
    price: Math.round(base * geo * factor * conflictMult),
    trend,
    stock: Math.floor(market?.stock ?? 0),
    conflict: armsConflictActive(state, countryId),
  };
}

// --- The Broker intro (a pure money gate; design/12 Item 1) -------------------

export interface ArmsBrokerQuote {
  readonly cost: number;
  readonly meetingHeat: number;
  readonly unlocked: boolean;
}

/** The standing broker-intro quote (always visible — the gate is priced, never
 * hidden). Cost + meeting heat are disclosed before commit (fairness). */
export function armsBrokerQuote(state: GameState): ArmsBrokerQuote {
  return {
    cost: state.config.arms.ARMS_BROKER_COST,
    meetingHeat: state.config.arms.ARMS_BROKER_HEAT,
    unlocked: state.armsBroker,
  };
}

export type ArmsBrokerRejectReason = 'already-unlocked' | 'insufficient-funds';

export interface ArmsBrokerResult {
  readonly state: GameState;
  readonly ok: boolean;
  readonly cost: number;
  readonly sceneKey: string;
  readonly rejected?: ArmsBrokerRejectReason;
}

/** The narrative-beat flag stamped when the broker opens — fires the existing
 * `beat.arms-unlock` (beats.ts `ARMS_UNLOCK_FLAG`). A consequence flag (a beat
 * payoff), NOT a gate — the gate is `state.armsBroker` and it is pure money. */
export const ARMS_UNLOCKED_FLAG = 'arms-unlocked';

/**
 * Pay the broker intro from CLEAN cash (design/12 Item 1 — the plug-style money
 * gate): unlock the arms trade, take the meeting's shown heat, and stamp the
 * arms-unlock beat flag. Rejections never mutate state.
 */
export function unlockArmsBroker(state: GameState): ArmsBrokerResult {
  if (state.armsBroker) {
    return { state, ok: false, cost: 0, sceneKey: 'arms.broker.reject', rejected: 'already-unlocked' };
  }
  const cost = state.config.arms.ARMS_BROKER_COST;
  if (state.cleanCash < cost) {
    return { state, ok: false, cost: 0, sceneKey: 'arms.broker.reject', rejected: 'insufficient-funds' };
  }
  let next: GameState = {
    ...state,
    cleanCash: state.cleanCash - cost,
    armsBroker: true,
    flags: { ...state.flags, [ARMS_UNLOCKED_FLAG]: true },
  };
  next = addHeat(next, state.config.arms.ARMS_BROKER_HEAT, 'arms.broker');
  return { state: next, ok: true, cost, sceneKey: 'arms.broker.opened' };
}

// --- Bust probability on an arms sale (the fairness contract) -----------------

/**
 * The bust probability shown to the player AND rolled against on an arms sale —
 * one number, no hidden second modifier (design/01 §0.3). `f(heat, country risk,
 * tier risk, qty)` minus the Customs Chief's EUC relief (design/12 Item 1),
 * clamped to `[ARMS_BUST_MIN, ARMS_BUST_MAX]`.
 */
export function armsBustProbability(
  state: GameState,
  tier: WeaponTierId,
  qty: number,
  countryId: string,
): number {
  const a = state.config.arms;
  const country = getCountry(countryId);
  const tierCfg = getWeaponTier(tier, a.WEAPON_TIERS);
  const heatN = clamp(state.heat / HEAT_MAX, 0, 1);
  const qtyN = clamp(qty / a.ARMS_BUST_QTY_FULL_RISK, 0, 1);
  const relief = hasCustomsProtection(state) ? a.ARMS_CUSTOMS_SEIZURE_RELIEF : 0;

  const raw =
    a.ARMS_BUST_BASE +
    heatN * a.ARMS_BUST_HEAT_WEIGHT +
    country.risk * a.ARMS_BUST_LOCATION_WEIGHT +
    tierCfg.tierRisk * a.ARMS_BUST_TIER_WEIGHT +
    qtyN * a.ARMS_BUST_QTY_WEIGHT -
    relief;

  return clamp(raw, a.ARMS_BUST_MIN, a.ARMS_BUST_MAX);
}

// --- Deal resolution ----------------------------------------------------------

export type ArmsDealOutcome = 'success' | 'bust' | 'rejected';

export type ArmsRejectReason =
  | 'invalid-qty'
  /** The broker intro hasn't been paid — the trade is closed (design/12 Item 1). */
  | 'no-broker'
  | 'no-home-stash'
  /** Arms don't trade at this country (regional culture; design/11 §1). */
  | 'not-traded'
  | 'insufficient-funds'
  | 'insufficient-inventory'
  /** The broker's line can't supply that many right now (finite stock). */
  | 'no-supply';

export interface ArmsDealResult {
  readonly state: GameState;
  readonly outcome: ArmsDealOutcome;
  /** The bust % shown pre-commit == the number rolled (0 for a buy). */
  readonly displayedBustProb: number;
  readonly rolledValue: number;
  readonly cashDelta: number;
  readonly sceneKey: string;
  readonly rejected?: ArmsRejectReason;
}

export interface BuyArmsIntent {
  readonly type: 'buyArms';
  readonly tier: WeaponTierId;
  readonly qty: number;
  readonly countryId: string;
}

export interface SellArmsIntent {
  readonly type: 'sellArms';
  readonly tier: WeaponTierId;
  readonly qty: number;
  readonly countryId: string;
}

export interface UnlockArmsBrokerIntent {
  readonly type: 'unlockArmsBroker';
}

export type ArmsIntent = BuyArmsIntent | SellArmsIntent;

function rejectArms(state: GameState, reason: ArmsRejectReason): ArmsDealResult {
  return {
    state,
    outcome: 'rejected',
    displayedBustProb: 0,
    rolledValue: Number.NaN,
    cashDelta: 0,
    sceneKey: 'arms.reject',
    rejected: reason,
  };
}

function homeStash(state: GameState): Stash | null {
  return state.stashes[0] ?? null;
}

function withHomeDirty(state: GameState, dirtyCash: number): GameState {
  const home = homeStash(state);
  if (!home) return state;
  const next = { ...home, dirtyCash };
  return { ...state, stashes: state.stashes.map((s) => (s.id === home.id ? next : s)) };
}

function withArmory(state: GameState, tier: WeaponTierId, units: number): GameState {
  return { ...state, armory: { ...state.armory, [tier]: Math.max(0, units) } };
}

function withArmsStock(
  state: GameState,
  countryId: string,
  tier: WeaponTierId,
  stock: number,
): GameState {
  const atCountry = state.armsMarkets[countryId];
  const market = atCountry?.[tier];
  if (!atCountry || !market) return state;
  return {
    ...state,
    armsMarkets: {
      ...state.armsMarkets,
      [countryId]: { ...atCountry, [tier]: { ...market, stock } },
    },
  };
}

/** Bank the net-worth / clean-cash peaks after an arms sale (design/01 §7). */
function bankArmsPeaks(state: GameState): GameState {
  const dirty = state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
  const netWorth = dirty + state.cleanCash;
  const { highScore } = state;
  return {
    ...state,
    highScore: {
      ...highScore,
      peakNetWorth: Math.max(highScore.peakNetWorth, netWorth),
      peakCleanCash: Math.max(highScore.peakCleanCash, state.cleanCash),
    },
  };
}

function resolveBuyArms(state: GameState, intent: BuyArmsIntent): ArmsDealResult {
  const { tier, qty, countryId } = intent;
  if (!Number.isInteger(qty) || qty <= 0) return rejectArms(state, 'invalid-qty');
  if (!state.armsBroker) return rejectArms(state, 'no-broker');
  if (!armsTraded(countryId)) return rejectArms(state, 'not-traded');
  const home = homeStash(state);
  if (!home) return rejectArms(state, 'no-home-stash');

  const price = getArmsPrice(state, tier, countryId);
  if (qty > price.stock) return rejectArms(state, 'no-supply');
  const cost = price.price * qty;
  // Pay the broker from the home stash's dirty cash first, clean cash covering
  // the shortfall (arms are bought with whatever capital's on hand — like a deal).
  const charge = splitCharge(state, home, cost);
  if (!charge) return rejectArms(state, 'insufficient-funds');

  let next = withHomeDirty(state, home.dirtyCash - charge.fromDirty);
  next = { ...next, cleanCash: next.cleanCash - charge.fromClean };
  next = withArmory(next, tier, (state.armory[tier] ?? 0) + qty);
  next = withArmsStock(next, countryId, tier, Math.max(0, price.stock - qty));
  // A clean arms buy adds ZERO heat (design/13 B1; Prompt 44) — same law as the
  // drug loop: heat comes from getting caught, never from transacting.

  return {
    state: next,
    outcome: 'success',
    displayedBustProb: 0, // buys don't roll a bust (only sells do)
    rolledValue: 1,
    cashDelta: -cost,
    sceneKey: 'arms.buy.success',
  };
}

function resolveSellArms(state: GameState, intent: SellArmsIntent): ArmsDealResult {
  const { tier, qty, countryId } = intent;
  if (!Number.isInteger(qty) || qty <= 0) return rejectArms(state, 'invalid-qty');
  if (!state.armsBroker) return rejectArms(state, 'no-broker');
  if (!armsTraded(countryId)) return rejectArms(state, 'not-traded');
  const home = homeStash(state);
  if (!home) return rejectArms(state, 'no-home-stash');
  if ((state.armory[tier] ?? 0) < qty) return rejectArms(state, 'insufficient-inventory');

  const a = state.config.arms;
  const tierCfg = getWeaponTier(tier, a.WEAPON_TIERS);
  const price = getArmsPrice(state, tier, countryId);
  const displayedBustProb = armsBustProbability(state, tier, qty, countryId);

  // The fairness roll: ONE draw from the run's stream, bust iff under the shown %.
  const rng = restoreRng(state.rngState);
  const rolledValue = rng.next();
  const busted = rolledValue < displayedBustProb;
  const rolled = { ...state, rngState: rng.getState() };

  if (busted) {
    // The bust seizes THE TABLE only (design/13 B2; Prompt 44): the arms being
    // moved are lost; the home stash's stored dirty cash stays — a raid is the
    // ONLY way stored cash is taken.
    let next = withArmory(rolled, tier, (state.armory[tier] ?? 0) - qty);
    const spike = tierCfg.heatPerUnit * qty * a.ARMS_BUST_HEAT_MULT;
    next = addHeat(next, spike, 'arms.bust');
    // A MAJOR arms bust opens the disclosed investigation window (design/13 B5.5).
    next = maybeOpenInvestigation(next, spike);
    return {
      state: next,
      outcome: 'bust',
      displayedBustProb,
      rolledValue,
      cashDelta: 0,
      sceneKey: 'arms.sell.bust',
    };
  }

  const proceeds = price.price * qty;
  let next = withArmory(rolled, tier, (state.armory[tier] ?? 0) - qty);
  next = withHomeDirty(next, home.dirtyCash + proceeds);
  const cap = armsStockCap(countryId, a);
  const pool = armsMarketFor(state, countryId, tier)?.stock ?? 0;
  next = withArmsStock(next, countryId, tier, Math.min(cap, pool + qty * a.ARMS_SELL_RESTOCK_FRACTION));
  // A clean arms sale adds ZERO heat (design/13 B1; Prompt 44) — the bust above
  // is the spike; conflict-zone risk lives in the bust odds, not a success tax.
  next = bankArmsPeaks(next);

  return {
    state: next,
    outcome: 'success',
    displayedBustProb,
    rolledValue,
    cashDelta: proceeds,
    sceneKey: 'arms.sell.success',
  };
}

/**
 * Resolve an arms buy or sell against `state`: validate broker / market / funds /
 * inventory / supply (rejecting without mutation), roll the bust check for sells,
 * and apply the cash + armory + heat changes. Pure and deterministic.
 */
export function resolveArmsDeal(state: GameState, intent: ArmsIntent): ArmsDealResult {
  return intent.type === 'buyArms'
    ? resolveBuyArms(state, intent)
    : resolveSellArms(state, intent);
}

// --- The arms-markets tick step (registered active-only in clock.ts) ----------

/**
 * Advance every arms market by one drift + restock step of `dtHours` (design/12
 * Item 10 shape): a bounded random walk of the price factor within
 * `[1 − vol, 1 + vol]` (a drained pool biases it up — scarcity pricing), then a
 * deterministic restock capped at the seed ceiling. Draws from an INDEPENDENT
 * run-seeded stream (like chaos / market events), so it never perturbs the main
 * deal/raid RNG. Registered ACTIVE-only — arms are frozen while away (GDD §6).
 */
export function armsMarketStep(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const a = state.config.arms;
  const dtScale = Math.min(dtHours, 24) / 24;
  const refill = a.ARMS_RESTOCK_PER_DAY * (dtHours / 24);
  const rng = createRng(`${state.world.eventSeed}::arms-drift::${state.clock.hours}`);
  const vol = a.ARMS_VOLATILITY;

  const markets = {} as Record<string, Record<WeaponTierId, ArmsMarketState>>;
  for (const countryId of ARMS_COUNTRY_IDS) {
    const atCountry = state.armsMarkets[countryId];
    if (!atCountry) continue;
    const cap = armsStockCap(countryId, a);
    const perTier = {} as Record<WeaponTierId, ArmsMarketState>;
    for (const tier of WEAPON_TIER_IDS) {
      const current = atCountry[tier];
      if (!current) continue;
      const drained = cap > 0 ? clamp(1 - current.stock / cap, 0, 1) : 0;
      const delta = (rng.float(-vol, vol) + a.ARMS_SCARCITY_PRICE_WEIGHT * drained) * dtScale;
      const factor = clamp(current.factor + delta, 1 - vol, 1 + vol);
      perTier[tier] = { factor, prevFactor: current.factor, stock: Math.min(cap, current.stock + refill) };
    }
    markets[countryId] = perTier;
  }
  return { ...state, armsMarkets: markets as ArmsMarkets };
}
