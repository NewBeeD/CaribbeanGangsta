/**
 * Heat & law enforcement — the tension / estimable-uncertainty system (design/01
 * §4; GDD §4.5, §5.4), reworked to the PER-COUNTRY heat map (heat redesign "B").
 * Heat is no longer one global meter: each country carries its own local heat fed
 * by what you do THERE, and a slow-cooling global **notoriety** scalar carries
 * your name between countries. Heat accrues from risky actions, **decays over
 * online time** per country, escalates the LE tier across **telegraphed**
 * thresholds, and periodically triggers **raids** on your hottest country.
 *
 * Design contract:
 *  - Heat is a **tension meter, not a currency** (design/01 §1): per-country
 *    scalars with decay, each clamped to [0, 100]. Never a wallet.
 *  - **Effective heat** in a country = local heat + `NOTORIETY_HEAT_WEIGHT ×
 *    notoriety`, clamped to the meter. That ONE number is what tiers, raids,
 *    and interdiction odds all read — shown = applied.
 *  - Notoriety is fed a `NOTORIETY_SHARE` slice of every heat gain anywhere and
 *    cools very slowly (`NOTORIETY_DECAY_RATE_PER_HOUR`) — a long quiet stretch
 *    can mostly clear your name, but it takes real played time.
 *  - Every escalation is **telegraphed before it lands** (design/07 §5): the
 *    FIRST crossing into a tier fires a return-hook / session-end beat — "a task
 *    force just opened a file on you" — exactly once per run, named after the
 *    hottest country. Re-crossings escalate silently.
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
import { PRODUCT_IDS, findCountry } from './config/countries';
import {
  HEAT_DOTS_TOTAL,
  HEAT_EPSILON,
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
 * loyal-enough bar (`BETRAYAL_PONR_LOYALTY`) as `hasRaidTipoff`. The single
 * `beat-cop` official is a GLOBAL payroll slot, so the perk cools every country.
 */
function hasLoyalBeatCop(state: GameState): boolean {
  return state.corruption.officials.some(
    (o) =>
      o.officialId === 'beat-cop' &&
      !o.isWire &&
      o.loyalty >= state.config.crew.BETRAYAL_PONR_LOYALTY,
  );
}

// --- The per-country map ------------------------------------------------------

/** The country your run began in — the anchor for context-free heat and income. */
export function homeCountryId(state: GameState): string {
  return state.world.startingCountry.id;
}

/** LOCAL heat in a country (absent key = stone cold). */
export function heatOf(state: GameState, countryId: string): number {
  return state.countryHeat[countryId] ?? 0;
}

/**
 * EFFECTIVE heat in a country — local heat plus your global name preceding you
 * (`NOTORIETY_HEAT_WEIGHT × notoriety`), clamped to the meter. This is THE
 * number tiers, raid odds, and interdiction odds read (shown = applied).
 */
export function effectiveHeat(state: GameState, countryId: string): number {
  const weighted = heatOf(state, countryId) + state.config.heat.NOTORIETY_HEAT_WEIGHT * state.notoriety;
  return clamp(weighted, HEAT_MIN, HEAT_MAX);
}

/**
 * Every country the empire currently touches: stash countries, active turf-war
 * fronts, and anywhere local heat still lingers from past action. Sorted for
 * determinism. (Laundering fronts carry no country — they anchor to home.)
 */
export function presenceCountries(state: GameState): readonly string[] {
  const ids = new Set<string>();
  ids.add(homeCountryId(state));
  for (const s of state.stashes) ids.add(s.countryId);
  for (const w of state.turfWars) ids.add(w.countryId);
  for (const c of Object.keys(state.countryHeat)) ids.add(c);
  return [...ids].sort();
}

/**
 * The country running the highest EFFECTIVE heat (deterministic tie-break:
 * lexicographic countryId). Context-free heat sources land here — the noise
 * naturally piles onto wherever you're already hottest — and the header meters
 * summarize the run by it.
 */
export function hottestCountry(state: GameState): string {
  let best = homeCountryId(state);
  let bestHeat = effectiveHeat(state, best);
  for (const c of presenceCountries(state)) {
    const h = effectiveHeat(state, c);
    if (h > bestHeat || (h === bestHeat && c < best)) {
      best = c;
      bestHeat = h;
    }
  }
  return best;
}

/** The run's peak effective heat — what the header gauge and global tier read. */
export function hottestHeat(state: GameState): number {
  return effectiveHeat(state, hottestCountry(state));
}

