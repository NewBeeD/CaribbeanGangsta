/**
 * Headless batch playtest (Prompt 25; design/01 §8): drive a whole run — engine
 * only, no UI, no store — with a simple deterministic dealer policy, over many
 * seeds, and report the two tune-first numbers the design demands:
 *
 * - **Dead-on-arrival seeds** (design/01 §8.7, target ~0): a generated world
 *   where no first move exists — the starting cash can't afford a single unit
 *   of anything traded at the starting country.
 * - **Run-length distribution** (design/01 §8.6): is a run an arc, not a
 *   coin-flip? The report carries per-run days/cause/score for the distribution.
 *
 * Everything here is pure engine calls on a seed, so a reported seed reproduces
 * its run exactly (the whole point of the seeded RNG).
 */

import {
  createInitialState,
  netWorth,
  splitCharge,
  type GameState,
} from '@/engine/state';
import { tick } from '@/engine/clock';
import {
  getMarketPrice,
  resolveDeal,
  type DealIntent,
} from '@/engine/deals';
import { PRODUCT_IDS, isTraded, requiresPlug, type ProductId } from '@/engine/config/countries';
import { getStashType } from '@/engine/config/stashes';
import { stashUnits } from '@/engine/storage';
import { buyFront } from '@/engine/laundering';
import type { FrontType } from '@/engine/config/fronts';
import type { GameConfig } from '@/engine/config';
import {
  effectiveHeat,
  hottestCountry,
  hottestHeat,
  isLyingLow,
  setLieLow,
} from '@/engine/heat';
import { HEAT_MAX } from '@/engine/config/heat';
import { endRun, evaluateSpiral } from '@/engine/endgame';
import type { RunEndCause } from '@/engine/endgame';

/** Units bought per product over a run — the policy's revealed trade mix. */
export type TradeMix = Readonly<Partial<Record<ProductId, number>>>;

export interface SimRunReport {
  readonly seed: string;
  /** In-game days survived when the run ended (or the retirement horizon hit). */
  readonly days: number;
  readonly cause: RunEndCause;
  /** The banked score (peak net worth). */
  readonly score: number;
  /** True when the end came through the telegraphed spiral, not the horizon. */
  readonly endedBySpiral: boolean;
  /** Units the policy BOUGHT of each product this run (the acquisition mix —
   * design/13 §H: the multi-drug acceptance is measured here, not on vibes). */
  readonly tradeMix: TradeMix;
}

export interface BatchSimReport {
  readonly runs: readonly SimRunReport[];
  /** Seeds where no first move existed at birth (design/01 §8.7 — target ~0). */
  readonly deadOnArrival: readonly string[];
  readonly medianDays: number;
  /** Units bought per product summed across every run in the batch. */
  readonly tradeMix: TradeMix;
  /** Total units bought across all products (the trade-mix denominator). */
  readonly totalUnits: number;
  /** Cocaine's fraction of `totalUnits` (0 when nothing traded). The design/13
   * §H acceptance bar: this must sit below `COCAINE_SHARE_TARGET`. */
  readonly cocaineShare: number;
}

/**
 * The multi-drug acceptance threshold (design/13 §H; Ideas2 round-4 "I want to
 * trade all drugs because of price hikes across countries"). Cocaine's share of
 * the batch policy's bought volume must sit BELOW this — if one drug owned the
 * board there would be no reason to touch the other nine. The drift-trading
 * policy already spreads across products because it buys the deepest relative
 * dip regardless of drug; this bar guards against a retune re-crowning cocaine.
 */
export const COCAINE_SHARE_TARGET = 0.6;

/** Fold a run's mix into a running total (pure). */
function mergeMix(into: Record<string, number>, add: TradeMix): void {
  for (const [product, units] of Object.entries(add)) {
    into[product] = (into[product] ?? 0) + (units ?? 0);
  }
}

export interface BatchSimOptions {
  /** In-game hours advanced per policy step (default 6). */
  readonly hoursPerStep?: number;
  /** Retirement horizon, in-game days — bounds every run (default 84). */
  readonly maxDays?: number;
  /**
   * The balance tuning to run under (Prompt 26) — default the v1 config. The
   * whole point of the injection: the SAME seeds under an alternate tuning
   * report different outcomes, with no code changes.
   */
  readonly config?: GameConfig;
}

