/**
 * Pure telemetry derivation (Prompt 25). The engine never emits events itself —
 * it stays pure — so tick-driven happenings (raids, shipment resolutions, beats,
 * chaos, flips, payroll, the debt ladder, the spiral) are recovered here by
 * DIFFING the state a tick consumed against the state it produced. Everything in
 * this module is a pure function of two `GameState`s, so it is deterministic and
 * unit-testable without a bus.
 *
 * Also home to the two AUDITS the ethical guardrails demand:
 * - `fairnessReport` — displayed odds ≈ realized odds in aggregate (design/01
 *   §0.3; GDD §8), over the `odds_audit` rows every risk surface emits.
 * - `auditOfflineFreeze` — real-world absence never moves owed balance, heat,
 *   assets, the ladder, or the spiral against the player (design/10 §6; GDD §6).
 */

import {
  debtOwed,
  totalDirtyCash,
  type GameState,
  type PendingChoice,
  type Stash,
} from '@/engine/state';
import { cleanCashRate } from '@/engine/laundering';
import { evaluateSpiral, type SpiralStage } from '@/engine/endgame';
import {
  diversificationIndex,
  effectiveSeizurePct,
  stashUnits,
  totalUnits,
  WIPED_CAPITAL_FLAG,
} from '@/engine/storage';
import { isDebtMarked } from '@/engine/debt';
import { CHAOS_FLAG_PREFIX } from '@/engine/config/events';
import { cardForPending } from '@/engine/cards';
import type {
  AnyTelemetryEvent,
  OddsSurface,
  TelemetryEventMap,
  TelemetryEventName,
} from './bus';

/** A derived event: name + props, not yet stamped by the bus. */
export type DerivedEvent = {
  [K in TelemetryEventName]: { readonly name: K; readonly props: TelemetryEventMap[K] };
}[TelemetryEventName];

/** The session-end open-loop card (design/07 §7; cards/content/onboarding.ts). */
export const SESSION_END_FLAG = 'session_end_hook_shown';

const HOURS_PER_WEEK = 24 * 7;

function findStash(state: GameState, id: string): Stash | null {
  return state.stashes.find((s) => s.id === id) ?? null;
}

/** Pending choices present in `next` but not `prev` (id-keyed). */
function newChoices(prev: GameState, next: GameState): readonly PendingChoice[] {
  const seen = new Set(prev.pendingChoices.map((c) => c.id));
  return next.pendingChoices.filter((c) => !seen.has(c.id));
}

/** `raid-<stashId>-<hours>` → `<stashId>` (stash ids may themselves contain dashes). */
function raidStashId(choiceId: string): string {
  return choiceId.slice('raid-'.length, choiceId.lastIndexOf('-'));
}

function raidEvents(prev: GameState, next: GameState): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  for (const choice of newChoices(prev, next)) {
    if (choice.kind !== 'raid') continue;
    const stashId = raidStashId(choice.id);
    const before = findStash(prev, stashId);
    const after = findStash(next, stashId);
    if (!before) continue;
    const unitsLost = Math.max(0, stashUnits(before) - (after ? stashUnits(after) : 0));
    const cashLost = Math.max(0, before.dirtyCash - (after ? after.dirtyCash : 0));
    const seized = unitsLost > 0 || cashLost > 0;
    const heldBefore = totalUnits(prev);
    events.push({
      name: 'raid_resolved',
      props: {
        stashId,
        seized,
        unitsLost,
        cashLost,
        lossPct: heldBefore > 0 ? unitsLost / heldBefore : 0,
        diversification: diversificationIndex(prev),
        wiped: next.flags[WIPED_CAPITAL_FLAG] === true && prev.flags[WIPED_CAPITAL_FLAG] !== true,
      },
    });
    // Fairness row: the seizure rolled at exactly the % the prev state displayed.
    events.push({
      name: 'odds_audit',
      props: { surface: 'raid', displayed: effectiveSeizurePct(prev, stashId), hit: seized },
    });
  }
  return events;
}

