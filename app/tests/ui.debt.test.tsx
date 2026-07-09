// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  borrow,
  createInitialState,
  debtOwed,
  getLender,
  quoteLoan,
  type GameState,
  type PendingChoice,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { DebtScreen } from '@/ui/screens/DebtScreen';
import {
  activeLoan,
  borrowQuote,
  ladderTelegraph,
  lifeline,
  repayPlan,
} from '@/ui/screens/debtScreen.model';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function freshSaveStore(): SaveStore {
  return new LocalSaveStore({ factory: new IDBFactory() });
}

function mount(ui: JSX.Element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return {
    container,
    click(el: Element) {
      act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** A run on ~day 2 with the street rep to draw a full line (mirrors debt.test.ts). */
function borrower(seed: string, streetRep = 100): GameState {
  const base = createInitialState(seed);
  return {
    ...base,
    clock: { ...base.clock, hours: 24, day: 2 },
    heat: 0,
    reputation: { ...base.reputation, street: streetRep },
  };
}

/** A wiped run: no clean cash, empty stashes, but rep enough to keep the door open. */
function wiped(seed: string, streetRep = 50): GameState {
  return {
    ...borrower(seed, streetRep),
    cleanCash: 0,
    stashes: [],
  };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('debtScreen.model — terms, timing & the ladder (Prompt 21)', () => {
  it('borrowQuote exposes full terms BEFORE confirming (principal, rate, total-to-repay)', () => {
    const s = borrower('quote');
    const view = borrowQuote(s, 'papa-cass', 1_500);
    const engine = quoteLoan(s, 'papa-cass', 1_500);

    expect(view.principal).toBe(1_500);
    expect(view.weeklyRatePct).toBe(Math.round(getLender('papa-cass').weeklyRate * 100));
    // The disclosed balloon-free total is exactly the engine's — shown == committed.
    expect(view.totalToRepayAtDue).toBe(engine.totalToRepayAtDue);
    expect(view.interestAtDue).toBe(engine.totalToRepayAtDue - 1_500);
    expect(view.withinCap).toBe(true);
  });

  it('activeLoan states the due-day in IN-GAME played time, not real time', () => {
    const s = borrow(borrower('due'), 'papa-cass', 1_000).state;
    const loan = activeLoan(s)!;
    const cfg = getLender('papa-cass');
    // Borrowed on day 2 → due `softDueDays` in-game days later; countdown is that gap.
    expect(loan.dueDay).toBe(2 + cfg.softDueDays);
    expect(loan.daysUntilDue).toBe(loan.dueDay - s.clock.day);
    expect(loan.overdue).toBe(false);
  });

  it('repayPlan allows a free full payoff and a patience-buying partial', () => {
    // Borrow 1,000 (clean → 1,000), then top up so a full payoff is affordable.
    const borrowed = borrow(borrower('repay'), 'papa-cass', 1_000).state;
    const s: GameState = { ...borrowed, cleanCash: borrowed.cleanCash + 5_000 };
    const plan = repayPlan(s);

    expect(plan.owed).toBe(Math.round(debtOwed(s.debt)));
    expect(plan.canPayFull).toBe(true);
    expect(plan.fullAmount).toBe(plan.owed);
    expect(plan.canPayPartial).toBe(true);
    expect(plan.partialAmount).toBeLessThan(plan.owed);
  });

  it('ladderTelegraph shows every rung to the ceiling — the fatal last rung visible', () => {
    // The street shark stops at seizing a stash (3 rungs, none run-ending)…
    const cass = ladderTelegraph(borrower('lad-a'), 'papa-cass');
    expect(cass).toHaveLength(3);
    expect(cass.some((r) => r.fatal)).toBe(false);

    // …only the cartel financier reaches the lethal, visible final rung.
    const fin = ladderTelegraph(borrower('lad-b'), 'financier');
    expect(fin).toHaveLength(5);
    expect(fin[4]!.fatal).toBe(true);
  });

  it('lifeline surfaces only when wiped AND reputation warrants', () => {
    expect(lifeline(wiped('life', 50))).not.toBeNull();
    // No reputation → no one fronts you; the spiral may be terminal (Prompt 11).
    expect(lifeline(wiped('nolife', 0))).toBeNull();
    // Not wiped → no lifeline (it's the way back, not a standing offer).
    expect(lifeline(borrower('flush'))).toBeNull();
  });

  it('lifeline amount never exceeds the current borrow cap (a grantable loan)', () => {
    const life = lifeline(wiped('cap', 50))!;
    const view = borrowQuote(wiped('cap', 50), life.lenderId, life.amount);
    expect(view.withinCap).toBe(true);
  });
});

describe('DebtScreen — full disclosure, no real-time pressure (Prompt 21)', () => {
  it('shows the full terms up front and taking the loan opens the ledger', () => {
    useGameStore.setState({ state: borrower('ui-borrow') });
    const view = mount(<DebtScreen />);

    // Terms are visible before any confirm.
    expect(view.container.querySelector('[data-testid="borrow-terms"]')).not.toBeNull();
    expect(view.container.textContent).toContain('Total to repay');

    view.click(view.container.querySelector('[data-testid="take-loan"]')!);

    const after = useGameStore.getState().state!;
    expect(after.debt.active).toBe(true);
    expect(after.debt.lenderId).toBe('papa-cass');
    // Principal (50% of a 2,000 cap at full rep) landed in clean cash.
    expect(after.cleanCash).toBe(1_000);
    view.unmount();
  });

  it('repaying in full clears the loan and spends clean cash', () => {
    const borrowed = borrow(borrower('ui-repay'), 'papa-cass', 1_000).state;
    useGameStore.setState({ state: borrowed });
    const owed = Math.round(debtOwed(borrowed.debt));

    const view = mount(<DebtScreen />);
    view.click(view.container.querySelector('[data-testid="repay-full"]')!);

    const after = useGameStore.getState().state!;
    expect(after.debt.active).toBe(false);
    expect(after.cleanCash).toBe(borrowed.cleanCash - owed);
    view.unmount();
  });

  it('states the freeze-offline guarantee and NEVER pressures with real-world time', () => {
    useGameStore.setState({ state: borrower('ui-ethics') });
    const view = mount(<DebtScreen />);
    const text = view.container.textContent!.toLowerCase();

    // Guarantee #2 reinforced in the copy…
    expect(text).toContain('in-game');
    expect(text).toContain('freezes while you');
    // …and no "log in or your debt grows" pressure, ever (design/10 §4.2).
    expect(text).not.toContain('log in');
    expect(text).not.toContain('real time');
    expect(text).not.toContain('real-world');
    view.unmount();
  });

  it('surfaces a default-ladder rung as a scene with intervention actions', () => {
    const borrowed = borrow(borrower('ui-default'), 'papa-cass', 1_000).state;
    const scene: PendingChoice = {
      id: 'debt-default-2-48',
      kind: 'debt-default',
      summary: 'Muscle paid you a visit. "Papa Cass says hi."',
      createdAtHours: 48,
    };
    useGameStore.setState({ state: { ...borrowed, debt: { ...borrowed.debt, ladderRung: 2 }, pendingChoices: [scene] } });

    const view = mount(<DebtScreen />);
    expect(view.container.textContent).toContain('Papa Cass says hi');
    // The intervention (pay / buy patience) is offered right on the scene.
    expect(view.container.querySelector('[data-testid="repay-full"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="repay-partial"]')).not.toBeNull();
    view.unmount();
  });

  it('presents the lifeline prominently when wiped and takes it on tap', () => {
    useGameStore.setState({ state: wiped('ui-life', 50) });
    const view = mount(<DebtScreen />);

    const take = view.container.querySelector('[data-testid="take-lifeline"]')!;
    expect(take).not.toBeNull();
    view.click(take);

    const after = useGameStore.getState().state!;
    expect(after.debt.active).toBe(true);
    expect(after.cleanCash).toBeGreaterThan(0);
    view.unmount();
  });
});
