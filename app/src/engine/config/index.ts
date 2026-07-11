/**
 * The single, typed, documented balance surface (Prompt 26; design/01 §8;
 * README "Config, not literals").
 *
 * `GameConfig` composes every per-system tuning module into ONE plain-data
 * object. The engine takes it **by injection**: `createInitialState(seed,
 * config)` stores it on `GameState.config`, and every reducer/tick step reads
 * its numbers from there — so tests and playtests can run **alternate tunings
 * with identical seeds and no code changes**, and a saved run round-trips with
 * the exact tuning it was played under.
 *
 * Every value is a v1 HYPOTHESIS to be replaced by playtest data (design/01
 * preamble); each per-system module documents its numbers' design sources, and
 * `app/tuning.md` maps each tune-first knob to the telemetry signal that
 * should drive it. Property names deliberately keep the module constants'
 * SCREAMING_SNAKE names, so any knob greps to its definition and design note.
 *
 * What is NOT in `GameConfig` (content and structure, not balance knobs):
 *  - rosters that are world CONTENT — countries/price bands (`countries.ts`),
 *    officials, crew archetypes, chaos events, rival archetypes, prestige
 *    unlocks, story cards, scenarios (`scenarios.ts`);
 *  - structural scale anchors — the 0–100 heat/loyalty meters, hours per day;
 *  - **ethical guardrails** (offline-adds-only, telegraphed-before-it-lands,
 *    shown-odds-are-rolled-odds). Those are laws enforced in code and tests,
 *    NOT tunable numbers (GDD §8/§15; Prompt 26 guardrail).
 */

