/**
 * The Heat / Threats screen's view-model (Prompt 19; design/07 §5, design/04 §1,
 * GDD §4.5), reworked for the PER-COUNTRY heat map (heat redesign "B"; v30). PURE
 * read selectors that turn `GameState` into the tension surface: the hottest
 * country's tier + gauge as the headline, global notoriety, a per-country row
 * for every place the empire touches (each with its OWN lie-low lever), the
 * **telegraphed** warnings that a crossing looms (or a task force has opened a
 * file), and the payroll raid tip-offs that buy lead time.
 *
 * The design contract (design/07 §5, GDD §5.4): tension is **estimable** and every
 * escalation is **telegraphed BEFORE it lands** — no surprise LE. Heat is a meter,
 * not a spendable currency (design/01 §1): the levers reduce it via in-fiction
 * actions, never a "buy heat" store. The screen composes these and dispatches
 * intents through the store — it authors NO decay/heat/probability math (README UI
 * rule; the number shown is the number the engine uses — design/01 §0.3).
 */

import {
  HEAT_DOTS_TOTAL,
  HEAT_MAX,
  HEAT_TIERS,
  LIE_LOW_INCOME_MULTIPLIER,
  PRODUCT_IDS,
  RAID_TIPOFF_LOOKAHEAD_HOURS,
  RAID_TIPOFF_MIN_CHANCE,
  TIER_TELEGRAPH_MARGIN,
  currentTier,
  effectiveHeat,
  hasRaidTipoff,
  heatOf,
  homeCountryId,
  hottestCountry,
  hottestHeat,
  investigationActiveIn,
  isLyingLow,
  passiveHeatTerms,
  presenceCountries,
  raidChance,
  recentUseOf,
  portUseKey,
  tierOf,
  tierDots,
  findCountry,
  type GameState,
  type LeTier,
  type Stash,
} from '@/engine';

/** The headline gauge — the HOTTEST country's tier + heat (design/07 §5). */
export interface HeatStatus {
  readonly tier: LeTier;
  readonly tierName: string;
  /** Filled dots of `total` — the `HeatDots` gauge, ∝ the hottest country. */
  readonly filled: number;
  readonly total: number;
  /** The hottest country's effective heat on the 0–100 meter. */
  readonly heat: number;
  /** Where that peak sits (display name). */
  readonly hottestCountryName: string;
  /** Global notoriety, 0–100 — the name that precedes you everywhere. */
  readonly notoriety: number;
  /** True when ANY country is lying low. */
  readonly lyingLow: boolean;
}

/** The human name for an LE tier id. */
function tierName(id: LeTier): string {
  return HEAT_TIERS.find((t) => t.id === id)?.name ?? id;
}

/** A country's display name, falling back to the raw id (never throws). */
function countryLabel(countryId: string): string {
  return findCountry(countryId)?.name ?? countryId;
}

export function heatStatus(state: GameState): HeatStatus {
  const dots = tierDots(state);
  const tier = currentTier(state);
  return {
    tier,
    tierName: tierName(tier),
    filled: dots.filled,
    total: dots.total,
    heat: hottestHeat(state),
    hottestCountryName: countryLabel(hottestCountry(state)),
    notoriety: state.notoriety,
    lyingLow: state.lyingLowCountries.length > 0,
  };
}

// --- Per-country rows (the map made legible) ----------------------------------

/** One country's heat row: its meter, tier, and its OWN lie-low lever. */
export interface CountryHeatRow {
  readonly countryId: string;
  readonly name: string;
  /** Effective heat (local + weighted notoriety) — the number the engine reads. */
  readonly heat: number;
  /** The local component alone (what cools when you lie low HERE). */
  readonly localHeat: number;
  readonly tier: LeTier;
  readonly tierName: string;
  readonly filled: number;
  readonly total: number;
  readonly lyingLow: boolean;
  /** True for the home country — lying low here also slows front income. */
  readonly isHome: boolean;
  /** Watched-port pattern line, if this origin has been run recently. */
  readonly patternLine: string | null;
  /** Open-investigation line with hours left, if a file is open HERE. */
  readonly investigationLine: string | null;
}

/**
 * Every country the empire touches, hottest first (ties by name) — each with the
 * numbers the engine itself reads (shown = applied) and its own lie-low lever.
 */
