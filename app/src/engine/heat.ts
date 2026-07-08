/**
 * Heat & law enforcement — the tension / estimable-uncertainty system (design/01
 * §4; GDD §4.5, §5.4). Heat accrues from risky actions, **decays over online
 * time**, escalates the LE tier across **telegraphed** thresholds, and
 * periodically triggers **raids** on stash locations.
 *
 * Design contract:
 *  - Heat is a **tension meter, not a currency** (design/01 §1): a scalar with
 *    decay, clamped to [0, 100]. Never a wallet.
 *  - Every escalation is **telegraphed before it lands** (design/07 §5): crossing
 *    a tier boundary fires a return-hook / session-end beat — "a task force just
 *    opened a file on you" — exactly once per crossing. No surprise CIA.
 *  - **Offline is safe** (GDD §6): decay, escalation, and raids are all
 *    active-only tick steps, so absence neither raises heat nor triggers a raid.
 *  - This module decides **whether/where** a raid triggers; the seizure itself
 *    lives in Prompt 06's `storage.ts`. `rollRaid` hands off a `RaidEvent`.
 *
 * Purity/determinism (prompts/README.md): no `Math.random`, no wall clock — raid
 * rolls draw from the run's serialized `state.rngState` and write the advanced
 * snapshot back, so a save/load round-trip reproduces every roll.
 */

import type { Rng } from './rng';
import { PRODUCT_IDS } from './config/countries';
import {
  BRIBE_HEAT_PER_DOLLAR,
  EMPIRE_DECAY_SLOWDOWN,
  HEAT_DECAY_RATE_PER_HOUR,
  HEAT_DOTS_TOTAL,
  HEAT_MAX,
  HEAT_MIN,
  HEAT_TIERS,
  LIE_LOW_DECAY_MULTIPLIER,
  RAID_BASE_RATE_PER_HOUR,
  RAID_EMPIRE_FACTOR,
  type LeTier,
} from './config/heat';
import type { GameState, PendingChoice, Stash } from './state';

export type { LeTier } from './config/heat';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Empire-size composite, inlined to keep this module type-only on `state`. */
function empireSizeOf(state: GameState): number {
  return state.stashes.length + state.fronts.length + state.crew.length;
}

// --- Heat scalar -------------------------------------------------------------

/**
 * Add (or, with a negative `amount`, subtract) heat, clamped to [0, 100]. The
 * single canonical mutator for the heat meter — the deal loop, bribes, and chaos
 * all route through here. `source` is a free-form tag for telemetry/beats.
 */
export function addHeat(state: GameState, amount: number, _source?: string): GameState {
  const heat = clamp(state.heat + amount, HEAT_MIN, HEAT_MAX);
  return heat === state.heat ? state : { ...state, heat };
}

/**
 * Decay heat over `dtHours` of ONLINE time (design/01 §4). Exponential toward 0
 * at `~5%/hour`, so heat never goes negative and always cools when left alone.
 * Lying low multiplies the rate (cools faster); a larger empire divides it
 * (cools slower). Registered as an active-only tick step — offline is frozen.
 */
export function decayHeat(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0 || state.heat <= HEAT_MIN) return state;
  const lieLowMult = state.lyingLow ? LIE_LOW_DECAY_MULTIPLIER : 1;
  const slowdown = 1 + empireSizeOf(state) * EMPIRE_DECAY_SLOWDOWN;
  const rate = clamp((HEAT_DECAY_RATE_PER_HOUR * lieLowMult) / slowdown, 0, 1);
  const heat = state.heat * Math.pow(1 - rate, dtHours);
  return { ...state, heat: clamp(heat, HEAT_MIN, HEAT_MAX) };
}

/**
 * The heat reduction a bribe of `bribeDollars` buys (design/07 §5). This is ONLY
 * the heat side — the bribe's cash cost, official ties, and payroll are owned by
 * Prompt 09; callers there apply the economy and use this hook for the effect.
 */
export function reduceHeatByBribe(state: GameState, bribeDollars: number): GameState {
  if (bribeDollars <= 0) return state;
  return addHeat(state, -bribeDollars * BRIBE_HEAT_PER_DOLLAR, 'bribe');
}

// --- Tiers -------------------------------------------------------------------

/** Classify a raw heat value into its LE tier (boundary belongs to the higher tier). */
export function tierForHeat(heat: number): LeTier {
  for (const tier of HEAT_TIERS) {
    if (heat < tier.max) return tier.id;
  }
  return HEAT_TIERS[HEAT_TIERS.length - 1]!.id;
}

function tierIndex(id: LeTier): number {
  return HEAT_TIERS.findIndex((t) => t.id === id);
}

/** The run's current LE tier from its heat meter (design/01 §4). */
export function currentTier(state: GameState): LeTier {
  return tierForHeat(state.heat);
}

/** The Heat wireframe's dot meter: `filled` of `total`, filled ∝ heat (design/07 §5). */
export function tierDots(state: GameState): { readonly filled: number; readonly total: number } {
  const filled = clamp(
    Math.round((state.heat / HEAT_MAX) * HEAT_DOTS_TOTAL),
    0,
    HEAT_DOTS_TOTAL,
  );
  return { filled, total: HEAT_DOTS_TOTAL };
}

// --- Tier escalation (telegraphed) -------------------------------------------

