/**
 * Contraband storage — *where* you stash product and dirty cash, as a life-or-
 * death risk decision (design/09 System A; GDD §4.8). A raid hits exactly ONE
 * location (heat.ts decides whether/where), so spreading inventory across stashes
 * caps a single night's loss — while over-concentration lets one raid wipe you,
 * the entry to the death spiral (owned by Prompt 11).
 *
 * The fairness law (design/09 A.4): `effectiveSeizurePct` is the number shown on
 * the storage screen AND exactly the number rolled in `resolveRaid` — no hidden
 * second modifier. Loss is returned as a `sceneKey`, never an error toast.
 *
 * Purity/determinism (prompts/README.md): no `Math.random`, no wall clock. The
 * raid seizure roll draws from the run's serialized `state.rngState` (threaded
 * through the passed `Rng` and written back), so a save/load round-trip
 * reproduces every roll. `resolveRaid` never ends the run and is active-only
 * (registered as `raidStep` in clock.ts) — offline is frozen/safe (GDD §6).
 */

import type { Rng } from './rng';
import { restoreRng } from './rng';
import { PRODUCT_IDS, type ProductId } from './config/countries';
import {
  GUARD_CASH_THRESHOLD,
  GUARD_MAX_PENALTY,
  GUARD_UNGUARDED_PENALTY,
  WIPE_CAPITAL_THRESHOLD,
  getStashType,
  stashCost,
  type StashType,
} from './config/stashes';
import { rollRaid, type RaidEvent } from './heat';
import {
  emptyInventory,
  totalDirtyCash,
  type GameState,
  type Inventory,
  type PendingChoice,
  type Stash,
} from './state';

export type { StashType } from './config/stashes';

/** Flag set when a raid drops operating capital to ~0 (read by Prompt 11). */
export const WIPED_CAPITAL_FLAG = 'wipedOperatingCapital';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function adjustInventory(inv: Inventory, product: ProductId, delta: number): Inventory {
  return { ...inv, [product]: inv[product] + delta };
}

/** Total product units held in a single stash (all products summed). */
export function stashUnits(stash: Stash): number {
  return PRODUCT_IDS.reduce((sum, id) => sum + stash.inventory[id], 0);
}

/** Total product units held across every stash in the run. */
export function totalUnits(state: GameState): number {
  return state.stashes.reduce((sum, s) => sum + stashUnits(s), 0);
}

/** The unit capacity of a stash, from its archetype (config/stashes.ts). */
export function stashCapacity(stash: Stash): number {
  return getStashType(stash.type).capacity;
}

/** Free unit capacity left in a stash (never negative). */
export function capacityRemaining(stash: Stash): number {
  return Math.max(0, stashCapacity(stash) - stashUnits(stash));
}

function findStash(state: GameState, id: string): Stash | null {
  return state.stashes.find((s) => s.id === id) ?? null;
}

function withStash(state: GameState, next: Stash): GameState {
  return {
    ...state,
    stashes: state.stashes.map((s) => (s.id === next.id ? next : s)),
  };
}

// --- Effective seizure % (the number shown AND rolled) -----------------------

/**
 * The extra seizure % a guard situation adds (design/09 A.3a — the inside job):
 * a low-loyalty guard raises risk in proportion to `1 − loyalty`; a stash that
 * *should* be guarded (a vault, or a significant cash pile) but is left unguarded
 * carries the full unguarded penalty. A fully loyal guard adds nothing.
 */
function guardPenalty(state: GameState, stash: Stash): number {
  const cfg = getStashType(stash.type);
  const needsGuard = cfg.requiresGuard || stash.dirtyCash >= GUARD_CASH_THRESHOLD;

  if (stash.guardCrewId !== undefined) {
    const guard = state.crew.find((c) => c.id === stash.guardCrewId);
    const loyalty = guard ? clamp(guard.loyalty / 100, 0, 1) : 0;
    return (1 - loyalty) * GUARD_MAX_PENALTY;
  }
  return needsGuard ? GUARD_UNGUARDED_PENALTY : 0;
}