export function countryHeatRows(state: GameState): readonly CountryHeatRow[] {
  const cfg = state.config.heat;
  const home = homeCountryId(state);
  const rows = presenceCountries(state).map((countryId): CountryHeatRow => {
    const heat = effectiveHeat(state, countryId);
    const tier = tierOf(state, countryId);
    const uses = recentUseOf(state, portUseKey(countryId));
    const odds = Math.round(uses * cfg.PATTERN_ODDS_PER_USE * 100);
    const investLeft = investigationActiveIn(state, countryId)
      ? Math.max(0, Math.ceil((state.investigations[countryId] ?? 0) - state.clock.hours))
      : 0;
    return {
      countryId,
      name: countryLabel(countryId),
      heat,
      localHeat: heatOf(state, countryId),
      tier,
      tierName: tierName(tier),
      filled: Math.min(HEAT_DOTS_TOTAL, Math.round((heat / HEAT_MAX) * HEAT_DOTS_TOTAL)),
      total: HEAT_DOTS_TOTAL,
      lyingLow: isLyingLow(state, countryId),
      isHome: countryId === home,
      patternLine:
        uses > 0
          ? `Watched port — run recently (next launch: +${odds}% odds, +${Math.round(uses * cfg.PATTERN_HEAT_PER_USE)} heat)`
          : null,
      investigationLine:
        investLeft > 0
          ? `Open investigation — cools slower, raids ×${cfg.INVESTIGATION_RAID_MULTIPLIER} for ${investLeft} more played hours`
          : null,
    };
  });
  return [...rows].sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name));
}

/**
 * A telegraphed threat warning (design/07 §5). `looming` fires while the hottest
 * country is still IN the lower tier but within `TIER_TELEGRAPH_MARGIN` of the
 * next boundary — the crossing is warned BEFORE it lands. `opened` surfaces a
 * queued `heat-escalation` choice — a task force has opened a file.
 */
export interface HeatWarning {
  readonly id: string;
  readonly kind: 'looming' | 'opened';
  readonly text: string;
}

export function heatWarnings(state: GameState): readonly HeatWarning[] {
  const warnings: HeatWarning[] = [];

  // Looming: approaching the next tier boundary — warned before the crossing.
  const peak = hottestHeat(state);
  const idx = HEAT_TIERS.findIndex((t) => t.id === currentTier(state));
  const next = HEAT_TIERS[idx + 1];
  if (next && peak < next.max && next.min - peak <= TIER_TELEGRAPH_MARGIN) {
    warnings.push({
      id: `looming-${next.id}`,
      kind: 'looming',
      text: `⚠ ${countryLabel(hottestCountry(state))} is heating up. Cross into ${next.name} range and it gets personal.`,
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

/** The lie-low income cut shown on the levers, as a percent (e.g. 50 for ×0.5). */
export function lieLowIncomePenaltyPct(): number {
  return Math.round((1 - LIE_LOW_INCOME_MULTIPLIER) * 100);
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
      ? 'Your beat cop is on the payroll — heat cools faster everywhere and they tip you off on raids.'
      : 'Put a cop on the payroll to cool heat faster.',
  };
}

/** Fraction of the gauge that's filled — the hottest country's share. */
export function heatFraction(state: GameState): number {
  return Math.max(0, Math.min(1, hottestHeat(state) / HEAT_MAX));
}

// --- "Why is my heat rising" — the source itemization (design/13 B5) -----------

/** One line of the Heat screen's source list. `perHour` present on the passive
 * (continuously-accruing) sources; status sources carry prose only. */
export interface HeatSourceRow {
  readonly id: string;
  readonly label: string;
  /** Notoriety/hour for passive terms; absent for status rows (patterns, files). */
  readonly perHour?: number;
}

/**
 * Every heat source ACTIVE right now, itemized (design/13 B5 — shown = applied):
 *
 *  - the engine's own `passiveHeatTerms` verbatim (the empire-size hum, feeding
 *    NOTORIETY since v30 — exactly the list the `heat-sources` tick step sums,
 *    so the shown per-hour numbers ARE the applied ones);
 *  - every open investigation window, named per country;
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

  for (const countryId of Object.keys(state.investigations).sort()) {
    if (!investigationActiveIn(state, countryId)) continue;
    const left = Math.max(
      0,
      Math.ceil((state.investigations[countryId] ?? 0) - state.clock.hours),
    );
    rows.push({
      id: `investigation:${countryId}`,
      label: `Open investigation in ${countryLabel(countryId)} — heat there cools slower and raids run ×${cfg.INVESTIGATION_RAID_MULTIPLIER} for ${left} more played hours`,
    });
  }

  for (const countryId of [...new Set(state.stashes.map((s) => s.countryId))]) {
    const uses = recentUseOf(state, portUseKey(countryId));
    if (uses <= 0) continue;
    const odds = Math.round(uses * cfg.PATTERN_ODDS_PER_USE * 100);
    rows.push({
      id: `pattern:${countryId}`,
      label: `Watched port — ${countryLabel(countryId)} has been run recently (next launch: +${odds}% odds, +${Math.round(uses * cfg.PATTERN_HEAT_PER_USE)} heat)`,
    });
  }

  return rows;
}

/** Total passive notoriety/hour — the sum the tick step applies (shown = applied). */
export function totalPassiveHeatPerHour(state: GameState): number {
  return passiveHeatTerms(state).reduce((sum, t) => sum + t.perHour, 0);
}