import type { Band } from './countries';
import { PRODUCTS, type ProductConfig } from './products';
import {
  VOLATILITY_RANGE,
  SUPPLIER_HEAT_FACTOR_RANGE,
  CHEAP_SUPPLIER_THRESHOLD,
  HOT_SUPPLIER_THRESHOLD,
} from './world';
import { RIVAL_COUNT } from './rivals';
import {
  BUST_MIN,
  BUST_MAX,
  BUST_BASE,
  BUST_HEAT_WEIGHT,
  BUST_LOCATION_WEIGHT,
  BUST_TIER_WEIGHT,
  BUST_QTY_WEIGHT,
  BUST_CREW_WEIGHT,
  BUST_QTY_FULL_RISK,
  BUY_HEAT_FACTOR,
  DEFAULT_STASH_CAPACITY,
} from './deals';
import {
  HEAT_TIERS,
  HEAT_DECAY_RATE_PER_HOUR,
  LIE_LOW_DECAY_MULTIPLIER,
  EMPIRE_DECAY_SLOWDOWN,
  LIE_LOW_INCOME_MULTIPLIER,
  BRIBE_HEAT_PER_DOLLAR,
  QUICK_BRIBE_DOLLARS,
  TIER_TELEGRAPH_MARGIN,
  RAID_TIPOFF_LOOKAHEAD_HOURS,
  RAID_TIPOFF_MIN_CHANCE,
  RAID_BASE_RATE_PER_HOUR,
  RAID_EMPIRE_FACTOR,
  type HeatTierConfig,
  type LeTier,
} from './heat';
import {
  STASH_TYPES,
  STASH_COST_GROWTH,
  GUARD_CASH_THRESHOLD,
  GUARD_MAX_PENALTY,
  GUARD_UNGUARDED_PENALTY,
  WIPE_CAPITAL_THRESHOLD,
  type StashTypeConfig,
} from './stashes';
import {
  FRONT_TYPES,
  FRONT_MAX_LEVEL,
  FRONT_COST_GROWTH,
  OFFLINE_SOFT_CAP_HOURS,
  OFFLINE_REDUCED_RATE,
  CRYPTO_SWING,
  CRYPTO_SWING_PERIOD_HOURS,
  PESO_EXCHANGE_HAIRCUT,
  TRADE_LAUNDER_FRACTION,
  GOLDEN_HOUR_MEAN_HOURS,
  GOLDEN_HOUR_MIN_MINUTES,
  GOLDEN_HOUR_MAX_MINUTES,
  GOLDEN_HOUR_BONUS_HOURS,
  GOLDEN_HOUR_MIN_BONUS,
  type FrontTypeConfig,
} from './fronts';
import {
  LOYALTY_EVENT_BASE,
  LOYALTY_DOLLARS_PER_POINT,
  LOYALTY_PAY_POINT_CAP,
  TRAIT_EVENT_MULTIPLIER,
  BETRAYAL_WARNING_LOYALTY,
  BETRAYAL_PONR_LOYALTY,
  BETRAYAL_FLIP_LOYALTY,
  WIRE_HEAT_PER_HOUR,
  TRAIN_SKILL_GAIN,
  TRAIN_COST,
  LIEUTENANT_FRONT_BONUS,
  type CrewTrait,
  type LoyaltyEventKind,
} from './crew';
import {
  POLITICIAN_REP_BONUS,
  PORT_BRIBE_BASE_FRACTION,
  PORT_BRIBE_MIN_FRACTION,
  PORT_BRIBE_MAX_FRACTION,
  PORT_BASE_SEIZURE,
  PORT_PAID_SEIZURE,
  PORT_GREED_MIN,
  PORT_GREED_MAX,
  PORT_PAID_DURATION_HOURS,
  PORT_PRICE_DRIFT,
  PORT_DRIFT_PERIOD_HOURS,
  HAGGLE_DISCOUNT,
  HAGGLE_REFUSE_CHANCE,
  RIVAL_TENSION_SCALE,
  RIVAL_PRESSURE_CAP,
  REP_DISCOUNT_SCALE,
  MAX_REP_DISCOUNT,
  RETAINER_PAID_LOYALTY,
  RETAINER_MISSED_LOYALTY,
  RETAINER_UNDERPAY_LOYALTY,
  RAISE_ACCEPT_LOYALTY,
  RAISE_MIN_MARGIN,
  BUSINESS_LEVEL_SCALE,
} from './corruption';
import {
  LENDERS,
  CAP_REPUTATION_FLOOR,
  CAP_REPUTATION_SCALE,
  CAP_COLLATERAL_FRACTION,
  INTEREST_DAYS_PER_WEEK,
  LADDER_VIG_RATE_INCREASE,
  LADDER_INCOME_CUT,
  LADDER_DAYS_PER_RUNG,
  CEILING_MAX_RUNG,
  LIFELINE_CAPITAL_THRESHOLD,
  LIFELINE_MIN_REPUTATION,
  LIFELINE_OFFER_FRACTION,
  DEBT_REPAY_REP_BONUS,
  DEBT_ONTIME_REP_BONUS,
  type ConsequenceCeiling,
  type LadderRung,
  type LenderConfig,
} from './lenders';
import {
  CHAOS_BASE_RATE_PER_HOUR,
  CHAOS_MAX_PER_TICK,
  ON_THE_MAP_CLEAN_CASH,
  CROWN_PEAK_NET_WORTH,
  MAJOR_BEATS_PER_TICK,
} from './events';
import {
  EMPIRE_WEIGHTS,
  SPIRAL_HEAT_UNMANAGED,
  SPIRAL_HEAT_HUNTED,
  SPIRAL_RIVAL_HUNTED,
} from './prestige';
import {
  TRANSPORTS,
  INTERDICTION_MIN,
  INTERDICTION_MAX,
  INTERDICTION_BASE,
  MODE_RISK_WEIGHT,
  DISTANCE_RISK_WEIGHT,
  CARGO_HEAT_WEIGHT,
  DEST_RISK_WEIGHT,
  PORT_PROTECTION_WEIGHT,
  PAID_PORT_RELIEF,
  CARGO_HEAT_FULL_RISK,
  MIN_LEG_DISTANCE,
  COURIER_CUT_PCT,
  ESCORT_ODDS_REDUCTION,
  COURIER_SKIM_PCT,
  CONSIGNED_BUST_HEAT_FACTOR,
  type TransportConfig,
} from './transport';
import { CONVERSION_RECIPES, type ConversionRecipe } from './conversions';
import { PLUG_MEETING_HEAT } from './plugs';
import {
  SESSION_TARGET_MIN_MINUTES,
  SESSION_TARGET_MAX_MINUTES,
  MINUTE_BUDGET,
  GUIDED_DEALS_AFTER_FIRST,
  MAX_INSTRUCTION_WORDS,
  SAFE_DEALS_BEFORE_RISK,
} from './onboarding';