/**
 * Whether this stash's port is paid (design/09 A.3 — a paid port drops a
 * container's seizure to ~3%). The corruption network owns port payment (Prompt
 * 09); until then no port is paid, so container seizure sits at its base.
 */
function isPortPaid(_state: GameState, _stash: Stash): boolean {
  return false; // Prompt 09 hook.
}

/**
 * The effective seizure probability for the stash `stashId`, 0..1 — base seizure
 * (config), lowered for a paid port, then raised by guard loyalty. This is the
 * number the storage screen shows and, unchanged, the number `resolveRaid` rolls
 * (fairness law, design/09 A.4). Returns 0 for an unknown stash.
 */
export function effectiveSeizurePct(state: GameState, stashId: string): number {
  const stash = findStash(state, stashId);
  if (!stash) return 0;
  const cfg = getStashType(stash.type);

  let pct = cfg.seizurePct;
  if (cfg.portLinked && isPortPaid(state, stash) && cfg.seizurePctPaid !== undefined) {
    pct = cfg.seizurePctPaid;
  }
  pct += guardPenalty(state, stash);
  return clamp(pct, 0, 1);
}

// --- Diversification telemetry -----------------------------------------------

/**
 * How spread the run's value is across its stashes, 0..1 (design/09 telemetry).
 * `0` = everything concentrated in one location (a wipe waiting to happen); it
 * rises toward `1 − 1/n` as value is spread evenly across `n` stashes. Computed
 * as `1 − Σ(shareᵢ²)` over each stash's share of total (dirty cash + units).
 */
export function diversificationIndex(state: GameState): number {
  const values = state.stashes.map((s) => s.dirtyCash + stashUnits(s));
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return 0;
  const hhi = values.reduce((sum, v) => sum + (v / total) ** 2, 0);
  return clamp(1 - hhi, 0, 1);
}

// --- Storage operations ------------------------------------------------------

export type StorageRejectReason =
  | 'invalid-qty'
  | 'invalid-amount'
  | 'invalid-move'
  | 'no-stash'
  | 'insufficient-inventory'
  | 'insufficient-capacity'
  | 'insufficient-funds';

/** Result of building a stash: the new state + the created stash, or a rejection. */
export interface AddStashResult {
  readonly state: GameState;
  readonly stash: Stash | null;
  readonly rejected?: StorageRejectReason;
}

/**
 * Build a new stash of `type`, paid from CLEAN cash (storage is a clean-cash sink
 * — design/09 Integration/Economy). Cost follows the upgrade curve `base × 1.15^n`
 * where `n` is how many of that type already exist (design/09 A.5). Rejects
 * without mutating on insufficient funds. New stashes start empty.
 */
export function addStash(
  state: GameState,
  type: StashType,
  opts: { readonly name?: string; readonly countryId?: string } = {},
): AddStashResult {
  const cfg = getStashType(type);
  const nOwned = state.stashes.filter((s) => s.type === type).length;
  const cost = stashCost(type, nOwned);
  if (state.cleanCash < cost) {
    return { state, stash: null, rejected: 'insufficient-funds' };
  }

  const stash: Stash = {
    id: `stash-${type}-${nOwned + 1}`,
    name: opts.name ?? cfg.name,
    countryId: opts.countryId ?? state.world.startingCountry.id,
    type,
    dirtyCash: 0,
    inventory: emptyInventory(),
  };
  const next: GameState = {
    ...state,
    cleanCash: state.cleanCash - cost,
    stashes: [...state.stashes, stash],
  };
  return { state: next, stash };
}

/**
 * The outcome of a product/cash move: the new state, whether it applied, and the
 * `travelDelayHours` the move incurs (the max access delay of the two stashes —
 * design/09 A.3). `ok: false` carries a `rejected` reason and leaves state as-is.
 */
export interface MoveResult {
  readonly state: GameState;
  readonly ok: boolean;
  readonly travelDelayHours: number;
  readonly rejected?: StorageRejectReason;
}