// --- Investigation windows (design/13 B5.5; Prompt 44 — now per-country) -------

/**
 * Whether a post-major-bust INVESTIGATION window is open in `countryId` right
 * now. While open, THAT country's heat decays slower and its raid chance runs
 * `INVESTIGATION_RAID_MULTIPLIER` — both disclosed when the window opens and
 * itemized on the Heat screen. The clock only advances online, so the window
 * burns ACTIVE hours only.
 */
export function investigationActiveIn(state: GameState, countryId: string): boolean {
  const until = state.investigations[countryId];
  return until !== undefined && state.clock.hours < until;
}

/** Whether ANY country's investigation window is open (the Heat screen's flag). */
export function investigationActive(state: GameState): boolean {
  return Object.keys(state.investigations).some((c) => investigationActiveIn(state, c));
}

// --- Heat mutators ------------------------------------------------------------

/**
 * Add (or, with a negative `amount`, subtract) heat in ONE country, clamped to
 * [0, 100] — the single canonical mutator for the heat map. `countryId` names
 * where the action happened; omitted (a truly context-free source: a crew wire,
 * a story card) it lands on the HOTTEST country, so magnitudes stay comparable.
 * Every positive gain also feeds `NOTORIETY_SHARE` of itself into global
 * notoriety — word gets around. Negative amounts cool locally only; your name,
 * once made, only fades with time. `source` is a free-form telemetry tag.
 */
export function addHeat(
  state: GameState,
  amount: number,
  _source?: string,
  countryId?: string,
): GameState {
  if (amount === 0) return state;
  const target = countryId ?? hottestCountry(state);
  const current = heatOf(state, target);
  const next = clamp(current + amount, HEAT_MIN, HEAT_MAX);
  let out = state;
  if (next !== current) {
    const countryHeat: Record<string, number> = { ...state.countryHeat };
    if (next <= HEAT_MIN) delete countryHeat[target];
    else countryHeat[target] = next;
    out = { ...out, countryHeat };
  }
  if (amount > 0) out = addNotoriety(out, amount * state.config.heat.NOTORIETY_SHARE);
  return out;
}

/**
 * Add directly to global notoriety, clamped to [0, 100]. The empire-size hum
 * (`heatSources.ts`) accrues here — overall footprint is about your NAME, not
 * any one port — alongside the `NOTORIETY_SHARE` slice `addHeat` feeds.
 */
export function addNotoriety(state: GameState, amount: number): GameState {
  const notoriety = clamp(state.notoriety + amount, HEAT_MIN, HEAT_MAX);
  return notoriety === state.notoriety ? state : { ...state, notoriety };
}

/**
 * Decay heat over `dtHours` of ONLINE time (design/01 §4), country by country.
 * Each country's exponential cool-down (~5%/hour) runs with ITS multipliers:
 * lying low THERE doubles it, an open investigation THERE halves it; the loyal
 * payrolled beat cop (global slot) and the empire-size slowdown apply everywhere.
 * Countries cooled below `HEAT_EPSILON` drop off the map (stone cold again).
 * Notoriety then sheds its own very slow rate. Active-only — offline is frozen.
 */
