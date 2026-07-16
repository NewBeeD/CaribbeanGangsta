/**
 * The money-mule wash queue — the BATCHED dirty→clean converter (design decision;
 * the money mules who go bank to bank depositing under the $10k reporting
 * threshold). It is the deliberate opposite of the removed instant Peso Exchange
 * (design/12 Item 12): dirty cash is committed, pulled out of stashes, and drips
 * back as clean cash over ONLINE time rather than in one lump — so it complements
 * fronts (which still mint clean passively) instead of trivializing them.
 *
 * Three pure operations:
 *  - `queueWash` — commit `amount` of located dirty cash to the mules (pulls it out
 *    of stashes into `state.wash.queuedDirty`). An intent, not a tick.
 *  - `cancelWash` — call the mules off and return the un-deposited dirty to a stash
 *    (adds only; never loses the cut on money not yet laundered).
 *  - `washStep` — the `wash-queue` tick: drain the queue at the mule throughput and
 *    land clean cash at `1 − WASH_CUT`. ACTIVE-ONLY, so a batch never clears while
 *    the player is away (GDD §6) — absence neither launders nor loses.
 *
 * Purity/determinism (prompts/README.md): no `Math.random`, no wall clock — the
 * throughput is a fixed function of config and elapsed hours. The cut is realized
 * only as each batch lands, so `netWorth` counts queued cash at face value and
 * committing to the queue never reads as a loss.
 */

import { washRatePerHour, WASH_CUT } from './config/fronts';
import type { TickMode } from './clock';
import type { GameState, PendingChoice, Stash } from './state';

// --- Rates (shown = charged) -------------------------------------------------

/** The mule throughput in dirty $/hr for this run's tuning (config-driven). */
export function washRate(state: GameState): number {
  return washRatePerHour(state.config.fronts);
}

/** Fraction of each laundered dollar the mules/banks skim (design decision). */
export function washCut(state: GameState): number {
  return state.config.fronts.WASH_CUT ?? WASH_CUT;
}

/** Clean $/hr the queue lands while draining — throughput after the cut. */
export function washCleanRate(state: GameState): number {
  return washRate(state) * (1 - washCut(state));
}

/**
 * In-game hours to finish the current queue at the run's throughput (0 when idle).
 * The ETA the Money screen shows — `queuedDirty / rate` (fairness: shown = drained).
 */
export function washEtaHours(state: GameState): number {
  const rate = washRate(state);
  if (rate <= 0 || state.wash.queuedDirty <= 0) return 0;
  return state.wash.queuedDirty / rate;
}

// --- Commit / cancel ---------------------------------------------------------

export type WashRejectReason = 'invalid-amount' | 'insufficient-dirty';

/** Result of committing/cancelling a wash: new state + the queued total, or a reject. */
export interface WashResult {
  readonly state: GameState;
  /** The queue's total AFTER the operation, $ (unchanged on a rejection). */
  readonly queuedDirty: number;
  readonly rejected?: WashRejectReason;
}

/** Total dirty cash located across stashes (what the mules can draw on). */
function totalDirty(stashes: readonly Stash[]): number {
  return stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
}

/**
 * Drain `amount` of dirty cash from `stashes`, most-flush stash first, returning
 * the reduced stashes. Assumes `amount ≤ Σ dirtyCash` (the caller checks). Pure.
 */
function drainDirty(stashes: readonly Stash[], amount: number): readonly Stash[] {
  const order = [...stashes].sort((a, b) => b.dirtyCash - a.dirtyCash);
  let remaining = amount;
  const drained = new Map<string, number>();
  for (const s of order) {
    if (remaining <= 0) break;
    const take = Math.min(s.dirtyCash, remaining);
    if (take > 0) {
      drained.set(s.id, take);
      remaining -= take;
    }
  }
  return stashes.map((s) =>
    drained.has(s.id) ? { ...s, dirtyCash: s.dirtyCash - drained.get(s.id)! } : s,
  );
}

/**
 * Commit `amount` of located dirty cash to the mules — pull it out of stashes and
 * into the wash queue (`state.wash.queuedDirty`). Rejects WITHOUT mutating on a
 * non-positive amount or when the run doesn't hold that much dirty cash. Adds to
 * any batch already in flight (the queue is a single pool). Net worth is unchanged
 * (the cash moved stash → queue, both counted at face value). The pickup gets a
 * feed line with its number (design/13 A6 — no dirty-cash movement is ever
 * silent, even a commissioned one), so the stash-side drop never reads as a loss.
 */
export function queueWash(state: GameState, amount: number): WashResult {
  const queued = state.wash.queuedDirty;
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { state, queuedDirty: queued, rejected: 'invalid-amount' };
  }
  if (totalDirty(state.stashes) < amount) {
    return { state, queuedDirty: queued, rejected: 'insufficient-dirty' };
  }
  const stashes = drainDirty(state.stashes, amount);
  const queuedDirty = queued + amount;
  const pickup: PendingChoice = {
    id: `wash-pickup-${state.clock.hours}-${queuedDirty}`,
    kind: 'wash-pickup',
    summary: `Mules picked up $${Math.round(amount).toLocaleString('en-US')} — it comes back clean as they deposit.`,
    createdAtHours: state.clock.hours,
  };
  return {
    state: {
      ...state,
      stashes,
      wash: { queuedDirty },
      pendingChoices: [...state.pendingChoices, pickup],
    },
    queuedDirty,
  };
}

/**
 * Call the mules off: return all un-deposited dirty cash to a stash (the home
 * stash, or the first stash) and empty the queue. Adds only — cash already
 * laundered stayed clean; this just reclaims what hadn't been deposited yet. A
 * no-op when the queue is idle or there is nowhere to return it.
 */
export function cancelWash(state: GameState): GameState {
  const queued = state.wash.queuedDirty;
  if (queued <= 0 || state.stashes.length === 0) return state;
  const target =
    state.stashes.find((s) => s.id === 'stash-home') ?? state.stashes[0]!;
  const stashes = state.stashes.map((s) =>
    s.id === target.id ? { ...s, dirtyCash: s.dirtyCash + queued } : s,
  );
  return { ...state, stashes, wash: { queuedDirty: 0 } };
}

// --- The `wash-queue` tick step ----------------------------------------------

/**
 * Drain the wash queue over `dtHours` of ONLINE time: deposit up to
 * `washRate × dtHours` dirty dollars, landing clean cash at `1 − WASH_CUT`. The
 * skimmed cut simply evaporates (the mules'/banks' fee). ACTIVE-ONLY and a no-op
 * on an empty queue, so absence never launders and a run using only fronts is
 * untouched. Peaks are (re)banked by the later `peak-tracking` step.
 */
export function washStep(
  state: GameState,
  dtHours: number,
  mode: TickMode = 'active',
): GameState {
  if (mode !== 'active' || dtHours <= 0 || state.wash.queuedDirty <= 0) return state;
  const deposited = Math.min(state.wash.queuedDirty, washRate(state) * dtHours);
  if (deposited <= 0) return state;
  const cleanGain = deposited * (1 - washCut(state));
  return {
    ...state,
    wash: { queuedDirty: state.wash.queuedDirty - deposited },
    cleanCash: state.cleanCash + cleanGain,
  };
}
