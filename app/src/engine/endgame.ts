/**
 * The run's terminal logic (design/01 §4a, §7; GDD §7, §8): the readable
 * **death-spiral chain**, **permadeath**, and the **high-score chase** that
 * persists past death and pulls the next run.
 *
 * Two things this module guarantees, both design red lines:
 *
 *  - **Death is earned and readable, never a cheap dice death.** `evaluateSpiral`
 *    exposes each rung of the chain (wipe → can't pay → protection collapses →
 *    hunted) as an inspectable step the UI telegraphs BEFORE the fatal one, plus
 *    the in-fiction exits (lifeline / liquidate / go to ground). The run only
 *    reaches `terminal` when hunted AND no exit is available. Nothing here ends a
 *    run on a tick — `endRun` is only ever called from an explicit, in-game player
 *    decision or the telegraphed last rung, so absence can never kill you (GDD §8).
 *  - **Score banks from PEAK values.** `bankPeaks` (the active-only `peak-tracking`
 *    tick step) keeps `highScore` at the max reached, so a late-game wipe still
 *    records the height climbed — death is thrilling, not demoralizing (design/01
 *    §7). `endRun` banks that peak the instant the run ends.
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in → new
 * state out, no `Math.random`, no wall clock, no RNG at all — the spiral is a
 * deterministic read of the run's situation. Persisting the banked score across
 * permadeath is the STORE's job (`store/metaProgress.ts` `bankScore`); the engine
 * only produces the `RunEndResult`.
 */

import { judgeCanDismiss } from './corruption';
import { isDebtMarked, lifelineOffer } from './debt';
import { PRESTIGE_UNLOCKS } from './config/prestige';
import {
  debtOwed,
  netWorth,
  totalDirtyCash,
  type GameState,
  type HighScore,
  type RunStatus,
} from './state';

// --- Empire-size composite & peak tracking (design/01 §7) --------------------

/** The in-game "act" a run has reached — the farthest-progress term (design/01 §7). */
export function actReached(state: GameState): number {
  return state.clock.week;
}

/**
 * The empire-size composite `w1·districts + w2·routes + w3·fronts + w4·crew +
 * w5·act` (design/01 §7). The district/route/act SYSTEMS arrive in later prompts,
 * so today they resolve from the concrete signals we have:
 *   - **districts** ≈ distinct countries the player holds a stash in (footprint);
 *   - **routes** ≈ distinct countries beyond home (smuggling reach);
 *   - **fronts / crew** are counted directly; **act** is the in-game week.
 * Weighted, so a paradigm-shift (a new district/route) moves the score more than
 * one more front — matching the design's intent for what "getting big" means.
 */
export function empireComposite(state: GameState): number {
  const countries = new Set(state.stashes.map((s) => s.countryId));
  const districts = countries.size;
  const homeCountry = state.world.startingCountry.id;
  const routes = [...countries].filter((c) => c !== homeCountry).length;
  const w = state.config.prestige.EMPIRE_WEIGHTS;
  return (
    w.district * districts +
    w.route * routes +
    w.front * state.fronts.length +
    w.crew * state.crew.length +
    w.act * actReached(state)
  );
}

/**
 * Raise every peak tracker to the current value (design/01 §7 — score banks from
 * peaks). Pure and monotonic: peaks only ever climb, so a later loss can't lower
 * the banked height. Registered as the active-only `peak-tracking` tick step, and
 * called by `endRun` so the final tally reflects the true max reached.
 */
export function bankPeaks(state: GameState): GameState {
  const { highScore } = state;
  const next: HighScore = {
    peakNetWorth: Math.max(highScore.peakNetWorth, netWorth(state)),
    peakCleanCash: Math.max(highScore.peakCleanCash, state.cleanCash),
    peakEmpireSize: Math.max(highScore.peakEmpireSize, empireComposite(state)),
  };
  if (
    next.peakNetWorth === highScore.peakNetWorth &&
    next.peakCleanCash === highScore.peakCleanCash &&
    next.peakEmpireSize === highScore.peakEmpireSize
  ) {
    return state;
  }
  return { ...state, highScore: next };
}

// --- The death-spiral chain (design/01 §4a) ----------------------------------

/** The rungs of the spiral, in order — plus `stable` (not in it) and `terminal` (no way out). */
export type SpiralStage =
  | 'stable'
  | 'wiped'
  | 'cant-pay'
  | 'protection-collapsed'
  | 'hunted'
  | 'terminal';

/** One inspectable rung of the chain — `active` true once the run has reached it. */
export interface SpiralStep {
  readonly stage: Exclude<SpiralStage, 'stable' | 'terminal'>;
  readonly active: boolean;
  /** Readable prose the UI telegraphs (design/01 §4a — every step shown). */
  readonly detail: string;
}

/** An in-fiction way out of the spiral (design/01 §4a — all telegraphed). */
export interface SpiralExit {
  readonly kind: 'lifeline' | 'liquidate' | 'go-to-ground';
  readonly available: boolean;
  readonly detail: string;
}

