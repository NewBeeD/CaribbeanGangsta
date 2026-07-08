/**
 * The Zustand store: the thin bridge between the pure engine and React (Prompt
 * 03 keeps it minimal). It holds the current `GameState`, dispatches intents
 * through `applyIntent`, advances time through `tick`, and persists/hydrates via
 * a `SaveStore`.
 *
 * The store — not the engine — owns wall-clock time. It stamps
 * `lastPlayedRealTime` on every persist, and on hydrate computes how long the
 * player was away and settles that offline time through `settleOffline` (which
 * is frozen/safe — it only accrues clean cash and queues return hooks).
 */

import { create } from 'zustand';
import { applyIntent, createInitialState, type GameState, type Intent } from '@/engine/state';
import { settleOffline, tick } from '@/engine/clock';
import { CloudSaveStore, LocalSaveStore, type SaveStore } from './persistence';

const MS_PER_HOUR = 3_600_000;

export interface GameStore {
  /** Current run, or `null` before a game is created/loaded. */
  readonly state: GameState | null;
  /** Save backend (swappable; defaults to on-device IndexedDB). */
  readonly saveStore: SaveStore;

  /** Start a fresh run from `seed` (does not persist until `persist` is called). */
  newGame(seed: number | string): void;
  /** Dispatch a player intent through the pure reducer. */
  dispatch(intent: Intent): void;
  /** Advance the sim by `dtHours` of online in-game time. */
  tickBy(dtHours: number): void;
  /** Load a slot and settle any offline time since it was last played. */
  hydrate(slot: string): Promise<boolean>;
  /** Persist the current run to a slot, stamping the wall clock. */
  persist(slot: string): Promise<void>;
}

/** Guarded update: only runs `fn` when a run is loaded. */
function withState(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
  fn: (state: GameState) => GameState,
): void {
  const { state } = get();
  if (!state) return;
  set({ state: fn(state) });
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  saveStore: safeLocalSaveStore(),

  newGame(seed) {
    set({ state: createInitialState(seed) });
  },

  dispatch(intent) {
    withState(get, set, (state) => applyIntent(state, intent));
  },

  tickBy(dtHours) {
    withState(get, set, (state) => tick(state, dtHours));
  },

  async hydrate(slot) {
    const { saveStore } = get();
    const loaded = await saveStore.load(slot);
    if (!loaded) return false;

    // Settle the gap since this save was last played (frozen/safe accrual).
    const away = loaded.lastPlayedRealTime;
    const realHoursAway =
      away === null ? 0 : Math.max(0, (Date.now() - away) / MS_PER_HOUR);
    const settled = realHoursAway > 0 ? settleOffline(loaded, realHoursAway) : loaded;

    set({ state: settled });
    return true;
  },

  async persist(slot) {
    const { state, saveStore } = get();
    if (!state) return;
    const stamped: GameState = { ...state, lastPlayedRealTime: Date.now() };
    set({ state: stamped });
    await saveStore.save(slot, stamped);
  },
}));

/**
 * A `LocalSaveStore` when IndexedDB is present, otherwise the cloud stub — so
 * importing the store never throws in an environment without IndexedDB (e.g. a
 * non-jsdom test). Real callers construct their own store explicitly.
 */
function safeLocalSaveStore(): SaveStore {
  try {
    return new LocalSaveStore();
  } catch {
    // No IndexedDB here — fall back to the no-op read stub.
    return new CloudSaveStore();
  }
}
