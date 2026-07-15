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
import {
  boardRows,
  countryPriceSheet,
  priceBook,
  widestSpread,
} from '@/ui/screens/worldMarket.model';
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

describe('worldMarket.model — the country sheet is the SAME price, read sideways (Ideas2 §6)', () => {
  it('countryPriceSheet(c) is byte-identical to getMarketPrice and to boardRows for every drug', () => {
    const state = createInitialState('sheet-fair');
    for (const c of COUNTRIES) {
      const sheet = countryPriceSheet(state, c.id);
      // Every DRUG, arms excluded — the drug menu, matching the Deal screen.
      expect(sheet.map((r) => r.productId)).toEqual(
        PRODUCTS.filter((p) => p.id !== 'arms').map((p) => p.id),
      );
      expect(sheet.some((r) => r.productId === 'arms')).toBe(false);
      for (const row of sheet) {
        const price = getMarketPrice(state, row.productId, c.id);
        expect(row.price).toBe(price.price);
        expect(row.stock).toBe(price.stock);
        expect(row.trend).toBe(price.trend);
        expect(row.traded).toBe(isTraded(c.id, row.productId));
        // …and identical to the same cell read the other way (one price path).
        const boardCell = boardRows(state, row.productId).find((b) => b.countryId === c.id)!;
        expect(row.price).toBe(boardCell.price);
        expect(row.plugGated).toBe(boardCell.plugGated);
        expect(row.plugCost).toBe(boardCell.plugCost);
      }
    }
  });

  it('a plug-gated source shows contract price + intro cost; a non-traded drug is inert', () => {
    const state = createInitialState('sheet-plug');
    const colombia = countryPriceSheet(state, 'colombia');
    const coke = colombia.find((r) => r.productId === 'cocaine')!;
    expect(coke.plugGated).toBe(true);
    expect(coke.plugCost).toBeGreaterThan(0);

    const crescent = countryPriceSheet(state, 'golden-crescent');
    const crescentCoke = crescent.find((r) => r.productId === 'cocaine')!;
    expect(crescentCoke.traded).toBe(false);
  });

  it('an unknown country id yields an empty sheet (no throw)', () => {
    const state = createInitialState('sheet-unknown');
    expect(countryPriceSheet(state, 'atlantis')).toEqual([]);
  });
});

describe('worldMarket.model — the price book (all drugs × all countries)', () => {
  it('is a full drugs×countries grid sharing the boardRows price path, arms excluded', () => {
    const state = createInitialState('book-grid');
    const book = priceBook(state);
    const drugs = PRODUCTS.filter((p) => p.id !== 'arms');
    expect(book.products.map((p) => p.id)).toEqual(drugs.map((p) => p.id));
    expect(book.countries.map((c) => c.id)).toEqual(COUNTRIES.map((c) => c.id));
    book.products.forEach((p, i) => {
      expect(book.rows[i]).toEqual(boardRows(state, p.id));
    });
    // The highlight pair is the board's widest spread, verbatim.
    expect(book.spread).toEqual(widestSpread(state));
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

  it('By country view: pick a country, read every drug from minute one (no stash needed)', () => {
    useGameStore.setState({ state: createInitialState('board-country') });
    const view = mount(<WorldMarketScreen />);

    // Switch to the location-centric view.
    view.click(view.container.querySelector('[data-testid="view-country"]')!);

    // Default sheet country is the first on the roster; its whole drug menu shows.
    const first = COUNTRIES[0]!;
    const drugs = PRODUCTS.filter((p) => p.id !== 'arms');
    for (const p of drugs) {
      expect(view.container.querySelector(`[data-testid="sheet-${p.id}"]`)).not.toBeNull();
    }
    // Arms never appear on the drug sheet.
    expect(view.container.querySelector('[data-testid="sheet-arms"]')).toBeNull();

    // Every cell equals the engine price for THIS country.
    const state = useGameStore.getState().state!;
    const coke = view.container.querySelector('[data-testid="sheet-cocaine"]')!;
    const price = getMarketPrice(state, 'cocaine', first.id);
    if (isTraded(first.id, 'cocaine')) {
      expect(coke.textContent).toContain(`$${Math.round(price.price).toLocaleString('en-US')}`);
    }

    // Pick another country and the sheet re-reads there.
    const other = COUNTRIES[1]!;
    view.click(view.container.querySelector(`[data-testid="sheet-country-${other.id}"]`)!);
    expect(view.container.textContent).toContain(`Every drug's price in ${other.name}`);

    // And the Price book matrix renders a live cell.
    view.click(view.container.querySelector('[data-testid="view-book"]')!);
    expect(
      view.container.querySelector(`[data-testid="book-cocaine-${first.id}"]`),
    ).not.toBeNull();
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