function rejectMove(state: GameState, rejected: StorageRejectReason): MoveResult {
  return { state, ok: false, travelDelayHours: 0, rejected };
}

function travelDelayBetween(from: Stash, to: Stash): number {
  return Math.max(
    getStashType(from.type).travelDelayHours,
    getStashType(to.type).travelDelayHours,
  );
}

/**
 * Move `qty` of `product` from one stash to another. Enforces the destination's
 * capacity (rejects `insufficient-capacity`) and reports the incurred access-speed
 * travel delay (design/09 A.3). Rejects without mutating on bad qty, unknown
 * stash, a same-stash move, or insufficient held inventory.
 */
export function moveProduct(
  state: GameState,
  fromId: string,
  toId: string,
  product: ProductId,
  qty: number,
): MoveResult {
  if (!Number.isInteger(qty) || qty <= 0) return rejectMove(state, 'invalid-qty');
  if (fromId === toId) return rejectMove(state, 'invalid-move');

  const from = findStash(state, fromId);
  const to = findStash(state, toId);
  if (!from || !to) return rejectMove(state, 'no-stash');
  if (from.inventory[product] < qty) return rejectMove(state, 'insufficient-inventory');
  if (stashUnits(to) + qty > stashCapacity(to)) {
    return rejectMove(state, 'insufficient-capacity');
  }

  const nextFrom: Stash = { ...from, inventory: adjustInventory(from.inventory, product, -qty) };
  const nextTo: Stash = { ...to, inventory: adjustInventory(to.inventory, product, qty) };
  return {
    state: withStash(withStash(state, nextFrom), nextTo),
    ok: true,
    travelDelayHours: travelDelayBetween(from, to),
  };
}

/**
 * Move `amount` of DIRTY cash between stashes (dirty cash is located — design/09
 * A.3a). Reports the same access-speed travel delay as a product move. Rejects
 * without mutating on a bad amount, unknown stash, same-stash move, or shortfall.
 */
export function storeCash(
  state: GameState,
  fromId: string,
  toId: string,
  amount: number,
): MoveResult {
  if (!(amount > 0)) return rejectMove(state, 'invalid-amount');
  if (fromId === toId) return rejectMove(state, 'invalid-move');

  const from = findStash(state, fromId);
  const to = findStash(state, toId);
  if (!from || !to) return rejectMove(state, 'no-stash');
  if (from.dirtyCash < amount) return rejectMove(state, 'insufficient-funds');

  const nextFrom: Stash = { ...from, dirtyCash: from.dirtyCash - amount };
  const nextTo: Stash = { ...to, dirtyCash: to.dirtyCash + amount };
  return {
    state: withStash(withStash(state, nextFrom), nextTo),
    ok: true,
    travelDelayHours: travelDelayBetween(from, to),
  };
}

/**
 * Assign (or, with `crewId: undefined`, clear) the crew member guarding a stash.
 * Guard loyalty feeds `effectiveSeizurePct` (design/09 A.3a). No-op for an
 * unknown stash. Crew loyalty/betrayal proper is owned by Prompt 08.
 */
export function setStashGuard(
  state: GameState,
  stashId: string,
  crewId: string | undefined,
): GameState {
  const stash = findStash(state, stashId);
  if (!stash) return state;
  const next: Stash = crewId === undefined
    ? (() => {
        const { guardCrewId: _drop, ...rest } = stash;
        return rest;
      })()
    : { ...stash, guardCrewId: crewId };
  return withStash(state, next);
}

// --- Raid resolution ---------------------------------------------------------

/**
 * The outcome of resolving a raid on a single location. `displayedSeizurePct` is
 * the number that was shown (== `effectiveSeizurePct`); `rolledValue` is the RNG
 * draw compared against it (seized iff `rolledValue < displayedSeizurePct`).
 * `productLossFraction` is the share of the run's TOTAL held product lost to this
 * one raid — the diversification signal (design/09 A.2: a diversified player
 * loses `<~40%`; an over-concentrated one can be wiped).
 */