export function decayHeat(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const cfg = state.config.heat;
  const copMult = hasLoyalBeatCop(state) ? cfg.PAYROLLED_COP_DECAY_MULTIPLIER : 1;
  const slowdown = 1 + empireSizeOf(state) * cfg.EMPIRE_DECAY_SLOWDOWN;

  let out = state;
  const keys = Object.keys(state.countryHeat);
  if (keys.length > 0) {
    const countryHeat: Record<string, number> = {};
    let changed = false;
    for (const c of keys) {
      const lieLowMult = state.lyingLowCountries.includes(c) ? cfg.LIE_LOW_DECAY_MULTIPLIER : 1;
      const investMult = investigationActiveIn(state, c) ? cfg.INVESTIGATION_DECAY_MULTIPLIER : 1;
      const rate = clamp(
        (cfg.HEAT_DECAY_RATE_PER_HOUR * lieLowMult * copMult * investMult) / slowdown,
        0,
        1,
      );
      const next = clamp(state.countryHeat[c]! * Math.pow(1 - rate, dtHours), HEAT_MIN, HEAT_MAX);
      if (next >= HEAT_EPSILON) countryHeat[c] = next;
      if (next !== state.countryHeat[c]) changed = true;
    }
    if (changed) out = { ...out, countryHeat };
  }

  if (out.notoriety > 0) {
    const noto = out.notoriety * Math.pow(1 - cfg.NOTORIETY_DECAY_RATE_PER_HOUR, dtHours);
    out = { ...out, notoriety: noto < HEAT_EPSILON ? 0 : clamp(noto, HEAT_MIN, HEAT_MAX) };
  }
  return out;
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

/** The LE tier hunting you in ONE country, from its effective heat. */
export function tierOf(state: GameState, countryId: string): LeTier {
  return tierForHeat(effectiveHeat(state, countryId), state.config.heat.HEAT_TIERS);
}

/**
 * The run's headline LE tier — the tier of the HOTTEST country's effective heat
 * (design/01 §4). Header meters and escalation telegraphs read this one.
 */
export function currentTier(state: GameState): LeTier {
  return tierForHeat(hottestHeat(state), state.config.heat.HEAT_TIERS);
}

/** The Heat wireframe's dot meter: `filled` of `total`, ∝ the hottest country. */
export function tierDots(state: GameState): { readonly filled: number; readonly total: number } {
  const filled = clamp(
    Math.round((hottestHeat(state) / HEAT_MAX) * HEAT_DOTS_TOTAL),
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
 * A PURE query: has the hottest country's heat crossed up into a higher tier
 * than the one already telegraphed (`state.leTierAck`)? Crossing is a
 * **telegraphed** event (design/07 §5) — the UI and `applyHeatEscalation` both
 * read this. It never mutates; `applyHeatEscalation` owns advancing the ack.
 */
export function checkTierEscalation(state: GameState): TierEscalation {
  const tiers = state.config.heat.HEAT_TIERS;
  const newTier = currentTier(state);
  const crossed = tierIndex(newTier, tiers) > tierIndex(state.leTierAck, tiers);
  const beatKey = crossed ? tiers[tierIndex(newTier, tiers)]!.beatKey : undefined;
  return beatKey === undefined ? { crossed, newTier } : { crossed, newTier, beatKey };
}

/**
 * Apply tier escalation as a tick step: on the FIRST crossing UP into a tier,
 * telegraph it — queue a return-hook `PendingChoice` naming the hottest country
 * and fire the tier's narrative beat — and advance `leTierAck`. Once a tier's
 * file is open (its beat is in `beatsFired`) the agency already has your name,
 * so a re-crossing after heat cooled advances the acknowledgement silently: no
 * repeat "opened a file" notification, ever, within a run. On a drop back DOWN
 * to a lower tier, `leTierAck` re-arms quietly. Active-only (clock.ts).
 */
export function applyHeatEscalation(state: GameState): GameState {
  const tiers = state.config.heat.HEAT_TIERS;
  const newTier = currentTier(state);
  const curIdx = tierIndex(newTier, tiers);
  const ackIdx = tierIndex(state.leTierAck, tiers);

  if (curIdx > ackIdx) {
    const tier = tiers[curIdx]!;
    if (state.beatsFired.includes(tier.beatKey)) {
      // The file's already open — they know your name. Escalate quietly.
      return { ...state, leTierAck: newTier };
    }
    const hotName = findCountry(hottestCountry(state))?.name ?? hottestCountry(state);
    const telegraph: PendingChoice = {
      id: `heat-escalation-${tier.id}-${state.clock.hours}`,
      kind: 'heat-escalation',
      summary: `A ${tier.name} task force just opened a file on you — the noise started in ${hotName}.`,
      createdAtHours: state.clock.hours,
    };
    return {
      ...state,
      leTierAck: newTier,
      beatsFired: [...state.beatsFired, tier.beatKey],
      pendingChoices: [...state.pendingChoices, telegraph],
    };
  }

  if (curIdx < ackIdx) {
    // De-escalation: re-arm quietly so climbing back up telegraphs afresh.
    return { ...state, leTierAck: newTier };
  }

  return state;
}

// --- Lie low (per-country) ----------------------------------------------------

/**
 * Toggle "lie low" in ONE country. While a country lies low ITS heat decays
 * faster, and when the HOME country lies low the laundering engine (Prompt 07)
 * slows front income (design/07 §5) — fronts anchor to home. Wired into
 * `applyIntent` via the `LieLowIntent`.
 */
export function setLieLow(state: GameState, countryId: string, enabled: boolean): GameState {
  const active = state.lyingLowCountries.includes(countryId);
  if (active === enabled) return state;
  const lyingLowCountries = enabled
    ? [...state.lyingLowCountries, countryId].sort()
    : state.lyingLowCountries.filter((c) => c !== countryId);
  return { ...state, lyingLowCountries };
}

/** Whether `countryId` is currently lying low. */
export function isLyingLow(state: GameState, countryId: string): boolean {
  return state.lyingLowCountries.includes(countryId);
}

export interface LieLowIntent {
  readonly type: 'lieLow';
  readonly countryId: string;
  readonly enabled: boolean;
}

// --- Raids -------------------------------------------------------------------

/**
 * A triggered raid: which single stash is being hit, in which country, under
 * which tier, at what effective heat. This is the **handoff** contract —
 * `heat.ts` decides whether/where a raid fires; Prompt 06's `storage.ts`
 * consumes the event and resolves the seizure. Heat never seizes here.
 */
export interface RaidEvent {
  readonly targetStashId: string;
  readonly countryId: string;
  readonly tier: LeTier;
  readonly heatAtRoll: number;
}

/** How much a stash has to lose — biases which location a raid targets. */
function stashValueAtRisk(stash: Stash): number {
  const units = PRODUCT_IDS.reduce((sum, id) => sum + stash.inventory[id], 0);
  return stash.dirtyCash + units;
}

/** The per-hour raid rate in ONE country — its tier base rate scaled by its
 * effective heat, empire size, the vulnerability surcharge, and any open
 * investigation window THERE. The building block both `raidChanceIn` and the
 * aggregate `raidChance` compound. */
function raidRatePerHour(state: GameState, countryId: string): number {
  const cfg = state.config.heat;
  return (
    cfg.RAID_BASE_RATE_PER_HOUR[tierOf(state, countryId)] *
    (effectiveHeat(state, countryId) / HEAT_MAX) *
    (1 + empireSizeOf(state) * cfg.RAID_EMPIRE_FACTOR) *
    (1 + maxVulnerability(state)) *
    // An open investigation window keeps them looking (design/13 B5.5; disclosed).
    (investigationActiveIn(state, countryId) ? cfg.INVESTIGATION_RAID_MULTIPLIER : 1)
  );
}

/** The probability a raid fires in ONE country within `dtHours` (compounded). */
export function raidChanceIn(state: GameState, countryId: string, dtHours: number): number {
  if (dtHours <= 0) return 0;
  return clamp(1 - Math.pow(1 - clamp(raidRatePerHour(state, countryId), 0, 1), dtHours), 0, 1);
}

/** The countries a raid can actually hit — only where product sits (stashes). */
function raidableCountries(state: GameState): readonly string[] {
  return [...new Set(state.stashes.map((s) => s.countryId))].sort();
}

/**
 * The probability that a raid fires SOMEWHERE within a `dtHours` window: the
 * per-country rates summed over every stash country, compounded over the window
 * so it rises with time but never exceeds 1 (design/01 §4). Active-only like
 * the whole raid path, so absence never exposes a new foothold.
 */
export function raidChance(state: GameState, dtHours: number): number {
  if (dtHours <= 0) return 0;
  const perHour = raidableCountries(state).reduce(
    (sum, c) => sum + raidRatePerHour(state, c),
    0,
  );
  return clamp(1 - Math.pow(1 - clamp(perHour, 0, 1), dtHours), 0, 1);
}

/**
 * Roll for a raid over `dtHours`. Returns a `RaidEvent` targeting **exactly
 * one** stash — the country picked ∝ its raid rate (they hit where they're
 * looking), the stash within it weighted toward the fattest — or `null` when no
 * raid fires. Consumes the run's RNG (`rng`) — the caller writes the advanced
 * snapshot back; determinism holds under a fixed seed.
 */
export function rollRaid(state: GameState, rng: Rng, dtHours = 1): RaidEvent | null {
  if (state.stashes.length === 0) return null;
  const fired = rng.next() < raidChance(state, dtHours);
  if (!fired) return null;
  const countryId = rng.weighted(
    raidableCountries(state).map((c) => [c, raidRatePerHour(state, c)]),
  );
  const candidates = state.stashes.filter((s) => s.countryId === countryId);
  const target = rng.weighted(candidates.map((s) => [s, 1 + stashValueAtRisk(s)]));
  return {
    targetStashId: target.id,
    countryId,
    tier: tierOf(state, countryId),
    heatAtRoll: effectiveHeat(state, countryId),
  };
}
