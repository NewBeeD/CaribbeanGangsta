/**
 * The production engine (Ideas2 item 3; Prompt 39) — grow-ops and drug factories
 * that turn ACTIVE time into PRODUCT UNITS, the "become a supplier" layer.
 *
 * This is the laundering idle spine mirrored for product: where `accrue` mints
 * clean cash into `cleanCash`, `productionStep` deposits product units into the
 * home stash — bounded by the SAME `effectiveCapacity` rule every other producer
 * uses (deals/cooks/moves/arrivals — storage.ts), so overflow is simply not
 * produced and never spoils an existing holding. It is registered ACTIVE-only in
 * `clock.ts` (`production-yield`, after `laundering-accrual`): the offline path
 * deposits NOTHING, so absence forgoes yield but never seizes it (GDD §6).
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in →
 * new state out, no `Math.random`, no wall clock. There is no randomness anywhere
 * in this module — yield is a deterministic function of `dtHours`, level, and any
 * assigned-lieutenant bonus (the exact `LIEUTENANT_FRONT_BONUS` the front
 * delegation uses — `crew.ts`), so the units/hr the screen shows is the number
 * deposited.
 */

import { addHeat, homeCountryId } from './heat';
import { effectiveCapacity, stashUnits } from './storage';
import { productionLieutenantBonus } from './crew';
import {
  getProductionOp,
  productionUpgradeCost,
  type ProductionOpId,
} from './config/production';
import type { TickMode } from './clock';
import type { GameState, Inventory, ProductionOp, Stash } from './state';

export type { ProductionOpId } from './config/production';

// --- Yield rate ---------------------------------------------------------------

/**
 * The product units per real hour a single op produces right now
 * (`unitsPerHourPerLevel × level`), lifted by any assigned-lieutenant delegation
 * bonus (design/02 §5). With no lieutenant on the op the bonus is 0, so a
 * crew-less run's yields are unchanged. This is the number the Production screen
 * shows and the yield tick deposits (fairness: shown = produced).
 */
export function productionYieldRate(state: GameState, op: ProductionOp): number {
  const cfg = getProductionOp(op.type as ProductionOpId, state.config.production.PRODUCTION_OPS);
  const base = cfg.unitsPerHourPerLevel * op.level;
  return base * (1 + productionLieutenantBonus(state, op.id));
}

// --- Active yield (the `production-yield` tick step) --------------------------

/**
 * The stash an op deposits into (design/13 C; Prompt 45). Its assigned `stashId`
 * when that stash still exists, else the home stash `stashes[0]` — the default and
 * every legacy op's behavior. Returns `null` only when there is no home stash at
 * all (a run with no stashes), so callers can short-circuit.
 */
function opDestination(state: GameState, op: ProductionOp): Stash | null {
  const home = state.stashes[0] ?? null;
  if (op.stashId) {
    const assigned = state.stashes.find((s) => s.id === op.stashId);
    if (assigned) return assigned;
  }
  return home;
}

/**
 * Deposit each op's yield into its DESTINATION stash over `dtHours` of ONLINE time
 * and apply its passive heat footprint. The destination is the op's assigned
 * `stashId` (default: the home stash — design/13 C); ops sharing a destination
 * share one capacity budget, so a full stash idles all of them in turn. Product
 * units are INTEGERS everywhere (design/13 A1): each op accrues fractional yield
 * into its own `pendingYield` accumulator and deposits only `Math.floor` WHOLE
 * units — the sub-unit remainder carries to the next tick, so total yield over
 * time equals the shown rate while nothing fractional ever lands in an inventory.
 * Deposits are bounded by `effectiveCapacity`: once the stash is full, overflow is
 * NOT produced (never past the cap, never a spoil; blocked whole units don't bank
 * into the accumulator either — a full destination idles the op). A PAUSED op is a
 * cold lab — it yields nothing and adds no heat (design/13 C). Heat otherwise
 * accrues in proportion to what was actually produced/accrued — an idled op emits
 * no wasted heat, which nudges the player to expand or sell rather than punishing a
 * full stash. Adds only; a run with no ops (or no home stash) is a no-op. Registered
 * active-only in `clock.ts`, so the offline path deposits nothing (frozen — GDD §6).
 */
