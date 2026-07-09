/**
 * The narrative-beat engine (design/05 whole doc; GDD §2–§3, §5.4). Beats fire off
 * **simulation state, not a script** (design/05 §0): the same milestone fires the
 * same beat whenever *that* player reaches it, so every run is a personal, earned
 * story. This module owns the trigger table (design/05 §2 + the rows added by
 * design/09 & design/10) and the per-tick check; the story-card layer (Prompt 13)
 * renders the fired beats.
 *
 * The design red lines this module enforces:
 *  - **Act-defining beats are deterministic** (GDD §5.4): the macro arc (come-up →
 *    contender → kingpin → the fall) fires from thresholds every player crosses,
 *    not a variable roll. Only *texture* beats are `'variable'`.
 *  - **Loss is sequenced after wins** (design/05 §4; Sid Meier): negative beats —
 *    and the fatal death-spiral one — only fire once the player has banked a win in
 *    the arc (`hasBankedWin`), so the fall lands *after* the come-up, never before.
 *  - **Plateaus** (design/05 §3): at most `MAJOR_BEATS_PER_TICK` act-defining beat
 *    fires per tick, so escalations never bunch — deliberate pacing and the ethical
 *    anti-firehose lever. `isPlateau` marks a rest stretch for quiet character beats.
 *  - **Offline never fires beats** (GDD §6): the `beat-check` step is active-only,
 *    so absence can't trigger a beat. (Chaos may *queue* a return-hook — allowed.)
 *
 * Purity/determinism (prompts/README.md): pure predicate reads over `GameState`,
 * immutable state in → new state out, no randomness, no wall clock.
 */

import { hasBankedWin } from './deals';
import { tierForHeat } from './heat';
import { lifelineOffer } from './debt';
import { evaluateSpiral } from './endgame';
import {
  CHAOS_MAJOR_DISRUPTION_FLAG,
  CHAOS_SUPPLY_SHOCK_FLAG,
} from './config/events';
import type { GameState, PendingChoice } from './state';

/**
 * A beat's trigger confidence (design/05 §6): `deterministic` = the safe spine
 * (act-defining beats), `variable` = texture that adds personality but isn't load-
 * bearing for the arc.
 */
export type BeatTriggerType = 'deterministic' | 'variable';

/** Which act of the macro arc a beat belongs to (design/05 §1). */
export type BeatAct = 1 | 2 | 3 | 4;

/**
 * A trigger: a predicate over `GameState` bound to a `beatId` (design/05 §0).
 * `once` beats fire a single time per run (tracked in `state.beatsFired`); non-once
 * beats are recurring texture. `major` beats are act-defining and subject to
 * plateau spacing. `negative` beats are losses/setbacks — gated behind a banked win
 * so the fall always follows the come-up (design/05 §4).
 */
export interface BeatTrigger {
  readonly beatId: string;
  readonly triggerType: BeatTriggerType;
  readonly act: BeatAct;
  readonly once: boolean;
  /** Act-defining escalation — counts against the per-tick plateau cap. */
  readonly major: boolean;
  /** A loss/setback beat — only fires after the player has banked a win. */
  readonly negative: boolean;
  /** Prose the story-card layer renders (design/05 §4 — a scene, not a report). */
  readonly summary: string;
  /** The predicate: fire when the run's state satisfies this (design/05 §0). */
  readonly when: (state: GameState) => boolean;
}

/** A beat that fired this tick — handed to the story-card layer (Prompt 13). */
export interface FiredBeat {
  readonly beatId: string;
  readonly triggerType: BeatTriggerType;
}

// --- Thresholds (v1 hypotheses; Prompt 26 centralizes) -----------------------

/** Clean cash at which "you're on the map now" — the DEA opens a file (design/05 §2). */
export const ON_THE_MAP_CLEAN_CASH = 1_000_000;

/** Peak net worth at which the crown-weighs-heavy beat fires (design/05 §2). */
export const CROWN_PEAK_NET_WORTH = 10_000_000;

/** Flags other systems set that beats key off (kept as named constants, not literals). */
export const ARMS_UNLOCK_FLAG = 'arms-unlocked';
export const INTERNATIONAL_ROUTES_FLAG = 'international-routes';
export const JUDGE_COMEBACK_FLAG = 'judge-comeback';

/** At most one act-defining beat fires per tick — plateau spacing (design/05 §3). */
export const MAJOR_BEATS_PER_TICK = 1;

// --- The trigger table (design/05 §2 + design/09 & design/10 rows) -----------

/**
 * The trigger table, roughly in act order. Predicates read only from concrete
 * state signals that already exist in the sim (design/05 §0.2). District/route
 * SYSTEMS arrive in later prompts, so those rows approximate from the footprint we
 * have (a second stash = a new district; the international-routes flag = a route),
 * matching how `endgame.empireComposite` reads the same signals today.
 */
