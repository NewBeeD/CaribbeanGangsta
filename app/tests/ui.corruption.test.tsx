// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HAGGLE_REFUSE_CHANCE,
  addStash,
  createInitialState,
  effectiveSeizurePct,
  hire,
  quoteBribe,
  type GameState,
  type OfficialTie,
  type RaiseAsk,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { CorruptionScreen } from '@/ui/screens/CorruptionScreen';
import {
  HAGGLE_REFUSE_PCT,
  payrollRows,
  portRows,
} from '@/ui/screens/corruptionScreen.model';

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

function run(seed: string, clean = 0): GameState {
  return { ...createInitialState(seed), cleanCash: clean };
}

/** A run holding a container stash with dirty cash staged through its port. */
function withPort(seed: string, clean: number, staged: number): GameState {
  const built = addStash(run(seed, clean), 'container');
  const container = built.stash!;
  return {
    ...built.state,
    stashes: built.state.stashes.map((s) =>
      s.id === container.id ? { ...s, dirtyCash: staged } : s,
    ),
  };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('corruptionScreen.model — who to buy, made legible (Prompt 20)', () => {
  it('a port row shows the exact ask + resulting seizure % BEFORE paying', () => {
    const state = withPort('corr-port', 1_000_000, 50_000);
    const row = portRows(state)[0]!;
    const quote = quoteBribe(state, row.portId, row.shipmentValue);
    expect(row.ask).toBe(quote.ask); // shown == charged (fairness law)
    expect(row.unpaidSeizurePctLabel).toBe('30%');
    expect(row.paidSeizurePctLabel).toBe('3%');
  });

  it('the haggle odds shown are the engine’s refuse chance', () => {
    expect(HAGGLE_REFUSE_PCT).toBe(Math.round(HAGGLE_REFUSE_CHANCE * 100));
  });

  it('a pending raise-ask surfaces as prose plus its number', () => {
    const hired = hire(run('corr-raise', 100_000), 'beat-cop');
    const raise: RaiseAsk = {
      newRetainer: 2_400,
      askedAtHours: 10,
      reason: 'The empire’s grown and so has the risk.',
    };
    const withRaise: GameState = {
      ...hired.state,
      corruption: {
        ...hired.state.corruption,
        officials: hired.state.corruption.officials.map((o) => ({ ...o, pendingRaise: raise })),
      },
    };
    const row = payrollRows(withRaise)[0]!;
    expect(row.pendingRaise).not.toBeNull();
    expect(row.pendingRaise!.newRetainer).toBe(2_400);
    expect(row.pendingRaise!.reason).toContain('risk');
  });

  it('a flipped official reads as prose, never a loyalty number', () => {
    const hired = hire(run('corr-flip', 100_000), 'beat-cop');
    const flipped: OfficialTie = { ...hired.state.corruption.officials[0]!, isWire: true };
    const state: GameState = {
      ...hired.state,
      corruption: { ...hired.state.corruption, officials: [flipped] },
    };
    const row = payrollRows(state)[0]!;
    expect(row.isWire).toBe(true);
    expect(row.statusLine.toLowerCase()).toContain('flipped');
    expect(row.statusLine).not.toMatch(/\d/); // no numbers in the standing prose
  });
});

describe('CorruptionScreen — buying your way to safety (Prompt 20)', () => {
  it('hiring an official spends the first week and adds them to the payroll', () => {
    useGameStore.setState({ state: run('corr-hire', 100_000) });
    const view = mount(<CorruptionScreen />);

    const before = useGameStore.getState().state!.cleanCash;
    const hireBtn = [...view.container.querySelectorAll('[data-testid="hire-official"]')].find(
      (b) => !(b as HTMLButtonElement).disabled,
    )!;
    view.click(hireBtn);

    const after = useGameStore.getState().state!;
    expect(after.corruption.officials.length).toBe(1);
    expect(after.cleanCash).toBeLessThan(before);
    view.unmount();
  });

  it('paying a port bribe lowers that container’s seizure to the floor', () => {
    // Stage under the guard-cash threshold so the base container seizure is clean.
    const state = withPort('corr-pay', 1_000_000, 40_000);
    const container = state.stashes.find((s) => s.type === 'container')!;
    expect(effectiveSeizurePct(state, container.id)).toBeCloseTo(0.15, 5);

    useGameStore.setState({ state });
    const view = mount(<CorruptionScreen />);
    view.click(view.container.querySelector('[data-testid="pay-bribe"]')!);

    const after = useGameStore.getState().state!;
    expect(effectiveSeizurePct(after, container.id)).toBeCloseTo(0.03, 5);
    view.unmount();
  });

  it('offers a walk / reroute — a bribe is never forced', () => {
    useGameStore.setState({ state: withPort('corr-walk', 1_000_000, 50_000) });
    const view = mount(<CorruptionScreen />);
    expect(view.container.querySelector('[data-testid="walk-bribe"]')).not.toBeNull();
    view.unmount();
  });

  it('accepting a raise-ask lifts the retainer to the asked number', () => {
    const hired = hire(run('corr-accept', 100_000), 'beat-cop');
    const official = hired.state.corruption.officials[0]!;
    const raise: RaiseAsk = {
      newRetainer: 2_400,
      askedAtHours: 10,
      reason: 'They want a bigger cut.',
    };
    const withRaise: GameState = {
      ...hired.state,
      corruption: {
        ...hired.state.corruption,
        officials: [{ ...official, pendingRaise: raise }],
      },
    };
    useGameStore.setState({ state: withRaise });

    const view = mount(<CorruptionScreen />);
    view.click(view.container.querySelector('[data-testid="raise-accept"]')!);

    const after = useGameStore.getState().state!.corruption.officials[0]!;
    expect(after.retainerPerWeek).toBe(2_400);
    expect(after.pendingRaise).toBeUndefined();
    view.unmount();
  });
});

describe('the phantom bribe card is gone (design/13 A3)', () => {
  /** Mark the container's port paid, expiring at `untilHours` (in-game). */
  function paidAt(state: GameState, untilHours: number | undefined): GameState {
    const portId = state.stashes.find((s) => s.type === 'container')!.countryId;
    return {
      ...state,
      corruption: {
        ...state.corruption,
        paidPorts: [
          {
            portId,
            seizurePct: 0.03,
            paidAtHours: 0,
            ...(untilHours !== undefined ? { paidUntilHours: untilHours } : {}),
          },
        ],
      },
    };
  }

  it('a paid port renders a protection status line — no quote, no pay button', () => {
    const state = paidAt(withPort('corr-protected', 1_000_000, 50_000), 72);
    useGameStore.setState({ state });
    const view = mount(<CorruptionScreen />);

    const status = view.container.querySelector('[data-testid="port-paid"]')!;
    expect(status.textContent).toContain('Protected');
    expect(status.textContent).toContain('3%');
    expect(status.textContent).toContain('until day 4'); // 72h → day 4
    expect(view.container.querySelector('[data-testid="pay-bribe"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="port-seizure"]')).toBeNull();
    view.unmount();
  });

  it('a LAPSED paid entry re-offers the real 30% → 3% drop — "3% → 3%" can never render', () => {
    // The playtest bug: the expired entry stayed on paidPorts, and the quote's
    // "base" collapsed to the paid floor. Labels now come from config.
    const lapsed = {
      ...paidAt(withPort('corr-lapsed', 1_000_000, 50_000), 5),
      clock: { hours: 10, day: 1, week: 1 }, // past the 5h expiry
    };
    const row = portRows(lapsed)[0]!;
    expect(row.paid).toBe(false);
    expect(row.unpaidSeizurePctLabel).toBe('30%');
    expect(row.paidSeizurePctLabel).toBe('3%');
    expect(row.unpaidSeizurePctLabel).not.toBe(row.paidSeizurePctLabel);

    useGameStore.setState({ state: lapsed });
    const view = mount(<CorruptionScreen />);
    expect(view.container.querySelector('[data-testid="port-seizure"]')!.textContent).toBe(
      '30% → 3%',
    );
    view.unmount();
  });

  it('an empty container gets guidance, never a quote against a hypothetical shipment', () => {
    const state = withPort('corr-empty', 1_000_000, 0);
    useGameStore.setState({ state });
    const view = mount(<CorruptionScreen />);

    expect(view.container.querySelector('[data-testid="port-nothing-staged"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="pay-bribe"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="port-seizure"]')).toBeNull();
    expect(view.container.textContent).not.toContain('Staged here ~$0');
    view.unmount();
  });
});