// --- Per-system tuning groups (all plain, JSON-cloneable data) ----------------

/** World-generation variety bounds (design/01 §0a, §8.7 — tune-first). */
export interface WorldTuning {
  readonly VOLATILITY_RANGE: Band;
  readonly SUPPLIER_HEAT_FACTOR_RANGE: Band;
  readonly CHEAP_SUPPLIER_THRESHOLD: number;
  readonly HOT_SUPPLIER_THRESHOLD: number;
  readonly RIVAL_COUNT: Band;
}

/** The product balance table (design/01 §2; design/11 §1). */
export interface ProductsTuning {
  readonly PRODUCTS: readonly ProductConfig[];
}

/** Bust-probability model (design/01 §2; the clamp is tune-first §8.3). */
export interface DealsTuning {
  readonly BUST_MIN: number;
  readonly BUST_MAX: number;
  readonly BUST_BASE: number;
  readonly BUST_HEAT_WEIGHT: number;
  readonly BUST_LOCATION_WEIGHT: number;
  readonly BUST_TIER_WEIGHT: number;
  readonly BUST_QTY_WEIGHT: number;
  readonly BUST_CREW_WEIGHT: number;
  readonly BUST_QTY_FULL_RISK: number;
  readonly BUY_HEAT_FACTOR: number;
  readonly DEFAULT_STASH_CAPACITY: number;
}

/** Heat & law enforcement (design/01 §4; design/07 §5). */
export interface HeatTuning {
  readonly HEAT_TIERS: readonly HeatTierConfig[];
  readonly HEAT_DECAY_RATE_PER_HOUR: number;
  readonly LIE_LOW_DECAY_MULTIPLIER: number;
  readonly EMPIRE_DECAY_SLOWDOWN: number;
  readonly LIE_LOW_INCOME_MULTIPLIER: number;
  readonly BRIBE_HEAT_PER_DOLLAR: number;
  readonly QUICK_BRIBE_DOLLARS: number;
  readonly TIER_TELEGRAPH_MARGIN: number;
  readonly RAID_TIPOFF_LOOKAHEAD_HOURS: number;
  readonly RAID_TIPOFF_MIN_CHANCE: number;
  readonly RAID_BASE_RATE_PER_HOUR: Readonly<Record<LeTier, number>>;
  readonly RAID_EMPIRE_FACTOR: number;
}

/** Contraband storage (design/09 System A). */
export interface StashesTuning {
  readonly STASH_TYPES: readonly StashTypeConfig[];
  readonly STASH_COST_GROWTH: number;
  readonly GUARD_CASH_THRESHOLD: number;
  readonly GUARD_MAX_PENALTY: number;
  readonly GUARD_UNGUARDED_PENALTY: number;
  readonly WIPE_CAPITAL_THRESHOLD: number;
}

