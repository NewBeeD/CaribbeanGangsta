/**
 * Street teams — the crack corner economy (design/12 Item 5d; Prompt 34).
 *
 * Cooking crack (`conversions.ts`, a `toStreet` recipe) hands the rocks to the
 * CREW instead of stacking them in a stash. They then sell through on the
 * corners over ONLINE time, dripping the booked value back as DIRTY cash into
 * the home stash — the same accrual shape as laundering (`laundering.accrue` is
 * the template), but paying dirty (corner money is untaxed and located). Corners
 * are loud, so each rock sold adds a little heat.
 *
 * The crew is the whole limiter (design/12 Item 5b — no artificial cooldown):
 * sell-through scales with `crew.length`, and the queue is capped per member, so
 * with no crew a cook can't be booked at all. Purity/determinism
 * (prompts/README.md): no randomness, no wall clock — the drip is a pure
 * function of `dtHours`. Registered ACTIVE-only in `clock.ts`, so the hustle
 * freezes while the player is away (GDD §6): absence never earns, never heats.
 */

import { addHeat, homeCountryId } from './heat';
import { emptyStreetStock, type GameState, type StreetStock } from './state';
import type { TickMode } from './clock';

/** The most rocks the crew can hold in the sell queue right now (crew-scaled). */
export function streetQueueCap(state: GameState): number {
  return state.config.street.STREET_QUEUE_PER_CREW * state.crew.length;
}

/** Room left in the sell queue for freshly-cooked rocks (never negative). */
export function streetQueueRoom(state: GameState): number {
  return Math.max(0, streetQueueCap(state) - state.streetStock.units);
}

/** Rocks the crew moves per ACTIVE in-game day at the current crew size. */
export function streetSalePerDay(state: GameState): number {
  return state.config.street.STREET_SALE_PER_CREW_PER_DAY * state.crew.length;
}

/** Projected dirty cash the corners bring in per active day at the booked price. */
export function streetRevenuePerDay(state: GameState): number {
  return Math.min(state.streetStock.units, streetSalePerDay(state)) *
    state.streetStock.bookedUnitPrice;
}

/**
 * Book `units` of freshly-cooked rock into the street queue at `unitPrice` (the
 * LOCAL crack price at cook time). The booked price is a units-weighted average
 * across cooks, so a later batch at a different price blends in fairly. Pure —
 * the caller (`convert`) has already clamped `units` to `streetQueueRoom`.
 */
export function bookStreetStock(
  state: GameState,
  units: number,
  unitPrice: number,
): GameState {
  if (units <= 0) return state;
  const prev = state.streetStock;
  const total = prev.units + units;
  const bookedUnitPrice =
    total > 0 ? (prev.units * prev.bookedUnitPrice + units * unitPrice) / total : 0;
  return { ...state, streetStock: { units: total, bookedUnitPrice } };
}

/** Add dirty corner proceeds to the home stash (where the crew brings the money). */
function depositToHome(state: GameState, amount: number): GameState {
  const home = state.stashes[0];
  if (!home || amount <= 0) return state;
  const next = { ...home, dirtyCash: home.dirtyCash + amount };
  return { ...state, stashes: state.stashes.map((s) => (s.id === home.id ? next : s)) };
}

/**
 * Advance the corner sell-through by `dtHours` of ONLINE time (design/12 Item
 * 5d): move up to `streetSalePerDay × days` rocks, drip their booked value into
 * the home stash as dirty cash, and add the corner heat. Deterministic; a run
 * with no rocks (or no crew) is a no-op. Registered as the ACTIVE-only
 * `street-sales` tick step — frozen offline, so absence is safe (GDD §6).
 */
export function streetStep(state: GameState, dtHours: number, mode: TickMode): GameState {
  if (mode !== 'active' || dtHours <= 0) return state;
  const { units, bookedUnitPrice } = state.streetStock;
  if (units <= 0) return state;

  const sold = Math.min(units, streetSalePerDay(state) * (dtHours / 24));
  if (sold <= 0) return state;

  const remaining = units - sold;
  const nextStreet: StreetStock =
    remaining > 0 ? { units: remaining, bookedUnitPrice } : emptyStreetStock();

  let next: GameState = { ...state, streetStock: nextStreet };
  next = depositToHome(next, sold * bookedUnitPrice);
  const heat = sold * state.config.street.STREET_HEAT_PER_UNIT;
  // Corners work the HOME turf — the drip lands there, and so does the noise.
  return heat > 0 ? addHeat(next, heat, 'street.sale', homeCountryId(state)) : next;
}
