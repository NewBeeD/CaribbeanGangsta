/**
 * The dev telemetry overlay's view-model (Prompt 25; design/06): the live
 * funnel + the ethical-audit readouts, derived PURELY from the on-device event
 * buffer and the current run state. No mutation, no store writes — the overlay
 * is a window, never a hand on the wheel.
 */

import {
  cleanCashRate,
  evaluateSpiral,
  hottestHeat,
  type GameState,
  type SpiralStage,
} from '@/engine';
import {
  fairnessReport,
  type AnyTelemetryEvent,
  type FairnessReport,
} from '@/telemetry';

/** One formatted log row (newest first in the overlay). */
export interface OverlayLogRow {
  readonly seq: number;
  readonly name: string;
  readonly detail: string;
}

export interface TelemetryOverlayModel {
  /** Real seconds since the current session started (design/06 §1). */
  readonly sessionSeconds: number;
  readonly deals: number;
  readonly busts: number;
  /** Seconds to the session's first sale, or `null` while none yet (≤120s target). */
  readonly timeToFirstSaleSec: number | null;
  readonly firstFrontSec: number | null;
  /** The session-end open loop was reached (open-loop rate row). */
  readonly sessionEndReached: boolean;
  readonly offlineEarned: number;
  /** Offline-freeze guarantee violations observed (MUST stay 0). */
  readonly freezeViolations: number;
  /** The aggregate fairness law readout (displayed ≈ realized). */
  readonly fairness: FairnessReport;
  /** Live idle rate from the current state, $/h. */
  readonly idleRatePerHour: number;
  readonly heat: number;
  readonly spiralStage: SpiralStage;
  readonly log: readonly OverlayLogRow[];
}

const dollars = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** A one-line human read of an event for the overlay's live log. */
export function describeEvent(event: AnyTelemetryEvent): string {
  switch (event.name) {
    case 'session_start':
      return `${event.props.source} · seed ${event.props.seed}`;
    case 'run_started':
      return `${event.props.countryId} · ${dollars(event.props.startingCash)} start`;
    case 'deal_resolved':
      return `${event.props.kind} ${event.props.qty} ${event.props.product} → ${event.props.outcome} (${dollars(event.props.cashDelta)})`;
    case 'first_sale':
      return `${Math.round(event.props.secondsIntoSession)}s in`;
    case 'first_front_opened':
      return `${event.props.frontType} · ${Math.round(event.props.secondsIntoSession)}s in`;
    case 'session_end_reached':
      return event.props.cardId;
    case 'offline_return':
      return `${event.props.hoursAway.toFixed(1)}h away${event.props.d1Proxy ? ' · D1' : ''}`;
    case 'return_to_allocate':
      return `after ${event.props.hoursAway.toFixed(1)}h away`;
    case 'front_opened':
    case 'front_upgraded':
      return `${event.props.frontType} L${event.props.level} · ${dollars(event.props.idleRatePerHour)}/h`;
    case 'offline_settled':
      return `${dollars(event.props.cleanEarned)} over ${event.props.hoursAway.toFixed(1)}h${event.props.freezeViolation ? ' · VIOLATION' : ''}`;
    case 'spiral_stage':
      return `${event.props.prevStage} → ${event.props.stage}`;
    case 'run_ended':
      return `${event.props.cause} · ${dollars(event.props.score)} · ${event.props.readable ? 'readable' : 'UNREADABLE'}`;
    case 'loan_borrowed':
      return `${event.props.lenderId} · ${dollars(event.props.amount)} (${pct(event.props.leverage)} lev)`;
    case 'loan_repaid':
      return `${dollars(event.props.paid)}${event.props.clearedInFull ? ' · cleared' : ''}${event.props.dugOut ? ' · dug out' : ''}`;
    case 'debt_ladder_advanced':
      return `rung ${event.props.rung}${event.props.marked ? ' · MARKED' : ''}`;
    case 'consignment_taken':
      return `${event.props.qty} ${event.props.product} fronted · owe ${dollars(event.props.principal)}`;
    case 'consignment_repaid':
      return `${dollars(event.props.paid)}${event.props.clearedInFull ? ' · cleared' : ''}${event.props.dugOut ? ' · dug out' : ''}`;
    case 'raid_resolved':
      return event.props.seized
        ? `${event.props.stashId} · ${pct(event.props.lossPct)} of product${event.props.wiped ? ' · WIPE' : ''}`
        : `${event.props.stashId} · came up empty`;
    case 'bribe_paid':
      return `${event.props.portId} · ${dollars(event.props.amount)}`;
    case 'payroll_charged':
      return `${dollars(event.props.payrollPerWeek)}/wk (${pct(event.props.pctOfCleanIncome)} of clean)`;
    case 'official_hired':
      return `${event.props.officialId} · ${dollars(event.props.retainerPerWeek)}/wk`;
    case 'official_flipped':
      return event.props.officialId;
    case 'crew_flipped':
      return event.props.crewId;
    case 'shipment_launched':
      return `${event.props.qty} ${event.props.product} by ${event.props.mode} · ${pct(event.props.interdictionChance)} risk`;
    case 'shipment_resolved':
      return `${event.props.mode} · ${event.props.seized ? 'SEIZED' : 'made it'} (shown ${pct(event.props.displayedOdds)})`;
    case 'odds_audit':
      return `${event.props.surface} · shown ${pct(event.props.displayed)} · ${event.props.hit ? 'hit' : 'clear'}`;
    case 'beat_fired':
      return event.props.beatId;
    case 'story_flag':
      return event.props.flag;
    case 'story_card_choice':
      return `${event.props.cardId} · option ${event.props.choiceIndex + 1}`;
    case 'chaos_event':
      return event.props.flag;
  }
}

