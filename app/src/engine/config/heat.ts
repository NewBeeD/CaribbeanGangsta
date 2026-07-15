/**
 * Heat & law-enforcement tuning (design/01 §4; design/07 §5). These are v1
 * balance HYPOTHESES held as config, never scattered literals (prompts/README.md
 * "Config, not literals"; Prompt 26 centralizes).
 *
 * Scale convention (the prompt's open question, resolved here): heat is ONE
 * internal meter on a **0–100** scale. Product `heatPerUnit` (config/products.ts;
 * some design tables write it on a 0–1 fraction) is treated as **heat points per
 * unit on this 0–100 meter** — a deal's heat is `heatPerUnit × qty`, added
 * directly. There is no second conversion: the number the meter carries is the
 * number the tiers classify and the raid math reads.
 *
 * Heat is a **tension meter, not a currency you spend** (design/01 §1): it is a
 * scalar with decay, never a wallet. Lying low and a beat cop on the payroll
 * cool it faster; they don't "buy" it down from a balance. (The one-tap
 * "bribe a cop to lower heat" lever was removed — Ideas2 item 2 — leaving the
 * payroll Beat Cop as the only cop-driven relief; see `PAYROLLED_COP_DECAY_MULTIPLIER`.)
 */

/** The law-enforcement attention tier a run currently sits under. */
export type LeTier = 'local' | 'dea' | 'cia';

/** The heat meter runs on a fixed 0–100 scale. */
export const HEAT_MIN = 0;
export const HEAT_MAX = 100;

export interface HeatTierConfig {
  readonly id: LeTier;
  readonly name: string;
  /** Inclusive lower bound on the 0–100 meter. */
  readonly min: number;
  /** Exclusive upper bound (the next tier's `min`); the top tier caps at HEAT_MAX. */
  readonly max: number;
  /** Fire-once narrative-beat key fired when this tier is first crossed into. */
  readonly beatKey: string;
}

/**
 * Tier thresholds on the 0–100 meter (design/01 §4): Local (0–30) → DEA (30–60)
 * → CIA/Interpol (60–100). A boundary value belongs to the HIGHER tier (heat 30
 * ⇒ DEA), so escalation is never "stuck" exactly on the line.
 */
export const HEAT_TIERS: readonly HeatTierConfig[] = [
  { id: 'local', name: 'Local Police', min: 0, max: 30, beatKey: 'heat.tier.local' },
  { id: 'dea', name: 'DEA', min: 30, max: 60, beatKey: 'heat.tier.dea' },
  { id: 'cia', name: 'CIA / Interpol', min: 60, max: HEAT_MAX, beatKey: 'heat.tier.cia' },
] as const;

/** How the Heat wireframe draws the meter: N dots, filled ∝ heat (design/07 §5). */
export const HEAT_DOTS_TOTAL = 10;

// --- Decay (design/01 §4: "~5%/hour, faster lying low, slower at higher size") --

/** Base fraction of current heat shed per online hour (exponential decay). */
export const HEAT_DECAY_RATE_PER_HOUR = 0.05;
/** Lying low multiplies the decay rate (heat sheds faster while you stay quiet). */
export const LIE_LOW_DECAY_MULTIPLIER = 2;
/**
 * A loyal beat cop on the PAYROLL (design/09 B.2 `raid-tipoff`) multiplies the
 * decay rate — "cools local heat faster," the standing benefit's promise made
 * real (Ideas2 item 2). This is the ONLY cop-driven heat relief now that the
 * one-tap bribe lever is gone; it's a deterministic active-only effect on
 * `decayHeat`, so heat still never moves while offline. Milder than lying low
 * (which also cuts income) — a passive perk of the relationship you maintain.
 */
export const PAYROLLED_COP_DECAY_MULTIPLIER = 1.5;
/**
 * A bigger empire cools SLOWER: the effective decay rate is divided by
 * `1 + empireSize × EMPIRE_DECAY_SLOWDOWN`. More territory = more exposure that
 * lingers (design/01 §4).
 */
export const EMPIRE_DECAY_SLOWDOWN = 0.04;

/**
 * Income multiplier applied while lying low — the laundering engine (Prompt 07)
 * reads `state.lyingLow` and scales accrual by this. Lower heat, lower income.
 */
export const LIE_LOW_INCOME_MULTIPLIER = 0.5;

// --- Telegraphing (design/07 §5: every escalation warned BEFORE it lands) -----

/**
 * How close (in heat points) to the next tier boundary the UI starts telegraphing
 * an imminent crossing — "cross into DEA range and it gets personal." Warned while
 * still IN the lower tier, so a crossing is never a surprise (design/07 §5).
 */
export const TIER_TELEGRAPH_MARGIN = 5;

/**
 * The look-ahead window (hours) a payrolled beat cop's raid tip-off reads, and the
 * minimum raid probability over it before the tip-off surfaces. Gives lead time to
 * move product BEFORE a raid lands, rather than a post-raid scene (design/07 §5).
 */
export const RAID_TIPOFF_LOOKAHEAD_HOURS = 24;
export const RAID_TIPOFF_MIN_CHANCE = 0.15;

// --- Raids (design/01 §4; resolution lives in Prompt 06's storage.ts) ---------

/**
 * Base per-hour raid probability by tier, BEFORE the heat and empire-size
 * multipliers. Higher tiers hunt harder. Kept small so a single tick rarely
 * raids, but sustained high heat makes a raid a matter of when, not if.
 */
export const RAID_BASE_RATE_PER_HOUR: Readonly<Record<LeTier, number>> = {
  local: 0.001,
  dea: 0.006,
  cia: 0.02,
};

/** Each unit of empire size raises the raid rate by this fraction. */
export const RAID_EMPIRE_FACTOR = 0.1;