export function productionStep(state: GameState, dtHours: number, mode: TickMode): GameState {
  if (mode !== 'active' || dtHours <= 0 || state.productionOps.length === 0) return state;
  if (!state.stashes[0]) return state;

  // Per-destination running budgets so ops targeting the same stash share one
  // capacity (and a full stash idles them all). Seeded lazily off live state.
  const budgets = new Map<string, { inventory: Inventory; units: number; cap: number }>();
  const budgetFor = (stash: Stash) => {
    let b = budgets.get(stash.id);
    if (!b) {
      b = { inventory: stash.inventory, units: stashUnits(stash), cap: effectiveCapacity(state, stash) };
      budgets.set(stash.id, b);
    }
    return b;
  };
  let heat = 0;

  const ops = state.productionOps.map((op) => {
    if (op.paused) return op; // cold lab — no yield, no heat
    const cfg = getProductionOp(op.type as ProductionOpId, state.config.production.PRODUCTION_OPS);
    const produced = productionYieldRate(state, op) * dtHours;
    if (produced <= 0) return op;
    const dest = opDestination(state, op);
    if (!dest) return op;
    const budget = budgetFor(dest);
    const carried = op.pendingYield ?? 0;
    const accrued = carried + produced;
    const whole = Math.floor(accrued);
    const room = Math.max(0, Math.floor(budget.cap - budget.units));
    const put = Math.min(whole, room);
    if (put > 0) {
      budget.inventory = { ...budget.inventory, [cfg.product]: budget.inventory[cfg.product] + put };
      budget.units += put;
    }
    // The sub-unit remainder carries (always < 1); whole units blocked by a full
    // stash are simply not produced (as before — never past the cap, never a
    // spoil) — but the carry never drops below what was already accrued in.
    const pendingYield = Math.min(accrued - put, Math.max(carried, accrued - whole));
    // Heat tracks what actually banked (deposited units + carried fraction) — a
    // capacity-idled op emits no wasted heat.
    const credited = put + (pendingYield - carried);
    if (credited > 0) heat += cfg.heatPerHour * dtHours * (credited / produced);
    return pendingYield === carried && put === 0 ? op : { ...op, pendingYield };
  });

  let next: GameState = { ...state, productionOps: ops };
  if (budgets.size > 0) {
    next = {
      ...next,
      stashes: next.stashes.map((s) => {
        const b = budgets.get(s.id);
        return b && b.inventory !== s.inventory ? { ...s, inventory: b.inventory } : s;
      }),
    };
  }
  // Ops yield into the home stash — the lab's hum is HOME-country noise.
  return heat > 0 ? addHeat(next, heat, 'production.op', homeCountryId(state)) : next;
}

// --- Op operations ------------------------------------------------------------

export type ProductionRejectReason =
  | 'already-owned'
  | 'insufficient-funds'
  | 'no-op'
  | 'max-level';

/** Result of buying/upgrading an op: the new state + the op, or a rejection. */
export interface ProductionResult {
  readonly state: GameState;
  readonly op: ProductionOp | null;
  readonly rejected?: ProductionRejectReason;
}

/**
 * Buy the Level-1 op of `id`, paid from CLEAN cash (production is a clean-cash
 * sink). SINGLE-BUY (like the fixed front roster — Ideas2 item 1): each op is
 * buyable exactly once, then upgrade-only — a second buy of an owned op rejects
 * with `already-owned` **without mutating**. The id is the stable `prod-${id}`
 * (one per op), so there is never a duplicate to disambiguate. Also rejects
 * without mutating on insufficient funds. Money is the only gate (open access).
 */
