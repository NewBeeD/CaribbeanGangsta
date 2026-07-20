/**
 * The six-source heat model (design/13 B5; Prompt 44) — where heat comes from
 * now that transacting itself is cold (B1: buying/selling cleanly adds ZERO
 * heat). Six legible categories, every weight in `config/heat.ts`, every source
 * itemized on the Heat screen ("why is my heat rising" — shown = applied):
 *
 *  1. **Shipment volume & route risk** — launch/landing heat scaled by the
 *     interdiction quote's own inputs (`travel.ts` calls `shipmentLegHeat`).
 *  2. **Storage concentration** — RETIRED: holding product is COLD. Sitting on
 *     inventory adds zero heat; only MOVING it draws attention (source 1), so
 *     lying low on a full warehouse actually cools you down.
 *  3. **Repeated patterns** — per-origin-port `recentUse` counters that decay
 *     over active hours; reuse inside the window surcharges heat AND odds
 *     (`travel.ts` reads `recentUseOf`; this step decays the counters).
 *  4. **Violence & flashy actions** — one-time bumps at their call sites
 *     (survived raid → `storage.ts`; rival clash → `chaos.ts`; conspicuous
 *     purchase → `laundering.ts`), knobs here-adjacent in `config/heat.ts`.
 *  5. **Failed deals & busts** — the existing spike stays where it is; a MAJOR
 *     bust additionally opens the disclosed INVESTIGATION window
 *     (`maybeOpenInvestigation`; `heat.ts` reads it in decay/raid math).
 *  6. **Empire size** — a mild passive term (this module's tick step).
 *
 * The fairness contract: `passiveHeatTerms` is BOTH the itemization the Heat
 * screen renders and the exact list the `heat-sources` tick step sums and
 * applies — one function, so shown = applied by construction.
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in →
 * new state out, no RNG, no wall clock. Registered ACTIVE-only in clock.ts —
 * offline neither hums, decays a pattern, nor burns an investigation hour.
 */

import { addNotoriety } from './heat';
import { findCountry } from './config/countries';
import type { GameState, PendingChoice } from './state';

// --- Passive terms (source 6): the itemization IS the application -------------

/** One passive heat source line — what the Heat screen shows per source. */
export interface PassiveHeatTerm {
  /** Stable id (`empire-size`). */
  readonly id: string;
  /** Readable label ("Empire footprint — size 12 keeps your name warm"). */
  readonly label: string;
  /** NOTORIETY points added per ACTIVE hour — the number the tick step applies. */
  readonly perHour: number;
}

/**
 * Every ACTIVE passive heat term right now (design/13 B5.6): the empire-size
 * term once the operation is big enough to register. Since the per-country
 * rework (v30) this hum feeds global NOTORIETY, not any one port — overall
 * footprint is about your NAME. Stored product adds NOTHING here — storage is
 * cold (the retired B5.2 concentration hum). This is the SAME list the
 * `heat-sources` tick step sums — shown = applied.
 */
export function passiveHeatTerms(state: GameState): readonly PassiveHeatTerm[] {
  const cfg = state.config.heat;
  const terms: PassiveHeatTerm[] = [];

  const size = state.stashes.length + state.fronts.length + state.crew.length;
  // The first EMPIRE_HEAT_FREE_SIZE units are ambient — a fresh run never hums.
  const empirePerHour = Math.max(0, size - cfg.EMPIRE_HEAT_FREE_SIZE) * cfg.EMPIRE_HEAT_PER_SIZE_HOUR;
  if (empirePerHour > 0) {
    terms.push({
      id: 'empire-size',
      label: `Empire footprint — size ${size} keeps your name warm`,
      perHour: empirePerHour,
    });
  }

  return terms;
}

/** Sum of every passive term, notoriety/hour — the rate the tick step applies. */
export function passiveHeatPerHour(state: GameState): number {
  return passiveHeatTerms(state).reduce((sum, t) => sum + t.perHour, 0);
}

// --- Repeated-pattern counters (source 3) --------------------------------------

/** The `recentUse` key for an origin port (a country's waterfront). */
export function portUseKey(countryId: string): string {
  return `port:${countryId}`;
}

/** How recently/often `key` has been used (0 = cold — no surcharge). */
export function recentUseOf(state: GameState, key: string): number {
  return state.recentUse[key] ?? 0;
}

/** Record one more use of `key` (a shipment launch bumps its origin port). */
export function bumpRecentUse(state: GameState, key: string): GameState {
  return {
    ...state,
    recentUse: { ...state.recentUse, [key]: recentUseOf(state, key) + 1 },
  };
}

/** Decay every pattern counter by `PATTERN_DECAY_PER_HOUR × dtHours`, dropping
 * entries that reach zero (the window closes; the port runs cold again). */
function decayRecentUse(state: GameState, dtHours: number): GameState {
  const keys = Object.keys(state.recentUse);
  if (keys.length === 0) return state;
  const shed = state.config.heat.PATTERN_DECAY_PER_HOUR * dtHours;
  const recentUse: Record<string, number> = {};
  for (const key of keys) {
    const left = state.recentUse[key]! - shed;
    if (left > 0) recentUse[key] = left;
  }
  return { ...state, recentUse };
}

// --- Investigation window (source 5) --------------------------------------------

/**
 * Open the post-bust INVESTIGATION window in `countryId` if this bust was MAJOR
 * — its heat spike at or above `INVESTIGATION_SPIKE_THRESHOLD` (amount- and
 * type-scaled by construction, since the spike is `heatPerUnit × qty ×
 * multiplier`). Per-country since v30: the file opens where the bust landed.
 * Disclosed the moment it opens: a feed line names the country, the slower
 * decay, the raised raid odds, and the ACTIVE hours on the clock. Re-opening
 * extends an already-open window (the fresh bust restarts that country's clock;
 * never stacks multipliers).
 */
export function maybeOpenInvestigation(
  state: GameState,
  spike: number,
  countryId: string,
): GameState {
  const cfg = state.config.heat;
  if (spike < cfg.INVESTIGATION_SPIKE_THRESHOLD) return state;
  const until = state.clock.hours + cfg.INVESTIGATION_HOURS;
  const name = findCountry(countryId)?.name ?? countryId;
  const line: PendingChoice = {
    id: `investigation-${countryId}-${state.clock.hours}`,
    kind: 'investigation',
    summary:
      `That bust opened a file in ${name}. For the next ${cfg.INVESTIGATION_HOURS} played hours ` +
      `heat there cools slower and raids run ×${cfg.INVESTIGATION_RAID_MULTIPLIER} likely.`,
    createdAtHours: state.clock.hours,
  };
  return {
    ...state,
    investigations: { ...state.investigations, [countryId]: until },
    pendingChoices: [...state.pendingChoices, line],
  };
}

// --- The tick step ----------------------------------------------------------------

/**
 * The `heat-sources` tick step (registered ACTIVE-only in clock.ts, right before
 * `heat-decay`): apply the passive terms' summed NOTORIETY over `dtHours`, then
 * decay the repeated-pattern counters. Deterministic — no randomness, so it
 * never touches the RNG stream. Offline never runs it (GDD §6): the empire
 * doesn't hum while you're away, and a pattern doesn't cool either.
 */
export function heatSourcesStep(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const hum = passiveHeatPerHour(state) * dtHours;
  const heated = hum > 0 ? addNotoriety(state, hum) : state;
  return decayRecentUse(heated, dtHours);
}
