/**
 * Laundering-front table — the idle engine's tuning (design/01 §3 & §3a; GDD
 * §4.2, §6). Fronts turn time-away into **clean cash**: each generates
 * `ratePerLevel × level` clean $/hr, and the offline payoff rewards return with
 * *decisions to allocate*, never with loss.
 *
 * These are v1 balance HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"; Prompt 26 centralizes). Every rate,
 * buy-in, and haircut here is **shown in-game** (estimable-but-fair, design/01
 * §0.3): the number the Money screen displays is the number the engine uses.
 *
 * The ethical core (GDD §6, §8): absence forgoes gains but never risks progress.
 * Nothing in this table can reduce an asset — the offline curve only *slows* past
 * a soft cap, it never zeroes; golden hours are *bonus-only*.
 */

/**
 * The laundering-front roster (design/01 §3a; Ideas2 item 1). Six FIXED
 * techniques drawn from the three-stage money-laundering model —
 * **Placement → Layering → Integration** — each mapping to a real-world method:
 *
 *  - `cash-front`    — a cash-intensive business (bar / car wash / nail salon)
 *                      mingles dirty notes with legitimate takings. **Placement.**
 *  - `smurf-network` — structuring: many small deposits under reporting
 *                      thresholds, run by low-level "smurfs". **Placement.**
 *  - `crypto`        — a stablecoin / exchange hop that obscures the trail.
 *                      **Layering** (its rate swings live).
 *  - `shell-company` — a paper company with no real operations, invoicing itself
 *                      clean. **Layering.**
 *  - `trade-front`   — trade-based laundering: over/under-invoiced import/export.
 *                      **Layering → Integration.**
 *  - `real-estate`   — property / hotel holdings that absorb the largest sums.
 *                      **Integration** (the heaviest buy-in).
 *
 * Each technique is buyable **once** (single-buy — `laundering.buyFront` rejects a
 * duplicate) and then **upgrade-only** along the unchanged `buy_in × 1.15^level`
 * curve. The roster is the cap: there is no way to own a seventh front or a second
 * copy of any technique, which kills the old "infinite fronts" exploit.
 */
export type FrontType =
  | 'cash-front'
  | 'smurf-network'
  | 'crypto'
  | 'shell-company'
  | 'trade-front'
  | 'real-estate';

export interface FrontTypeConfig {
  readonly id: FrontType;
  readonly name: string;
  /**
   * Clean cash per real hour **per level** (design/01 §3a). A front's rate is
   * `ratePerLevel × level`; the run total is `Σ` over all fronts. Shown in-game.
   */
  readonly ratePerLevel: number;
  /** Buy-in for a Level-1 front, paid from CLEAN cash (design/01 §3a). */
  readonly buyIn: number;
  /** Passive heat added per online hour while this front operates (design/01 §3a). */
  readonly heatPerHour: number;
  /**
   * Crypto's rate **swings ±`swing`** live (design/01 §3a). Absent/0 for the
   * steady fronts. The swing is a deterministic function of in-game time (see
   * `laundering.ts`) — pure and reproducible, never a hidden roll.
   */
  readonly swing: number;
}

/** Levels run 1–5 for every front (design/01 §3a). */
export const FRONT_MAX_LEVEL = 5;

/**
 * The fixed six-front roster (design/01 §3a; Ideas2 item 1), ordered by buy-in
 * along the Placement → Layering → Integration ladder. Every front is purchasable
 * from the start — the buy-in is the gate, never a progression flag (Ideas.md —
 * Drug Lord 2 open access) — but each only **once** (`laundering.buyFront` rejects
 * a duplicate), then upgrade-only. `cash-front` is where a broke player starts
 * because it's the one he can afford; `real-estate` is the "much larger sum" a
 * richer player graduates to; `crypto` is fast and low-heat but its rate *swings*.
 *
 * Rates/buy-ins are v1 HYPOTHESES (the ×1.15 upgrade curve and 5-level cap are
 * unchanged); retune against the Prompt 25 batch sim.
 */
export const FRONT_TYPES: readonly FrontTypeConfig[] = [
  {
    id: 'cash-front',
    name: 'Cash-Intensive Front',
    ratePerLevel: 120,
    buyIn: 2_000,
    heatPerHour: 0,
    swing: 0,
  },
  {
    id: 'smurf-network',
    name: 'Smurf / Structuring Network',
    ratePerLevel: 300,
    buyIn: 8_000,
    heatPerHour: 0.02,
    swing: 0,
  },
  {
    id: 'crypto',
    name: 'Crypto / Stablecoin Exchange',
    ratePerLevel: 900,
    buyIn: 20_000,
    heatPerHour: 0.01, // lowest footprint
    swing: 0.4, // ±40% live rate swing (design/01 §3a)
  },
  {
    id: 'shell-company',
    name: 'Shell Company',
    ratePerLevel: 700,
    buyIn: 35_000,
    heatPerHour: 0.015,
    swing: 0,
  },
  {
    id: 'trade-front',
    name: 'Trade-Based Front',
    ratePerLevel: 1_300,
    buyIn: 90_000,
    heatPerHour: 0.03,
    swing: 0,
  },
  {
    id: 'real-estate',
    name: 'Real-Estate Holdings',
    ratePerLevel: 2_600,
    buyIn: 250_000,
    heatPerHour: 0.05,
    swing: 0,
  },
] as const;

