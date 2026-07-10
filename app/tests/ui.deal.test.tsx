// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeBustProbability,
  createInitialState,
  type DealResult,
  type GameState,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { DealScreen, DealOutcome } from '@/ui/screens/DealScreen';

// react-dom/test-utils `act` requires this flag to be set.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function freshSaveStore(): SaveStore {
  return new LocalSaveStore({ factory: new IDBFactory() });
}

/** Mount a component into a real (jsdom) client root — the path that reads the LIVE store. */
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

/** A run holding weed in the home stash — so the screen opens in sell mode. */
function stateWithWeed(seed: string, weed = 20, heat = 40): GameState {
  const base = createInitialState(seed);
  return {
    ...base,
    heat,
    stashes: base.stashes.map((s, i) =>
      i === 0 ? { ...s, inventory: { ...s.inventory, weed } } : s,
    ),
  };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DealScreen — fairness law (odds shown = odds rolled; GDD §8)', () => {
  it('renders the exact computeBustProbability for the current selection', () => {
    const state = stateWithWeed('deal-fairness');
    useGameStore.setState({ state });

    const view = mount(<DealScreen />);
    const homeId = state.stashes[0]!.countryId;
    const expectedPct = Math.round(computeBustProbability(state, 'weed', 1, homeId) * 100);

    expect(view.container.textContent).toContain('Bust chance');
    expect(view.container.innerHTML).toContain(`${expectedPct}%`);
    expect(view.container.innerHTML).toContain(`aria-valuenow="${expectedPct}"`);
    view.unmount();
  });

  it('shows exactly one primary action per state', () => {
    useGameStore.setState({ state: stateWithWeed('deal-primary') });
    const view = mount(<DealScreen />);
    expect(view.container.querySelectorAll('.cg-btn--primary')).toHaveLength(1);
    view.unmount();
  });
});

describe('DealScreen — market is legible', () => {
  it('reflects a rising price with an up trend arrow', () => {
    const base = stateWithWeed('deal-trend');
    const homeId = base.stashes[0]!.countryId;
    const state: GameState = {
      ...base,
      markets: {
        ...base.markets,
        [homeId]: {
          ...base.markets[homeId]!,
          weed: { factor: 1.2, prevFactor: 1.0 }, // rising this cycle
        },
      },
    };
    useGameStore.setState({ state });

    const view = mount(<DealScreen />);
    expect(view.container.querySelector('.cg-trend--up')).not.toBeNull();
    view.unmount();
  });
});

describe('DealScreen — the outcome is a scene, not a toast (design/05 §4)', () => {
  it('commits a buy through the store and renders its success scene', () => {
    // A fresh run holds nothing → the screen opens in buy mode; buys never bust.
    useGameStore.setState({ state: createInitialState('deal-buy') });
    const view = mount(<DealScreen />);

    const primary = view.container.querySelector('.cg-btn--primary')!;
    expect(primary.textContent).toContain('Buy');
    view.click(primary);

    expect(view.container.querySelector('.cg-scene')).not.toBeNull();
    expect(view.container.textContent).toContain('The package changes hands');
    // The store actually applied the buy (inventory now holds product).
    const after = useGameStore.getState().state!;
    expect(after.stashes[0]!.inventory.weed).toBeGreaterThan(0);
    view.unmount();
  });
});

describe('DealOutcome — success and bust both render scene text', () => {
  const base = createInitialState('deal-outcome');

  it('renders a win scene for a successful sell', () => {
    const result: DealResult = {
      state: base,
      outcome: 'success',
      displayedBustProb: 0.3,
      rolledValue: 0.9,
      cashDelta: 4_800,
      sceneKey: 'deal.sell.success',
    };
    const html = renderToStaticMarkup(<DealOutcome result={result} onContinue={() => {}} />);
    expect(html).toContain('cg-scene--win');
    expect(html).toContain('counts it twice, nods, gone.');
  });

  it('renders a bust scene — never an error/toast — for a seized sell', () => {
    const result: DealResult = {
      state: base,
      outcome: 'bust',
      displayedBustProb: 0.4,
      rolledValue: 0.1,
      cashDelta: -8_450,
      sceneKey: 'deal.sell.bust',
    };
    const html = renderToStaticMarkup(<DealOutcome result={result} onContinue={() => {}} />).toLowerCase();
    expect(html).toContain('cg-scene--bust');
    expect(html).toContain('blue lights hit the alley');
    expect(html).not.toContain('error');
  });
});