export interface SpiralStatus {
  /** The furthest rung reached right now. */
  readonly stage: SpiralStage;
  /** All four rungs, each inspectable so the UI can show the whole chain. */
  readonly steps: readonly SpiralStep[];
  /** The exits and whether each is available to take right now. */
  readonly exits: readonly SpiralExit[];
  /** True ONLY when hunted and no exit is available — the run can now end. */
  readonly terminal: boolean;
}

/** Operating capital = all clean + dirty cash (design/01 §4a — "→ ~0" is a wipe). */
export function operatingCapital(state: GameState): number {
  return state.cleanCash + totalDirtyCash(state);
}

/** Weekly obligations that come due — payroll retainers + any active loan balance. */
function obligations(state: GameState): number {
  return state.corruption.payrollPerWeek + (state.debt.active ? debtOwed(state.debt) : 0);
}

/** Count of embedded wires (flipped crew + flipped officials) — protection turning on you. */
function wireCount(state: GameState): number {
  return (
    state.crew.filter((c) => c.isWire).length +
    state.corruption.officials.filter((o) => o.isWire).length
  );
}

function maxRivalTension(state: GameState): number {
  return state.rivals.reduce((m, r) => Math.max(m, r.tension), 0);
}

/**
 * Evaluate the death-spiral chain as an inspectable, telegraphable status
 * (design/01 §4a). Pure read — it NEVER mutates the run or ends it. The chain is
 * strictly sequential (each rung requires the one before), and `terminal` is true
 * only at the last rung with no exit left — which is exactly when the UI is allowed
 * to offer the consensual, telegraphed final choice.
 */
export function evaluateSpiral(state: GameState): SpiralStatus {
  const P = state.config.prestige;
  const capital = operatingCapital(state);
  const wiped = capital <= state.config.stashes.WIPE_CAPITAL_THRESHOLD;
  const cantPay = wiped && obligations(state) > capital;
  const protectionCollapsed =
    cantPay && (wireCount(state) > 0 || state.heat >= P.SPIRAL_HEAT_UNMANAGED);
  const hunted =
    protectionCollapsed &&
    (isDebtMarked(state) ||
      maxRivalTension(state) >= P.SPIRAL_RIVAL_HUNTED ||
      state.heat >= P.SPIRAL_HEAT_HUNTED);

  const exits: SpiralExit[] = [
    {
      kind: 'lifeline',
      available: lifelineOffer(state) !== null,
      detail: 'A lender who still trusts you will front a stake — reputation keeps the door open.',
    },
    {
      kind: 'liquidate',
      available: state.fronts.length > 0,
      detail: 'Dump fronts and assets fast, at a haircut, to make payroll.',
    },
    {
      kind: 'go-to-ground',
      available: state.crew.length > 0 || state.heat > 0 || state.stashes.length > 0,
      detail: 'Shed crew, abandon territory, cut heat — rebuild small.',
    },
  ];
  const anyExit = exits.some((e) => e.available);

  const steps: SpiralStep[] = [
    {
      stage: 'wiped',
      active: wiped,
      detail: 'You sank everything and lost it. Operating capital is gone.',
    },
    {
      stage: 'cant-pay',
      active: cantPay,
      detail: "Crew, payroll, and loan installments are due — and you can't cover them.",
    },
    {
      stage: 'protection-collapsed',
      active: protectionCollapsed,
      detail: 'Unpaid people walk or flip and your heat runs unmanaged. Your cover is gone.',
    },
    {
      stage: 'hunted',
      active: hunted,
      detail: 'With no protection, a rival, a stiffed shark, or the state is moving on you.',
    },
  ];

  const terminal = hunted && !anyExit;
  const stage: SpiralStage = terminal
    ? 'terminal'
    : hunted
      ? 'hunted'
      : protectionCollapsed
        ? 'protection-collapsed'
        : cantPay
          ? 'cant-pay'
          : wiped
            ? 'wiped'
            : 'stable';

  return { stage, steps, exits, terminal };
}

// --- Prestige (design/01 §7; GDD §7 — non-power) -----------------------------

/** The peak/terminal stats a run's prestige unlocks are measured against. */
export interface RunStats {
  readonly peakNetWorth: number;
  readonly peakEmpireSize: number;
  readonly rivalsToppled: number;
  readonly weeksSurvived: number;
}

/** Snapshot the stats used for scoring & prestige from a (peak-banked) run. */
export function runStats(state: GameState): RunStats {
  return {
    peakNetWorth: state.highScore.peakNetWorth,
    peakEmpireSize: state.highScore.peakEmpireSize,
    rivalsToppled: state.rivals.filter((r) => r.toppled).length,
    weeksSurvived: state.clock.week,
  };
}

/**
 * The ids of every prestige unlock a run's stats have EARNED (design/01 §7). Pure
 * threshold check against the non-power roster — deterministic and order-stable.
 */