/** Laundering / idle engine (design/01 §3, §3a — offline cap × rate is tune-first §8.2). */
export interface FrontsTuning {
  readonly FRONT_TYPES: readonly FrontTypeConfig[];
  readonly FRONT_MAX_LEVEL: number;
  readonly FRONT_COST_GROWTH: number;
  readonly OFFLINE_SOFT_CAP_HOURS: number;
  readonly OFFLINE_REDUCED_RATE: number;
  readonly CRYPTO_SWING: number;
  readonly CRYPTO_SWING_PERIOD_HOURS: number;
  readonly PESO_EXCHANGE_HAIRCUT: number;
  readonly TRADE_LAUNDER_FRACTION: number;
  readonly GOLDEN_HOUR_MEAN_HOURS: number;
  readonly GOLDEN_HOUR_MIN_MINUTES: number;
  readonly GOLDEN_HOUR_MAX_MINUTES: number;
  readonly GOLDEN_HOUR_BONUS_HOURS: number;
  readonly GOLDEN_HOUR_MIN_BONUS: number;
}

/** Crew loyalty / betrayal / development (design/02 §4–§5). */
export interface CrewTuning {
  readonly LOYALTY_EVENT_BASE: Readonly<Record<LoyaltyEventKind, number>>;
  readonly LOYALTY_DOLLARS_PER_POINT: number;
  readonly LOYALTY_PAY_POINT_CAP: number;
  readonly TRAIT_EVENT_MULTIPLIER: Readonly<
    Record<CrewTrait, Partial<Record<LoyaltyEventKind, number>>>
  >;
  readonly BETRAYAL_WARNING_LOYALTY: number;
  readonly BETRAYAL_PONR_LOYALTY: number;
  readonly BETRAYAL_FLIP_LOYALTY: number;
  readonly WIRE_HEAT_PER_HOUR: number;
  readonly TRAIN_SKILL_GAIN: number;
  readonly TRAIN_COST: number;
  readonly LIEUTENANT_FRONT_BONUS: number;
}

/** Corruption network — port bribes & payroll (design/09 System B). */
export interface CorruptionTuning {
  readonly POLITICIAN_REP_BONUS: number;
  readonly PORT_BRIBE_BASE_FRACTION: number;
  readonly PORT_BRIBE_MIN_FRACTION: number;
  readonly PORT_BRIBE_MAX_FRACTION: number;
  readonly PORT_BASE_SEIZURE: number;
  readonly PORT_PAID_SEIZURE: number;
  readonly PORT_GREED_MIN: number;
  readonly PORT_GREED_MAX: number;
  readonly PORT_PAID_DURATION_HOURS: number;
  readonly PORT_PRICE_DRIFT: number;
  readonly PORT_DRIFT_PERIOD_HOURS: number;
  readonly HAGGLE_DISCOUNT: number;
  readonly HAGGLE_REFUSE_CHANCE: number;
  readonly RIVAL_TENSION_SCALE: number;
  readonly RIVAL_PRESSURE_CAP: number;
  readonly REP_DISCOUNT_SCALE: number;
  readonly MAX_REP_DISCOUNT: number;
  readonly RETAINER_PAID_LOYALTY: number;
  readonly RETAINER_MISSED_LOYALTY: number;
  readonly RETAINER_UNDERPAY_LOYALTY: number;
  readonly RAISE_ACCEPT_LOYALTY: number;
  readonly RAISE_MIN_MARGIN: number;
  readonly BUSINESS_LEVEL_SCALE: number;
}

/** Loan sharks (design/10 — lifeline reach is tune-first §8.8). */
export interface LendersTuning {
  readonly LENDERS: readonly LenderConfig[];
  readonly CAP_REPUTATION_FLOOR: number;
  readonly CAP_REPUTATION_SCALE: number;
  readonly CAP_COLLATERAL_FRACTION: number;
  readonly INTEREST_DAYS_PER_WEEK: number;
  readonly LADDER_VIG_RATE_INCREASE: number;
  readonly LADDER_INCOME_CUT: number;
  readonly LADDER_DAYS_PER_RUNG: number;
  readonly CEILING_MAX_RUNG: Readonly<Record<ConsequenceCeiling, LadderRung>>;
  readonly LIFELINE_CAPITAL_THRESHOLD: number;
  readonly LIFELINE_MIN_REPUTATION: number;
  readonly LIFELINE_OFFER_FRACTION: number;
  readonly DEBT_REPAY_REP_BONUS: number;
  readonly DEBT_ONTIME_REP_BONUS: number;
}

