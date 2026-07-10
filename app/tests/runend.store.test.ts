import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { findPrestige, type GameState, type OfficialTie } from '@/engine';
import {
  emptyMeta,
  LocalMetaProgressStore,
  LocalLeaderboard,
  MemoryStorage,
  RemoteLeaderboard,
  LocalSaveStore,
  AUTOSAVE_SLOT,
  useGameStore,
  type MetaProgressStore,
} from '@/store';

/** Reset the singleton store onto fresh, isolated backends. */
function freshBackends(): { metaStore: MetaProgressStore } {
  const metaStore = new LocalMetaProgressStore({ factory: new IDBFactory() });
  useGameStore.setState({
    state: null,
    lastOfflineReport: null,
    lastRunEnd: null,
    meta: emptyMeta(),
    saveStore: new LocalSaveStore({ factory: new IDBFactory() }),
    metaStore,
    leaderboard: new LocalLeaderboard({ storage: new MemoryStorage() }),
  });
  return { metaStore };
}

/** Overwrite the live run with peak-banked, late-wipe numbers. */
function withPeaks(peakNetWorth: number): GameState {
  const state = useGameStore.getState().state!;
  const wiped: GameState = {
    ...state,
    cleanCash: 0,
    stashes: [],
    highScore: {
      peakNetWorth,
      peakCleanCash: peakNetWorth / 2,
      peakEmpireSize: 12,
    },
  };
  useGameStore.setState({ state: wiped });
  return wiped;
}

beforeEach(() => {
  freshBackends();
});

describe('endCurrentRun — bank, submit, recap (Prompt 23)', () => {
  it('a late wipe still banks and shows the PEAK, never zero (design/01 §7)', async () => {
    const store = useGameStore.getState();
    store.newGame('fall-seed');
    withPeaks(2_400_000);

    const result = await useGameStore.getState().endCurrentRun('killed');

    expect(result?.comeback).toBe(false);
    expect(result?.score).toBe(2_400_000);
    const { state, lastRunEnd, meta } = useGameStore.getState();
    expect(state?.runStatus).toBe('dead');
    expect(lastRunEnd?.recap.peakNetWorth).toBe(2_400_000);
    expect(lastRunEnd?.newPersonalBest).toBe(true);
    expect(lastRunEnd?.rank).toBe(1);
    expect(meta.personalBest).toBe(2_400_000);
    expect(meta.runsPlayed).toBe(1);
  });

  it('personal best persists across runs & permadeath via the meta store', async () => {
    const store = useGameStore.getState();
    store.newGame('big-run');
    withPeaks(500_000);
    await useGameStore.getState().endCurrentRun('killed');

    useGameStore.getState().startNextRun();
    withPeaks(200_000);
    await useGameStore.getState().endCurrentRun('prison');

    const { lastRunEnd, meta, metaStore } = useGameStore.getState();
    // The weaker second run fell short — and knows by exactly how much.
    expect(lastRunEnd?.newPersonalBest).toBe(false);
    expect(lastRunEnd?.previousBest).toBe(500_000);
    expect(lastRunEnd?.shortBy).toBe(300_000);
    expect(meta.personalBest).toBe(500_000);
    expect(meta.runsPlayed).toBe(2);
    // And the best survives on disk, past both deaths.
    expect((await metaStore.loadMeta()).personalBest).toBe(500_000);
  });

  it('prestige unlocks banked are NON-POWER (roster/scenario/cosmetic only — GDD §7)', async () => {
    const store = useGameStore.getState();
    store.newGame('prestige-run');
    withPeaks(1_500_000); // clears both net-worth titles
    await useGameStore.getState().endCurrentRun('retired');

    const { lastRunEnd, meta } = useGameStore.getState();
    expect(lastRunEnd!.unlockedPrestige.length).toBeGreaterThan(0);
    for (const id of lastRunEnd!.unlockedPrestige) {
      const cfg = findPrestige(id);
      expect(cfg).toBeDefined();
      expect(['roster', 'scenario', 'cosmetic']).toContain(cfg!.category);
    }
    expect(meta.unlockedPrestige).toEqual(lastRunEnd!.unlockedPrestige);
  });

  it('a payrolled judge converts a prison end into a comeback — NOTHING banks', async () => {
    const store = useGameStore.getState();
    store.newGame('comeback-run');
    const state = useGameStore.getState().state!;
    const judge: OfficialTie = {
      id: 'official-judge-1',
      officialId: 'judge',
      name: 'Judge Moreau',
      retainerPerWeek: 5_000,
      loyalty: 80,
      greed: 1,
      comfortHeat: 60,
      hiredAtHours: 0,
      lastPaidWeek: 1,
      memoryLog: [],
    };
    useGameStore.setState({
      state: {
        ...state,
        corruption: {
          ...state.corruption,
          officials: [judge],
          payrollPerWeek: judge.retainerPerWeek,
        },
      },
    });

    const result = await useGameStore.getState().endCurrentRun('prison');

    expect(result?.comeback).toBe(true);
    const after = useGameStore.getState();
    expect(after.state?.runStatus).toBe('active'); // the run continues
    expect(after.lastRunEnd).toBeNull();
    expect(after.meta.runsPlayed).toBe(0); // meta untouched
  });

  it('works unchanged with the RemoteLeaderboard stub (nothing depends on it being live)', async () => {
    useGameStore.setState({ leaderboard: new RemoteLeaderboard() });
    const store = useGameStore.getState();
    store.newGame('stub-run');
    withPeaks(50_000);

    const result = await useGameStore.getState().endCurrentRun('killed');

    expect(result?.score).toBe(50_000);
    const { lastRunEnd, meta } = useGameStore.getState();
    expect(lastRunEnd?.recap.peakNetWorth).toBe(50_000); // recap still shows
    expect(lastRunEnd?.rank).toBeNull(); // just unranked
    expect(meta.personalBest).toBe(50_000); // meta still banks
  });
});

