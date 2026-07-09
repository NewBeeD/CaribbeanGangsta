// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  frontUpgradeCost,
  pesoExchangeQuote,
  type Front,
  type GameState,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { MoneyScreen } from '@/ui/screens/MoneyScreen';
import {
  buyFrontOptions,
  frontRows,
  nextAffordableUpgradeId,
} from '@/ui/screens/moneyScreen.model';

// react-dom/test-utils `act` requires this flag to be set.
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
      act(() => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** A run with clean cash and a single Level-1 bar front. */
function fundedRun(seed: string, clean: number): GameState {
  const bar: Front = { id: 'front-bar-1', type: 'bar', level: 1 };
  return { ...createInitialState(seed), cleanCash: clean, fronts: [bar] };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('moneyScreen.model — priced fronts on the open-access curve', () => {
  it('upgrade cost matches buy_in × 1.15^level (the shown = charged fairness law)', () => {
    const state = fundedRun('money-cost', 0);
    const [row] = frontRows(state);
    expect(row!.upgradeCost).toBe(frontUpgradeCost('bar', 1));
  });

  it('highlights the cheapest affordable upgrade, or nothing when broke', () => {
    expect(nextAffordableUpgradeId(fundedRun('money-broke', 0))).toBeNull();
    expect(nextAffordableUpgradeId(fundedRun('money-rich', 1_000_000))).toBe('front-bar-1');
  });

  it('offers every front to buy from minute one (open access)', () => {
    const options = buyFrontOptions(createInitialState('money-open'));
    expect(options.map((o) => o.type).sort()).toEqual(['bar', 'crypto', 'nightclub', 'resort']);
  });
});

describe('MoneyScreen — the return payoff (Prompt 18)', () => {
  it('shows dirty and clean totals; exactly one affordable upgrade is emphasized', () => {
    const state = fundedRun('money-view', 1_000_000);
    useGameStore.setState({ state });

    const view = mount(<MoneyScreen />);
    expect(view.container.textContent).toContain('Clean cash');
    expect(view.container.textContent).toContain('Dirty (in stashes)');
    // One primary = the highlighted affordable next step (buy options stay secondary).
    expect(view.container.querySelectorAll('.cg-btn--primary')).toHaveLength(1);
    view.unmount();
  });

  it('peso exchange shows the exact haircut and converts dirty→clean on commit', () => {
    const state = fundedRun('money-peso', 0);
    useGameStore.setState({ state });
    const home = state.stashes[0]!;
    const quote = pesoExchangeQuote(home.dirtyCash);

    const view = mount(<MoneyScreen />);
    // The haircut is disclosed before commit.
    expect(view.container.textContent).toContain('15% haircut');
    expect(view.container.textContent).toContain(`+ $${quote.clean.toLocaleString('en-US')} clean`);

    const button = view.container.querySelector('[data-testid="peso-exchange"]')!;
    view.click(button);

    const after = useGameStore.getState().state!;
    expect(after.stashes[0]!.dirtyCash).toBe(0);
    expect(after.cleanCash).toBe(quote.clean);
    view.unmount();
  });

  it('upgrading a front spends clean cash and raises its level', () => {
    useGameStore.setState({ state: fundedRun('money-upgrade', 1_000_000) });
    const before = useGameStore.getState().state!;

    const view = mount(<MoneyScreen />);
    const primary = view.container.querySelector('.cg-btn--primary')!;
    view.click(primary);

    const after = useGameStore.getState().state!;
    expect(after.fronts[0]!.level).toBe(before.fronts[0]!.level + 1);
    expect(after.cleanCash).toBeLessThan(before.cleanCash);
    view.unmount();
  });

  it('the offline summary reads as gains + choices — never a loss (GDD §6)', () => {
    const state = createInitialState('money-offline');
    useGameStore.setState({
      state,
      lastOfflineReport: {
        hoursAway: 5,
        cappedAt: 12,
        cleanEarned: 4_200,
        pendingChoices: [],
      },
    });

    const view = mount(<MoneyScreen />);
    expect(view.container.textContent).toContain('While you were gone');
    expect(view.container.textContent).toContain('+ $4,200');
    // The hard line: no "at risk" / "lost" pressure anywhere on the return.
    const text = view.container.textContent!.toLowerCase();
    expect(text).not.toContain('at risk');
    expect(text).not.toContain('you lost');
    view.unmount();
  });

  it('renders queued decisions as return hooks to allocate', () => {
    const state = createInitialState('money-hooks');
    const withHook: GameState = {
      ...state,
      pendingChoices: [
        { id: 'return-buyer-0', kind: 'buyer', summary: 'A buyer has been waiting.', createdAtHours: 0 },
      ],
    };
    useGameStore.setState({ state: withHook });

    const view = mount(<MoneyScreen />);
    expect(view.container.querySelector('[data-testid="pending-decision"]')).not.toBeNull();
    expect(view.container.textContent).toContain('A buyer has been waiting.');
    view.unmount();
  });
});
