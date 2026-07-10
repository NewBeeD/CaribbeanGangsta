// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  emptyInventory,
  interdictionChance,
  quoteShipment,
  totalDirtyCash,
  type GameState,
  type ShipIntent,
  type Stash,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { ShipmentDesk } from '@/ui/screens/ShipmentDesk';

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

/** A run with cocaine + cash at home and a Miami foothold to ship to. */
function shippingState(seed: string): GameState {
  const base = createInitialState(seed);
  const miami: Stash = {
    id: 'stash-miami',
    name: 'Miami stash',
    countryId: 'miami',
    type: 'safehouse',
    dirtyCash: 0,
    inventory: emptyInventory(),
  };
  return {
    ...base,
    stashes: [
      { ...base.stashes[0]!, dirtyCash: 5_000_000, inventory: { ...base.stashes[0]!.inventory, cocaine: 30 } },
      miami,
    ],
  };
}

/** The desk's default manifest for `shippingState` (first origin/cargo/dest). */
function defaultIntent(state: GameState): ShipIntent {
  return {
    type: 'ship',
    product: 'cocaine',
    qty: 1,
    fromStashId: state.stashes[0]!.id,
    toStashId: 'stash-miami',
    mode: 'go-fast',
  };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ShipmentDesk — fairness law on the manifest (GDD §8)', () => {
  it('renders EXACTLY interdictionChance on the RiskMeter for the current manifest', () => {
    const state = shippingState('ship-fair');
    useGameStore.setState({ state });
    const view = mount(<ShipmentDesk />);

    const intent = defaultIntent(state);
    const expectedPct = Math.round(interdictionChance(state, intent) * 100);
    expect(view.container.textContent).toContain('Interdiction odds');
    expect(view.container.innerHTML).toContain(`aria-valuenow="${expectedPct}"`);
    view.unmount();
  });

  it('quotes the full price — transport, owner cut, ETA — before the launch button', () => {
    const state = shippingState('ship-quote');
    useGameStore.setState({ state });
    const view = mount(<ShipmentDesk />);

    const quote = quoteShipment(state, defaultIntent(state));
    const text = view.container.querySelector('[data-testid="ship-quote"]')!.textContent!;
    expect(text).toContain(`$${Math.round(quote.transportCost).toLocaleString('en-US')}`);
    expect(text).toContain(`$${Math.round(quote.ownerCut).toLocaleString('en-US')}`); // go-fast owner's taste
    expect(text).toContain(`~${Math.ceil(quote.etaHours)}h`);
    view.unmount();
  });

  it('launches through the store, charges exactly the quote, and tracks the flight', () => {
    const state = shippingState('ship-launch');
    useGameStore.setState({ state });
    const view = mount(<ShipmentDesk />);

    const quote = quoteShipment(state, defaultIntent(state));
    const poolBefore = totalDirtyCash(state) + state.cleanCash;
    view.click(view.container.querySelector('[data-testid="launch-shipment"]')!);

    const after = useGameStore.getState().state!;
    expect(after.shipments).toHaveLength(1);
    expect(after.shipments[0]!.interdictionChance).toBe(quote.interdictionChance);
    expect(poolBefore - (totalDirtyCash(after) + after.cleanCash)).toBe(quote.totalCost);

    // The tracker now shows the consignment with its ETA and the SAME odds.
    const inflight = view.container.querySelector('[data-testid="shipment-inflight"]')!;
    expect(inflight.textContent).toContain('cocaine');
    expect(inflight.textContent).toContain(`odds ${Math.round(quote.interdictionChance * 100)}%`);
    view.unmount();
  });

  it('with no foreign foothold, points at the Empire map instead of a dead form', () => {
    const base = createInitialState('ship-nowhere');
    const state: GameState = {
      ...base,
      stashes: [{ ...base.stashes[0]!, inventory: { ...base.stashes[0]!.inventory, weed: 5 } }],
    };
    useGameStore.setState({ state });
    const view = mount(<ShipmentDesk />);
    expect(view.container.textContent).toContain('needs somewhere to land');
    expect(view.container.querySelector('[data-testid="launch-shipment"]')).toBeNull();
    view.unmount();
  });
});
