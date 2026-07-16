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
  STASH_TYPES,
  STASH_CAPACITY_GROWTH,
  getStashType,
  smallestLevelForCapacity,
  stashLevelCapacity,
  stashUpgradeCost,
  type StashType,
  type StashTypeConfig,
} from './config/stashes';
import { addHeat, rollRaid, type RaidEvent } from './heat';
import { countryName, crewGateBlocksOpen, footholdCost, isHeldCountry } from './territory';
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

/** A stash's current upgrade level (design/13 G; Prompt 49). Absent reads as 1. */
export function stashLevel(stash: Stash): number {
  return stash.level ?? 1;
}

/**
 * The BASE unit capacity of a stash, from its archetype scaled by its upgrade LEVEL
 * (config/stashes.ts `stashLevelCapacity` — design/13 G; Prompt 49) — before the
 * crew-carry bonus. Level 1 is the archetype base; each level multiplies it by
 * `STASH_CAPACITY_GROWTH`. Prefer `effectiveCapacity` for any real limit.
 */
export function stashCapacity(
  stash: Stash,
  types: readonly StashTypeConfig[] = STASH_TYPES,
  growth: number = STASH_CAPACITY_GROWTH,
): number {
  return stashLevelCapacity(getStashType(stash.type, types).capacity, stashLevel(stash), growth);
}

/**
 * A stash's EFFECTIVE unit capacity (design/12 Item 4 — crew-scaled carry): the
 * archetype base plus `CREW_CARRY_PER_MEMBER × crew.length`. THE single capacity
 * rule — buys (`deals.ts`), cooks (`conversions.ts`), same-country moves (this
 * module), and shipment arrivals (`travel.ts`) all route through it, so effective
 * capacity means one thing everywhere. With recruiting unbounded (open access),
 * capacity is unbounded too — "no hard max" without deleting the storage system
 * or its raid-seizure stakes.
 */
export function effectiveCapacity(state: GameState, stash: Stash): number {
  const tuning = state.config.stashes;
  return (
    stashCapacity(stash, tuning.STASH_TYPES, tuning.STASH_CAPACITY_GROWTH) +
    tuning.CREW_CARRY_PER_MEMBER * state.crew.length
  );
}

/** Free EFFECTIVE unit capacity left in a stash (never negative) — the crew-scaled
 * headroom the deal/convert/move/ship checks all clamp to. */
export function effectiveCapacityRemaining(state: GameState, stash: Stash): number {
  return Math.max(0, effectiveCapacity(state, stash) - stashUnits(stash));
}

/** Free BASE capacity left in a stash (never negative) — archetype only, no crew. */
export function capacityRemaining(
  stash: Stash,
  types: readonly StashTypeConfig[] = STASH_TYPES,
): number {
  return Math.max(0, stashCapacity(stash, types) - stashUnits(stash));
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
  const tuning = state.config.stashes;
  const cfg = getStashType(stash.type, tuning.STASH_TYPES);
  const needsGuard = cfg.requiresGuard || stash.dirtyCash >= tuning.GUARD_CASH_THRESHOLD;

  if (stash.guardCrewId !== undefined) {
    const guard = state.crew.find((c) => c.id === stash.guardCrewId);
    const loyalty = guard ? clamp(guard.loyalty / 100, 0, 1) : 0;
    return (1 - loyalty) * tuning.GUARD_MAX_PENALTY;
  }
  return needsGuard ? tuning.GUARD_UNGUARDED_PENALTY : 0;
}

/**
 * Whether this stash's port is paid (design/09 A.3 — a paid port drops a
 * container's seizure to ~3%). The corruption network (Prompt 09) records paid
 * ports on `state.corruption.paidPorts`, keyed by the port's `countryId`; a one-off
 * bribe carries an expiry (`paidUntilHours`), while a standing customs chief has
 * none. Read directly off state so storage stays decoupled from `corruption.ts`.
 */
