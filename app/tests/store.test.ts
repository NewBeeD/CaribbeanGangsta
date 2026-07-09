import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createInitialState, type GameState } from '@/engine';
import { LocalSaveStore, type SaveStore } from '@/store';
import { AUTOSAVE_SLOT, useGameStore } from '@/store/gameStore';

const MS_PER_HOUR = 3_600_000;

/** A LocalSaveStore over an isolated in-memory IndexedDB. */
function freshSaveStore(): SaveStore {
  return new LocalSaveStore({ factory: new IDBFactory() });
}

beforeEach(() => {
  // Reset the singleton store between cases (fresh, isolated save backend each time).
  useGameStore.setState({
    state: null,
    lastOfflineReport: null,
    saveStore: freshSaveStore(),
  });
});

describe('gameStore — the engine⇄React bridge (Prompt 14)', () => {
  it('newGame seeds a fresh active run', () => {
    useGameStore.getState().newGame('store-seed');
    const { state } = useGameStore.getState();
    expect(state?.runStatus).toBe('active');
    expect(state?.seed).toBe('store-seed');
  });

  it('dispatch routes an intent through the pure reducer', () => {
    const store = useGameStore.getState();
    store.newGame('store-seed');
    const before = useGameStore.getState().state;
    store.dispatch({ type: 'noop' });
    // noop returns the same state value — the reducer never mutated in place.
    expect(useGameStore.getState().state).toBe(before);
  });

  it('tickBy advances in-game time', () => {
    const store = useGameStore.getState();
    store.newGame('store-seed');
    expect(useGameStore.getState().state?.clock.hours).toBe(0);
    store.tickBy(3);
    expect(useGameStore.getState().state?.clock.hours).toBeGreaterThan(0);
  });

  it('settles offline exactly once on open and surfaces the report as a reward', async () => {
    const saveStore = freshSaveStore();
    // A run last played 5 hours ago (the store owns the wall clock).
    const played = createInitialState('offline-seed');
    const stamped: GameState = {
      ...played,
      lastPlayedRealTime: Date.now() - 5 * MS_PER_HOUR,
    };
    await saveStore.save(AUTOSAVE_SLOT, stamped);

    useGameStore.setState({ state: null, lastOfflineReport: null, saveStore });
    const ok = await useGameStore.getState().hydrate(AUTOSAVE_SLOT);

    expect(ok).toBe(true);
    const { state, lastOfflineReport } = useGameStore.getState();
    expect(state).not.toBeNull();
    expect(lastOfflineReport).not.toBeNull();
    expect(lastOfflineReport?.hoursAway).toBeGreaterThan(4);
    // Reward-only guarantee: clean cash never decreased while away.
    expect(state!.cleanCash).toBeGreaterThanOrEqual(played.cleanCash);
  });

  it('acknowledgeOffline clears the report so it shows only once', () => {
    useGameStore.setState({
      lastOfflineReport: {
        hoursAway: 2,
        cappedAt: 8,
        cleanEarned: 0,
        pendingChoices: [],
      },
    });
    useGameStore.getState().acknowledgeOffline();
    expect(useGameStore.getState().lastOfflineReport).toBeNull();
  });
});
