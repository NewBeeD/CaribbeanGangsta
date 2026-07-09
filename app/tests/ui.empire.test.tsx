// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRIES, createInitialState, type GameState } from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { EmpireMap } from '@/ui/screens/EmpireMap';
import {
  districtViews,
  empireSummary,
  expansionCost,
  nextAffordableStep,
} from '@/ui/screens/empireMap.model';

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

/** A run with clean cash on hand — so expansion is affordable. */
function fundedRun(seed: string, clean: number): GameState {
  return { ...createInitialState(seed), cleanCash: clean };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('empireMap.model — territory as countries (empireComposite mapping)', () => {
  it('home country is controlled; every other country starts unowned', () => {
    const state = createInitialState('empire-model');
    const ds = districtViews(state);
    const home = ds.find((d) => d.isHome)!;
    expect(home.status).toBe('home');
    expect(ds.filter((d) => d.status === 'unowned')).toHaveLength(COUNTRIES.length - 1);
  });

  it('the next step is null when broke and opens a route when funded (money is the gate)', () => {
    expect(nextAffordableStep(fundedRun('empire-broke', 0))).toBeNull();
    const step = nextAffordableStep(fundedRun('empire-funded', 1_000_000));
    expect(step?.kind).toBe('open');
  });
});

describe('EmpireMap — the whole map is open, money is the only gate (Ideas.md)', () => {
  it('renders a summary row matching engine state', () => {
    const state = createInitialState('empire-summary');
    useGameStore.setState({ state });
    const s = empireSummary(state);

    const view = mount(<EmpireMap />);
    expect(view.container.textContent).toContain(`Fronts ${s.fronts}`);
    expect(view.container.textContent).toContain(`Crew ${s.crew}`);
    expect(view.container.textContent).toContain(`Routes ${s.routes}`);
    expect(view.container.textContent).toContain(`Rivals ${s.rivals}`);
    view.unmount();
  });

  it('shows unowned zones with their price but leaves them un-actionable when broke', () => {
    const poor = fundedRun('empire-poor', 0);
    useGameStore.setState({ state: poor });

    const view = mount(<EmpireMap />);
    const cost = expansionCost(poor);
    // The price is always visible (never hidden behind a flag)…
    expect(view.container.textContent).toContain(`$${cost.toLocaleString('en-US')}`);
    // …but nothing is affordable, so no primary is emphasized and every action is disabled.
    expect(view.container.querySelectorAll('.cg-btn--primary')).toHaveLength(0);
    const buttons = [...view.container.querySelectorAll('.cg-btn')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.hasAttribute('disabled'))).toBe(true);
    view.unmount();
  });

  it('highlights exactly one next affordable step once cash is in hand', () => {
    useGameStore.setState({ state: fundedRun('empire-rich', 1_000_000) });
    const view = mount(<EmpireMap />);
    expect(view.container.querySelectorAll('.cg-btn--primary')).toHaveLength(1);
    view.unmount();
  });

  it('renders controlled and unowned districts distinctly', () => {
    useGameStore.setState({ state: createInitialState('empire-distinct') });
    const view = mount(<EmpireMap />);
    expect(view.container.textContent).toContain('Home turf');
    expect(view.container.textContent).toContain('No presence');
    expect(view.container.querySelector('[data-status="home"]')).not.toBeNull();
    expect(view.container.querySelector('[data-status="unowned"]')).not.toBeNull();
    view.unmount();
  });

  it('opening a route is a purchase — it builds a foothold in that country immediately', () => {
    useGameStore.setState({ state: fundedRun('empire-open', 1_000_000) });
    const before = useGameStore.getState().state!;
    const homeId = before.world.startingCountry.id;
    const target = COUNTRIES.find((c) => c.id !== homeId)!;

    const view = mount(<EmpireMap />);
    // Districts render one button per country, in COUNTRIES order.
    const idx = COUNTRIES.findIndex((c) => c.id === target.id);
    const button = [...view.container.querySelectorAll('.cg-btn')][idx]!;
    view.click(button);

    const after = useGameStore.getState().state!;
    expect(after.stashes.some((s) => s.countryId === target.id)).toBe(true);
    expect(after.stashes).toHaveLength(before.stashes.length + 1);
    // Paid from clean cash — the purchase actually cost money.
    expect(after.cleanCash).toBeLessThan(before.cleanCash);
    view.unmount();
  });
});
