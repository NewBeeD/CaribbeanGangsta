/**
 * The Heat / Threats screen's view-model (Prompt 19; design/07 §5, design/04 §1,
 * GDD §4.5). PURE read selectors that turn `GameState` into the tension surface:
 * the current LE tier + decaying heat gauge, the **telegraphed** warnings that a
 * crossing looms (or a task force has opened a file), the payroll raid tip-offs
 * that buy lead time, and the levers to cool it (lie low / a beat cop on the
 * payroll — the one-tap "bribe a cop" lever was removed, Ideas2 item 2).
 *
 * The design contract (design/07 §5, GDD §5.4): tension is **estimable** and every
 * escalation is **telegraphed BEFORE it lands** — no surprise LE. Heat is a meter,
 * not a spendable currency (design/01 §1): the levers reduce it via in-fiction
 * actions, never a "buy heat" store. The screen composes these and dispatches
 * intents through the store — it authors NO decay/heat/probability math (README UI
 * rule; the number shown is the number the engine uses — design/01 §0.3).
 */

import {
  HEAT_MAX,
  HEAT_TIERS,
  LIE_LOW_INCOME_MULTIPLIER,
  PRODUCT_IDS,
  RAID_TIPOFF_LOOKAHEAD_HOURS,
  RAID_TIPOFF_MIN_CHANCE,
  TIER_TELEGRAPH_MARGIN,
  currentTier,
  hasRaidTipoff,
  investigationActive,
  passiveHeatTerms,
  raidChance,
  recentUseOf,
  portUseKey,
  tierDots,
  findCountry,
  type GameState,
  type LeTier,
  type Stash,
} from '@/engine';

/** The heat gauge + current tier — the wireframe's top status (design/07 §5). */
export interface HeatStatus {
  readonly tier: LeTier;
  readonly tierName: string;
  /** Filled dots of `total` — the `HeatDots` gauge that "decays as you lie low". */
  readonly filled: number;
  readonly total: number;
  /** Raw heat on the 0–100 meter (for aria/estimation, not a spendable balance). */
  readonly heat: number;
  readonly lyingLow: boolean;
}

/** The human name for an LE tier id. */
function tierName(id: LeTier): string {
  return HEAT_TIERS.find((t) => t.id === id)?.name ?? id;
}

export function heatStatus(state: GameState): HeatStatus {
  const dots = tierDots(state);
  const tier = currentTier(state);
  return {
    tier,
    tierName: tierName(tier),
    filled: dots.filled,
    total: dots.total,
    heat: state.heat,
    lyingLow: state.lyingLow,
  };
}

/**
 * A telegraphed threat warning (design/07 §5). `looming` fires while heat is still
 * IN the lower tier but within `TIER_TELEGRAPH_MARGIN` of the next boundary — the
 * crossing is warned BEFORE it lands. `opened` surfaces a queued `heat-escalation`
 * choice — a task force has opened a file (the crossing's own telegraph).
 */
export interface HeatWarning {
  readonly id: string;
  readonly kind: 'looming' | 'opened';
  readonly text: string;
}

export function heatWarnings(state: GameState): readonly HeatWarning[] {
  const warnings: HeatWarning[] = [];

  // Looming: approaching the next tier boundary — warned before the crossing.
  const idx = HEAT_TIERS.findIndex((t) => t.id === currentTier(state));
  const next = HEAT_TIERS[idx + 1];
  if (next && state.heat < next.max && next.min - state.heat <= TIER_TELEGRAPH_MARGIN) {
    warnings.push({
      id: `looming-${next.id}`,
      kind: 'looming',
      text: `⚠ Heat's climbing. Cross into ${next.name} range and it gets personal.`,
    });
  }

  // Opened file: any queued escalation telegraph from `applyHeatEscalation`.
  for (const c of state.pendingChoices) {
    if (c.kind === 'heat-escalation') {
      warnings.push({ id: c.id, kind: 'opened', text: `⚠ ${c.summary}` });
    }
  }

  return warnings;
}

/**
 * A payroll raid tip-off (design/07 §5): when a bought beat cop is on the take and
 * a raid is likely within the look-ahead window, they tip you off — with LEAD TIME
 * to move product, not a post-raid scene. `null` when no tipster is on payroll or
 * the risk is still low. The chance is the engine's own `raidChance` (estimable).
 */
export interface RaidTipoff {
  readonly text: string;
  readonly chancePct: number;
  readonly stashName: string;
}

/** How much a stash has to lose — biases which location a tip-off names. */
function stashValueAtRisk(stash: Stash): number {
  const units = PRODUCT_IDS.reduce((sum, id) => sum + stash.inventory[id], 0);
  return stash.dirtyCash + units;
}