export const BEAT_TRIGGERS: readonly BeatTrigger[] = [
  // --- Act I: the come-up --------------------------------------------------
  {
    beatId: 'beat.first-sale',
    triggerType: 'deterministic',
    act: 1,
    once: true,
    major: false,
    negative: false,
    summary: 'Your first sale lands. The mentor nods — this is the life you chose.',
    when: (s) => hasBankedWin(s),
  },
  {
    beatId: 'beat.papa-cass-offer',
    triggerType: 'variable',
    act: 1,
    once: true,
    major: false,
    negative: false,
    summary: 'Papa Cass, a street shark, lets it be known his money is available — for a price.',
    // Borrowing is open from minute one (Ideas.md) — the beat is always eligible;
    // the variable-trigger pacing decides when it actually lands.
    when: () => true,
  },
  // --- Act II: the contender ----------------------------------------------
  {
    beatId: 'beat.first-district',
    triggerType: 'deterministic',
    act: 2,
    once: true,
    major: true,
    negative: false,
    summary: 'You hold a second block now. A rival sends a message — not violent yet, but a message.',
    when: (s) => s.stashes.length >= 2,
  },
  {
    beatId: 'beat.first-front',
    triggerType: 'deterministic',
    act: 2,
    once: true,
    major: true,
    negative: false,
    summary: 'Your first laundering front opens. A corrupt banker explains how clean money is made in the dark.',
    when: (s) => s.fronts.length >= 1,
  },
  {
    beatId: 'beat.port-official-offer',
    triggerType: 'variable',
    act: 2,
    once: true,
    major: false,
    negative: false,
    summary: 'A port official is on your payroll now. Doors that were shut swing open.',
    when: (s) => s.corruption.officials.length >= 1,
  },
  {
    beatId: 'beat.crew-betrayal',
    triggerType: 'variable',
    act: 2,
    once: true,
    major: false,
    negative: true, // a setback — only after a win is banked (design/05 §4)
    summary: 'One of your own is drifting. The signs are there if you read them: a betrayal arc has begun.',
    when: (s) => s.crew.some((c) => c.activeArc !== undefined),
  },
  // --- Act III: the kingpin ------------------------------------------------
  {
    beatId: 'beat.on-the-map',
    triggerType: 'deterministic',
    act: 3,
    once: true,
    major: true,
    negative: false,
    summary: "A million clean. You're on the map now — and a DEA analyst just opened a file with your name on it.",
    when: (s) => s.cleanCash >= ON_THE_MAP_CLEAN_CASH,
  },
  {
    beatId: 'beat.arms-unlock',
    triggerType: 'deterministic',
    act: 3,
    once: true,
    major: true,
    negative: false,
    summary: 'You move into arms. A whole new systems layer arrives — the game just got bigger.',
    when: (s) => s.flags[ARMS_UNLOCK_FLAG] === true,
  },
  {
    beatId: 'beat.international-route',
    triggerType: 'deterministic',
    act: 3,
    once: true,
    major: true,
    negative: false,
    summary: 'Your first international route opens. The map — and the stakes — widen.',
    when: (s) => s.flags[INTERNATIONAL_ROUTES_FLAG] === true,
  },
  {
    beatId: 'beat.heat-taskforce-named',
    triggerType: 'deterministic',
    act: 3,
    once: true,
    major: true,
    negative: false,
    summary: 'Heat crosses the line. The task force hunting you gets a name and a face — this is personal now.',
    when: (s) => tierForHeat(s.heat) === 'cia',
  },
  {
    beatId: 'beat.official-flip',
    triggerType: 'variable',
    act: 3,
    once: true,
    major: false,
    negative: true,
    summary: 'An official you paid just flipped. They are a wire now, feeding the people hunting you.',
    when: (s) => s.corruption.officials.some((o) => o.isWire === true),
  },
  {
    beatId: 'beat.crown-weighs-heavy',
    triggerType: 'deterministic',
    act: 3,
    once: true,
    major: true,
    negative: false,
    summary: 'At the peak, the crown weighs heavy. Family, vice, the cost of it all — it surfaces now.',
    when: (s) => s.highScore.peakNetWorth >= CROWN_PEAK_NET_WORTH,
  },
  // --- Act IV: the fall ----------------------------------------------------
  {
    beatId: 'beat.major-disruption',
    triggerType: 'variable',
    act: 3,
    once: true,
    major: false,
    negative: false, // recoverable: the corridor reroutes, not a wall
    summary: 'The main route is compromised — but the networks reroute. The Guyana/Suriname corridor opens.',
    when: (s) => s.flags[CHAOS_MAJOR_DISRUPTION_FLAG] === true,
  },
  {
    beatId: 'beat.supply-shock',
    triggerType: 'variable',
    act: 3,
    once: true,
    major: false,
    negative: false,
    summary: 'Prices swing hard. Fortunes are made and lost on the turn — and rivals scramble like everyone else.',
    when: (s) => s.flags[CHAOS_SUPPLY_SHOCK_FLAG] === true,
  },
  {
    beatId: 'beat.judge-saves-run',
    triggerType: 'variable',
    act: 4,
    once: true,
    major: false,
    negative: false,
    summary: 'The charges evaporate. A judge on your payroll buried it — you walk free, this time.',
    when: (s) => s.flags[JUDGE_COMEBACK_FLAG] === true,
  },
  {
    beatId: 'beat.comeback-lifeline',
    triggerType: 'variable',
    act: 4,
    once: true,
    major: false,
    negative: true, // the brink — only meaningful after wins were banked
    summary: 'Wiped, but not finished. A lender who still trusts you fronts a stake — you claw back from the brink.',
    when: (s) => lifelineOffer(s) !== null,
  },
  {
    beatId: 'beat.death-spiral',
    triggerType: 'deterministic', // act-defining: the fall is never a variable roll
    act: 4,
    once: true,
    major: true,
    negative: true,
    summary: 'Wiped, marked, and out of lifelines. The protection collapses and the hunt closes in — this is the fall.',
    when: (s) => evaluateSpiral(s).terminal,
  },
  {
    beatId: 'beat.run-ends',
    triggerType: 'deterministic',
    act: 4,
    once: true,
    major: true,
    negative: true,
    summary: 'The run is over. Then the tally — how big you got banks as your score. Beat it next run.',
    when: (s) => s.runStatus !== 'active',
  },
];