/** Chaos rate + narrative-beat thresholds (design/05 §2–§3; design/01 §4.7). */
export interface EventsTuning {
  readonly CHAOS_BASE_RATE_PER_HOUR: number;
  readonly CHAOS_MAX_PER_TICK: number;
  readonly ON_THE_MAP_CLEAN_CASH: number;
  readonly CROWN_PEAK_NET_WORTH: number;
  readonly MAJOR_BEATS_PER_TICK: number;
}

/** Score composite + death-spiral thresholds (design/01 §4a, §7 — spiral is tune-first §8.5). */
export interface PrestigeTuning {
  readonly EMPIRE_WEIGHTS: Readonly<Record<'district' | 'route' | 'front' | 'crew' | 'act', number>>;
  readonly SPIRAL_HEAT_UNMANAGED: number;
  readonly SPIRAL_HEAT_HUNTED: number;
  readonly SPIRAL_RIVAL_HUNTED: number;
}

/** Travel / transports / couriers (design/11 §3; Ideas2 §1/§3). */
export interface TransportTuning {
  readonly TRANSPORTS: readonly TransportConfig[];
  readonly INTERDICTION_MIN: number;
  readonly INTERDICTION_MAX: number;
  readonly INTERDICTION_BASE: number;
  readonly MODE_RISK_WEIGHT: number;
  readonly DISTANCE_RISK_WEIGHT: number;
  readonly CARGO_HEAT_WEIGHT: number;
  readonly DEST_RISK_WEIGHT: number;
  readonly PORT_PROTECTION_WEIGHT: number;
  readonly PAID_PORT_RELIEF: number;
  readonly CARGO_HEAT_FULL_RISK: number;
  readonly MIN_LEG_DISTANCE: number;
  readonly COURIER_CUT_PCT: number;
  readonly ESCORT_ODDS_REDUCTION: number;
  readonly COURIER_SKIM_PCT: number;
  readonly CONSIGNED_BUST_HEAT_FACTOR: number;
}

/** Product-conversion recipes (Ideas2 §4; design/11 §4). */
export interface ConversionsTuning {
  readonly CONVERSION_RECIPES: readonly ConversionRecipe[];
}

/** Plug scalars (Ideas2 §2) — per-source costs live on the country roster. */
export interface PlugsTuning {
  readonly PLUG_MEETING_HEAT: number;
}

/** First-session onboarding budget (design/01 §6; GDD §9 — data for Prompt 24). */
export interface OnboardingTuning {
  readonly SESSION_TARGET_MIN_MINUTES: number;
  readonly SESSION_TARGET_MAX_MINUTES: number;
  readonly MINUTE_BUDGET: typeof MINUTE_BUDGET;
  readonly GUIDED_DEALS_AFTER_FIRST: number;
  readonly MAX_INSTRUCTION_WORDS: number;
  readonly SAFE_DEALS_BEFORE_RISK: number;
}

// --- The composed config -------------------------------------------------------

export interface GameConfig {
  readonly world: WorldTuning;
  readonly products: ProductsTuning;
  readonly deals: DealsTuning;
  readonly heat: HeatTuning;
  readonly stashes: StashesTuning;
  readonly fronts: FrontsTuning;
  readonly crew: CrewTuning;
  readonly corruption: CorruptionTuning;
  readonly lenders: LendersTuning;
  readonly events: EventsTuning;
  readonly prestige: PrestigeTuning;
  readonly transport: TransportTuning;
  readonly conversions: ConversionsTuning;
  readonly plugs: PlugsTuning;
  readonly onboarding: OnboardingTuning;
}

