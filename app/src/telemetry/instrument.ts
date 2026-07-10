/**
 * Store-side instrumentation (Prompt 25): the thin helpers `gameStore.ts` calls
 * around its actions. Each takes the engine's own result objects (which already
 * carry the disclosed numbers — the fairness law means the displayed odds ARE
 * the telemetry) and turns them into typed bus events. Session context (wall
 * clock, first-sale seen, borrower cohort) lives here — never in the engine.
 *
 * The module-level singletons are the app's default pipeline: one bus, one
 * on-device `LocalSink` the overlay reads. Local-first, no PII (design/06).
 */

import { netWorth, debtOwed, type GameState } from '@/engine/state';
import type { DealIntent, DealResult } from '@/engine/deals';
import { cleanCashRate, type OfflineReport } from '@/engine/laundering';
import type { FrontResult } from '@/engine/laundering';
import { borrowCap, type BorrowResult, type RepayResult } from '@/engine/debt';
import type { LenderId } from '@/engine/config/lenders';
import type { HireResult, PayBribeResult } from '@/engine/corruption';
import type { ShipResult } from '@/engine/travel';
import { evaluateSpiral, type RunEndResult } from '@/engine/endgame';
import { LocalSink, TelemetryBus } from './bus';
import { auditOfflineFreeze, deriveTickEvents } from './derive';

/** The app-wide bus. Swap/extend sinks here (ConsoleSink for noisy dev runs). */
export const telemetry = new TelemetryBus();

/** The on-device ring buffer the live overlay subscribes to. */
export const localSink = new LocalSink();
telemetry.addSink(localSink);

// --- Session context (wall-clock; the engine never sees any of this) ----------

interface SessionContext {
  startedAt: number | null;
  firstSaleTracked: boolean;
  borrowedThisSession: boolean;
  lastHoursAway: number;
}

const session: SessionContext = {
  startedAt: null,
  firstSaleTracked: false,
  borrowedThisSession: false,
  lastHoursAway: 0,
};

function secondsIntoSession(): number {
  if (session.startedAt === null) return 0;
  return Math.max(0, (telemetry.now() - session.startedAt) / 1000);
}

/** The borrower-cohort tag (design/10 — borrower vs non-borrower retention). */
function everBorrowed(state: GameState): boolean {
  return session.borrowedThisSession || state.debt.lenderId !== null;
}

/** Reset session context (tests; also called on every session start). */
export function resetTelemetrySession(): void {
  session.startedAt = null;
  session.firstSaleTracked = false;
  session.borrowedThisSession = false;
  session.lastHoursAway = 0;
}

// --- Session / funnel ----------------------------------------------------------

export function trackSessionStart(
  source: 'new-run' | 'continue',
  state: GameState,
): void {
  resetTelemetrySession();
  session.startedAt = telemetry.now();
  session.borrowedThisSession = state.debt.lenderId !== null;
  telemetry.track('session_start', {
    source,
    seed: state.seed,
    day: state.clock.day,
    everBorrowed: everBorrowed(state),
  });
}

export function trackRunStarted(state: GameState): void {
  telemetry.track('run_started', {
    seed: state.seed,
    countryId: state.world.startingCountry.id,
    startingCash: state.world.startingCountry.startingCash,
  });
}

export function trackDeal(intent: DealIntent, result: DealResult): void {
  telemetry.track('deal_resolved', {
    kind: intent.type,
    outcome: result.outcome,
    product: intent.product,
    qty: intent.qty,
    displayedBustProb: result.displayedBustProb,
    rolledValue: result.rolledValue,
    cashDelta: result.cashDelta,
    secondsIntoSession: secondsIntoSession(),
  });
  // Only sells roll the bust check — each committed roll is one fairness row.
  if (intent.type === 'sell' && result.outcome !== 'rejected') {
    telemetry.track('odds_audit', {
      surface: 'deal',
      displayed: result.displayedBustProb,
      hit: result.outcome === 'bust',
    });
  }
  if (intent.type === 'sell' && result.outcome === 'success' && !session.firstSaleTracked) {
    session.firstSaleTracked = true;
    telemetry.track('first_sale', {
      secondsIntoSession: secondsIntoSession(),
      day: result.state.clock.day,
    });
  }
}

// --- Economy ---------------------------------------------------------------------

export function trackFront(
  kind: 'opened' | 'upgraded',
  before: GameState,
  result: FrontResult,
): void {
  if (!result.front) return;
  const props = {
    frontType: result.front.type,
    level: result.front.level,
    cost: Math.max(0, before.cleanCash - result.state.cleanCash),
    idleRatePerHour: cleanCashRate(result.state),
  };
  telemetry.track(kind === 'opened' ? 'front_opened' : 'front_upgraded', props);
  if (kind === 'opened' && result.state.fronts.length === 1) {
    telemetry.track('first_front_opened', {
      frontType: result.front.type,
      secondsIntoSession: secondsIntoSession(),
    });
  }
}

