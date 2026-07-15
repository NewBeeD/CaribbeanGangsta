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
  HEAT_DOTS_TOTAL,
  HEAT_MAX,
  HEAT_MIN,
  HEAT_TIERS,
  type HeatTierConfig,
  type LeTier,
} from './config/heat';
import type { GameState, PendingChoice, Stash } from './state';
import { maxVulnerability } from './territory';

export type { LeTier } from './config/heat';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Empire-size composite, inlined to keep this module type-only on `state`. */
function empireSizeOf(state: GameState): number {
  return state.stashes.length + state.fronts.length + state.crew.length;
}

/**
 * Whether a beat cop is on the PAYROLL, loyal, and not flipped — the standing
 * `raid-tipoff` benefit whose promise is "cools local heat faster" (design/09
 * B.2). Inlined here (rather than importing `corruption.hasRaidTipoff`) because
 * `corruption.ts` already imports `addHeat` from this module — reading the tie
 * off `state` directly keeps `heat.ts` free of that import cycle. Uses the same
 * loyal-enough bar (`BETRAYAL_PONR_LOYALTY`) as `hasRaidTipoff`.
 */
function hasLoyalBeatCop(state: GameState): boolean {
  return state.corruption.officials.some(
    (o) =>
      o.officialId === 'beat-cop' &&
      !o.isWire &&
      o.loyalty >= state.config.crew.BETRAYAL_PONR_LOYALTY,
  );
}

// --- Investigation window (design/13 B5.5; Prompt 44) --------------------------

/**
 * Whether a post-major-bust INVESTIGATION window is open right now. While open,
 * heat decays slower (`INVESTIGATION_DECAY_MULTIPLIER` in `decayHeat`) and raid
 * chance runs `INVESTIGATION_RAID_MULTIPLIER` (in `raidChance`) — both disclosed
 * when the window opens and itemized on the Heat screen. The clock only advances
 * online, so the window burns ACTIVE hours only.
 */
export function investigationActive(state: GameState): boolean {
  return (
    state.investigationUntilHours !== undefined &&
    state.clock.hours < state.investigationUntilHours
  );
}

// --- Heat scalar -------------------------------------------------------------

/**
 * Add (or, with a negative `amount`, subtract) heat, clamped to [0, 100]. The
 * single canonical mutator for the heat meter — the deal loop, chaos, and wire
 * heat all route through here. `source` is a free-form tag for telemetry/beats.
 */
export function addHeat(state: GameState, amount: number, _source?: string): GameState {
  const heat = clamp(state.heat + amount, HEAT_MIN, HEAT_MAX);
  return heat === state.heat ? state : { ...state, heat };
}

/**
 * Decay heat over `dtHours` of ONLINE time (design/01 §4). Exponential toward 0
 * at `~5%/hour`, so heat never goes negative and always cools when left alone.
 * Lying low multiplies the rate (cools faster); a loyal beat cop on the payroll
 * also multiplies it ("cools local heat faster" — design/09 B.2, the only
 * cop-driven relief now the one-tap bribe is gone); a larger empire divides it
 * (cools slower). Registered as an active-only tick step — offline is frozen.
 */
export function decayHeat(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0 || state.heat <= HEAT_MIN) return state;
  const cfg = state.config.heat;
  const lieLowMult = state.lyingLow ? cfg.LIE_LOW_DECAY_MULTIPLIER : 1;
  const copMult = hasLoyalBeatCop(state) ? cfg.PAYROLLED_COP_DECAY_MULTIPLIER : 1;
  // An open investigation window slows the cool-down (design/13 B5.5; disclosed).
  const investMult = investigationActive(state) ? cfg.INVESTIGATION_DECAY_MULTIPLIER : 1;
  const slowdown = 1 + empireSizeOf(state) * cfg.EMPIRE_DECAY_SLOWDOWN;
  const rate = clamp(
    (cfg.HEAT_DECAY_RATE_PER_HOUR * lieLowMult * copMult * investMult) / slowdown,
    0,
    1,
  );
  const heat = state.heat * Math.pow(1 - rate, dtHours);
  return { ...state, heat: clamp(heat, HEAT_MIN, HEAT_MAX) };
}

// --- Tiers -------------------------------------------------------------------

/** Classify a raw heat value into its LE tier (boundary belongs to the higher tier). */
export function tierForHeat(
  heat: number,
  tiers: readonly HeatTierConfig[] = HEAT_TIERS,
): LeTier {
  for (const tier of tiers) {
    if (heat < tier.max) return tier.id;
  }
  return tiers[tiers.length - 1]!.id;
}

function tierIndex(id: LeTier, tiers: readonly HeatTierConfig[]): number {
  return tiers.findIndex((t) => t.id === id);
}

/** The run's current LE tier from its heat meter (design/01 §4). */
export function currentTier(state: GameState): LeTier {
  return tierForHeat(state.heat, state.config.heat.HEAT_TIERS);
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
  const tiers = state.config.heat.HEAT_TIERS;
  const newTier = currentTier(state);
  const crossed = tierIndex(newTier, tiers) > tierIndex(state.leTierAck, tiers);
  const beatKey = crossed ? tiers[tierIndex(newTier, tiers)]!.beatKey : undefined;
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
  const tiers = state.config.heat.HEAT_TIERS;
  const newTier = currentTier(state);
  const curIdx = tierIndex(newTier, tiers);
  const ackIdx = tierIndex(state.leTierAck, tiers);

  if (curIdx > ackIdx) {
    const tier = tiers[curIdx]!;
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
 * rate scaled by heat (0..1 of the meter) and empire size, then lifted by any
 * freshly opened territory's fading VULNERABILITY surcharge (Ideas2 item 5 —
 * over-expansion runs hot until it consolidates), compounded over the window so
 * it rises with time but never exceeds 1 (design/01 §4). Active-only like the
 * whole raid path, so absence never exposes a new foothold (offline is frozen).
 */
export function raidChance(state: GameState, dtHours: number): number {
  if (dtHours <= 0) return 0;
  const cfg = state.config.heat;
  const perHour =
    cfg.RAID_BASE_RATE_PER_HOUR[currentTier(state)] *
    (state.heat / HEAT_MAX) *
    (1 + empireSizeOf(state) * cfg.RAID_EMPIRE_FACTOR) *
    (1 + maxVulnerability(state)) *
    // An open investigation window keeps them looking (design/13 B5.5; disclosed).
    (investigationActive(state) ? cfg.INVESTIGATION_RAID_MULTIPLIER : 1);
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
    tier: currentTier(state),
    heatAtRoll: state.heat,
  };
}
