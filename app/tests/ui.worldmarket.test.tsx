// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  PRODUCTS,
  createInitialState,
  getMarketPrice,
  isTraded,
  type GameState,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { WorldMarketScreen } from '@/ui/screens/WorldMarketScreen';
import { boardRows, widestSpread } from '@/ui/screens/worldMarket.model';
import { openLoop } from '@/ui/shell/sessionEnd.model';

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

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('worldMarket.model — the board IS getMarketPrice (fairness spot-check)', () => {
  it('lists all countries × products with numbers identical to the engine', () => {
    const state = createInitialState('board-fair');
    for (const p of PRODUCTS) {
      const rows = boardRows(state, p.id);
      expect(rows.map((r) => r.countryId)).toEqual(COUNTRIES.map((c) => c.id));
      for (const row of rows) {
        const price = getMarketPrice(state, p.id, row.countryId);
        expect(row.price).toBe(price.price);
        expect(row.stock).toBe(price.stock);
        expect(row.trend).toBe(price.trend);
        expect(row.traded).toBe(isTraded(row.countryId, p.id));
      }
    }
  });
});

describe('WorldMarketScreen — every price, every island, from minute one', () => {
  it('shows the plug contract with its intro cost, and inert "no market" cells', () => {
    useGameStore.setState({ state: createInitialState('board-open') });
    const view = mount(<WorldMarketScreen />);

    // Default product is cocaine: Colombia is a gated true source…
    const colombia = view.container.querySelector('[data-testid="board-colombia"]')!;
    expect(colombia.textContent).toContain('🔌 Contract');
    expect(colombia.textContent).toContain('$220,000'); // the intro cost, up front

    // …and the Golden Crescent has no cocaine market at all (Ideas2 §5).
    const crescent = view.container.querySelector('[data-testid="board-golden-crescent"]')!;
    expect(crescent.textContent).toContain('No market');
    view.unmount();
  });

  it('plug flow: cost + heat disclosed before commit; buying lifts the gate (scene, not toast)', () => {
    const funded: GameState = { ...createInitialState('board-plug'), cleanCash: 1_000_000 };
    useGameStore.setState({ state: funded });
    const view = mount(<WorldMarketScreen />);

    // Open Colombia's detail: the full terms show BEFORE any commit button.
    view.click(view.container.querySelector('[data-testid="board-colombia"]')!);
    expect(view.container.textContent).toContain('One-time intro');
    expect(view.container.textContent).toContain('+5 heat'); // PLUG_MEETING_HEAT, disclosed
    // Exactly one primary action in this state (design/04).
    expect(view.container.querySelectorAll('.cg-btn--primary')).toHaveLength(1);

    view.click(view.container.querySelector('[data-testid="buy-plug"]')!);

    // Outcome renders as a scene, never a toast — and the store really bought it.
    expect(view.container.querySelector('.cg-scene')).not.toBeNull();
    expect(view.container.textContent).toContain('The price list just changed');
    const after = useGameStore.getState().state!;
    expect(after.plugs).toContain('colombia');
    expect(after.cleanCash).toBe(1_000_000 - 220_000);

    // Back on the board the contract price row updates: gate lifted.
    view.click(view.container.querySelector('.cg-btn--primary')!);
    const colombia = view.container.querySelector('[data-testid="board-colombia"]')!;
    expect(colombia.textContent).not.toContain('🔌');
    expect(colombia.textContent).toContain('(contract)');
    expect(view.container.querySelector('[data-testid="plug-connected"]')).not.toBeNull();
    view.unmount();
  });
});

describe('session-end open loops — plug & margin (Prompt 31; GDD §11 bonus-framing)', () => {
  it('an affordable plug is the pending decision', () => {
    const state: GameState = { ...createInitialState('loop-plug'), cleanCash: 500_000 };
    expect(openLoop(state).pending).toContain('will take the meeting');
  });

  it('a wide cross-country margin reads as an opportunity when nothing else is in reach', () => {
    const state = createInitialState('loop-margin'); // broke: no plug, no fronts affordable
    const spread = widestSpread(state);
    expect(spread).not.toBeNull();
    expect(openLoop(state).pending).toContain('the water in between is the margin');
  });
});