/**
 * Products the policy may buy at `countryId` right now (traded, plug held).
 * Arms are EXCLUDED — like the Deal screen (`dealScreen.model.ts` filters
 * `p.id !== 'arms'`), they trade through their own broker screen, never on the
 * drug loop `resolveDeal` runs. Keeping them out makes the trade-mix a true
 * DRUG mix (design/13 §H — the multi-drug acceptance is a drug-board number).
 */
function buyableProducts(state: GameState, countryId: string): ProductId[] {
  return PRODUCT_IDS.filter(
    (p) =>
      p !== 'arms' &&
      isTraded(countryId, p) &&
      !(requiresPlug(countryId, p) && !state.plugs.includes(countryId)),
  );
}

/**
 * Whether ANY first move exists from the starting hand: one affordable unit of
 * anything traded at home. This is the dead-on-arrival check.
 */
export function hasFirstMove(state: GameState): boolean {
  const home = state.stashes[0];
  if (!home) return false;
  return buyableProducts(state, home.countryId).some((p) => {
    const price = getMarketPrice(state, p, home.countryId);
    return price.stock >= 1 && splitCharge(state, home, price.price) !== null;
  });
}

/**
 * The cheapest front the policy still needs to open (idle engine on = longer
 * runs). Single-buy (Ideas2 item 1) means each technique is bought at most once,
 * so owned types are excluded; `null` once the whole roster is in play.
 */
function cheapestFront(
  state: GameState,
): { readonly type: FrontType; readonly buyIn: number } | null {
  const owned = new Set(state.fronts.map((f) => f.type));
  const candidates = state.config.fronts.FRONT_TYPES.filter((f) => !owned.has(f.id));
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.buyIn < a.buyIn ? b : a));
  return { type: best.id, buyIn: best.buyIn };
}

/**
 * One policy step: a simple, deterministic street dealer. The one-price
 * economy (Prompt 32) has no in-place margin, so the policy trades the DRIFT:
 * buy when the local price sits below its base (factor < 1), sell the holding
 * once it's back at/above base; open fronts when clean cash allows (the only
 * dirty→clean route now — design/12 Item 12); lie low when hot. No cleverness —
 * the policy exists to exercise the sim, not to win.
 */
/** A policy step's outcome: the next state, plus any product bought (for the mix). */
interface PolicyStep {
  readonly state: GameState;
  readonly bought?: { readonly product: ProductId; readonly qty: number };
}

function policyStep(state: GameState): PolicyStep {
  const home = state.stashes[0];
  if (!home) return { state };
  let next = state;

  // Heat management: duck under the worst of it (free, deterministic lever).
  // The 0.7/0.3 hysteresis band is POLICY (what this scripted dealer does), not
  // game balance — sim-policy knobs stay local to the harness. Per-country heat:
  // the policy lies low wherever it's hottest, and surfaces once that cools.
  const hotC = hottestCountry(next);
  if (!isLyingLow(next, hotC) && hottestHeat(next) > HEAT_MAX * 0.7) {
    next = setLieLow(next, hotC, true);
  } else {
    for (const c of next.lyingLowCountries) {
      if (effectiveHeat(next, c) < HEAT_MAX * 0.3) next = setLieLow(next, c, false);
    }
  }

  // Sell the holding once the local price is back at/above its base, a slab at
  // a time; below base, hold for the bounce.
  const held = PRODUCT_IDS.find((p) => (home.inventory[p] ?? 0) > 0);
  if (held) {
    const factor = next.markets[home.countryId]?.[held]?.factor ?? 1;
    if (factor >= 1) {
      const qty = Math.min(home.inventory[held] ?? 0, 10);
      const intent: DealIntent = { type: 'sell', product: held, qty, stashId: home.id };
      return { state: resolveDeal(next, intent).state };
    }
  }

  // Put surplus clean cash to work in a front (the idle engine — the ONLY
  // dirty→clean route now that the bulk peso exchange is gone, design/12 Item
  // 12). Clean cash here comes from front accrual + golden hours, so a front
  // compounds the clean side once one is affordable.
  const front = cheapestFront(next);
  if (front && next.cleanCash >= front.buyIn * 1.5) {
    next = buyFront(next, front.type).state;
  }

  // Not holding: buy the deepest dip — the affordable product priced furthest
  // below its base (factor < 1), bounded by the street's stock.
  if (held) return { state: next };
  const homeNow = next.stashes[0]!;
  const room =
    getStashType(homeNow.type, next.config.stashes.STASH_TYPES).capacity -
    stashUnits(homeNow);
  let best: { product: ProductId; qty: number; factor: number } | null = null;
  for (const p of buyableProducts(next, homeNow.countryId)) {
    const factor = next.markets[homeNow.countryId]?.[p]?.factor ?? 1;
    if (factor >= 1) continue;
    const price = getMarketPrice(next, p, homeNow.countryId);
    if (price.price <= 0) continue;
    const affordable = Math.floor((homeNow.dirtyCash + next.cleanCash) / price.price);
    const qty = Math.min(affordable, 20, room, price.stock);
    if (qty < 1) continue;
    if (!best || factor < best.factor) best = { product: p, qty, factor };
  }
  if (best) {
    const intent: DealIntent = {
      type: 'buy',
      product: best.product,
      qty: best.qty,
      stashId: homeNow.id,
    };
    const result = resolveDeal(next, intent);
    next = result.state;
    // Only a landed buy counts toward the mix (a rejected intent moves nothing).
    if (result.outcome !== 'rejected') {
      return { state: next, bought: { product: best.product, qty: best.qty } };
    }
  }
  return { state: next };
}

