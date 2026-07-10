/**
 * The injected-time clock. Online, the sim advances ONLY through
 * `tick(state, dtHours)` — never by reading a wall clock inside the engine
 * (prompts/README.md "Time is injected"). This is what keeps the sim
 * deterministic and lets the store compute elapsed real time and feed it in.
 *
 * Per-tick systems (heat decay, laundering accrual, debt interest, chaos rolls,
 * beat checks) are registered as small pure steps in `TICK_STEPS`, run in a
 * defined order. Later prompts fill the placeholder steps they own.
 *
 * Offline is frozen/safe (GDD §6; design/10 §4.2): the return-from-away payoff is
 * settled by `laundering.settleOffline` (Prompt 07), which only adds clean cash
 * and queues return hooks — it never advances heat, debt, or the death spiral,
 * never seizes, never kills. The active `TICK_STEPS` are all `'active'`-only for
 * anything that could punish absence; nothing runs on the frozen offline path.
 */

import type { GameState } from './state';
import { restoreRng } from './rng';
import { driftPrices } from './deals';
import { applyHeatEscalation, decayHeat } from './heat';
import { raidStep } from './storage';
import { travelStep } from './travel';
import { accrue } from './laundering';
import { crewStep } from './crew';
import { corruptionStep } from './corruption';
import { debtStep } from './debt';
import { chaosStep } from './chaos';
import { beatStep } from './beats';
import { bankPeaks } from './endgame';

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
  { id: 'heat-decay', modes: ['active'], run: (s, dt) => decayHeat(s, dt) },
  // Telegraph an LE-tier crossing after decay/accrual shift heat (design/07 §5).
  // Prompt 05. Active-only, and fires each crossing exactly once.
  { id: 'heat-escalation', modes: ['active'], run: (s) => applyHeatEscalation(s) },
  // Roll for a raid on a single stash and resolve the seizure (design/01 §4;
  // design/09 A). Prompt 05 (`rollRaid`) decides whether/where; Prompt 06
  // (`raidStep` → `resolveRaid`) applies the seizure and queues the scene.
  // Active-only: offline is safe (GDD §6) — no raid fires while the player is away.
  { id: 'raid-roll', modes: ['active'], run: (s, dt) => raidStep(s, dt) },
  // Shipments in flight resolve their arrivals/interdictions (design/11 §3;
  // Prompt 30). ACTIVE-only: in-flight cargo is frozen while the player is
  // away — never delivered, never seized offline (GDD §6). The roll compares
  // one RNG draw against the odds snapshotted at launch (fairness law).
  { id: 'travel', modes: ['active'], run: (s, dt) => travelStep(s, dt) },
  // Laundering fronts accrue clean cash + apply their passive heat footprint
  // (design/01 §3). Prompt 07. Active-only: the offline return payoff is settled
  // separately by `laundering.settleOffline` on its own piecewise curve.
  { id: 'laundering-accrual', modes: ['active'], run: (s, dt) => accrue(s, dt) },
  // Crew: advance betrayal arcs one telegraphed stage, then apply any flipped-wire
  // heat (design/02 §4). Prompt 08. Active-only: offline never advances an arc or a
  // wire's heat (GDD §6). Deterministic — the arc uses no randomness.
  { id: 'crew', modes: ['active'], run: (s, dt) => crewStep(s, dt) },
  // Corruption: settle weekly retainers on the weekly boundary (from clean cash),
  // let officials ask for raises, advance flip arcs one telegraphed stage, then
  // apply flipped-official wire heat (design/09 B.2). Prompt 09. Active-only:
  // offline never charges a retainer or advances a flip, so absence is safe
  // (GDD §6). Deterministic — the flip arc uses no randomness.
  { id: 'corruption', modes: ['active'], run: (s, dt) => corruptionStep(s, dt) },
  // Debt interest + default ladder (design/10). Prompt 10. Active-only AND only
  // when debt.active: accrues interest per in-game day played, then advances the
  // telegraphed default ladder one rung past the soft due date. Offline never runs
  // it, so absence never grows what's owed or escalates (guarantee #2, §4.2).
  { id: 'debt-interest', modes: ['active'], run: (s, dt) => debtStep(s, dt) },
  // Procedural world events — the variable-reward core (design/05 §2; design/01
  // §4.7). Prompt 12. Active-only: offline is frozen/safe, so absence never
  // triggers chaos (GDD §6). Draws from an INDEPENDENT run-seeded stream, so it
  // never perturbs the main deal/raid RNG. Runs after the economic systems so a
  // shock lands on this tick's settled prices/heat.
  { id: 'chaos-roll', modes: ['active'], run: (s, dt) => chaosStep(s, dt) },
  // Narrative-beat checks — state → beats, not a script (design/05 §0). Prompt 12
  // (Prompt 13 renders them). Active-only (offline never fires a beat, GDD §6),
  // and AFTER chaos so beats can key off the flags a fired event just stamped.
  { id: 'beat-check', modes: ['active'], run: (s) => beatStep(s) },
  // Peak trackers: bank net-worth / clean-cash / empire-composite peaks after every
  // system above has settled (design/01 §7). Prompt 11. Active-only and LAST, so the
  // banked height reflects this tick's true max. Offline peak banking is handled by
  // `laundering.settleOffline` (clean cash only; empire size can't grow while away).
  { id: 'peak-tracking', modes: ['active'], run: (s) => bankPeaks(s) },
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

// Offline settlement (return-from-away payoff) lives in `laundering.ts` —
// `settleOffline(state, realHoursAway) → { state, report }` — the concrete
// implementation of Prompt 03's hook. It is frozen/safe by construction (adds
// only, never advances the clock or any punishing system).