const FRONT_BY_ID: ReadonlyMap<FrontType, FrontTypeConfig> = new Map(
  FRONT_TYPES.map((f) => [f.id, f]),
);

/**
 * Resolve a front-type config, throwing on an unknown id (closed-union guard).
 * Pass an alternate `types` (e.g. `state.config.fronts.FRONT_TYPES`) to
 * resolve against an injected tuning (Prompt 26).
 */
export function getFrontType(
  id: FrontType,
  types: readonly FrontTypeConfig[] = FRONT_TYPES,
): FrontTypeConfig {
  const cfg = types === FRONT_TYPES ? FRONT_BY_ID.get(id) : types.find((f) => f.id === id);
  if (!cfg) throw new Error(`getFrontType(): unknown front type "${id}"`);
  return cfg;
}

// --- Upgrade curve (design/01 §3: buy_in × 1.15^level) -----------------------

/** Each level up costs 15% more than the last — the classic idle geometric curve. */
export const FRONT_COST_GROWTH = 1.15;

/**
 * Cost to raise a `type` front from `level` → `level + 1`: `buy_in × 1.15^level`
 * (design/01 §3). Keeps a next affordable step always in reach (design/01 §0.4).
 * `tuning` injects an alternate roster/growth (`state.config.fronts` — Prompt 26).
 */
export function frontUpgradeCost(
  type: FrontType,
  level: number,
  tuning?: {
    readonly FRONT_TYPES?: readonly FrontTypeConfig[];
    readonly FRONT_COST_GROWTH?: number;
  },
): number {
  const buyIn = getFrontType(type, tuning?.FRONT_TYPES ?? FRONT_TYPES).buyIn;
  const growth = tuning?.FRONT_COST_GROWTH ?? FRONT_COST_GROWTH;
  return Math.round(buyIn * Math.pow(growth, level));
}

// --- Offline curve (design/01 §3: soft cap, then 25% — never zero) ------------

/**
 * Soft cap on offline accrual: up to this many real hours accrue at FULL rate
 * (design/01 §3). Beyond it, accrual slows to `OFFLINE_REDUCED_RATE` — it never
 * stops, so a long absence idles rather than being *punished* (GDD §6).
 */
export const OFFLINE_SOFT_CAP_HOURS = 12;

/** Fraction of the full rate applied to offline hours BEYOND the soft cap. */
export const OFFLINE_REDUCED_RATE = 0.25;

// --- Crypto live swing --------------------------------------------------------

/** Peak fractional swing of the crypto rate around its base (±40%, design/01 §3a). */
export const CRYPTO_SWING = 0.4;

/** Period (in-game hours) of the crypto rate's deterministic oscillation. */
export const CRYPTO_SWING_PERIOD_HOURS = 24;

// --- Special channels (design/01 §3a) ----------------------------------------

// The Black Market Peso Exchange (a bulk, INSTANT dirty→clean haircut) was REMOVED
// in design/12 Item 12: a lump-sum converter made fronts pointless. The money-mule
// wash queue below is its deliberate opposite — a dirty→clean channel that is
// BATCHED OVER TIME (not instant), so it complements fronts instead of trivializing
// them (fronts still mint clean passively; the mules eat a cut for turning dirty).

// --- Money-mule wash queue (the batched dirty→clean converter) ----------------
//
// The "money mules go bank to bank depositing under $10k" mechanic: dirty cash is
// deposited in sub-threshold batches over ONLINE time, landing clean at 1 − cut.
// Throughput is fixed (WASH_MAX_DEPOSIT × WASH_DEPOSITS_PER_DAY dirty $/day), so a
// bigger sum takes proportionally longer — more money, more time. v1 hypotheses.

/**
 * Largest single mule deposit, $ — kept UNDER the $10,000 bank cash-reporting
 * threshold (structuring is the whole point). Flavor + the batch-size story;
 * throughput is `WASH_MAX_DEPOSIT × WASH_DEPOSITS_PER_DAY`.
 */
export const WASH_MAX_DEPOSIT = 9_000;

/**
 * How many sub-threshold deposits the mules clear per in-game DAY. Combined with
 * `WASH_MAX_DEPOSIT` this sets the wash throughput — raise it to launder faster.
 *
 * Tuned so the mule network clears `9,000 × 133 / 24 ≈ 49,875` dirty $/hr, i.e. a
 * $100,000 batch lands clean in ~2 in-game hours (the earlier 20/day read as far
 * too slow — that same batch took ~13 hours). It models a large aggregate network
 * of mules, not one person doing 133 bank runs.
 */
