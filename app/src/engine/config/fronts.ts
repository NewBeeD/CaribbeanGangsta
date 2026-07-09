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
 * a soft cap, it never zeroes; the peso exchange is a *disclosed* sink the player
 * chooses; golden hours are *bonus-only*.
 */

/** The rate-front archetypes (design/01 §3a). Special channels are separate. */
export type FrontType = 'bar' | 'nightclub' | 'resort' | 'crypto';

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
 * The front roster (design/01 §3a, real dollars). Every front is purchasable
 * from the start — the buy-in is the gate, never a progression flag (Ideas.md —
 * Drug Lord 2 open access). Bar is where a broke player starts because it's the
 * one he can afford; the resort is the heavy earner; crypto is fast and low-heat
 * but its rate *swings*, pairing with the tech playstyle.
 */
export const FRONT_TYPES: readonly FrontTypeConfig[] = [
  {
    id: 'bar',
    name: 'Bar / Food Cart',
    ratePerLevel: 120,
    buyIn: 2_000,
    heatPerHour: 0,
    swing: 0,
  },
  {
    id: 'nightclub',
    name: 'Nightclub / Restaurant',
    ratePerLevel: 450,
    buyIn: 12_000,
    heatPerHour: 0.02,
    swing: 0,
  },
  {
    id: 'resort',
    name: 'Resort / Casino',
    ratePerLevel: 1_600,
    buyIn: 60_000,
    heatPerHour: 0.05,
    swing: 0,
  },
  {
    id: 'crypto',
    name: 'Crypto',
    ratePerLevel: 900,
    buyIn: 20_000,
    heatPerHour: 0.01, // lowest footprint
    swing: 0.4, // ±40% live rate swing (design/01 §3a)
  },
] as const;

const FRONT_BY_ID: ReadonlyMap<FrontType, FrontTypeConfig> = new Map(
  FRONT_TYPES.map((f) => [f.id, f]),
);

/** Resolve a front-type config, throwing on an unknown id (closed-union guard). */
export function getFrontType(id: FrontType): FrontTypeConfig {
  const cfg = FRONT_BY_ID.get(id);
  if (!cfg) throw new Error(`getFrontType(): unknown front type "${id}"`);
  return cfg;
}

// --- Upgrade curve (design/01 §3: buy_in × 1.15^level) -----------------------

/** Each level up costs 15% more than the last — the classic idle geometric curve. */
export const FRONT_COST_GROWTH = 1.15;

/**
 * Cost to raise a `type` front from `level` → `level + 1`: `buy_in × 1.15^level`
 * (design/01 §3). Keeps a next affordable step always in reach (design/01 §0.4).
 */
export function frontUpgradeCost(type: FrontType, level: number): number {
  return Math.round(getFrontType(type).buyIn * Math.pow(FRONT_COST_GROWTH, level));
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

/**
 * Black Market Peso Exchange haircut — the DISCLOSED discount converting a lump
 * of dirty cash to clean funds (design/01 §3a: a ~10–20% sink, shown before you
 * commit). This is the number the UI shows AND the number applied (fairness law).
 */
export const PESO_EXCHANGE_HAIRCUT = 0.15;

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