function shipmentEvents(prev: GameState, next: GameState): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  const audit = (mode: string, displayed: number, seized: boolean): void => {
    events.push({ name: 'shipment_resolved', props: { mode, seized, displayedOdds: displayed } });
    events.push({ name: 'odds_audit', props: { surface: 'shipment', displayed, hit: seized } });
  };

  for (const choice of newChoices(prev, next)) {
    if (choice.kind === 'shipment-seized') {
      const shipment = prev.shipments.find((s) => choice.id === `shipment-seized-${s.id}`);
      if (shipment) audit(shipment.mode, shipment.interdictionChance, true);
    } else if (choice.kind === 'shipment-arrived') {
      const shipment = prev.shipments.find((s) => choice.id === `shipment-arrived-${s.id}`);
      // A load that had already `cleared` its roll was recorded when it cleared —
      // delivery later is not a second roll (fairness: one draw per shipment).
      if (shipment && !shipment.cleared) audit(shipment.mode, shipment.interdictionChance, false);
    }
  }
  // Survived-but-waiting loads (destination full): the roll happened this tick.
  for (const shipment of next.shipments) {
    if (!shipment.cleared) continue;
    const before = prev.shipments.find((s) => s.id === shipment.id);
    if (before && !before.cleared) audit(shipment.mode, shipment.interdictionChance, false);
  }
  return events;
}

function storyEvents(prev: GameState, next: GameState): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  for (const beatId of next.beatsFired) {
    if (!prev.beatsFired.includes(beatId)) events.push({ name: 'beat_fired', props: { beatId } });
  }
  for (const choice of newChoices(prev, next)) {
    if (!choice.beatId && !choice.cardId) continue;
    const card = cardForPending(next, choice);
    if (!card) continue;
    events.push({ name: 'story_flag', props: { flag: card.telemetryFlag, cardId: card.id } });
    if (card.telemetryFlag === SESSION_END_FLAG) {
      events.push({ name: 'session_end_reached', props: { cardId: card.id } });
    }
  }
  for (const [flag, set] of Object.entries(next.flags)) {
    if (!set || prev.flags[flag] === true) continue;
    if (flag.startsWith(CHAOS_FLAG_PREFIX)) events.push({ name: 'chaos_event', props: { flag } });
  }
  return events;
}

function wireFlipEvents(prev: GameState, next: GameState): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  for (const official of next.corruption.officials) {
    const before = prev.corruption.officials.find((o) => o.id === official.id);
    if (official.isWire && before && !before.isWire) {
      events.push({ name: 'official_flipped', props: { officialId: official.id } });
    }
  }
  for (const crew of next.crew) {
    const before = prev.crew.find((c) => c.id === crew.id);
    if (crew.isWire && before && !before.isWire) {
      events.push({ name: 'crew_flipped', props: { crewId: crew.id } });
    }
  }
  return events;
}

function ledgerEvents(prev: GameState, next: GameState): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  // Weekly payroll settled (design/09 B.2): sink health vs. clean income.
  if (next.corruption.lastPayrollWeek > prev.corruption.lastPayrollWeek) {
    const payrollPerWeek = prev.corruption.payrollPerWeek;
    const idleRatePerHour = cleanCashRate(next);
    const weeklyIncome = idleRatePerHour * HOURS_PER_WEEK;
    events.push({
      name: 'payroll_charged',
      props: {
        payrollPerWeek,
        idleRatePerHour,
        pctOfCleanIncome: weeklyIncome > 0 ? payrollPerWeek / weeklyIncome : 0,
      },
    });
  }
  // The default ladder advanced a telegraphed rung (design/10 §5).
  if (next.debt.active && next.debt.ladderRung > prev.debt.ladderRung) {
    events.push({
      name: 'debt_ladder_advanced',
      props: { rung: next.debt.ladderRung, marked: isDebtMarked(next) },
    });
  }
  return events;
}

/**
 * Everything a tick did, as telemetry (raids, shipments, beats, cards, chaos,
 * flips, payroll, the ladder, and any spiral-stage crossing). Pure in
 * `(prev, next)`; the caller stamps the rows through the bus.
 */
export function deriveTickEvents(prev: GameState, next: GameState): DerivedEvent[] {
  if (prev === next) return [];
  const events: DerivedEvent[] = [
    ...raidEvents(prev, next),
    ...shipmentEvents(prev, next),
    ...storyEvents(prev, next),
    ...wireFlipEvents(prev, next),
    ...ledgerEvents(prev, next),
  ];
  const prevStage = evaluateSpiral(prev).stage;
  const stage = evaluateSpiral(next).stage;
  if (stage !== prevStage) events.push({ name: 'spiral_stage', props: { stage, prevStage } });
  return events;
}

// --- Fairness audit (design/01 §0.3; GDD §8) -----------------------------------

export interface FairnessSurfaceReport {
  readonly surface: OddsSurface | 'all';
  readonly samples: number;
  /** Mean displayed odds — what the player was told, on average. */
  readonly expected: number;
  /** Realized bad-outcome rate — what actually happened. */
  readonly observed: number;
  /** |expected − observed|, the aggregate fairness gap. */
  readonly gap: number;
  /** True when the gap is inside tolerance (or too few samples to judge). */
  readonly withinTolerance: boolean;
}

