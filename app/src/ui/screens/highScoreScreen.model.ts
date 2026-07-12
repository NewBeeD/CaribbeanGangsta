/**
 * The standalone High Score screen's view-model (Prompt 23; design/01 §7; GDD
 * §12). PURE formatting selectors over the cross-run surfaces: the meta profile
 * (personal best, prestige earned, runs played) and the leaderboard's entries
 * (boards + run history). Every board here is ASPIRATIONAL mastery display —
 * there is no purchasable rank anywhere (GDD §12, §8).
 *
 * The screen composes these over the store's `Leaderboard` adapter — local-first;
 * the remote is a drop-in stub nothing here depends on (prompts/README.md).
 */

import type { RunEndCause } from '@/engine';
import type { LeaderboardEntry, MetaProgress } from '@/store';
import { prestigeViews, type PrestigeView } from './runEndScreen.model';

export { money } from './runEndScreen.model';
export type { PrestigeView };

/** How a run ended, as a short board tag. */
const CAUSE_LABEL: Readonly<Record<RunEndCause, string>> = {
  killed: 'Killed',
  prison: 'Taken',
  retired: 'Walked',
  abandoned: 'Walked',
};

/** "Jul 10" — board-row date from the entry's wall-clock end (display only). */
function whenLabel(endedAt: number): string {
  return new Date(endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- Boards (top N, best first) ------------------------------------------------

export interface BoardRow {
  readonly id: string;
  readonly rank: number;
  readonly score: number;
  readonly when: string;
  readonly causeLabel: string;
  readonly weeksSurvived: number;
}

/** Ranked rows from a board query's already-sorted entries. */
export function boardRows(entries: readonly LeaderboardEntry[]): readonly BoardRow[] {
  return entries.map((e, i) => ({
    id: e.id,
    rank: i + 1,
    score: e.score,
    when: whenLabel(e.endedAt),
    causeLabel: CAUSE_LABEL[e.cause],
    weeksSurvived: e.weeksSurvived,
  }));
}

// --- Run history (newest first) --------------------------------------------------

export interface HistoryRow {
  readonly id: string;
  readonly when: string;
  readonly score: number;
  readonly causeLabel: string;
  readonly weeksSurvived: number;
}

export function historyRows(entries: readonly LeaderboardEntry[]): readonly HistoryRow[] {
  return entries.map((e) => ({
    id: e.id,
    when: whenLabel(e.endedAt),
    score: e.score,
    causeLabel: CAUSE_LABEL[e.cause],
    weeksSurvived: e.weeksSurvived,
  }));
}

// --- The cross-run profile summary ----------------------------------------------

export interface ProfileView {
  readonly personalBest: number;
  readonly bestEmpireSize: number;
  readonly runsPlayed: number;
  readonly rivalsToppledTotal: number;
  /** Prestige earned across all runs — non-power by construction (GDD §7). */
  readonly prestige: readonly PrestigeView[];
}

export function profileView(meta: MetaProgress): ProfileView {
  return {
    personalBest: meta.personalBest,
    bestEmpireSize: meta.bestEmpireSize,
    runsPlayed: meta.runsPlayed,
    rivalsToppledTotal: meta.rivalsToppledTotal,
    prestige: prestigeViews(meta.unlockedPrestige),
  };
}