/** Events since (and including) the latest `session_start` — the live session. */
function sessionEvents(events: readonly AnyTelemetryEvent[]): readonly AnyTelemetryEvent[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.name === 'session_start') return events.slice(i);
  }
  return events;
}

/**
 * Build the overlay model from the on-device buffer + the current run. `nowMs`
 * is the overlay's wall clock (injected so the model stays pure and testable).
 */
export function telemetryOverlayModel(
  events: readonly AnyTelemetryEvent[],
  state: GameState | null,
  nowMs: number,
): TelemetryOverlayModel {
  const inSession = sessionEvents(events);
  const start = inSession.find((e) => e.name === 'session_start');

  let deals = 0;
  let busts = 0;
  let timeToFirstSaleSec: number | null = null;
  let firstFrontSec: number | null = null;
  let sessionEndReached = false;
  let offlineEarned = 0;
  let freezeViolations = 0;
  for (const e of inSession) {
    if (e.name === 'deal_resolved' && e.props.outcome !== 'rejected') {
      deals++;
      if (e.props.outcome === 'bust') busts++;
    } else if (e.name === 'first_sale') {
      timeToFirstSaleSec = e.props.secondsIntoSession;
    } else if (e.name === 'first_front_opened') {
      firstFrontSec = e.props.secondsIntoSession;
    } else if (e.name === 'session_end_reached') {
      sessionEndReached = true;
    } else if (e.name === 'offline_settled') {
      offlineEarned += e.props.cleanEarned;
      if (e.props.freezeViolation) freezeViolations++;
    }
  }

  return {
    sessionSeconds: start ? Math.max(0, (nowMs - start.at) / 1000) : 0,
    deals,
    busts,
    timeToFirstSaleSec,
    firstFrontSec,
    sessionEndReached,
    offlineEarned,
    freezeViolations,
    // Fairness aggregates over EVERYTHING retained, not just this session —
    // the law is verified in aggregate (design/01 §0.3).
    fairness: fairnessReport(events),
    idleRatePerHour: state ? cleanCashRate(state) : 0,
    heat: state ? hottestHeat(state) : 0,
    spiralStage: state ? evaluateSpiral(state).stage : 'stable',
    log: [...events]
      .slice(-30)
      .reverse()
      .map((e) => ({ seq: e.seq, name: e.name, detail: describeEvent(e) })),
  };
}
