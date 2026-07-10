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
import { pesoExchange, buyFront } from '@/engine/laundering';
import { FRONT_TYPES, type FrontType } from '@/engine/config/fronts';
import { setLieLow } from '@/engine/heat';
import { HEAT_MAX } from '@/engine/config/heat';
import { endRun, evaluateSpiral } from '@/engine/endgame';
import type { RunEndCause } from '@/engine/endgame';

export interface SimRunReport {
  readonly seed: string;
  /** In-game days survived when the run ended (or the retirement horizon hit). */
  readonly days: number;
  readonly cause: RunEndCause;
  /** The banked score (peak net worth). */
  readonly score: number;
  /** True when the end came through the telegraphed spiral, not the horizon. */
  readonly endedBySpiral: boolean;
}

export interface BatchSimReport {
  readonly runs: readonly SimRunReport[];
  /** Seeds where no first move existed at birth (design/01 §8.7 — target ~0). */
  readonly deadOnArrival: readonly string[];
  readonly medianDays: number;
}

export interface BatchSimOptions {
  /** In-game hours advanced per policy step (default 6). */
  readonly hoursPerStep?: number;
  /** Retirement horizon, in-game days — bounds every run (default 84). */
  readonly maxDays?: number;
}

/** Products the policy may buy at `countryId` right now (traded, plug held). */
function buyableProducts(state: GameState, countryId: string): ProductId[] {
  return PRODUCT_IDS.filter(
    (p) =>
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
    return splitCharge(state, home, price.buy) !== null;
  });
}

/** The cheapest front the policy saves toward (idle engine on = longer runs). */
function cheapestFront(): { readonly type: FrontType; readonly buyIn: number } {
  const best = FRONT_TYPES.reduce((a, b) => (b.buyIn < a.buyIn ? b : a));
  return { type: best.id, buyIn: best.buyIn };
}

/**
 * One policy step: a simple, deterministic street dealer. Sell what's held,
 * else buy the best-margin affordable product; launder surplus dirty cash; open
 * fronts when clean cash allows; lie low when hot. No cleverness — the policy
 * exists to exercise the sim, not to win.
 */
function policyStep(state: GameState): GameState {
  const home = state.stashes[0];
  if (!home) return state;
  let next = state;

  // Heat management: duck under the worst of it (free, deterministic lever).
  if (!next.lyingLow && next.heat > HEAT_MAX * 0.7) next = setLieLow(next, true);
  else if (next.lyingLow && next.heat < HEAT_MAX * 0.3) next = setLieLow(next, false);

  // Sell anything held at home, a slab at a time.
  const held = PRODUCT_IDS.find((p) => (home.inventory[p] ?? 0) > 0);
  if (held) {
    const qty = Math.min(home.inventory[held] ?? 0, 10);
    const intent: DealIntent = { type: 'sell', product: held, qty, stashId: home.id };
    return resolveDeal(next, intent).state;
  }

  // Launder a surplus into clean cash, then put clean cash to work in a front.
  if (home.dirtyCash > 20_000) {
    next = pesoExchange(next, Math.floor(home.dirtyCash / 2), home.id).state;
  }
  const front = cheapestFront();
  if (next.cleanCash >= front.buyIn * 1.5) {
    next = buyFront(next, front.type).state;
  }

  // Buy the best-margin affordable product at home.
  const homeNow = next.stashes[0]!;
  const room = getStashType(homeNow.type).capacity - stashUnits(homeNow);
  let best: { product: ProductId; qty: number; margin: number } | null = null;
  for (const p of buyableProducts(next, homeNow.countryId)) {
    const price = getMarketPrice(next, p, homeNow.countryId);
    if (price.buy <= 0) continue;
    const affordable = Math.floor((homeNow.dirtyCash + next.cleanCash) / price.buy);
    const qty = Math.min(affordable, 20, room);
    if (qty < 1) continue;
    const margin = (price.sell - price.buy) / price.buy;
    if (!best || margin > best.margin) best = { product: p, qty, margin };
  }
  if (best) {
    const intent: DealIntent = {
      type: 'buy',
      product: best.product,
      qty: best.qty,
      stashId: homeNow.id,
    };
    next = resolveDeal(next, intent).state;
  }
  return next;
}

/** Play one seed to its end (spiral death or the retirement horizon). */
export function simulateRun(
  seed: number | string,
  options: BatchSimOptions = {},
): SimRunReport {
  const hoursPerStep = options.hoursPerStep ?? 6;
  const maxDays = options.maxDays ?? 84;
  let state = createInitialState(seed);
  const maxSteps = Math.ceil((maxDays * 24) / hoursPerStep);

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
      };
    }
    state = policyStep(state);
    state = tick(state, hoursPerStep);
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
    const opening = createInitialState(seed);
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
  return { runs, deadOnArrival, medianDays };
}
