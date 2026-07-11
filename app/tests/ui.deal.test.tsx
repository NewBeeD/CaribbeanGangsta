// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeBustProbability,
  createInitialState,
  emptyInventory,
  getRecipe,
  type DealResult,
  type GameState,
  type Stash,
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
    change(el: HTMLSelectElement, value: string) {
      act(() => {
        // Native setter so React's value tracker sees the change (controlled select).
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
          el,
          value,
        );
        el.dispatchEvent(new Event('change', { bubbles: true }));
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
          // Rising this cycle; the street pool rides along untouched.
          weed: { ...base.markets[homeId]!.weed, factor: 1.2, prevFactor: 1.0 },
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

describe('DealScreen — the kitchen (conversions, Prompt 31; Ideas2 §4)', () => {
  it('shows the recipe config verbatim, commits through the store, and renders the scene', () => {
    const base = createInitialState('deal-cook');
    const state: GameState = {
      ...base,
      stashes: base.stashes.map((s, i) =>
        i === 0
          ? { ...s, dirtyCash: 10_000, inventory: { ...s.inventory, cocaine: 15 } }
          : s,
      ),
    };
    useGameStore.setState({ state });
    const view = mount(<DealScreen />);

    // Terms disclosed BEFORE commit — the recipe config, verbatim.
    const recipe = getRecipe('cook-crack');
    const terms = view.container.querySelector('[data-testid="convert-terms-cook-crack"]')!;
    expect(terms.textContent).toContain(`${recipe.fromQty} cocaine`);
    expect(terms.textContent).toContain(`$${recipe.costPerBatch.toLocaleString('en-US')}`);
    expect(terms.textContent).toContain(`${recipe.toQty} crack`);
    expect(terms.textContent).toContain(`+${recipe.heatPerBatch} heat`);

    view.click(view.container.querySelector('[data-testid="convert-cook-crack"]')!);

    // Outcome is the recipe's scene (never a toast) and the store really cooked.
    expect(view.container.querySelector('.cg-scene')).not.toBeNull();
    expect(view.container.textContent).toContain('Baking soda');
    const home = useGameStore.getState().state!.stashes[0]!;
    expect(home.inventory.crack).toBe(recipe.toQty);
    expect(home.inventory.cocaine).toBe(15 - recipe.fromQty);
    expect(home.dirtyCash).toBe(10_000 - recipe.costPerBatch);
    view.unmount();
  });
});

describe('DealScreen — market switcher & the plug gate as prose (Prompt 31)', () => {
  /** A run with a Colombia foothold — a market where cocaine needs the plug. */
  function stateWithColombia(seed: string): GameState {
    const base = createInitialState(seed);
    const colombia: Stash = {
      id: 'stash-colombia',
      name: 'Bogotá room',
      countryId: 'colombia',
      type: 'floor',
      dirtyCash: 500_000,
      inventory: emptyInventory(),
    };
    return { ...base, stashes: [...base.stashes, colombia] };
  }

  it('switching markets re-renders the board for that stash country and shows the gate prose', () => {
    useGameStore.setState({ state: stateWithColombia('deal-switch') });
    const view = mount(<DealScreen />);

    // Switch the board to the Colombia stash's market.
    const switcher = view.container.querySelector<HTMLSelectElement>(
      '[data-testid="market-switcher"]',
    )!;
    expect(switcher).not.toBeNull();
    view.change(switcher, 'stash-colombia');
    expect(view.container.textContent).toContain('Colombia');

    // Pick the gated product: the buy side reads as prose with the intro price.
    const cocaineRow = [...view.container.querySelectorAll('button.cg-panel')].find((b) =>
      b.textContent!.includes('Cocaine'),
    )!;
    view.click(cocaineRow);
    expect(view.container.textContent).toContain('doesn’t sell cocaine to strangers');
    expect(view.container.textContent).toContain('$220,000 buys the introduction');
    // …with a jump to the plug flow, and the primary action disabled.
    expect(view.container.querySelector('[data-testid="jump-to-plug"]')).not.toBeNull();
    const primary = view.container.querySelector<HTMLButtonElement>('.cg-btn--primary')!;
    expect(primary.disabled).toBe(true);
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