/** True when the away gap reads as a next-day return (the D1 proxy window). */
export function isD1ReturnProxy(hoursAway: number): boolean {
  return hoursAway >= 8 && hoursAway <= 48;
}

/**
 * Offline settlement: the return-payoff numbers PLUS the freeze guarantee run as
 * an assert-and-log audit (design/10 §6). `before` is the state as it slept;
 * `settled` is what `settleOffline` produced. A violation is loudly logged —
 * it means an ethical guarantee regressed, which is a release blocker.
 */
export function trackOfflineSettled(
  before: GameState,
  settled: GameState,
  report: OfflineReport,
): void {
  const audit = auditOfflineFreeze(before, settled);
  session.lastHoursAway = report.hoursAway;
  telemetry.track('offline_settled', {
    hoursAway: report.hoursAway,
    cleanEarned: report.cleanEarned,
    cappedAt: report.cappedAt,
    goldenHour: report.goldenHour !== undefined,
    freezeViolation: audit.violation,
    owedDelta: audit.owedDelta,
    heatDelta: audit.heatDelta,
  });
  telemetry.track('offline_return', {
    hoursAway: report.hoursAway,
    d1Proxy: isD1ReturnProxy(report.hoursAway),
  });
  if (audit.violation) {
    // eslint-disable-next-line no-console
    console.error('[telemetry] OFFLINE-FREEZE VIOLATION — absence moved state against the player', audit);
  }
}

export function trackReturnToAllocate(): void {
  telemetry.track('return_to_allocate', { hoursAway: session.lastHoursAway });
}

// --- Debt (design/10) -------------------------------------------------------------

export function trackBorrow(
  before: GameState,
  lenderId: LenderId,
  result: BorrowResult,
  collateralRef?: string,
): void {
  if (!result.ok) return;
  session.borrowedThisSession = true;
  const amount = result.state.debt.principal;
  const worth = netWorth(before);
  telemetry.track('loan_borrowed', {
    lenderId,
    amount,
    cap: collateralRef === undefined
      ? borrowCap(before, lenderId)
      : borrowCap(before, lenderId, collateralRef),
    leverage: worth > 0 ? amount / worth : amount,
  });
}

export function trackRepay(before: GameState, result: RepayResult): void {
  if (!result.ok) return;
  telemetry.track('loan_repaid', {
    paid: result.paid,
    remaining: debtOwed(result.state.debt),
    clearedInFull: result.clearedInFull,
    dugOut: result.clearedInFull && before.debt.ladderRung > 0,
  });
}

// --- Corruption / shipments ---------------------------------------------------------

export function trackBribe(
  portId: string,
  shipmentValue: number,
  result: PayBribeResult,
): void {
  if (!result.ok) return;
  telemetry.track('bribe_paid', { portId, amount: result.paid, shipmentValue });
}

export function trackOfficialHired(result: HireResult): void {
  if (!result.official) return;
  telemetry.track('official_hired', {
    officialId: result.official.officialId,
    retainerPerWeek: result.official.retainerPerWeek,
  });
}

export function trackShipmentLaunched(result: ShipResult): void {
  if (!result.ok || !result.shipment) return;
  telemetry.track('shipment_launched', {
    mode: result.shipment.mode,
    product: result.shipment.product,
    qty: result.shipment.qty,
    interdictionChance: result.shipment.interdictionChance,
    totalCost: result.quote.totalCost,
  });
}

// --- Run end / story ------------------------------------------------------------------

/**
 * The run ended and banked. `readable` operationalizes design/01 §8.5's "was it
 * earned?" flag: the end is readable when the telegraphed spiral rungs had
 * visibly collapsed first, or the player chose it (retired) — never a surprise.
 */
export function trackRunEnded(before: GameState, result: RunEndResult): void {
  if (result.comeback) return; // the judge buried it — the run continues
  const stage = evaluateSpiral(before).stage;
  const telegraphed =
    stage === 'protection-collapsed' || stage === 'hunted' || stage === 'terminal';
  telemetry.track('run_ended', {
    cause: result.cause,
    score: result.score,
    day: result.recap.day,
    week: result.recap.week,
    readable: telegraphed || result.cause === 'retired',
    everBorrowed: everBorrowed(before),
  });
}

export function trackCardChoice(cardId: string, choiceIndex: number): void {
  telemetry.track('story_card_choice', { cardId, choiceIndex });
}

/** Diff a tick's input/output states and emit everything the tick did. */
export function trackTick(prev: GameState, next: GameState): void {
  for (const e of deriveTickEvents(prev, next)) telemetry.track(e.name, e.props);
}
