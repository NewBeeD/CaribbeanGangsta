// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addStash,
  createInitialState,
  effectiveSeizurePct,
  recruit,
  type GameState,
  type PaidPort,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { StorageScreen } from '@/ui/screens/StorageScreen';
import {
  buildCountries,
  buildOptions,
  diversificationCue,
  stashRows,
  stashRowsByCountry,
} from '@/ui/screens/storageScreen.model';

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

/** A run with a set clean-cash balance for the build actions. */
function run(seed: string, clean = 0): GameState {
  return { ...createInitialState(seed), cleanCash: clean };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('storageScreen.model — where to stash, made legible (Prompt 20)', () => {
  it('each stash row shows exactly `effectiveSeizurePct` (the number rolled)', () => {
    const state = run('stash-fair');
    for (const r of stashRows(state)) {
      const enginePct = effectiveSeizurePct(state, r.id);
      expect(r.seizurePct).toBe(enginePct);
      expect(r.seizurePctLabel).toBe(`${Math.round(enginePct * 100)}%`);
    }
  });

  it('a paid port visibly lowers a container stash’s seizure %', () => {
    const built = addStash(run('stash-port', 100_000), 'container');
    const container = built.stash!;

    const unpaid = stashRows(built.state).find((r) => r.id === container.id)!;
    expect(unpaid.seizurePct).toBeCloseTo(0.15, 5); // container base seizure

    const paid: PaidPort = {
      portId: container.countryId,
      seizurePct: 0.03,
      paidAtHours: 0,
      paidUntilHours: 999,
    };
    const paidState: GameState = {
      ...built.state,
      corruption: { ...built.state.corruption, paidPorts: [paid] },
    };
    const after = stashRows(paidState).find((r) => r.id === container.id)!;
    expect(after.seizurePct).toBeCloseTo(0.03, 5);
    expect(after.seizurePct).toBeLessThan(unpaid.seizurePct);
  });

  it('build options price exactly along the engine cost curve, gated by cash', () => {
    const state = run('stash-build', 3_000);
    const buried = buildOptions(state).find((o) => o.type === 'buried')!;
    expect(buried.cost).toBe(3_000); // base cost, none owned yet
    expect(buried.affordable).toBe(true);
    const container = buildOptions(state).find((o) => o.type === 'container')!;
    expect(container.affordable).toBe(false); // 60k build, only 3k clean
    expect(container.paidSeizurePctLabel).toBe('3%');
  });

  it('diversification cue reads concentration as a fact, not a scolding', () => {
    const one = run('div-one'); // one stash holds all the starting dirty cash
    const cueOne = diversificationCue(one);
    expect(cueOne.concentrated).toBe(true);
    expect(cueOne.line.toLowerCase()).not.toContain('should');

    // Split the value evenly across a second stash ⇒ well spread.
    const built = addStash({ ...one, cleanCash: 10_000 }, 'buried');
    const spread: GameState = {
      ...built.state,
      stashes: built.state.stashes.map((s) => ({ ...s, dirtyCash: 5_000 })),
    };
    expect(diversificationCue(spread).concentrated).toBe(false);
  });
});

describe('StorageScreen — managing where product lives (Prompt 20)', () => {
  it('building a stash spends clean cash and adds it to the roster', () => {
    useGameStore.setState({ state: run('storage-build', 5_000) });
    const view = mount(<StorageScreen />);

    const before = useGameStore.getState().state!.stashes.length;
    const buildBtns = view.container.querySelectorAll('[data-testid="build-stash"]');
    const enabled = [...buildBtns].find((b) => !(b as HTMLButtonElement).disabled)!;
    view.click(enabled);

    expect(useGameStore.getState().state!.stashes.length).toBe(before + 1);
    view.unmount();
  });

  it('posting a guard writes the stash’s guard and lowers its seizure %', () => {
    // A vault requires a guard; unguarded it carries the inside-job penalty.
    const withVault = addStash(run('storage-guard', 20_000), 'safehouse');
    const withCrew = recruit(withVault.state, 'deon');
    useGameStore.setState({ state: withCrew.state });

    const vault = withVault.stash!;
    const guard = withCrew.crew!;
    const unguarded = effectiveSeizurePct(withCrew.state, vault.id);

    useGameStore.getState().assignStashGuard(vault.id, guard.id);
    const after = useGameStore.getState().state!;
    expect(after.stashes.find((s) => s.id === vault.id)!.guardCrewId).toBe(guard.id);
    expect(effectiveSeizurePct(after, vault.id)).toBeLessThan(unguarded);
  });

  it('renders each stash’s seizure % — loss is a scene, never a raw toast', () => {
    useGameStore.setState({ state: run('storage-view') });
    const view = mount(<StorageScreen />);
    const seizure = view.container.querySelector('[data-testid="stash-seizure"]');
    expect(seizure).not.toBeNull();
    expect(seizure!.textContent).toContain('%');
    view.unmount();
  });
});

describe('build a stash anywhere you hold ground (not just home)', () => {
  /** Home run + a floor foothold manually held in a foreign country (`miami`). */
  function withForeignFloor(seed: string, clean = 100_000): GameState {
    const base = run(seed, clean);
    const home = base.stashes[0]!;
    return {
      ...base,
      stashes: [
        ...base.stashes,
        {
          ...home,
          id: 'stash-floor-miami',
          name: 'Miami floor',
          countryId: 'miami',
          type: 'floor',
          dirtyCash: 0,
        },
      ],
    };
  }

  it('buildCountries lists every held country, home first', () => {
    const state = withForeignFloor('build-list');
    const countries = buildCountries(state);
    expect(countries[0]!.isHome).toBe(true);
    expect(countries.map((c) => c.countryId)).toContain('miami');
    // Home already holds its starting floor, so a floor is no longer buildable there.
    expect(countries.find((c) => c.isHome)!.buildableTypes).toBeLessThan(5);
  });

  it('buildOptions targets the chosen country’s own slate', () => {
    // Give home a safehouse; the foreign floor-only country should still offer one.
    const withVault = addStash(run('build-target', 100_000), 'safehouse');
    const home = withVault.state.stashes[0]!;
    const state: GameState = {
      ...withVault.state,
      stashes: [
        ...withVault.state.stashes,
        { ...home, id: 'stash-floor-miami', name: 'Miami floor', countryId: 'miami', type: 'floor', dirtyCash: 0 },
      ],
    };
    const homeId = state.world.startingCountry.id;
    expect(buildOptions(state, homeId).map((o) => o.type)).not.toContain('safehouse');
    expect(buildOptions(state, 'miami').map((o) => o.type)).toContain('safehouse');
  });

  it('buildStash plants a safehouse in a held non-home country (reinforce — no gate)', () => {
    useGameStore.setState({ state: withForeignFloor('build-foreign') });
    const result = useGameStore.getState().buildStash({ stashType: 'safehouse', countryId: 'miami' });
    expect(result?.stash).not.toBeNull();
    const stashes = useGameStore.getState().state!.stashes;
    expect(stashes.some((s) => s.countryId === 'miami' && s.type === 'safehouse')).toBe(true);
  });

  it('every stash row carries its country name and home flag', () => {
    const state = withForeignFloor('rows-country');
    const homeId = state.world.startingCountry.id;
    for (const r of stashRows(state)) {
      expect(r.countryName.length).toBeGreaterThan(0);
      expect(r.isHome).toBe(r.countryId === homeId);
    }
    expect(stashRows(state).some((r) => r.countryId === 'miami')).toBe(true);
  });

  it('stashRowsByCountry groups stashes under their country, home first', () => {
    const state = withForeignFloor('groups');
    const groups = stashRowsByCountry(state);
    expect(groups[0]!.isHome).toBe(true); // home leads
    expect(groups.map((g) => g.countryId)).toContain('miami');
    // Every row in a group actually belongs to that group's country.
    for (const g of groups) {
      expect(g.rows.every((r) => r.countryId === g.countryId)).toBe(true);
    }
    // No stash is dropped or duplicated across groups.
    const grouped = groups.flatMap((g) => g.rows.map((r) => r.id)).sort();
    expect(grouped).toEqual(state.stashes.map((s) => s.id).sort());
  });

  it('the screen labels each stash with its country', () => {
    useGameStore.setState({ state: withForeignFloor('ui-country') });
    const view = mount(<StorageScreen />);
    const headings = [...view.container.querySelectorAll('[data-testid="country-heading"]')].map(
      (h) => h.textContent,
    );
    // A home heading and the foreign country both show up as section headers.
    expect(headings.some((t) => t?.includes('Home'))).toBe(true);
    expect(headings.length).toBeGreaterThanOrEqual(2);
    view.unmount();
  });

  it('the screen offers a country selector and builds into the picked country', () => {
    useGameStore.setState({ state: withForeignFloor('build-ui') });
    const view = mount(<StorageScreen />);

    const select = view.container.querySelector<HTMLSelectElement>(
      '[data-testid="build-country"]',
    )!;
    expect(select).not.toBeNull();
    expect([...select.options].map((o) => o.value)).toContain('miami');

    // Point the build card at the foreign country, then build — the new stash must
    // land in the PICKED country, not home.
    act(() => {
      select.value = 'miami';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const miamiBefore = useGameStore
      .getState()
      .state!.stashes.filter((s) => s.countryId === 'miami').length;
    const buildBtn = [...view.container.querySelectorAll('[data-testid="build-stash"]')].find(
      (b) => !(b as HTMLButtonElement).disabled,
    )!;
    view.click(buildBtn);

    const miamiStashes = useGameStore
      .getState()
      .state!.stashes.filter((s) => s.countryId === 'miami');
    expect(miamiStashes.length).toBe(miamiBefore + 1);
    view.unmount();
  });
});

describe('move rejections are legible, with numbers (design/13 A4)', () => {
  it('moveRejectProse gives each reason its own line with the real numbers', async () => {
    const { moveRejectProse, cashMoveRejectProse } = await import(
      '@/ui/screens/storageScreen.model'
    );
    const { effectiveCapacity } = await import('@/engine');

    // Home + a same-country safehouse with 12 units of room + a foreign stash.
    const built = addStash(run('move-prose', 500_000), 'safehouse');
    const dest = built.stash!;
    const home = built.state.stashes[0]!;
    const state: GameState = {
      ...built.state,
      stashes: [
        { ...home, inventory: { ...home.inventory, weed: 5 } },
        {
          ...dest,
          inventory: {
            ...dest.inventory,
            weed: effectiveCapacity(built.state, dest) - 12,
          },
        },
        {
          ...home,
          id: 'stash-miami',
          name: 'Miami spot',
          countryId: 'miami',
          dirtyCash: 0,
        },
      ],
    };

    expect(
      moveRejectProse(state, 'insufficient-capacity', {
        fromId: home.id,
        toId: dest.id,
        product: 'weed',
        qty: 40,
      }),
    ).toBe(`${dest.name} is full — 12 of 40 fit.`);

    expect(
      moveRejectProse(state, 'insufficient-inventory', {
        fromId: home.id,
        toId: dest.id,
        product: 'weed',
        qty: 30,
      }),
    ).toContain('doesn’t hold 30 weed');

    expect(
      moveRejectProse(state, 'cross-country', {
        fromId: home.id,
        toId: 'stash-miami',
        product: 'weed',
        qty: 1,
      }),
    ).toContain('Transport desk');

    expect(
      cashMoveRejectProse(state, 'insufficient-funds', { fromId: 'stash-miami', amount: 500 }),
    ).toContain('only holds $0 dirty');
  });

  it('the move sheet shows the destination’s remaining room and rejects with numbers', async () => {
    const { effectiveCapacity } = await import('@/engine');
    // A FULL same-country destination: the default 1-unit move must reject.
    const built = addStash(run('move-full', 500_000), 'safehouse');
    const dest = built.stash!;
    const home = built.state.stashes[0]!;
    const state: GameState = {
      ...built.state,
      stashes: built.state.stashes.map((s) =>
        s.id === home.id
          ? { ...s, inventory: { ...s.inventory, weed: 5 } }
          : { ...s, inventory: { ...s.inventory, weed: effectiveCapacity(built.state, s) } },
      ),
    };
    useGameStore.setState({ state });

    const view = mount(<StorageScreen />);
    // The destination's remaining effectiveCapacity is disclosed BEFORE the move.
    const room = view.container.querySelector('[data-testid="move-room"]')!;
    expect(room.textContent).toContain(`Room at ${dest.name}: 0 units`);

    view.click(view.container.querySelector('[data-testid="move-product"]')!);
    const feedback = view.container.querySelector('[data-testid="move-feedback"]')!;
    expect(feedback.textContent).toBe(`${dest.name} is full — 0 of 1 fit.`);
    view.unmount();
  });
});
