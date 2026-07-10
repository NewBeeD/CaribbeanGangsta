// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '@/engine';
import {
  emptyMeta,
  entryFromRunEnd,
  LocalMetaProgressStore,
  LocalLeaderboard,
  LocalSaveStore,
  MemoryStorage,
  useGameStore,
  type RunEndSummary,
} from '@/store';
import { RunEndScreen } from '@/ui/screens/RunEndScreen';
import { HighScoreScreen } from '@/ui/screens/HighScoreScreen';
import { actLabel, bestLine, runEndView } from '@/ui/screens/runEndScreen.model';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    async flush() {
      // Let effects and pending promises (leaderboard reads) settle.
      await act(async () => {});
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** A finished-run summary straight off design/07 §6's wireframe numbers. */
function summary(overrides: Partial<RunEndSummary> = {}): RunEndSummary {
  return {
    cause: 'killed',
    score: 2_400_000,
    recap: {
      cause: 'killed',
      seed: 'wire-seed',
      day: 63,
      week: 9,
      peakNetWorth: 2_400_000,
      peakCleanCash: 900_000,
      peakEmpireSize: 7,
      rivalsToppled: 3,
    },
    unlockedPrestige: ['title-kingpin', 'scenario-clean-slate'],
    previousBest: 2_700_000,
    newPersonalBest: false,
    shortBy: 300_000,
    rank: 2,
    ...overrides,
  };
}

/** Poll (inside `act`) until `cond` holds — lets async store work (IndexedDB) settle. */
async function until(cond: () => boolean, tries = 100): Promise<void> {
  for (let i = 0; i < tries && !cond(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  expect(cond()).toBe(true);
}

function freshBackends() {
  useGameStore.setState({
    state: null,
    lastOfflineReport: null,
    lastRunEnd: null,
    meta: emptyMeta(),
    saveStore: new LocalSaveStore({ factory: new IDBFactory() }),
    metaStore: new LocalMetaProgressStore({ factory: new IDBFactory() }),
    leaderboard: new LocalLeaderboard({ storage: new MemoryStorage() }),
  });
}

beforeEach(() => {
  freshBackends();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('runEndScreen.model — the fall, framed as a dare (Prompt 23)', () => {
  it('shows the BANKED peak, and the exact shortfall when the best stands', () => {
    const view = runEndView(summary(), { ...emptyMeta(), personalBest: 2_700_000 });
    expect(view.peakNetWorth).toBe(2_400_000); // the height, not the wiped zero
    expect(view.best.newBest).toBe(false);
    expect(view.best.text).toContain('$300,000 short');
    expect(view.rankLine).toContain('#2');
  });

  it('celebrates a new personal best', () => {
    const line = bestLine(summary({ newPersonalBest: true, shortBy: 0 }));
    expect(line.newBest).toBe(true);
    expect(line.text).toMatch(/new personal best/i);
  });

  it('maps weeks to acts for the "farthest act" line', () => {
    expect(actLabel(2)).toContain('I —');
    expect(actLabel(5)).toContain('II —');
    expect(actLabel(9)).toContain('Kingpin');
  });

  it('resolves prestige ids to non-power views (a title / scenario, never a stat)', () => {
    const view = runEndView(summary(), emptyMeta());
    const labels = view.prestige.map((p) => p.categoryLabel).join(' ');
    expect(view.prestige.map((p) => p.name)).toEqual(['Kingpin', 'Clean Slate']);
    expect(labels).not.toMatch(/power|multiplier|boost/i);
  });
});

describe('RunEndScreen — THE FALL, RUN OVER (design/07 §6)', () => {
  it('renders the banked recap: peaks, chase line, prestige, and both actions', () => {
    useGameStore.setState({ lastRunEnd: summary() });
    const m = mount(
      <RunEndScreen onStartNextRun={() => {}} onLeaderboard={() => {}} />,
    );

    const text = m.container.textContent ?? '';
    expect(text).toContain('$2,400,000'); // ← banked, not zero
    expect(text).toContain('$300,000 short');
    expect(text).toContain('Kingpin'); // prestige by name
    expect(text).toMatch(/never power/i);
    expect(text).toContain('Beat it next run.');
    expect(m.container.querySelector('[data-testid="start-next-run"]')).not.toBeNull();
    expect(m.container.querySelector('[data-testid="open-leaderboard"]')).not.toBeNull();
    // A fall + a dare — never a bare "game over" (design/01 §7).
    expect(text).not.toMatch(/game over/i);
    m.unmount();
  });

  it('[Start next run] hands off to the store: a NEW world with a new seed', async () => {
    // End a real run through the store, then take the dare from the screen.
    useGameStore.getState().newGame('the-fall');
    await useGameStore.getState().endCurrentRun('killed');
    const endedSeed = useGameStore.getState().state!.seed;

    const m = mount(
      <RunEndScreen
        onStartNextRun={() => useGameStore.getState().startNextRun()}
        onLeaderboard={() => {}}
      />,
    );
    m.click(m.container.querySelector('[data-testid="start-next-run"]')!);

    const { state, lastRunEnd } = useGameStore.getState();
    expect(state?.runStatus).toBe('active');
    expect(state?.seed).not.toBe(endedSeed);
    expect(lastRunEnd).toBeNull();
    m.unmount();
  });
});

describe('HighScoreScreen — the standalone cross-run chase (Prompt 23)', () => {
  it('shows personal best, the local board, prestige earned, and run history', async () => {
    // Seed two finished runs onto the board + a meta profile with prestige.
    const leaderboard = useGameStore.getState().leaderboard;
    const s1 = summary({ score: 900_000 });
    await leaderboard.submit(entryFromRunEnd(
      { state: {} as GameState, cause: 'killed', score: 900_000, recap: s1.recap, sceneKey: '', unlockedPrestige: [], comeback: false },
      Date.now() - 1000,
    ));
    await leaderboard.submit(entryFromRunEnd(
      { state: {} as GameState, cause: 'retired', score: 150_000, recap: { ...s1.recap, cause: 'retired' }, sceneKey: '', unlockedPrestige: [], comeback: false },
      Date.now(),
    ));
    useGameStore.setState({
      meta: {
        ...emptyMeta(),
        personalBest: 900_000,
        runsPlayed: 2,
        unlockedPrestige: ['title-hustler'],
      },
    });

    const m = mount(<HighScoreScreen />);
    await m.flush();

    const text = m.container.textContent ?? '';
    expect(text).toContain('$900,000'); // personal best
    expect(m.container.querySelector('[data-testid="board-rows"]')).not.toBeNull();
    expect(m.container.querySelector('[data-testid="run-history"]')).not.toBeNull();
    expect(text).toContain('Hustler'); // prestige earned
    expect(text).toMatch(/never bought/i); // aspirational, not pay-to-win (GDD §12)
    m.unmount();
  });

  it('retire is a two-step, no-penalty bank-and-walk (design/01 §7)', async () => {
    useGameStore.getState().newGame('walk-tall');
    const m = mount(<HighScoreScreen />);
    await m.flush();

    m.click(m.container.querySelector('[data-testid="retire"]')!);
    m.click(m.container.querySelector('[data-testid="retire-confirm"]')!);
    // The bank-and-summarize path is async (meta store) — wait for it to settle.
    await until(() => useGameStore.getState().lastRunEnd !== null);

    const { state, lastRunEnd } = useGameStore.getState();
    expect(state?.runStatus).toBe('retired');
    expect(lastRunEnd?.cause).toBe('retired');
    m.unmount();
  });
});
