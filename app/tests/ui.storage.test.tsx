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
  buildOptions,
  diversificationCue,
  stashRows,
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