/**
 * The v1 tuning — every number a design/01-sourced hypothesis, composed from
 * the per-system modules (which stay the single points of definition and carry
 * the design citations). This is the default injected everywhere.
 */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  world: {
    VOLATILITY_RANGE,
    SUPPLIER_HEAT_FACTOR_RANGE,
    CHEAP_SUPPLIER_THRESHOLD,
    HOT_SUPPLIER_THRESHOLD,
    RIVAL_COUNT,
  },
  products: { PRODUCTS },
  deals: {
    BUST_MIN,
    BUST_MAX,
    BUST_BASE,
    BUST_HEAT_WEIGHT,
    BUST_LOCATION_WEIGHT,
    BUST_TIER_WEIGHT,
    BUST_QTY_WEIGHT,
    BUST_CREW_WEIGHT,
    BUST_QTY_FULL_RISK,
    BUY_HEAT_FACTOR,
    DEFAULT_STASH_CAPACITY,
  },
  heat: {
    HEAT_TIERS,
    HEAT_DECAY_RATE_PER_HOUR,
    LIE_LOW_DECAY_MULTIPLIER,
    EMPIRE_DECAY_SLOWDOWN,
    LIE_LOW_INCOME_MULTIPLIER,
    BRIBE_HEAT_PER_DOLLAR,
    QUICK_BRIBE_DOLLARS,
    TIER_TELEGRAPH_MARGIN,
    RAID_TIPOFF_LOOKAHEAD_HOURS,
    RAID_TIPOFF_MIN_CHANCE,
    RAID_BASE_RATE_PER_HOUR,
    RAID_EMPIRE_FACTOR,
  },
  stashes: {
    STASH_TYPES,
    STASH_COST_GROWTH,
    GUARD_CASH_THRESHOLD,
    GUARD_MAX_PENALTY,
    GUARD_UNGUARDED_PENALTY,
    WIPE_CAPITAL_THRESHOLD,
  },
  fronts: {
    FRONT_TYPES,
    FRONT_MAX_LEVEL,
    FRONT_COST_GROWTH,
    OFFLINE_SOFT_CAP_HOURS,
    OFFLINE_REDUCED_RATE,
    CRYPTO_SWING,
    CRYPTO_SWING_PERIOD_HOURS,
    PESO_EXCHANGE_HAIRCUT,
    TRADE_LAUNDER_FRACTION,
    GOLDEN_HOUR_MEAN_HOURS,
    GOLDEN_HOUR_MIN_MINUTES,
    GOLDEN_HOUR_MAX_MINUTES,
    GOLDEN_HOUR_BONUS_HOURS,
    GOLDEN_HOUR_MIN_BONUS,
  },
  crew: {
    LOYALTY_EVENT_BASE,
    LOYALTY_DOLLARS_PER_POINT,
    LOYALTY_PAY_POINT_CAP,
    TRAIT_EVENT_MULTIPLIER,
    BETRAYAL_WARNING_LOYALTY,
    BETRAYAL_PONR_LOYALTY,
    BETRAYAL_FLIP_LOYALTY,
    WIRE_HEAT_PER_HOUR,
    TRAIN_SKILL_GAIN,
    TRAIN_COST,
    LIEUTENANT_FRONT_BONUS,
  },
  corruption: {
    POLITICIAN_REP_BONUS,
    PORT_BRIBE_BASE_FRACTION,
    PORT_BRIBE_MIN_FRACTION,
    PORT_BRIBE_MAX_FRACTION,
    PORT_BASE_SEIZURE,
    PORT_PAID_SEIZURE,
    PORT_GREED_MIN,
    PORT_GREED_MAX,
    PORT_PAID_DURATION_HOURS,
    PORT_PRICE_DRIFT,
    PORT_DRIFT_PERIOD_HOURS,
    HAGGLE_DISCOUNT,
    HAGGLE_REFUSE_CHANCE,
    RIVAL_TENSION_SCALE,
    RIVAL_PRESSURE_CAP,
    REP_DISCOUNT_SCALE,
    MAX_REP_DISCOUNT,
    RETAINER_PAID_LOYALTY,
    RETAINER_MISSED_LOYALTY,
    RETAINER_UNDERPAY_LOYALTY,
    RAISE_ACCEPT_LOYALTY,
    RAISE_MIN_MARGIN,
    BUSINESS_LEVEL_SCALE,
  },
  lenders: {
    LENDERS,
    CAP_REPUTATION_FLOOR,
    CAP_REPUTATION_SCALE,
    CAP_COLLATERAL_FRACTION,
    INTEREST_DAYS_PER_WEEK,
    LADDER_VIG_RATE_INCREASE,
    LADDER_INCOME_CUT,
    LADDER_DAYS_PER_RUNG,
    CEILING_MAX_RUNG,
    LIFELINE_CAPITAL_THRESHOLD,
    LIFELINE_MIN_REPUTATION,
    LIFELINE_OFFER_FRACTION,
    DEBT_REPAY_REP_BONUS,
    DEBT_ONTIME_REP_BONUS,
  },
  events: {
    CHAOS_BASE_RATE_PER_HOUR,
    CHAOS_MAX_PER_TICK,
    ON_THE_MAP_CLEAN_CASH,
    CROWN_PEAK_NET_WORTH,
    MAJOR_BEATS_PER_TICK,
  },
  prestige: {
    EMPIRE_WEIGHTS,
    SPIRAL_HEAT_UNMANAGED,
    SPIRAL_HEAT_HUNTED,
    SPIRAL_RIVAL_HUNTED,
  },
  transport: {
    TRANSPORTS,
    INTERDICTION_MIN,
    INTERDICTION_MAX,
    INTERDICTION_BASE,
    MODE_RISK_WEIGHT,
    DISTANCE_RISK_WEIGHT,
    CARGO_HEAT_WEIGHT,
    DEST_RISK_WEIGHT,
    PORT_PROTECTION_WEIGHT,
    PAID_PORT_RELIEF,
    CARGO_HEAT_FULL_RISK,
    MIN_LEG_DISTANCE,
    COURIER_CUT_PCT,
    ESCORT_ODDS_REDUCTION,
    COURIER_SKIM_PCT,
    CONSIGNED_BUST_HEAT_FACTOR,
  },
  conversions: { CONVERSION_RECIPES },
  plugs: { PLUG_MEETING_HEAT },
  onboarding: {
    SESSION_TARGET_MIN_MINUTES,
    SESSION_TARGET_MAX_MINUTES,
    MINUTE_BUDGET,
    GUIDED_DEALS_AFTER_FIRST,
    MAX_INSTRUCTION_WORDS,
    SAFE_DEALS_BEFORE_RISK,
  },
};

