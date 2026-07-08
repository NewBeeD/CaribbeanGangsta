/**
 * The injected-time clock. The sim advances ONLY through `tick(state, dtHours)`
 * (player online) and `settleOffline(state, realHoursAway)` (return from away) —
 * never by reading a wall clock inside the engine (prompts/README.md "Time is
 * injected"). This is what keeps the sim deterministic and lets the store
 * compute elapsed real time and feed it in.
 *
 * Per-tick systems (heat decay, laundering accrual, debt interest, chaos rolls,
 * beat checks) are registered as small pure steps in `TICK_STEPS`, run in a
 * defined order. Later prompts fill the placeholder steps they own.
 *
 * Offline is frozen/safe (GDD §6; design/10 §4.2): `settleOffline` runs ONLY the
 * offline-safe steps — it may add clean cash and queue return hooks, but never
 * advances heat, debt, or the death spiral, never seizes, never kills.
 */

import type { GameState } from './state';
import { restoreRng } from './rng';
import { driftPrices } from './deals';

const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

export type TickMode = 'active' | 'offline';

export interface TickStep {
  readonly id: string;
  /**
   * Advance this system by `dtHours`. Must be PURE: state in -> new state out,
   * no mutation, no wall-clock reads, randomness only via `state.rngState`.
   */
  readonly run: (state: GameState, dtHours: number, mode: TickMode) => GameState;
  /**
   * Which modes this step runs in. Anything that could punish real-world
   * absence (heat, debt interest, chaos, the spiral) omits `'offline'`.
   */
  readonly modes: readonly TickMode[];
}

/**
 * The ordered per-tick pipeline. Steps are placeholders owned by later prompts;
 * each returns state unchanged until its prompt implements it. Order matters:
 * decay before accrual before interest before events before beats.
 */
export const TICK_STEPS: readonly TickStep[] = [
  // Live market price walk (design/01 §2). Prompt 04. Active-only: prices are
  // frozen while away so absence is never punished (GDD §6). Draws from and
  // advances the run's RNG stream.
  {
    id: 'price-drift',
    modes: ['active'],
    run: (s, dt) => driftPrices(s, restoreRng(s.rngState), dt),
  },
  // Heat decays over online time (design/01 §4). Prompt 05. Active-only: offline
  // is frozen, so heat neither rises nor falls while away.
  { id: 'heat-decay', modes: ['active'], run: (s) => s },
  // Laundering fronts accrue clean cash (design/01 §3). Prompt 07. The ONE
  // offline-safe step: it only *adds* clean cash on return.
  { id: 'laundering-accrual', modes: ['active', 'offline'], run: (s) => s },
  // Debt interest (design/10). Prompt 10. Active-only AND only when debt.active —
  // offline never advances what is owed.
  { id: 'debt-interest', modes: ['active'], run: (s) => s },
  // Procedural events (design/05). Prompt 12. Active-only.
  { id: 'chaos-roll', modes: ['active'], run: (s) => s },
  // Narrative-beat checks (design/05). Prompt 12/13. Active-only.
  { id: 'beat-check', modes: ['active'], run: (s) => s },
];

/** Recompute a clock advanced by `dtHours` (derives day/week from total hours). */
function advanceClock(hours: number, dtHours: number): GameState['clock'] {
  const total = hours + dtHours;
  const day = Math.floor(total / HOURS_PER_DAY) + 1;
  const week = Math.floor((day - 1) / DAYS_PER_WEEK) + 1;
  return { hours: total, day, week };
}

function runSteps(state: GameState, dtHours: number, mode: TickMode): GameState {
  let next = state;
  for (const step of TICK_STEPS) {
    if (step.modes.includes(mode)) next = step.run(next, dtHours, mode);
  }
  return next;
}

/**
 * Advance the sim by `dtHours` of in-game time with the player online: moves the
 * clock and runs the full active pipeline.
 */
export function tick(state: GameState, dtHours: number): GameState {
  if (dtHours < 0) throw new Error(`tick(): dtHours must be >= 0 (got ${dtHours})`);
  if (dtHours === 0) return state;
  const clock = advanceClock(state.clock.hours, dtHours);
  return runSteps({ ...state, clock }, dtHours, 'active');
}

/**
 * Settle `realHoursAway` of offline absence. Offline is FROZEN (GDD §6): the
 * in-game clock does NOT advance and only offline-safe steps run — laundering
 * accrues clean cash and events may queue as pending choices. Nothing here may
 * seize, kill, imprison, or advance debt/heat/the spiral.
 *
 * The invariants below are asserted defensively so a future mis-registered step
 * can never silently punish absence.
 */
export function settleOffline(state: GameState, realHoursAway: number): GameState {
  if (realHoursAway < 0) {
    throw new Error(`settleOffline(): realHoursAway must be >= 0 (got ${realHoursAway})`);
  }
  if (realHoursAway === 0) return state;

  // No clock advance: the world is frozen while away, only accrual/queueing runs.
  const settled = runSteps(state, realHoursAway, 'offline');

  // Guardrail invariants (prompts/README.md ethical checklist; design/10 §4.2).
  if (settled.debt.principal > state.debt.principal) {
    throw new Error('settleOffline(): debt increased while offline (guardrail violation)');
  }
  if (settled.runStatus === 'dead' || settled.runStatus === 'prison') {
    throw new Error('settleOffline(): run ended while offline (guardrail violation)');
  }
  if (settled.heat > state.heat) {
    throw new Error('settleOffline(): heat rose while offline (guardrail violation)');
  }

  return settled;
}
