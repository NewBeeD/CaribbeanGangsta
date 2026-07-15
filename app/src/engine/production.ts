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

import { addHeat } from './heat';
import { effectiveCapacity, stashUnits } from './storage';
import { productionLieutenantBonus } from './crew';
import {
  getProductionOp,
  productionUpgradeCost,
  type ProductionOpId,
} from './config/production';
import type { TickMode } from './clock';
import type { GameState, ProductionOp, Stash } from './state';

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
 * Deposit each op's yield into the home stash over `dtHours` of ONLINE time and
 * apply its passive heat footprint. Product units are INTEGERS everywhere
 * (design/13 A1): each op accrues fractional yield into its own `pendingYield`
 * accumulator and deposits only `Math.floor` WHOLE units — the sub-unit remainder
 * carries to the next tick, so total yield over time equals the shown rate while
 * nothing fractional ever lands in an inventory. Deposits are bounded by
 * `effectiveCapacity`: once the stash is full, overflow is NOT produced (never
 * past the cap, never a spoil; blocked whole units don't bank into the
 * accumulator either — a full destination idles the op). Heat accrues in
 * proportion to what was actually produced/accrued — an idled op emits no wasted
 * heat, which nudges the player to expand or sell rather than punishing a full
 * stash. Adds only; a run with no ops (or no home stash) is a no-op. Registered
 * active-only in `clock.ts`, so the offline path deposits nothing (frozen — GDD §6).
 */
export function productionStep(state: GameState, dtHours: number, mode: TickMode): GameState {
  if (mode !== 'active' || dtHours <= 0 || state.productionOps.length === 0) return state;
  const home = state.stashes[0];
  if (!home) return state;

  const cap = effectiveCapacity(state, home);
  let units = stashUnits(home);
  let inventory = home.inventory;
  let deposited = false;
  let heat = 0;

  const ops = state.productionOps.map((op) => {
    const cfg = getProductionOp(op.type as ProductionOpId, state.config.production.PRODUCTION_OPS);
    const produced = productionYieldRate(state, op) * dtHours;
    if (produced <= 0) return op;
    const carried = op.pendingYield ?? 0;
    const accrued = carried + produced;
    const whole = Math.floor(accrued);
    const room = Math.max(0, Math.floor(cap - units));
    const put = Math.min(whole, room);
    if (put > 0) {
      inventory = { ...inventory, [cfg.product]: inventory[cfg.product] + put };
      units += put;
      deposited = true;
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
  if (deposited) {
    const nextHome: Stash = { ...home, inventory };
    next = { ...next, stashes: next.stashes.map((s) => (s.id === home.id ? nextHome : s)) };
  }
  return heat > 0 ? addHeat(next, heat, 'production.op') : next;
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