const TRIGGER_BY_ID: ReadonlyMap<string, BeatTrigger> = new Map(
  BEAT_TRIGGERS.map((t) => [t.beatId, t]),
);

// --- Evaluation --------------------------------------------------------------

/**
 * Evaluate the trigger table against the current state and return the beats that
 * should fire this tick. Respects `once` (via `state.beatsFired`), gates negative
 * beats behind a banked win (design/05 §4), and caps act-defining beats to
 * `MAJOR_BEATS_PER_TICK` so escalations never bunch (plateau spacing, design/05 §3).
 * Pure read — it never mutates; `beatStep` applies the result.
 */
export function checkBeats(state: GameState): FiredBeat[] {
  const fired: FiredBeat[] = [];
  let majorCount = 0;
  for (const t of BEAT_TRIGGERS) {
    if (t.once && state.beatsFired.includes(t.beatId)) continue;
    // Loss beats land only after the come-up has banked a win (design/05 §4).
    if (t.negative && !hasBankedWin(state)) continue;
    if (!t.when(state)) continue;
    if (t.major) {
      if (majorCount >= MAJOR_BEATS_PER_TICK) continue; // spaced to a later tick
      majorCount++;
    }
    fired.push({ beatId: t.beatId, triggerType: t.triggerType });
  }
  return fired;
}

/**
 * A plateau (design/05 §3): a rest stretch where NO act-defining beat is currently
 * ready to fire. The story-card layer surfaces quiet character beats here rather
 * than escalation. Pure read.
 */
export function isPlateau(state: GameState): boolean {
  return !BEAT_TRIGGERS.some(
    (t) =>
      t.major &&
      !(t.once && state.beatsFired.includes(t.beatId)) &&
      !(t.negative && !hasBankedWin(state)) &&
      t.when(state),
  );
}

/**
 * The `beat-check` tick step (clock.ts, active-only): fire the eligible beats,
 * record the `once` ones in `state.beatsFired` so they never repeat, and enqueue
 * each as a `PendingChoice` scene for the story-card layer (Prompt 13). Active-only
 * — offline never fires a beat (GDD §6). Pure.
 */
export function beatStep(state: GameState): GameState {
  const fired = checkBeats(state);
  if (fired.length === 0) return state;

  const newOnce = fired
    .map((f) => f.beatId)
    .filter((id) => TRIGGER_BY_ID.get(id)?.once && !state.beatsFired.includes(id));
  const beatsFired =
    newOnce.length > 0 ? [...state.beatsFired, ...newOnce] : state.beatsFired;

  const scenes: PendingChoice[] = fired.map((f) => ({
    id: `beat-${f.beatId}-${state.clock.hours}`,
    kind: 'beat',
    summary: TRIGGER_BY_ID.get(f.beatId)?.summary ?? f.beatId,
    createdAtHours: state.clock.hours,
    // The story-card presenter (Prompt 22) resolves the scene via `cardForBeat`.
    beatId: f.beatId,
  }));

  return { ...state, beatsFired, pendingChoices: [...state.pendingChoices, ...scenes] };
}