export interface FairnessReport {
  readonly all: FairnessSurfaceReport;
  readonly surfaces: readonly FairnessSurfaceReport[];
  /** False only when some judged surface is out of tolerance. */
  readonly fair: boolean;
}

/** Below this many rolls a surface is reported but not judged (too noisy). */
export const FAIRNESS_MIN_SAMPLES = 30;

function summarizeOdds(
  surface: OddsSurface | 'all',
  rows: readonly { readonly displayed: number; readonly hit: boolean }[],
  tolerance: number,
): FairnessSurfaceReport {
  const samples = rows.length;
  const expected = samples > 0 ? rows.reduce((s, r) => s + r.displayed, 0) / samples : 0;
  const observed = samples > 0 ? rows.filter((r) => r.hit).length / samples : 0;
  const gap = Math.abs(expected - observed);
  return {
    surface,
    samples,
    expected,
    observed,
    gap,
    withinTolerance: samples < FAIRNESS_MIN_SAMPLES || gap <= tolerance,
  };
}

/**
 * Aggregate the `odds_audit` rows into the continuously-verifiable fairness
 * law: displayed odds ≈ realized odds, overall and per surface. `tolerance` is
 * the acceptable absolute gap (law-of-large-numbers noise, not a fudge factor).
 */
export function fairnessReport(
  events: readonly AnyTelemetryEvent[],
  tolerance = 0.05,
): FairnessReport {
  const rows = events.flatMap((e) => (e.name === 'odds_audit' ? [e.props] : []));
  const surfaces: OddsSurface[] = ['deal', 'shipment', 'raid'];
  const perSurface = surfaces.map((s) =>
    summarizeOdds(s, rows.filter((r) => r.surface === s), tolerance),
  );
  const all = summarizeOdds('all', rows, tolerance);
  return { all, surfaces: perSurface, fair: [all, ...perSurface].every((r) => r.withinTolerance) };
}

// --- Offline-freeze audit (design/10 §6; GDD §6) --------------------------------

export interface OfflineFreezeAudit {
  /** Owed loan balance after − before. MUST be ≤ 0 (absence never grows debt). */
  readonly owedDelta: number;
  /** Heat after − before. MUST be ≤ 0. */
  readonly heatDelta: number;
  /** Located dirty cash after − before. MUST be ≥ 0 (nothing seized while away). */
  readonly dirtyCashDelta: number;
  /** Held product units after − before. MUST be ≥ 0. */
  readonly unitsDelta: number;
  /** Clean cash after − before. MUST be ≥ 0 (the return payoff only adds). */
  readonly cleanCashDelta: number;
  /** Default-ladder rungs after − before. MUST be ≤ 0. */
  readonly ladderDelta: number;
  /** True when the spiral stage worsened across the absence. MUST be false. */
  readonly spiralWorsened: boolean;
  /** True when ANY of the guarantees above was violated. */
  readonly violation: boolean;
}

const SPIRAL_ORDER: readonly SpiralStage[] = [
  'stable',
  'wiped',
  'cant-pay',
  'protection-collapsed',
  'hunted',
  'terminal',
];

/**
 * Assert-and-log the offline-freeze guarantee (design/10 §6): compare the state
 * that went to sleep with the state `settleOffline` produced. Absence may only
 * ever ADD (clean cash, return hooks) — any movement against the player is a
 * `violation`, logged so the guarantee is continuously verifiable in aggregate
 * (owed balance / assets stay uncorrelated with real-world absence).
 */
export function auditOfflineFreeze(before: GameState, after: GameState): OfflineFreezeAudit {
  const owedDelta = debtOwed(after.debt) - debtOwed(before.debt);
  const heatDelta = after.heat - before.heat;
  const dirtyCashDelta = totalDirtyCash(after) - totalDirtyCash(before);
  const unitsDelta = totalUnits(after) - totalUnits(before);
  const cleanCashDelta = after.cleanCash - before.cleanCash;
  const ladderDelta = after.debt.ladderRung - before.debt.ladderRung;
  const spiralWorsened =
    SPIRAL_ORDER.indexOf(evaluateSpiral(after).stage) >
    SPIRAL_ORDER.indexOf(evaluateSpiral(before).stage);
  return {
    owedDelta,
    heatDelta,
    dirtyCashDelta,
    unitsDelta,
    cleanCashDelta,
    ladderDelta,
    spiralWorsened,
    violation:
      owedDelta > 0 ||
      heatDelta > 0 ||
      dirtyCashDelta < 0 ||
      unitsDelta < 0 ||
      cleanCashDelta < 0 ||
      ladderDelta > 0 ||
      spiralWorsened,
  };
}