export function evaluatePrestige(stats: RunStats): readonly string[] {
  return PRESTIGE_UNLOCKS.filter((p) => {
    switch (p.requirement.kind) {
      case 'peak-net-worth':
        return stats.peakNetWorth >= p.requirement.threshold;
      case 'rivals-toppled':
        return stats.rivalsToppled >= p.requirement.threshold;
      case 'weeks-survived':
        return stats.weeksSurvived >= p.requirement.threshold;
    }
  }).map((p) => p.id);
}

// --- Ending a run (design/01 §7; design/07 §6 run-end) -----------------------

export type RunEndCause = 'killed' | 'prison' | 'retired' | 'abandoned';

/** The run-recap tally shown at the end — a fall, then the numbers that dare the next run. */
export interface RunRecap {
  readonly cause: RunEndCause;
  readonly seed: string;
  readonly day: number;
  readonly week: number;
  readonly peakNetWorth: number;
  readonly peakCleanCash: number;
  readonly peakEmpireSize: number;
  readonly rivalsToppled: number;
}

export interface RunEndResult {
  /** The run with `runStatus` set (or unchanged, if a judge granted a comeback). */
  readonly state: GameState;
  readonly cause: RunEndCause;
  /** The banked score = peak net worth (design/01 §7). */
  readonly score: number;
  readonly recap: RunRecap;
  /** The run-end scene the presenter renders (design/07 §6). */
  readonly sceneKey: string;
  /** Prestige unlock ids this run earned (the store folds these into meta). */
  readonly unlockedPrestige: readonly string[];
  /** True when a payrolled judge converted a `prison` end into a survivable comeback. */
  readonly comeback: boolean;
}

/** Map an end cause onto the persisted `RunStatus`. Abandoning banks like a
 * retirement — the player chose to reset; that choice costs nothing (design/12
 * Item 2; the retire guarantee, design/01 §7). */
function statusForCause(cause: RunEndCause): RunStatus {
  return cause === 'killed' ? 'dead' : cause === 'prison' ? 'prison' : 'retired';
}

/**
 * End the run (design/01 §7; design/07 §6). Banks peaks one last time, sets
 * `runStatus`, and produces the recap + prestige unlocks + run-end scene key. The
 * banked `score` is peak net worth, so how BIG you got is what's rewarded — a fall,
 * not a zeroing-out.
 *
 * A payrolled judge (Prompt 09) can convert a `prison` end into a survivable
 * comeback: the run stays `active`, no score is banked, and the scene is the
 * charges-dismissed beat instead of a run-end. Death/retire have no such reprieve.
 * This function never rolls dice and is only ever called from an explicit, in-game,
 * telegraphed decision — so it can't fire from absence (GDD §8).
 */
export function endRun(state: GameState, cause: RunEndCause): RunEndResult {
  const banked = bankPeaks(state);
  const stats = runStats(banked);
  const recapBase = {
    seed: banked.seed,
    day: banked.clock.day,
    week: banked.clock.week,
    peakNetWorth: banked.highScore.peakNetWorth,
    peakCleanCash: banked.highScore.peakCleanCash,
    peakEmpireSize: banked.highScore.peakEmpireSize,
    rivalsToppled: stats.rivalsToppled,
  };

  // A judge on the payroll buries the charge — a comeback, not a run-end (Prompt 09).
  if (cause === 'prison' && judgeCanDismiss(banked)) {
    return {
      state: banked, // still active — the run continues
      cause,
      score: 0,
      recap: { ...recapBase, cause },
      sceneKey: 'runend.comeback',
      unlockedPrestige: [],
      comeback: true,
    };
  }

  return {
    state: { ...banked, runStatus: statusForCause(cause) },
    cause,
    score: banked.highScore.peakNetWorth,
    recap: { ...recapBase, cause },
    sceneKey: `runend.${cause}`,
    unlockedPrestige: evaluatePrestige(stats),
    comeback: false,
  };
}

/**
 * Voluntarily retire — bank the current run and walk away (design/01 §7). No
 * penalty: it's just `endRun` with the `retired` cause, so the score banks exactly
 * as it would on death. The player chose to reset; that choice costs nothing.
 */
export function retire(state: GameState): RunEndResult {
  return endRun(state, 'retired');
}

// --- Legacy / heir — PARKED (design/01 §7 "Parked"; GDD §7) ------------------

/**
 * PARKED SEAM — do not build against this. The v1.0 heir-inheritance idea (an heir
 * inherits a % of clean assets plus compounding multipliers) is shelved with Legacy
 * mode because compounding power would dilute the high-score stakes (design/01 §7,
 * GDD §7). This flag exists only to mark the seam; it is permanently `false` in v1.
 * If Legacy ever returns as an optional lower-stakes mode, its math lands here.
 */
export const LEGACY_MODE_ENABLED = false as const;