// --- Alternate tunings without code changes ------------------------------------

/** Per-group partial overrides — everything unspecified keeps the v1 value. */
export type GameConfigOverrides = {
  readonly [G in keyof GameConfig]?: Partial<GameConfig[G]>;
};

/**
 * Build an alternate tuning from per-group overrides — the injection point for
 * A/B playtests and the two-tunings acceptance test (Prompt 26). Shallow-merges
 * each overridden group over the v1 defaults; untouched groups are shared by
 * reference (config is read-only everywhere).
 */
export function tunedConfig(overrides: GameConfigOverrides): GameConfig {
  const next: Record<string, unknown> = { ...DEFAULT_GAME_CONFIG };
  for (const key of Object.keys(overrides) as (keyof GameConfig)[]) {
    next[key] = { ...DEFAULT_GAME_CONFIG[key], ...overrides[key] };
  }
  return next as unknown as GameConfig;
}

// --- Tune-first knobs (design/01 §8) --------------------------------------------

/** One tune-first knob: where it lives, where it came from, what should move it. */
export interface TuneFirstKnob {
  /** design/01 §8 priority number. */
  readonly priority: number;
  readonly name: string;
  /** Dot-paths into `GameConfig` for the values this knob covers. */
  readonly paths: readonly string[];
  readonly designRef: string;
  /** The telemetry signal (Prompt 25 / design/06) that should drive retuning. */
  readonly telemetrySignal: string;
}