describe('startNextRun — the dare taken (design/01 §0a)', () => {
  it('starts a NEW random world: fresh seed, active run, recap cleared', async () => {
    const store = useGameStore.getState();
    store.newGame();
    const firstSeed = useGameStore.getState().state!.seed;
    withPeaks(100_000);
    await useGameStore.getState().endCurrentRun('killed');

    useGameStore.getState().startNextRun();

    const { state, lastRunEnd } = useGameStore.getState();
    expect(state?.runStatus).toBe('active');
    expect(state?.seed).not.toBe(firstSeed);
    expect(lastRunEnd).toBeNull();

    // Two consecutive next-runs never share a seed either.
    useGameStore.getState().startNextRun();
    expect(useGameStore.getState().state?.seed).not.toBe(state?.seed);
  });
});

describe('hydrating an ended save — the fall survives a refresh, without re-banking', () => {
  it('rebuilds the recap from the banked peaks and does NOT bump runsPlayed', async () => {
    const store = useGameStore.getState();
    store.newGame('refresh-run');
    withPeaks(750_000);
    await useGameStore.getState().endCurrentRun('killed');
    await useGameStore.getState().persist(AUTOSAVE_SLOT);

    // Simulate a fresh app open over the same backends.
    useGameStore.setState({ state: null, lastRunEnd: null, meta: emptyMeta() });
    const ok = await useGameStore.getState().hydrate(AUTOSAVE_SLOT);

    expect(ok).toBe(true);
    const { state, lastRunEnd, meta } = useGameStore.getState();
    expect(state?.runStatus).toBe('dead');
    expect(lastRunEnd?.recap.peakNetWorth).toBe(750_000);
    expect(lastRunEnd?.cause).toBe('killed');
    expect(lastRunEnd?.rank).toBe(1);
    // Re-derived, not re-banked: still exactly one run on the books.
    expect(meta.runsPlayed).toBe(1);
    expect(meta.personalBest).toBe(750_000);
  });
});

describe('retire — voluntary reset banks exactly like a death (design/01 §7)', () => {
  it('banks the peaks with the retired cause', async () => {
    const store = useGameStore.getState();
    store.newGame('walk-away');
    withPeaks(320_000);

    await useGameStore.getState().endCurrentRun('retired');

    const { state, lastRunEnd } = useGameStore.getState();
    expect(state?.runStatus).toBe('retired');
    expect(lastRunEnd?.cause).toBe('retired');
    expect(lastRunEnd?.score).toBe(320_000);
  });
});

describe('meta profile boot (refreshMeta)', () => {
  it('loads the persisted profile into the store', async () => {
    const { metaStore } = freshBackends();
    await metaStore.saveMeta({ ...emptyMeta(), personalBest: 42_000, runsPlayed: 3 });

    await useGameStore.getState().refreshMeta();

    expect(useGameStore.getState().meta.personalBest).toBe(42_000);
    expect(useGameStore.getState().meta.runsPlayed).toBe(3);
  });
});