export function raidTipoff(state: GameState): RaidTipoff | null {
  if (!hasRaidTipoff(state) || state.stashes.length === 0) return null;
  const chance = raidChance(state, RAID_TIPOFF_LOOKAHEAD_HOURS);
  if (chance < RAID_TIPOFF_MIN_CHANCE) return null;

  const fattest = [...state.stashes].sort(
    (a, b) => stashValueAtRisk(b) - stashValueAtRisk(a),
  )[0]!;
  return {
    text: `A bought cop tipped a raid on ${fattest.name} — move product before it lands.`,
    chancePct: Math.round(chance * 100),
    stashName: fattest.name,
  };
}

/** The "lie low" lever's state — active flag + the income it trades away. */
export interface LieLowLever {
  readonly active: boolean;
  /** The income cut while lying low, as a percent (e.g. 50 for ×0.5). */
  readonly incomePenaltyPct: number;
}

export function lieLowLever(state: GameState): LieLowLever {
  return {
    active: state.lyingLow,
    incomePenaltyPct: Math.round((1 - LIE_LOW_INCOME_MULTIPLIER) * 100),
  };
}

/**
 * The cop-driven heat relief on the Heat screen (Ideas2 item 2). The one-tap
 * "bribe a cop" lever is gone — a beat cop on the PAYROLL is now the only
 * cop-driven cool-down (design/09 B.2's `raid-tipoff`: "cools local heat
 * faster"). When one is on the take (loyal, not flipped — the same bar as
 * `hasRaidTipoff`) their standing benefit line shows; otherwise a pointer routes
 * to the Corruption screen to put one on the payroll. This authors no math —
 * `onPayroll` mirrors the engine's own `decayHeat` beat-cop condition.
 */
export interface BeatCopRelief {
  readonly onPayroll: boolean;
  readonly text: string;
}

export function beatCopRelief(state: GameState): BeatCopRelief {
  const onPayroll = hasRaidTipoff(state);
  return {
    onPayroll,
    text: onPayroll
      ? 'Your beat cop is on the payroll — heat cools faster and they tip you off on raids.'
      : 'Put a cop on the payroll to cool local heat faster.',
  };
}

/** Peso-style fraction of the gauge that's filled — for the caption "decays…". */
export function heatFraction(state: GameState): number {
  return Math.max(0, Math.min(1, state.heat / HEAT_MAX));
}

// --- "Why is my heat rising" — the six-source itemization (design/13 B5) -------

/** One line of the Heat screen's source list. `perHour` present on the passive
 * (continuously-accruing) sources; status sources carry prose only. */
export interface HeatSourceRow {
  readonly id: string;
  readonly label: string;
  /** Heat/hour for passive terms; absent for status rows (patterns, files). */
  readonly perHour?: number;
}

/**
 * Every heat source ACTIVE right now, itemized (design/13 B5 — shown = applied):
 *
 *  - the engine's own `passiveHeatTerms` verbatim (storage concentration +
 *    empire size — exactly the list the `heat-sources` tick step sums, so the
 *    shown per-hour numbers ARE the applied ones);
 *  - an open investigation window (slower decay + raised raid odds, hours left);
 *  - any warm repeated-pattern counter (the port being watched, and what the
 *    next run from it costs on the quote).
 *
 * One-time events (busts, launches, flashy bumps) disclose at their own moments
 * — quotes and scenes — so they aren't standing lines here.
 */
export function heatSourceRows(state: GameState): readonly HeatSourceRow[] {
  const cfg = state.config.heat;
  const rows: HeatSourceRow[] = passiveHeatTerms(state).map((t) => ({
    id: t.id,
    label: t.label,
    perHour: t.perHour,
  }));

  if (investigationActive(state)) {
    const left = Math.max(0, Math.ceil((state.investigationUntilHours ?? 0) - state.clock.hours));
    rows.push({
      id: 'investigation',
      label: `Open investigation — heat cools slower and raids run ×${cfg.INVESTIGATION_RAID_MULTIPLIER} for ${left} more played hours`,
    });
  }

  for (const countryId of [...new Set(state.stashes.map((s) => s.countryId))]) {
    const uses = recentUseOf(state, portUseKey(countryId));
    if (uses <= 0) continue;
    const name = findCountry(countryId)?.name ?? countryId;
    const odds = Math.round(uses * cfg.PATTERN_ODDS_PER_USE * 100);
    rows.push({
      id: `pattern:${countryId}`,
      label: `Watched port — ${name} has been run recently (next launch: +${odds}% odds, +${Math.round(uses * cfg.PATTERN_HEAT_PER_USE)} heat)`,
    });
  }

  return rows;
}

/** Total passive heat/hour — the sum the tick step applies (shown = applied). */
export function totalPassiveHeatPerHour(state: GameState): number {
  return passiveHeatTerms(state).reduce((sum, t) => sum + t.perHour, 0);
}
