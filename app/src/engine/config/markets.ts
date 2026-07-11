/**
 * Market stock tuning — finite supply per market (design/12 Item 10; Prompt 32).
 *
 * Every `markets[countryId][productId]` carries a STOCK POOL: units available
 * on the street. Buys deplete it (a buy past it rejects `no-supply` — shown on
 * the board as "~N on the street", never a hidden cap); player sells put a
 * fraction back (goods re-enter the market); active play restocks it (the same
 * ACTIVE-only cadence as price drift — the world stays frozen offline, GDD §6);
 * and a drained pool nudges the price drift UP (scarcity pricing — one
 * multiplier of emergent juice).
 *
 * All v1 tuning HYPOTHESES held as config (prompts/README.md "Config, not
 * literals"); the live numbers are read from `state.config.markets`.
 */

import type { Band } from './countries';

/**
 * Per-run stock seed band, units. A market's pool spawns at a draw from this
 * band × the country's demand-bias midpoint (big sinks run deep books), and its
 * restock CEILING is the band max under the same scaling. Sized against stash
 * archetypes (50/200/800/3000): a street market can fill a safehouse run but
 * not a warehouse in one sitting.
 */
export const STOCK_SEED_BAND: Band = { min: 100, max: 250 };

/**
 * A TRUE SOURCE (`plugFor` includes the product) multiplies its pool by this —
 * a source IS a deep book; that's what the plug intro buys access to.
 */
export const PLUG_STOCK_MULTIPLIER = 8;

/** Units a market recovers per ACTIVE in-game day, up to its ceiling. */
export const RESTOCK_PER_DAY = 30;

/** Fraction of player-sold units that re-enter the market's pool. */
export const SELL_RESTOCK_FRACTION = 0.5;

/**
 * Scarcity pricing: the price-drift walk gains an upward bias of up to this
 * much per in-game day when the pool is empty (scaled linearly by how drained
 * it is). Deliberately a DRIFT bias, not an instant repricing — buying can
 * never pump the number you immediately sell back at (the one-price wash law,
 * design/12 Item 3) — and the walk stays clamped inside `1 ± volatility`.
 */
export const SCARCITY_PRICE_WEIGHT = 0.15;