/** Play one seed to its end (spiral death or the retirement horizon). */
export function simulateRun(
  seed: number | string,
  options: BatchSimOptions = {},
): SimRunReport {
  const hoursPerStep = options.hoursPerStep ?? 6;
  const maxDays = options.maxDays ?? 84;
  let state = options.config
    ? createInitialState(seed, options.config)
    : createInitialState(seed);
  const maxSteps = Math.ceil((maxDays * 24) / hoursPerStep);
  const mix: Record<string, number> = {};

  for (let step = 0; step < maxSteps; step++) {
    if (state.runStatus !== 'active') break;
    if (evaluateSpiral(state).terminal) {
      const ended = endRun(state, 'killed');
      return {
        seed: state.seed,
        days: ended.recap.day,
        cause: ended.cause,
        score: ended.score,
        endedBySpiral: true,
        tradeMix: mix,
      };
    }
    const stepped = policyStep(state);
    if (stepped.bought) mix[stepped.bought.product] = (mix[stepped.bought.product] ?? 0) + stepped.bought.qty;
    state = tick(stepped.state, hoursPerStep);
  }

  // Horizon reached (or a card-driven terminal status): bank and retire.
  const cause: RunEndCause = state.runStatus === 'active' ? 'retired' : 'killed';
  const ended = state.runStatus === 'active' ? endRun(state, cause) : null;
  return {
    seed: state.seed,
    days: state.clock.day,
    cause: ended?.cause ?? cause,
    score: ended?.score ?? Math.max(state.highScore.peakNetWorth, netWorth(state)),
    endedBySpiral: false,
    tradeMix: mix,
  };
}

/**
 * The batch harness: run every seed headlessly and aggregate the report the
 * tuning loop (and Prompt 28's acceptance pass) reads.
 */
export function runBatchSim(
  seeds: readonly (number | string)[],
  options: BatchSimOptions = {},
): BatchSimReport {
  const deadOnArrival: string[] = [];
  const runs: SimRunReport[] = [];
  for (const seed of seeds) {
    const opening = options.config
      ? createInitialState(seed, options.config)
      : createInitialState(seed);
    if (!hasFirstMove(opening)) {
      deadOnArrival.push(opening.seed);
      continue;
    }
    runs.push(simulateRun(seed, options));
  }
  const sorted = runs.map((r) => r.days).sort((a, b) => a - b);
  const medianDays =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const tradeMix: Record<string, number> = {};
  for (const run of runs) mergeMix(tradeMix, run.tradeMix);
  const totalUnits = Object.values(tradeMix).reduce((a, b) => a + b, 0);
  const cocaineShare = totalUnits > 0 ? (tradeMix.cocaine ?? 0) / totalUnits : 0;
  return { runs, deadOnArrival, medianDays, tradeMix, totalUnits, cocaineShare };
}