export function buyProductionOp(state: GameState, id: ProductionOpId): ProductionResult {
  const existing = state.productionOps.find((o) => o.type === id) ?? null;
  if (existing) return { state, op: existing, rejected: 'already-owned' };

  const cfg = getProductionOp(id, state.config.production.PRODUCTION_OPS);
  if (state.cleanCash < cfg.buyIn) {
    return { state, op: null, rejected: 'insufficient-funds' };
  }
  const op: ProductionOp = { id: `prod-${id}`, type: id, level: 1 };
  return {
    state: {
      ...state,
      cleanCash: state.cleanCash - cfg.buyIn,
      productionOps: [...state.productionOps, op],
    },
    op,
  };
}

/**
 * Upgrade the op `opId` by one level, paid from CLEAN cash at `buy_in × 1.15^level`
 * (design/01 §3). Rejects without mutating on an unknown op, a maxed level, or
 * insufficient funds.
 */
export function upgradeProductionOp(state: GameState, opId: string): ProductionResult {
  const op = state.productionOps.find((o) => o.id === opId) ?? null;
  if (!op) return { state, op: null, rejected: 'no-op' };
  if (op.level >= state.config.production.PRODUCTION_MAX_LEVEL) {
    return { state, op, rejected: 'max-level' };
  }
  const cost = productionUpgradeCost(op.type as ProductionOpId, op.level, state.config.production);
  if (state.cleanCash < cost) return { state, op, rejected: 'insufficient-funds' };

  const upgraded: ProductionOp = { ...op, level: op.level + 1 };
  return {
    state: {
      ...state,
      cleanCash: state.cleanCash - cost,
      productionOps: state.productionOps.map((o) => (o.id === opId ? upgraded : o)),
    },
    op: upgraded,
  };
}

// --- Pause & destination (design/13 C; Prompt 45) -----------------------------

/**
 * Pause or resume op `opId` (design/13 C). A paused op is a cold lab: it yields
 * nothing and emits no heat (`productionStep` skips it), and pausing never touches
 * the `pendingYield` carry, so resuming picks up at the same accumulator — pause is
 * free and instant both ways, never a trap or a fee (ethical guardrail). No-op
 * (returns the same state) on an unknown op or a redundant set.
 */
export function setProductionPaused(state: GameState, opId: string, paused: boolean): GameState {
  const op = state.productionOps.find((o) => o.id === opId);
  if (!op || (op.paused ?? false) === paused) return state;
  return {
    ...state,
    productionOps: state.productionOps.map((o) => (o.id === opId ? { ...o, paused } : o)),
  };
}

/**
 * Assign op `opId`'s yield to destination stash `stashId` (design/13 C). Production
 * is PHYSICAL: the destination must be a stash in the op's own country (its current
 * destination's country, home by default), so yield can never teleport across
 * borders — a cross-country target is REJECTED without mutating. Selecting the home
 * stash clears the assignment (stored as absent), so an op deposited to home reads
 * identically to a legacy/unassigned op. No-op on an unknown op or stash.
 */
export function setProductionStash(state: GameState, opId: string, stashId: string): GameState {
  const op = state.productionOps.find((o) => o.id === opId);
  if (!op) return state;
  const target = state.stashes.find((s) => s.id === stashId);
  const current = opDestination(state, op);
  if (!target || !current) return state;
  // No teleporting yield — same country as where the op already deposits.
  if (target.countryId !== current.countryId) return state;
  const home = state.stashes[0];
  const nextStashId = home && target.id === home.id ? undefined : target.id;
  if ((op.stashId ?? undefined) === nextStashId) return state;
  return {
    ...state,
    productionOps: state.productionOps.map((o) =>
      o.id === opId ? { ...withoutStashId(o), ...(nextStashId ? { stashId: nextStashId } : {}) } : o,
    ),
  };
}

/** Strip `stashId` so an op reassigned to home carries no dangling destination. */
function withoutStashId(op: ProductionOp): ProductionOp {
  if (op.stashId === undefined) return op;
  const { stashId: _drop, ...rest } = op;
  return rest;
}