export interface TierEscalation {
  /** True on the tick heat first crosses UP into a tier above the acknowledged one. */
  readonly crossed: boolean;
  /** The current tier (whether or not a crossing happened this check). */
  readonly newTier: LeTier;
  /** The beat key to fire — present only when `crossed`. */
  readonly beatKey?: string;
}

/**
 * A PURE query: has heat crossed up into a higher tier than the one already
 * telegraphed (`state.leTierAck`)? Crossing is a **telegraphed** event
 * (design/07 §5) — the UI and `applyHeatEscalation` both read this. It never
 * mutates; `applyHeatEscalation` owns advancing the acknowledgement.
 */
export function checkTierEscalation(state: GameState): TierEscalation {
  const newTier = currentTier(state);
  const crossed = tierIndex(newTier) > tierIndex(state.leTierAck);
  const beatKey = crossed ? HEAT_TIERS[tierIndex(newTier)]!.beatKey : undefined;
  return beatKey === undefined ? { crossed, newTier } : { crossed, newTier, beatKey };
}

/**
 * Apply tier escalation as a tick step: on a crossing UP, telegraph it — queue a
 * return-hook `PendingChoice` and fire the tier's narrative beat once — and
 * advance `leTierAck` so the SAME crossing never fires twice. On a drop back DOWN
 * to a lower tier, silently re-arm `leTierAck` so a future re-crossing telegraphs
 * again ("exactly once per crossing"). Active-only (registered in clock.ts).
 */
export function applyHeatEscalation(state: GameState): GameState {
  const newTier = currentTier(state);
  const curIdx = tierIndex(newTier);
  const ackIdx = tierIndex(state.leTierAck);

  if (curIdx > ackIdx) {
    const tier = HEAT_TIERS[curIdx]!;
    const telegraph: PendingChoice = {
      id: `heat-escalation-${tier.id}-${state.clock.hours}`,
      kind: 'heat-escalation',
      summary: `A ${tier.name} task force just opened a file on you.`,
      createdAtHours: state.clock.hours,
    };
    const beatsFired = state.beatsFired.includes(tier.beatKey)
      ? state.beatsFired
      : [...state.beatsFired, tier.beatKey];
    return {
      ...state,
      leTierAck: newTier,
      beatsFired,
      pendingChoices: [...state.pendingChoices, telegraph],
    };
  }

  if (curIdx < ackIdx) {
    // De-escalation: re-arm quietly so climbing back up telegraphs afresh.
    return { ...state, leTierAck: newTier };
  }

  return state;
}

// --- Lie low -----------------------------------------------------------------

/**
 * Toggle "lie low" mode. While lying low heat decays faster and the laundering
 * engine (Prompt 07) reads `state.lyingLow` to slow income (design/07 §5). Wired
 * into `applyIntent` via the `LieLowIntent`.
 */
export function setLieLow(state: GameState, enabled: boolean): GameState {
  return state.lyingLow === enabled ? state : { ...state, lyingLow: enabled };
}

export interface LieLowIntent {
  readonly type: 'lieLow';
  readonly enabled: boolean;
}

// --- Raids -------------------------------------------------------------------

/**
 * A triggered raid: which single stash is being hit, under which tier, at what
 * heat. This is the **handoff** contract — `heat.ts` decides whether/where a
 * raid fires; Prompt 06's `storage.ts` consumes the event and resolves the
 * seizure. Heat never seizes here.
 */
export interface RaidEvent {
  readonly targetStashId: string;
  readonly tier: LeTier;
  readonly heatAtRoll: number;
}

/** How much a stash has to lose — biases which location a raid targets. */
function stashValueAtRisk(stash: Stash): number {
  const units = PRODUCT_IDS.reduce((sum, id) => sum + stash.inventory[id], 0);
  return stash.dirtyCash + units;
}

/**
 * The probability that a raid fires within a `dtHours` window: the tier base
 * rate scaled by heat (0..1 of the meter) and empire size, compounded over the
 * window so it rises with time but never exceeds 1 (design/01 §4).
 */
export function raidChance(state: GameState, dtHours: number): number {
  if (dtHours <= 0) return 0;
  const perHour =
    RAID_BASE_RATE_PER_HOUR[tierForHeat(state.heat)] *
    (state.heat / HEAT_MAX) *
    (1 + empireSizeOf(state) * RAID_EMPIRE_FACTOR);
  return clamp(1 - Math.pow(1 - clamp(perHour, 0, 1), dtHours), 0, 1);
}

/**
 * Roll for a raid over `dtHours`. Returns a `RaidEvent` targeting **exactly one**
 * stash (weighted toward the fattest), or `null` when no raid fires. Consumes the
 * run's RNG (`rng`) — the caller writes the advanced snapshot back. Probability
 * rises with heat and empire size; determinism holds under a fixed seed.
 */
export function rollRaid(state: GameState, rng: Rng, dtHours = 1): RaidEvent | null {
  if (state.stashes.length === 0) return null;
  const fired = rng.next() < raidChance(state, dtHours);
  if (!fired) return null;
  const target = rng.weighted(state.stashes.map((s) => [s, 1 + stashValueAtRisk(s)]));
  return {
    targetStashId: target.id,
    tier: tierForHeat(state.heat),
    heatAtRoll: state.heat,
  };
}
