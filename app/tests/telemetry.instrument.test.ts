import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  borrow,
  borrowCap,
  buyFront,
  createInitialState,
  endRun,
  netWorth,
  repay,
  resolveDeal,
  settleOffline,
  FRONT_TYPES,
  LENDERS,
  PRODUCT_IDS,
  type GameState,
} from '@/engine';
import {
  isD1ReturnProxy,
  localSink,
  resetTelemetrySession,
  telemetry,
  trackBorrow,
  trackDeal,
  trackFront,
  trackOfflineSettled,
  trackRepay,
  trackReturnToAllocate,
  trackRunEnded,
  trackSessionStart,
  trackTick,
  LocalSink,
  type AnyTelemetryEvent,
  type TelemetryEventName,
} from '@/telemetry';

const PRODUCT = PRODUCT_IDS[0]!;
const LENDER = LENDERS[0]!;

/** A private sink on the app bus so each test reads only what it emitted. */
let sink: LocalSink;

beforeEach(() => {
  resetTelemetrySession();
  sink = new LocalSink();
  telemetry.addSink(sink);
});

afterEach(() => {
  telemetry.removeSink(sink);
  resetTelemetrySession();
  localSink.clear();
});

function named(name: TelemetryEventName): AnyTelemetryEvent[] {
  return sink.events().filter((e) => e.name === name);
}

/** A state holding `qty` of the demo product at home (sells become possible). */
function holding(seed: string, qty: number): GameState {
  const base = createInitialState(seed);
  const home = base.stashes[0]!;
  return {
    ...base,
    stashes: [
      { ...home, inventory: { ...home.inventory, [PRODUCT]: qty } },
      ...base.stashes.slice(1),
    ],
  };
}

describe('session + funnel instrumentation (Prompt 25; design/06 §1)', () => {
  it('session_start carries the borrower-cohort tag', () => {
    const clean = createInitialState('instr-session');
    trackSessionStart('new-run', clean);
    expect(named('session_start')).toHaveLength(1);
    expect(named('session_start')[0]!.props).toMatchObject({
      source: 'new-run',
      seed: clean.seed,
      everBorrowed: false,
    });

    const inDebt = borrow(clean, LENDER.id, borrowCap(clean, LENDER.id)).state;
    trackSessionStart('continue', inDebt);
    expect(named('session_start')[1]!.props).toMatchObject({
      source: 'continue',
      everBorrowed: true,
    });
  });

  it('a committed sell emits deal_resolved + one fairness row; first sale fires once', () => {
    trackSessionStart('new-run', createInitialState('instr-deal'));
    const state = holding('instr-deal', 5);
    const home = state.stashes[0]!;

    const first = resolveDeal(state, { type: 'sell', product: PRODUCT, qty: 1, stashId: home.id });
    expect(first.outcome).toBe('success');
    trackDeal({ type: 'sell', product: PRODUCT, qty: 1, stashId: home.id }, first);

    expect(named('deal_resolved')).toHaveLength(1);
    expect(named('deal_resolved')[0]!.props).toMatchObject({
      kind: 'sell',
      outcome: 'success',
      product: PRODUCT,
      displayedBustProb: first.displayedBustProb,
    });
    expect(named('odds_audit')).toHaveLength(1);
    expect(named('odds_audit')[0]!.props).toMatchObject({
      surface: 'deal',
      displayed: first.displayedBustProb,
      hit: false,
    });
    expect(named('first_sale')).toHaveLength(1);

    // A second sale is not a second "first sale".
    const second = resolveDeal(first.state, {
      type: 'sell',
      product: PRODUCT,
      qty: 1,
      stashId: home.id,
    });
    trackDeal({ type: 'sell', product: PRODUCT, qty: 1, stashId: home.id }, second);
    expect(named('first_sale')).toHaveLength(1);
  });

  it('a buy rolls no bust — so it adds no fairness row and no first sale', () => {
    const state = createInitialState('instr-buy');
    const home = state.stashes[0]!;
    const result = resolveDeal(state, { type: 'buy', product: PRODUCT, qty: 1, stashId: home.id });
    trackDeal({ type: 'buy', product: PRODUCT, qty: 1, stashId: home.id }, result);
    expect(named('deal_resolved')).toHaveLength(1);
    expect(named('odds_audit')).toHaveLength(0);
    expect(named('first_sale')).toHaveLength(0);
  });

  it('the first front opened emits the funnel row alongside front_opened', () => {
    const front = FRONT_TYPES[0]!;
    const state: GameState = { ...createInitialState('instr-front'), cleanCash: front.buyIn * 3 };

    const opened = buyFront(state, front.id);
    trackFront('opened', state, opened);
    expect(named('front_opened')).toHaveLength(1);
    expect(named('front_opened')[0]!.props).toMatchObject({
      frontType: front.id,
      level: 1,
      cost: front.buyIn,
    });
    expect(named('first_front_opened')).toHaveLength(1);

    // A second front is not a second "first front".
    const again = buyFront(opened.state, front.id);
    trackFront('opened', opened.state, again);
    expect(named('front_opened')).toHaveLength(2);
    expect(named('first_front_opened')).toHaveLength(1);
  });
});