/**
 * The prioritized tune-first list (design/01 §8), exposed prominently so the
 * tuning loop starts here — see `app/tuning.md` for the full worksheet.
 * (§8.1, first-session length, is an ONBOARDING budget — its knobs live under
 * `onboarding`; run-length §8.6 is emergent, measured by the batch sim.)
 */
export const TUNE_FIRST: readonly TuneFirstKnob[] = [
  {
    priority: 1,
    name: 'First-session length budget',
    paths: [
      'onboarding.SESSION_TARGET_MIN_MINUTES',
      'onboarding.SESSION_TARGET_MAX_MINUTES',
      'onboarding.MINUTE_BUDGET',
    ],
    designRef: 'design/01 §6, §8.1, §9',
    telemetrySignal: 'first-session length distribution vs. D1 retention',
  },
  {
    priority: 2,
    name: 'Offline cap × front rate',
    paths: [
      'fronts.OFFLINE_SOFT_CAP_HOURS',
      'fronts.OFFLINE_REDUCED_RATE',
      'fronts.FRONT_TYPES',
    ],
    designRef: 'design/01 §3/§3a, §8.2',
    telemetrySignal: 'return-session frequency; "rewarding without mandatory" survey',
  },
  {
    priority: 3,
    name: 'Bust-probability clamp',
    paths: ['deals.BUST_MIN', 'deals.BUST_MAX'],
    designRef: 'design/01 §2, §8.3',
    telemetrySignal: 'perceived-fairness survey vs. realized bust rate',
  },
  {
    priority: 4,
    name: 'Upgrade cost multiplier (1.15)',
    paths: ['fronts.FRONT_COST_GROWTH', 'stashes.STASH_COST_GROWTH'],
    designRef: 'design/01 §3, §0.4, §8.4',
    telemetrySignal: 'time-to-next-affordable-step ("always a next step")',
  },
  {
    priority: 5,
    name: 'Death-spiral rate & fairness',
    paths: [
      'prestige.SPIRAL_HEAT_UNMANAGED',
      'prestige.SPIRAL_HEAT_HUNTED',
      'prestige.SPIRAL_RIVAL_HUNTED',
      'stashes.WIPE_CAPITAL_THRESHOLD',
    ],
    designRef: 'design/01 §4a, §8.5 (v1.1 top priority)',
    telemetrySignal: '% runs ending in spiral; "earned/readable vs. cheap dice death" survey',
  },
  {
    priority: 6,
    name: 'Run-length distribution',
    paths: ['heat.HEAT_DECAY_RATE_PER_HOUR', 'heat.RAID_BASE_RATE_PER_HOUR'],
    designRef: 'design/01 §8.6',
    telemetrySignal: 'median time-to-death from the batch sim (telemetry/simulation.ts)',
  },
  {
    priority: 7,
    name: 'Randomization variety bounds',
    paths: ['world.VOLATILITY_RANGE', 'world.SUPPLIER_HEAT_FACTOR_RANGE', 'world.RIVAL_COUNT'],
    designRef: 'design/01 §0a, §8.7',
    telemetrySignal: 'dead-on-arrival seed count (target ~0) vs. run-variety spread',
  },
  {
    priority: 8,
    name: 'Lifeline reach',
    paths: [
      'lenders.LIFELINE_CAPITAL_THRESHOLD',
      'lenders.LIFELINE_MIN_REPUTATION',
      'lenders.LIFELINE_OFFER_FRACTION',
    ],
    designRef: 'design/10 §1; design/01 §8.8',
    telemetrySignal: '% of wiped players offered + taking a lifeline who recover',
  },
];

/** Resolve a `TUNE_FIRST` dot-path against a config (undefined = a broken path). */
export function knobValue(config: GameConfig, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], config);
}