function isPortPaid(state: GameState, stash: Stash): boolean {
  return state.corruption.paidPorts.some(
    (p) =>
      p.portId === stash.countryId &&
      (p.paidUntilHours === undefined || p.paidUntilHours > state.clock.hours),
  );
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
  const cfg = getStashType(stash.type, state.config.stashes.STASH_TYPES);

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
  | 'insufficient-funds'
  /**
   * A spot already holds a stash of this type — build the FIRST of a type per
   * (country, spot), then UPGRADE it for space (design/13 G; Prompt 49). Opening a
   * NEW country/port is unchanged (money only).
   */
  | 'already-present'
  /** `upgradeStash` on a stash already at `STASH_MAX_LEVEL` (design/13 G; Prompt 49). */
  | 'max-level'
  /** Cross-country product moves route through shipments (travel.ts, Prompt 30). */
  | 'cross-country'
  /**
   * Opening a NEW country past the free reach tier needs a lieutenant to run it
   * (Ideas2 item 5 crew gate; territory.ts). The one rejection that is NOT a money
   * gate — territory alone relaxes open access (user sign-off).
   */
  | 'needs-lieutenant';

/** Result of building a stash: the new state + the created stash, or a rejection. */
export interface AddStashResult {
  readonly state: GameState;
  readonly stash: Stash | null;
  readonly rejected?: StorageRejectReason;
}

/**
 * Build a new stash of `type` in `countryId` — the FIRST stash of that type at that
 * spot, paid from CLEAN cash (storage is a clean-cash sink — design/09 Integration/
 * Economy). A spot holds exactly ONE stash of a type (design/13 G; Prompt 49): a
 * second build of a type already present in the country rejects `already-present`
 * WITHOUT mutating — you UPGRADE the one you have (`upgradeStash`) for more space,
 * you don't stack another. Cost comes from `footholdCost` (territory.ts): the FIRST
 * spot of a type in a country already held (or home) pays the plain `base × 1.15^n`
 * open step; OPENING a NEW country pays the reach-and-region surcharge (Ideas2 item
 * 5; Prompt 41). Rejects without mutating on insufficient funds — or, when opening
 * past the free reach tier with no lieutenant to run it, on the crew gate
 * (`needs-lieutenant`). New stashes start empty at level 1.
 *
 * Opening a new country also (a) stamps `openedAtHours` so the foothold reads as
 * EXPOSED (raid-risk window) and CONTESTED (consolidation hold) — territory.ts;
 * (b) adds a one-time takeover HEAT bump; and (c) queues a telegraphed "new
 * territory is exposed" return-hook. Reinforcing/home builds do none of that
 * (storage-screen behavior is unchanged).
 */
export function addStash(
  state: GameState,
  type: StashType,
  opts: { readonly name?: string; readonly countryId?: string } = {},
): AddStashResult {
  const cfg = getStashType(type, state.config.stashes.STASH_TYPES);
  const nOwned = state.stashes.filter((s) => s.type === type).length;
  const target = opts.countryId ?? state.world.startingCountry.id;
  const opening = !isHeldCountry(state, target);

  // One stash per (country, type) spot (design/13 G; Prompt 49) — a second build of
  // a type already here rejects; upgrade the existing one for space instead.
  if (state.stashes.some((s) => s.countryId === target && s.type === type)) {
    return { state, stash: null, rejected: 'already-present' };
  }

  // The crew gate is the one non-money rejection (territory relaxes open access).
  if (opening && crewGateBlocksOpen(state, target)) {
    return { state, stash: null, rejected: 'needs-lieutenant' };
  }

  const cost = footholdCost(state, type, target);
  if (state.cleanCash < cost) {
    return { state, stash: null, rejected: 'insufficient-funds' };
  }

  const stash: Stash = {
    id: `stash-${type}-${nOwned + 1}`,
    name: opts.name ?? cfg.name,
    countryId: target,
    type,
    level: 1,
    dirtyCash: 0,
    inventory: emptyInventory(),
    // A fresh foothold is dated so it reads as exposed + contested; reinforcing an
    // already-held country leaves it established (undefined).
    ...(opening ? { openedAtHours: state.clock.hours } : {}),
  };
  let next: GameState = {
    ...state,
    cleanCash: state.cleanCash - cost,
    stashes: [...state.stashes, stash],
  };

  if (opening) {
    // Expansion draws attention (one-time heat) and telegraphs the exposure.
    next = addHeat(next, state.config.territory.TERRITORY_TAKEOVER_HEAT, 'territory-open');
    const exposed: PendingChoice = {
      id: `territory-exposed-${stash.id}-${state.clock.hours}`,
      kind: 'territory-exposed',
      summary: `Word's out you moved into ${countryName(target)} — fresh turf runs hot until you lock it down.`,
      createdAtHours: state.clock.hours,
    };
    next = { ...next, pendingChoices: [...next.pendingChoices, exposed] };
  }

  return { state: next, stash };
}

// --- Upgrade a stash for space (design/13 G; Prompt 49) ----------------------

/** The cost, $, of the NEXT upgrade for `stash` (its live price), or `null` if maxed. */
export function nextUpgradeCost(state: GameState, stash: Stash): number | null {
  if (stashLevel(stash) >= state.config.stashes.STASH_MAX_LEVEL) return null;
  return stashUpgradeCost(stash.type, stashLevel(stash), state.config.stashes);
}

/**
 * Raise a stash by one LEVEL, paid from CLEAN cash at `base × 1.15^level` (design/13
 * G; Prompt 49 — `stashUpgradeCost`). This is depth in ground you already hold: it
 * lifts `effectiveCapacity` up the `STASH_CAPACITY_GROWTH` curve (the crew-carry
 * bonus still stacks on top), and is the ONLY way to grow a spot now that stacking a
 * second stash is gone. Money is the only gate (open access) — the price is always
 * shown and always actionable the moment it's affordable. Rejects WITHOUT mutating
 * on an unknown stash, a stash already at `STASH_MAX_LEVEL`, or insufficient funds.
 */
export function upgradeStash(state: GameState, stashId: string): AddStashResult {
  const stash = findStash(state, stashId);
  if (!stash) return { state, stash: null, rejected: 'no-stash' };
  if (stashLevel(stash) >= state.config.stashes.STASH_MAX_LEVEL) {
    return { state, stash, rejected: 'max-level' };
  }
  const cost = stashUpgradeCost(stash.type, stashLevel(stash), state.config.stashes);
  if (state.cleanCash < cost) return { state, stash, rejected: 'insufficient-funds' };

  const upgraded: Stash = { ...stash, level: stashLevel(stash) + 1 };
  return {
    state: withStash({ ...state, cleanCash: state.cleanCash - cost }, upgraded),
    stash: upgraded,
  };
}

// --- Migration fold: one stash per spot (design/13 G; Prompt 49) -------------

/** The stash-carry bonus per crew member for the run (config), read once for the fold. */
function crewCarryTotal(state: GameState): number {
  return state.config.stashes.CREW_CARRY_PER_MEMBER * state.crew.length;
}

/**
 * Fold every (country, type) SPOT down to a SINGLE stash (design/13 G; Prompt 49 —
 * the v18→v19 migration's heart, kept in the engine so it's pure and property-
 * testable). Where a legacy save stacked multiple stashes on one spot, the survivor
 * is the first in roster order (so `stash-home` stays home and first), and:
 *
 *  - inventories are merged unit-for-unit and dirty cash dollar-for-dollar (nothing
 *    seized);
 *  - the survivor's LEVEL is rounded UP to the smallest level whose capacity holds
 *    at least the folded stashes' COMBINED `effectiveCapacity` — so total capacity
 *    never shrinks (a fold can push level past `STASH_MAX_LEVEL`; that's fine —
 *    `upgradeStash` won't, but the fold must never take space away);
 *  - a guard carries over (the survivor's, else any folded member's);
 *  - `openedAtHours` reads as the most-consolidated of the group (established wins,
 *    else the oldest stamp — always in the player's favor: least exposed);
 *  - production destinations, guard assignments, and debt collateral pointing at a
 *    folded-away id are re-pointed to the survivor.
 *
 * Idempotent: a save that already holds one stash per spot folds to itself (each
 * group has one member, so nothing merges and no id changes).
 */
export function foldStashesOnePerSpot(state: GameState): GameState {
  const growth = state.config.stashes.STASH_CAPACITY_GROWTH;
  const carry = crewCarryTotal(state);

  // Group by spot, preserving first-seen order (keeps stash-home first).
  const order: string[] = [];
  const groups = new Map<string, Stash[]>();
  for (const s of state.stashes) {
    const key = `${s.countryId}::${s.type}`;
    const group = groups.get(key);
    if (group) {
      group.push(s);
    } else {
      order.push(key);
      groups.set(key, [s]);
    }
  }

  // No spot has more than one stash — nothing to fold (fast idempotent path).
  if (order.every((k) => groups.get(k)!.length === 1)) return state;

  const idRemap = new Map<string, string>();
  const folded: Stash[] = order.map((key) => {
    const group = groups.get(key)!;
    const survivor = group[0]!;
    for (const s of group) idRemap.set(s.id, survivor.id);
    if (group.length === 1) return survivor;

    // Merge inventories + dirty cash; sum the combined effective capacity so the
    // survivor's new level holds at least what the whole group did.
    const inventory: Record<ProductId, number> = { ...emptyInventory() };
    let dirtyCash = 0;
    let combinedCapacity = 0;
    let guardCrewId: string | undefined;
    let openedAtHours: number | undefined = Infinity;
    let anyEstablished = false;
    for (const s of group) {
      for (const id of PRODUCT_IDS) inventory[id] += s.inventory[id];
      dirtyCash += s.dirtyCash;
      combinedCapacity += effectiveCapacity(state, s);
      if (guardCrewId === undefined && s.guardCrewId !== undefined) guardCrewId = s.guardCrewId;
      if (s.openedAtHours === undefined) anyEstablished = true;
      else openedAtHours = Math.min(openedAtHours, s.openedAtHours);
    }

    const base = getStashType(survivor.type, state.config.stashes.STASH_TYPES).capacity;
    // Target the survivor's BASE level-capacity (the level curve excludes crew carry,
    // which the survivor still gets once): combined effective − the one carry it keeps.
    const level = smallestLevelForCapacity(base, Math.max(0, combinedCapacity - carry), growth);
    // Established (undefined) wins outright — least exposed; else the oldest stamp.
    const finalOpened =
      anyEstablished || openedAtHours === Infinity ? undefined : openedAtHours;

    // Strip the survivor's optionals, then re-add each only when it stays defined
    // (exactOptionalPropertyTypes-safe — never assign `undefined`).
    const { openedAtHours: _o, guardCrewId: _g, ...rest } = survivor;
    return {
      ...rest,
      level,
      dirtyCash,
      inventory,
      ...(guardCrewId !== undefined ? { guardCrewId } : {}),
      ...(finalOpened !== undefined ? { openedAtHours: finalOpened } : {}),
    };
  });

  // Re-point any reference to a folded-away id onto its survivor.
  const remap = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : (idRemap.get(id) ?? id);

  const productionOps = state.productionOps.map((op) =>
    op.stashId && remap(op.stashId) !== op.stashId
      ? { ...op, stashId: remap(op.stashId)! }
      : op,
  );
  const crew = state.crew.map((c) =>
    c.assignment.kind === 'guard' && c.assignment.targetId && remap(c.assignment.targetId) !== c.assignment.targetId
      ? { ...c, assignment: { ...c.assignment, targetId: remap(c.assignment.targetId)! } }
      : c,
  );
  const debt =
    state.debt.collateralRef && remap(state.debt.collateralRef) !== state.debt.collateralRef
      ? { ...state.debt, collateralRef: remap(state.debt.collateralRef)! }
      : state.debt;

  return { ...state, stashes: folded, productionOps, crew, debt };
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

function travelDelayBetween(
  from: Stash,
  to: Stash,
  types: readonly StashTypeConfig[],
): number {
  return Math.max(
    getStashType(from.type, types).travelDelayHours,
    getStashType(to.type, types).travelDelayHours,
  );
}

/**
 * Move `qty` of `product` from one stash to another WITHIN the same country —
 * instant and free. Cross-country moves are a priced, risky shipment
 * (travel.ts, design/11 §3) and reject here with `cross-country`. Enforces the
 * destination's capacity (rejects `insufficient-capacity`) and reports the
 * incurred access-speed travel delay (design/09 A.3). Rejects without mutating
 * on bad qty, unknown stash, a same-stash move, or insufficient held inventory.
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
  if (from.countryId !== to.countryId) return rejectMove(state, 'cross-country');
  if (from.inventory[product] < qty) return rejectMove(state, 'insufficient-inventory');
  const types = state.config.stashes.STASH_TYPES;
  // Effective (crew-scaled) capacity bounds the destination (design/12 Item 4).
  if (stashUnits(to) + qty > effectiveCapacity(state, to)) {
    return rejectMove(state, 'insufficient-capacity');
  }

  const nextFrom: Stash = { ...from, inventory: adjustInventory(from.inventory, product, -qty) };
  const nextTo: Stash = { ...to, inventory: adjustInventory(to.inventory, product, qty) };
  return {
    state: withStash(withStash(state, nextFrom), nextTo),
    ok: true,
    travelDelayHours: travelDelayBetween(from, to, types),
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
    travelDelayHours: travelDelayBetween(from, to, state.config.stashes.STASH_TYPES),
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
  const wipedOperatingCapital =
    operatingCapitalAfter <= state.config.stashes.WIPE_CAPITAL_THRESHOLD;
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

  let result = resolveRaid(state, raid, rng);
  if (!result.seized) {
    // Surviving a raid is a flashy, one-time heat bump (design/13 B5.4): they
    // came, they missed, and now they're sore — the scene below discloses it.
    result = {
      ...result,
      state: addHeat(result.state, state.config.heat.RAID_SURVIVED_HEAT, 'raid.survived'),
    };
  }
  const stash = findStash(state, raid.targetStashId);
  const where = stash?.name ?? 'a stash';
  // The loss carries its numbers (design/13 A6): seized dirty cash never reads
  // as money silently vanishing.
  const taken = [
    result.dirtyCashLost > 0
      ? `$${Math.round(result.dirtyCashLost).toLocaleString('en-US')} dirty`
      : '',
    result.productUnitsLost > 0
      ? `${Math.floor(result.productUnitsLost)} units`
      : '',
  ]
    .filter(Boolean)
    .join(' and ');
  const summary = result.seized
    ? `They raided ${where} and took what was there${taken ? ` — ${taken} seized` : ''}.`
    : `Law enforcement hit ${where} — and came up empty. Word travels; the block is hotter for it.`;
  const scene: PendingChoice = {
    id: `raid-${raid.targetStashId}-${state.clock.hours}`,
    kind: 'raid',
    summary,
    createdAtHours: state.clock.hours,
  };
  return { ...result.state, pendingChoices: [...result.state.pendingChoices, scene] };
}
