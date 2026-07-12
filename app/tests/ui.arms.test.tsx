// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARMS_BROKER_COST,
  createInitialState,
  hire,
  unlockArmsBroker,
  type GameState,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { ArmsScreen } from '@/ui/screens/ArmsScreen';
import { productRows } from '@/ui/screens/dealScreen.model';

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

/** A run with the broker paid and cash on hand — the unlocked trade. */
function armed(seed: string): GameState {
  const opened = unlockArmsBroker({ ...createInitialState(seed), cleanCash: 3_000_000 }).state;
  const home = opened.stashes[0]!;
  return { ...opened, stashes: [{ ...home, dirtyCash: 500_000 }, ...opened.stashes.slice(1)] };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ArmsScreen — the broker gate (a pure money gate; design/12 Item 1)', () => {
  it('shows the intro priced in prose and disables the meeting when clean cash is short', () => {
    useGameStore.setState({ state: { ...createInitialState('arms-locked'), cleanCash: 0 } });
    const view = mount(<ArmsScreen />);
    expect(view.container.textContent).toContain('The broker takes meetings at two and a half');
    const unlock = view.container.querySelector<HTMLButtonElement>('[data-testid="arms-broker-unlock"]')!;
    expect(unlock).not.toBeNull();
    expect(unlock.disabled).toBe(true);
    // No trade panel while locked — just the priced catalogue.
    expect(view.container.querySelector('[data-testid="arms-commit"]')).toBeNull();
    view.unmount();
  });

  it('takes the meeting through the store: unlocks the trade and shows the scene', () => {
    useGameStore.setState({ state: { ...createInitialState('arms-open'), cleanCash: ARMS_BROKER_COST + 1 } });
    const view = mount(<ArmsScreen />);
    view.click(view.container.querySelector('[data-testid="arms-broker-unlock"]')!);
    expect(view.container.querySelector('.cg-scene')).not.toBeNull();
    expect(useGameStore.getState().state!.armsBroker).toBe(true);
    view.unmount();
  });
});

describe('ArmsScreen — the trade (weapon tiers, heaviest heat)', () => {
  it('lists the weapon tiers with prices and per-unit heat', () => {
    useGameStore.setState({ state: armed('arms-board') });
    const view = mount(<ArmsScreen />);
    expect(view.container.textContent).toContain('Pistols');
    expect(view.container.textContent).toContain('Military-grade');
    expect(view.container.textContent).toContain('heat/unit');
    view.unmount();
  });

  it('commits a buy through the store into the armory, rendered as a scene', () => {
    useGameStore.setState({ state: armed('arms-buy') });
    const view = mount(<ArmsScreen />);
    const commit = view.container.querySelector('[data-testid="arms-commit"]')!;
    expect(commit.textContent).toContain('Buy');
    view.click(commit);
    expect(view.container.querySelector('.cg-scene')).not.toBeNull();
    expect(useGameStore.getState().state!.armory.pistols).toBeGreaterThan(0);
    view.unmount();
  });

  it('surfaces the Customs Chief EUC relief on a sale', () => {
    const base = armed('arms-euc');
    const withChief = hire({ ...base, cleanCash: 100_000 }, 'customs-chief', {
      portId: base.stashes[0]!.countryId,
    }).state;
    const state: GameState = { ...withChief, armory: { ...withChief.armory, pistols: 6 } };
    useGameStore.setState({ state });

    const view = mount(<ArmsScreen />);
    // Selecting a held tier flips the panel to sell mode → the risk panel shows.
    const pistolRow = [...view.container.querySelectorAll('button.cg-panel')].find((b) =>
      b.textContent!.includes('Pistols'),
    )!;
    view.click(pistolRow);
    expect(view.container.textContent).toContain('Seizure chance');
    expect(view.container.querySelector('[data-testid="arms-euc-note"]')).not.toBeNull();
    view.unmount();
  });
});

describe('the drug board no longer carries arms (design/12 Item 1)', () => {
  it('productRows excludes arms — it trades only on the Arms page', () => {
    const state = createInitialState('arms-off-board');
    const rows = productRows(state, state.stashes[0]!);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === 'arms')).toBe(false);
  });
});
