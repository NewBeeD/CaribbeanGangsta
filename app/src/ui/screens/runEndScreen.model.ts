/**
 * The run-end screen's view-model (Prompt 23; design/07 §6; design/01 §7). PURE
 * formatting selectors that turn the store's `RunEndSummary` + cross-run meta into
 * "THE FALL — RUN OVER" — the banked tally that dares the next run.
 *
 * Two design guardrails are enforced in the COPY here (design/01 §7, design/05 §4):
 *  - Death is a **fall + a dare**, never a bare "game over" — every cause's prose
 *    frames the height reached and the run to come, not the loss.
 *  - The values shown are the **banked peaks** — a late wipe still shows how big
 *    the empire got, never zero. This module only reads `summary.recap` peaks.
 *
 * The screen composes these and dispatches `startNextRun` through the store — it
 * authors no scoring/prestige math (README UI rule).
 */

import { findPrestige, type PrestigeCategory, type RunEndCause } from '@/engine';
import type { RunEndSummary } from '@/store';
import type { MetaProgress } from '@/store';

/** "$2,400,000" — plain money formatting (display only). */
export function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// --- The fall, framed as a dare (design/01 §7; design/05 §4) -------------------

/** The fall prose per cause — the height and the dare, never a bare "you lost". */
const FALL_PROSE: Readonly<Record<RunEndCause, string>> = {
  killed:
    'The streets finally collected. But look at the height you fell from — ' +
    'nobody takes the climb off the books.',
  prison:
    'They took you alive, and the ledger still reads like a legend. ' +
    'The score is banked; the story is not over.',
  arrested:
    'You drove it yourself and they were waiting on the water. No bond, no ' +
    'walk — but the height you reached is banked, and the water is still out there.',
  retired:
    'You walked out on top, on your own terms. That number is banked — ' +
    'now it is the one to beat.',
  abandoned:
    'You torched it and walked — a clean slate on your own terms. The score so ' +
    'far is banked; the next city is waiting.',
};

export function fallProse(cause: RunEndCause): string {
  return FALL_PROSE[cause];
}

/** The short cause tag under the headline ("KILLED" / "TAKEN" / "WALKED"). */
export function causeStamp(cause: RunEndCause): string {
  return cause === 'killed'
    ? 'KILLED'
    : cause === 'prison'
      ? 'TAKEN'
      : cause === 'arrested'
        ? 'CUFFED'
        : cause === 'abandoned'
          ? 'WALKED AWAY'
          : 'WALKED';
}

// --- Farthest act (design/07 §6 "Farthest act: III — Kingpin") -----------------

/** Week thresholds → act labels (display grouping only; the engine tracks weeks). */
export function actLabel(week: number): string {
  if (week >= 8) return 'III — Kingpin';
  if (week >= 4) return 'II — The Connect';
  return 'I — The Come-Up';
}

// --- Personal best & leaderboard lines (design/07 §6) --------------------------

export interface BestLine {
  readonly newBest: boolean;
  /** "✓ new personal best" or "✗ $300,000 short" — the chase made concrete. */
  readonly text: string;
}

export function bestLine(summary: RunEndSummary): BestLine {
  if (summary.newPersonalBest) {
    return { newBest: true, text: '✓ New personal best' };
  }
  if (summary.shortBy > 0) {
    return { newBest: false, text: `✗ ${money(summary.shortBy)} short` };
  }
  return { newBest: false, text: '✗ Matched your best — one dollar more next run' };
}

/** "#3 on the island (local board)" or `null` when unranked/board unavailable. */
export function rankLine(summary: RunEndSummary): string | null {
  return summary.rank === null ? null : `#${summary.rank} on the island (local board)`;
}

// --- Prestige unlocked (GDD §7 — NON-POWER only) -------------------------------

/** What each (closed, power-free) category reads as on the recap. */
const CATEGORY_LABEL: Readonly<Record<PrestigeCategory, string>> = {
  roster: 'new face for future runs',
  scenario: 'new starting scenario',
  cosmetic: 'title',
};

export interface PrestigeView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The non-power kind, spelled out ("new starting scenario" — never a stat). */
  readonly categoryLabel: string;
}

/** Resolve unlock ids to display views (unknown ids drop silently — tolerant UI). */
export function prestigeViews(ids: readonly string[]): readonly PrestigeView[] {
  return ids.flatMap((id) => {
    const cfg = findPrestige(id);
    if (!cfg) return [];
    return [
      {
        id: cfg.id,
        name: cfg.name,
        description: cfg.description,
        categoryLabel: CATEGORY_LABEL[cfg.category],
      },
    ];
  });
}

// --- The whole recap view (design/07 §6) ---------------------------------------

export interface RunEndView {
  readonly cause: RunEndCause;
  readonly causeStamp: string;
  readonly fallProse: string;
  /** Peak net worth — the banked score (← banked). */
  readonly peakNetWorth: number;
  /** This run's peak empire composite, and the best ever across runs. */
  readonly peakEmpireSize: number;
  readonly bestEmpireSize: number;
  readonly rivalsToppled: number;
  readonly farthestAct: string;
  readonly weeksSurvived: number;
  readonly best: BestLine;
  readonly rankLine: string | null;
  readonly prestige: readonly PrestigeView[];
  /** The cliffhanger the screen ends on. */
  readonly dare: string;
}

export function runEndView(summary: RunEndSummary, meta: MetaProgress): RunEndView {
  return {
    cause: summary.cause,
    causeStamp: causeStamp(summary.cause),
    fallProse: fallProse(summary.cause),
    peakNetWorth: summary.recap.peakNetWorth,
    peakEmpireSize: summary.recap.peakEmpireSize,
    bestEmpireSize: Math.max(meta.bestEmpireSize, summary.recap.peakEmpireSize),
    rivalsToppled: summary.recap.rivalsToppled,
    farthestAct: actLabel(summary.recap.week),
    weeksSurvived: summary.recap.week,
    best: bestLine(summary),
    rankLine: rankLine(summary),
    prestige: prestigeViews(summary.unlockedPrestige),
    dare: 'Beat it next run.',
  };
}
