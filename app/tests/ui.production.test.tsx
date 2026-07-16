// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  buyProductionOp,
  productionUpgradeCost,
  spawnCrew,
  CREW_ARCHETYPES,
  type GameState,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { ProductionScreen } from '@/ui/screens/ProductionScreen';
import { buyOpOptions, opRows } from '@/ui/screens/production.model';

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

/** A run with clean cash on hand (rest of the state fresh). */
function funded(seed: string, clean: number): GameState {
  return { ...createInitialState(seed), cleanCash: clean };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('production.model — priced ops on the open-access curve', () => {
  it('offers every op from minute one; a bought op drops out of the buy roster', () => {
    const state = funded('prod-roster', 50_000);
    const before = buyOpOptions(state).length;
    expect(before).toBeGreaterThan(0);

    const bought = buyProductionOp(state, 'backyard-grow').state;
    const types = buyOpOptions(bought).map((o) => o.type);
    expect(types).not.toContain('backyard-grow');
    expect(types).toHaveLength(before - 1);
    expect(opRows(bought)).toHaveLength(1);
  });

  it('upgrade cost matches buy_in × 1.15^level (shown = charged)', () => {
    const bought = buyProductionOp(funded('prod-cost', 50_000), 'backyard-grow').state;
    const [row] = opRows(bought);
    expect(row!.upgradeCost).toBe(productionUpgradeCost('backyard-grow', 1));
  });

  it('an assigned lieutenant lifts the shown yield above base', () => {
    const bought = buyProductionOp(funded('prod-lt', 50_000), 'backyard-grow').state;
    const base = opRows(bought)[0]!.unitsPerHour;
    const lt = spawnCrew(CREW_ARCHETYPES[0]!.id, {
      id: 'lt-1',
      role: 'lieutenant',
      productionOpIds: ['prod-backyard-grow'],
    });
    const withLt: GameState = { ...bought, crew: [lt] };
    const row = opRows(withLt)[0]!;
    expect(row.unitsPerHour).toBeGreaterThan(base);
    expect(row.managerBonus).toBeGreaterThan(0);
    expect(row.manager?.id).toBe('lt-1');
  });
});

describe('ProductionScreen — become a supplier', () => {
  it('renders the buy roster and sets up an op on click', () => {
    useGameStore.setState({ state: funded('prod-buy', 1_000_000) });
    const before = useGameStore.getState().state!;

    const view = mount(<ProductionScreen />);
    const buy = view.container.querySelector('[data-testid="op-buy"]')!;
    expect(buy).not.toBeNull();
    view.click(buy);

    const after = useGameStore.getState().state!;
    expect(after.productionOps.length).toBe(before.productionOps.length + 1);
    expect(after.cleanCash).toBeLessThan(before.cleanCash);
    view.unmount();
  });

  it('emphasizes exactly one affordable upgrade when an op is owned', () => {
    useGameStore.setState({
      state: buyProductionOp(funded('prod-hi', 1_000_000), 'backyard-grow').state,
    });
    const view = mount(<ProductionScreen />);
    expect(view.container.querySelectorAll('.cg-btn--primary')).toHaveLength(1);
    view.unmount();
  });

  it('has no loss surface — production never frames absence as a risk (GDD §6)', () => {
    useGameStore.setState({
      state: buyProductionOp(funded('prod-safe', 1_000_000), 'crack-lab').state,
    });
    const view = mount(<ProductionScreen />);
    const text = view.container.textContent!.toLowerCase();
    expect(text).not.toContain('at risk');
    expect(text).not.toContain('seized');
    view.unmount();
  });
});
