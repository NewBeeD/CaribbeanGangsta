// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bribeCoolQuote,
  createInitialState,
  hire,
  tierForHeat,
  type GameState,
  type PendingChoice,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { HeatScreen } from '@/ui/screens/HeatScreen';
import {
  bribeLever,
  heatStatus,
  heatWarnings,
  lieLowLever,
  raidTipoff,
} from '@/ui/screens/heatScreen.model';

// react-dom/test-utils `act` requires this flag to be set.
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

/** A run pinned to a given heat level (and clean cash for the bribe lever). */
function runAtHeat(seed: string, heat: number, clean = 0): GameState {
  return { ...createInitialState(seed), heat, cleanCash: clean, leTierAck: tierForHeat(heat) };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('heatScreen.model — tension made estimable (Prompt 19)', () => {
  it('tier and dots follow engine state (heat 45 ⇒ DEA)', () => {
    const status = heatStatus(runAtHeat('heat-dea', 45));
    expect(status.tier).toBe('dea');
    expect(status.tierName).toBe('DEA');
    expect(status.filled).toBe(Math.round((45 / 100) * status.total));
  });

  it('telegraphs a looming crossing BEFORE the tier escalates', () => {
    // 27 heat is still Local (< 30) but within the 5-point margin of DEA.
    const looming = heatWarnings(runAtHeat('heat-loom', 27));
    expect(looming.some((w) => w.kind === 'looming')).toBe(true);
    // 20 heat is comfortably Local — no warning yet.
    expect(heatWarnings(runAtHeat('heat-calm', 20)).length).toBe(0);
  });

  it('surfaces a queued heat-escalation as an opened-file warning', () => {
    const base = runAtHeat('heat-open', 45);
    const escalation: PendingChoice = {
      id: 'heat-escalation-dea-10',
      kind: 'heat-escalation',
      summary: 'A DEA task force just opened a file on you.',
      createdAtHours: 10,
    };
    const withFile: GameState = { ...base, pendingChoices: [escalation] };
    const opened = heatWarnings(withFile).filter((w) => w.kind === 'opened');
    expect(opened).toHaveLength(1);
    expect(opened[0]!.text).toContain('opened a file');
  });

  it('bribe lever discloses the exact cost and heat shed (shown == charged)', () => {
    const state = runAtHeat('heat-bribe', 40, 1_000_000);
    const quote = bribeCoolQuote(state);
    const lever = bribeLever(state);
    expect(lever.cost).toBe(quote.cost);
    expect(lever.heatReduced).toBe(quote.heatReduced);
    expect(lever.affordable).toBe(true);
  });

  it('lie-low lever reports the income it trades away', () => {
    expect(lieLowLever(runAtHeat('heat-ll', 30)).incomePenaltyPct).toBe(50);
  });

  it('raid tip-off only fires with a bought cop and real risk', () => {
    // No official on payroll ⇒ no tip-off even at high heat.
    expect(raidTipoff(runAtHeat('heat-notip', 90))).toBeNull();
    // Beat cop hired + high heat + a stash ⇒ a tip-off with lead time.
    const hired = hire(runAtHeat('heat-tip', 90, 100_000), 'beat-cop');
    const tip = raidTipoff(hired.state);
    expect(tip).not.toBeNull();
    expect(tip!.chancePct).toBeGreaterThan(0);
  });
});

describe('HeatScreen — the reduce-heat levers (Prompt 19)', () => {
  it('shows the current tier and a heat gauge', () => {
    useGameStore.setState({ state: runAtHeat('heat-view', 45) });
    const view = mount(<HeatScreen />);
    expect(view.container.textContent).toContain('DEA');
    expect(view.container.querySelector('.cg-heatdots')).not.toBeNull();
    view.unmount();
  });

  it('lying low toggles state and slows income; toggling back resumes', () => {
    useGameStore.setState({ state: runAtHeat('heat-lielow', 40) });
    const view = mount(<HeatScreen />);

    const lieLow = view.container.querySelector('[data-testid="lie-low"]')!;
    view.click(lieLow);
    expect(useGameStore.getState().state!.lyingLow).toBe(true);

    view.click(view.container.querySelector('[data-testid="lie-low"]')!);
    expect(useGameStore.getState().state!.lyingLow).toBe(false);
    view.unmount();
  });

  it('bribing a cop spends clean cash and cools heat by the shown amount', () => {
    const state = runAtHeat('heat-bribe-ui', 40, 100_000);
    useGameStore.setState({ state });
    const quote = bribeCoolQuote(state);

    const view = mount(<HeatScreen />);
    view.click(view.container.querySelector('[data-testid="bribe-cop"]')!);

    const after = useGameStore.getState().state!;
    expect(after.cleanCash).toBe(state.cleanCash - quote.cost);
    expect(state.heat - after.heat).toBeCloseTo(quote.heatReduced, 5);
    view.unmount();
  });

  it('never frames heat as a spendable balance — no "buy heat" surface', () => {
    useGameStore.setState({ state: runAtHeat('heat-ethics', 45, 100_000) });
    const view = mount(<HeatScreen />);
    const text = view.container.textContent!.toLowerCase();
    expect(text).not.toContain('buy heat');
    view.unmount();
  });
});
