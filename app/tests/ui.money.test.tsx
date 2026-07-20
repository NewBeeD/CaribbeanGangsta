// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  frontUpgradeCost,
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

/** A run with clean cash and a single Level-1 cash-intensive front. */
function fundedRun(seed: string, clean: number): GameState {
  const front: Front = { id: 'front-cash-front', type: 'cash-front', level: 1 };
  return { ...createInitialState(seed), cleanCash: clean, fronts: [front] };
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
    expect(row!.upgradeCost).toBe(frontUpgradeCost('cash-front', 1));
  });

  it('highlights the cheapest affordable upgrade, or nothing when broke', () => {
    expect(nextAffordableUpgradeId(fundedRun('money-broke', 0))).toBeNull();
    expect(nextAffordableUpgradeId(fundedRun('money-rich', 1_000_000))).toBe('front-cash-front');
  });

  it('offers all six fixed fronts to buy from minute one (open access)', () => {
    const options = buyFrontOptions(createInitialState('money-open'));
    expect(options.map((o) => o.type).sort()).toEqual([
      'cash-front',
      'crypto',
      'real-estate',
      'shell-company',
      'smurf-network',
      'trade-front',
    ]);
  });

  it('drops an owned technique from the buy list — single-buy, no duplicates', () => {
    const owned = fundedRun('money-owned', 0); // owns cash-front
    const types = buyFrontOptions(owned).map((o) => o.type);
    expect(types).not.toContain('cash-front');
    expect(types).toHaveLength(5);
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

  it('offers no INSTANT bulk converter — the removed peso exchange stays gone', () => {
    const state = fundedRun('money-nopeso', 0);
    useGameStore.setState({ state });

    const view = mount(<MoneyScreen />);
    // The instant lump-sum peso exchange (with its haircut) was removed (Item 12).
    expect(view.container.querySelector('[data-testid="peso-exchange"]')).toBeNull();
    expect(view.container.textContent!.toLowerCase()).not.toContain('haircut');
    view.unmount();
  });

  it('washes dirty cash through the mules in batches over time — not instantly', () => {
    // Home stash holds starting dirty cash; the wash desk offers to send the mules.
    const state = createInitialState('money-wash');
    useGameStore.setState({ state });
    const dirtyBefore = state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
    expect(dirtyBefore).toBeGreaterThan(0);

    const view = mount(<MoneyScreen />);
    const send = view.container.querySelector('[data-testid="wash-send"]')!;
    expect(send).not.toBeNull();

    // Max the amount, then send the mules.
    view.click(view.container.querySelector('[data-testid="qty-max"]')!);
    view.click(send);

    const after = useGameStore.getState().state!;
    // Dirty was committed to the queue — NOT instantly turned into clean cash.
    expect(after.wash.queuedDirty).toBeGreaterThan(0);
    expect(after.cleanCash).toBe(state.cleanCash);
    expect(after.stashes.reduce((sum, s) => sum + s.dirtyCash, 0)).toBeLessThan(dirtyBefore);
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

describe('MoneyScreen — the notification feed is capped with Clear all (design/13 A5)', () => {
  /** `n` dismissible hooks queued in order (oldest first, like the engine does). */
  function hooks(n: number): GameState['pendingChoices'] {
    return Array.from({ length: n }, (_, i) => ({
      id: `hook-${i}`,
      kind: 'buyer',
      summary: `Hook number ${i}.`,
      createdAtHours: i,
    }));
  }

  it('with 12 pending choices, shows only the 2 newest plus "+10 older"', () => {
    const state: GameState = { ...createInitialState('money-cap'), pendingChoices: hooks(12) };
    useGameStore.setState({ state });

    const view = mount(<MoneyScreen />);
    const rendered = [...view.container.querySelectorAll('[data-testid="pending-decision"]')];
    expect(rendered).toHaveLength(2);
    // The NEWEST two (10..11), newest first — the older ten sit behind the count.
    expect(rendered[0]!.textContent).toContain('Hook number 11.');
    expect(rendered[1]!.textContent).toContain('Hook number 10.');
    expect(view.container.textContent).not.toContain('Hook number 9.');
    expect(view.container.querySelector('[data-testid="pending-older"]')!.textContent).toContain(
      '+10 older',
    );
    view.unmount();
  });

  it('Clear all resolves every dismissible choice via the same safe default path', () => {
    const state: GameState = { ...createInitialState('money-clear'), pendingChoices: hooks(12) };
    useGameStore.setState({ state });

    const view = mount(<MoneyScreen />);
    view.click(view.container.querySelector('[data-testid="clear-pending"]')!);

    expect(useGameStore.getState().state!.pendingChoices).toHaveLength(0);
    // The card is gone — nothing waiting.
    expect(view.container.querySelector('[data-testid="pending-decision"]')).toBeNull();
    view.unmount();
  });

  it('consequential (card-bearing) choices survive Clear all and are labeled', () => {
    const beatScene = {
      id: 'beat-scene-1',
      kind: 'beat',
      summary: 'A big call is waiting.',
      createdAtHours: 0,
      beatId: 'beat.first-front',
    };
    const state: GameState = {
      ...createInitialState('money-conseq'),
      pendingChoices: [...hooks(3), beatScene],
    };
    useGameStore.setState({ state });

    const view = mount(<MoneyScreen />);
    // The consequential scene is labeled as excluded from Clear all.
    expect(
      view.container.querySelector('[data-testid="pending-consequential"]')!.textContent,
    ).toContain('Clear all leaves them');

    view.click(view.container.querySelector('[data-testid="clear-pending"]')!);
    const after = useGameStore.getState().state!;
    expect(after.pendingChoices).toEqual([beatScene]); // the big call survives
    view.unmount();
  });
});