export interface RaidResult {
  readonly state: GameState;
  readonly targetStashId: string;
  readonly displayedSeizurePct: number;
  readonly rolledValue: number;
  readonly seized: boolean;
  readonly productUnitsLost: number;
  readonly dirtyCashLost: number;
  readonly productLossFraction: number;
  /** True iff this raid dropped operating capital to ~0 (for Prompt 11). */
  readonly wipedOperatingCapital: boolean;
  readonly sceneKey: string;
}

/**
 * Resolve a raid on its single target stash (design/09 A.4). Rolls the seizure at
 * exactly `effectiveSeizurePct` (fairness law); on a hit, removes product + dirty
 * cash at THAT location only, leaving every other stash untouched. Sets the
 * `wipedOperatingCapital` flag when the seizure zeroed operating capital, but
 * never ends the run itself (Prompt 11 evaluates the spiral). Consumes `rng`; the
 * returned state carries the advanced snapshot.
 */
export function resolveRaid(state: GameState, raid: RaidEvent, rng: Rng): RaidResult {
  const stash = findStash(state, raid.targetStashId);
  const displayedSeizurePct = stash ? effectiveSeizurePct(state, stash.id) : 0;
  const rolledValue = rng.next();
  const seized = stash !== null && rolledValue < displayedSeizurePct;
  const advanced: GameState = { ...state, rngState: rng.getState() };

  if (!stash || !seized) {
    return {
      state: advanced,
      targetStashId: raid.targetStashId,
      displayedSeizurePct,
      rolledValue,
      seized: false,
      productUnitsLost: 0,
      dirtyCashLost: 0,
      productLossFraction: 0,
      wipedOperatingCapital: false,
      // Nothing lost — they came up empty (moved in time / a decoy) or missed.
      sceneKey: 'raid.miss',
    };
  }

  const productUnitsLost = stashUnits(stash);
  const dirtyCashLost = stash.dirtyCash;
  const totalBefore = totalUnits(state);
  const emptied: Stash = { ...stash, dirtyCash: 0, inventory: emptyInventory() };
  let next = withStash(advanced, emptied);

  const operatingCapitalAfter = totalDirtyCash(next) + next.cleanCash;
  const wipedOperatingCapital = operatingCapitalAfter <= WIPE_CAPITAL_THRESHOLD;
  if (wipedOperatingCapital) {
    next = { ...next, flags: { ...next.flags, [WIPED_CAPITAL_FLAG]: true } };
  }

  return {
    state: next,
    targetStashId: stash.id,
    displayedSeizurePct,
    rolledValue,
    seized: true,
    productUnitsLost,
    dirtyCashLost,
    productLossFraction: totalBefore > 0 ? productUnitsLost / totalBefore : 0,
    wipedOperatingCapital,
    sceneKey: 'raid.seized',
  };
}

/**
 * Raid tick step (registered active-only in clock.ts): roll whether/where a raid
 * fires over `dtHours` (heat.ts `rollRaid`), and if one does, resolve the seizure
 * (`resolveRaid`) and queue the loss as a scene `PendingChoice` (design/09 A.4 —
 * loss renders as a scene, never a toast). Threads the run's RNG through
 * `state.rngState`. Offline never runs this step, so absence is safe (GDD §6).
 */
export function raidStep(state: GameState, dtHours: number): GameState {
  const rng = restoreRng(state.rngState);
  const raid = rollRaid(state, rng, dtHours);
  if (!raid) return { ...state, rngState: rng.getState() };

  const result = resolveRaid(state, raid, rng);
  const stash = findStash(state, raid.targetStashId);
  const where = stash?.name ?? 'a stash';
  const summary = result.seized
    ? `They raided ${where} and took what was there.`
    : `Law enforcement hit ${where} — and came up empty.`;
  const scene: PendingChoice = {
    id: `raid-${raid.targetStashId}-${state.clock.hours}`,
    kind: 'raid',
    summary,
    createdAtHours: state.clock.hours,
  };
  return { ...result.state, pendingChoices: [...result.state.pendingChoices, scene] };
}