describe('offline settlement + the freeze audit (design/10 §6)', () => {
  it('a real settleOffline reports its payoff and a clean audit', () => {
    const before = createInitialState('instr-offline');
    const { state: settled, report } = settleOffline(before, 24);
    trackOfflineSettled(before, settled, report);

    expect(named('offline_settled')).toHaveLength(1);
    expect(named('offline_settled')[0]!.props).toMatchObject({
      hoursAway: 24,
      cleanEarned: report.cleanEarned,
      freezeViolation: false,
    });
    expect(named('offline_return')[0]!.props).toMatchObject({ hoursAway: 24, d1Proxy: true });

    // The return hook led to the Money screen — tagged with the same absence.
    trackReturnToAllocate();
    expect(named('return_to_allocate')[0]!.props).toMatchObject({ hoursAway: 24 });
  });

  it('the D1 proxy window is 8–48 hours away', () => {
    expect(isD1ReturnProxy(7.9)).toBe(false);
    expect(isD1ReturnProxy(8)).toBe(true);
    expect(isD1ReturnProxy(48)).toBe(true);
    expect(isD1ReturnProxy(48.1)).toBe(false);
  });
});

describe('debt instrumentation (design/10)', () => {
  it('a landed borrow reports amount, cap and leverage; a rejection reports nothing', () => {
    const state = createInitialState('instr-borrow');
    const cap = borrowCap(state, LENDER.id);
    const amount = Math.min(cap, 2_000);

    trackBorrow(state, LENDER.id, borrow(state, LENDER.id, amount));
    expect(named('loan_borrowed')).toHaveLength(1);
    expect(named('loan_borrowed')[0]!.props).toMatchObject({
      lenderId: LENDER.id,
      amount,
      cap,
      leverage: amount / netWorth(state),
    });

    // Over-cap borrow rejects in the engine — no event may leak out.
    trackBorrow(state, LENDER.id, borrow(state, LENDER.id, cap + 1));
    expect(named('loan_borrowed')).toHaveLength(1);
  });

  it('clearing a loan off the default ladder counts as digging out', () => {
    const fresh = createInitialState('instr-repay');
    const opened = borrow(fresh, LENDER.id, borrowCap(fresh, LENDER.id)).state;
    const marked: GameState = {
      ...opened,
      cleanCash: 1_000_000,
      debt: { ...opened.debt, ladderRung: 2 },
    };
    const result = repay(marked, 1_000_000);
    expect(result.clearedInFull).toBe(true);

    trackRepay(marked, result);
    expect(named('loan_repaid')).toHaveLength(1);
    expect(named('loan_repaid')[0]!.props).toMatchObject({
      clearedInFull: true,
      dugOut: true,
      remaining: 0,
    });
  });
});

describe('run end + tick derivation through the bus', () => {
  it('a chosen retirement is always a readable end', () => {
    const state = createInitialState('instr-retire');
    trackRunEnded(state, endRun(state, 'retired'));
    expect(named('run_ended')).toHaveLength(1);
    expect(named('run_ended')[0]!.props).toMatchObject({ cause: 'retired', readable: true });
  });

  it('trackTick pushes everything the tick did through the bus', () => {
    const prev = createInitialState('instr-tick');
    const next: GameState = { ...prev, beatsFired: [...prev.beatsFired, 'BEAT-TEST'] };
    trackTick(prev, next);
    expect(named('beat_fired')).toHaveLength(1);
    expect(named('beat_fired')[0]!.props).toMatchObject({ beatId: 'BEAT-TEST' });
  });
});