export const WASH_DEPOSITS_PER_DAY = 133;

/**
 * The mules'/banks' skim: fraction of each laundered dollar lost to fees and the
 * mules' cut (design decision — laundering costs, so dirty isn't free to clean).
 * $1 dirty lands as `$(1 − WASH_CUT)` clean; the rest evaporates.
 */
export const WASH_CUT = 0.1;

/**
 * Front-coupling, MULTIPLICATIVE (design/13 §H; Prompt 50, refined by user tuning
 * 2026-07-16). Each OWNED front is placement infrastructure that steps the whole
 * operation up a gear, so unlocking one multiplies mule throughput by
 * `WASH_FRONT_MULT` even before it is upgraded — a new front is worth ≥ ×1.5. Each
 * front LEVEL above the first then compounds by `WASH_LEVEL_MULT`, so upgrades keep
 * helping. Throughput = flat × `WASH_FRONT_MULT^(fronts owned)` ×
 * `WASH_LEVEL_MULT^(Σ levels − fronts owned)`.
 *
 * Calibrated so a FULLY BUILT empire — all six fronts at Level 5 — launders at
 * least $2,000,000/hr (the user's floor; asserted in `wash.test.ts`):
 *   49,875 × 1.5^6 × 1.06^24 ≈ $2.30M/hr.
 * A single fresh front is ×1.5 (≈ $74.8k/hr); three Level-3 fronts ≈ ×4.3.
 */
export const WASH_FRONT_MULT = 1.5;

/** Each front LEVEL above the first multiplies throughput by this (upgrades compound). */
export const WASH_LEVEL_MULT = 1.06;

/** In-game hours per day — the structural anchor the wash rate divides by. */
const WASH_HOURS_PER_DAY = 24;

/**
 * Dirty dollars the mules clear per in-game HOUR (derived throughput). Passing a
 * `tuning` (`state.config.fronts`) reads the injected knobs so a save/playtest
 * runs at its own numbers; `frontCount` (owned fronts) and `totalFrontLevels`
 * (Σ level over them) apply the multiplicative front-coupling (design/13 §H).
 * Shown in-game (the ETA the Money screen displays is `queuedDirty / this`).
 */
export function washRatePerHour(
  tuning?: {
    readonly WASH_MAX_DEPOSIT?: number;
    readonly WASH_DEPOSITS_PER_DAY?: number;
    readonly WASH_FRONT_MULT?: number;
    readonly WASH_LEVEL_MULT?: number;
  },
  frontCount = 0,
  totalFrontLevels = 0,
): number {
  const maxDeposit = tuning?.WASH_MAX_DEPOSIT ?? WASH_MAX_DEPOSIT;
  const perDay = tuning?.WASH_DEPOSITS_PER_DAY ?? WASH_DEPOSITS_PER_DAY;
  const frontMult = tuning?.WASH_FRONT_MULT ?? WASH_FRONT_MULT;
  const levelMult = tuning?.WASH_LEVEL_MULT ?? WASH_LEVEL_MULT;
  const flat = (maxDeposit * perDay) / WASH_HOURS_PER_DAY;
  const fronts = Math.max(0, frontCount);
  // Every front is at least Level 1, so Σ levels ≥ front count; guard anyway.
  const extraLevels = Math.max(0, totalFrontLevels - fronts);
  return flat * Math.pow(frontMult, fronts) * Math.pow(levelMult, extraLevels);
}

/**
 * Trade-based laundering capacity as a fraction of the dollar value of product
 * moved (design/01 §3a: ~15–20%). Capacity *grows with the empire* rather than
 * ticking at a fixed rate. Carried here; the shipment integration lands with the
 * international-routes unlock.
 */
export const TRADE_LAUNDER_FRACTION = 0.175;

/** Clean capacity a shipment of `movedValue` dollars opens via trade laundering. */
export function tradeLaunderCapacity(movedValue: number): number {
  return Math.max(0, movedValue) * TRADE_LAUNDER_FRACTION;
}

// --- Golden hours (design/01 §3a: bonus-only return triggers) -----------------

/** Mean online hours between golden-hour spawns (Poisson ~1 per 3–5h). */
export const GOLDEN_HOUR_MEAN_HOURS = 4;
/** Golden-hour lifetime window, minutes (design/01 §3a: 5–15 min). */
export const GOLDEN_HOUR_MIN_MINUTES = 5;
export const GOLDEN_HOUR_MAX_MINUTES = 15;
/** A golden hour's one-time bonus is worth about this many hours of clean rate… */
export const GOLDEN_HOUR_BONUS_HOURS = 2;
/** …but never less than this floor (so an empty-front run still gets a real bonus). */
export const GOLDEN_HOUR_MIN_BONUS = 500;
