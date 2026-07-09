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
import { resolveDeal, type DealIntent, type DealResult } from '@/engine/deals';
import { tick } from '@/engine/clock';
import { settleOffline, type OfflineReport } from '@/engine/laundering';
import { CloudSaveStore, LocalSaveStore, type SaveStore, type SlotMeta } from './persistence';

const MS_PER_HOUR = 3_600_000;

/** The single-slot autosave the app boots from / continues into (Prompt 14). */
export const AUTOSAVE_SLOT = 'autosave';

export interface GameStore {
  /** Current run, or `null` before a game is created/loaded. */
  readonly state: GameState | null;
  /** Save backend (swappable; defaults to on-device IndexedDB). */
  readonly saveStore: SaveStore;
  /**
   * The payoff from the most recent offline settlement (clean cash earned + the
   * choices queued on return) — the "welcome back" the Money screen presents.
   * `null` until a hydrate settles some away time.
   */
  readonly lastOfflineReport: OfflineReport | null;

  /**
   * Start a fresh run. When `seed` is omitted the store mints one from the wall
   * clock — the engine stays pure, so the ONLY `Date.now()` lives here.
   */
  newGame(seed?: number | string): void;
  /** Dispatch a player intent through the pure reducer. */
  dispatch(intent: Intent): void;
  /**
   * Resolve a buy/sell with a SINGLE bust roll, apply the new state, and return
   * the full `DealResult` (scene key + fairness numbers) so the UI can render the
   * outcome scene. Distinct from `dispatch` — which re-runs `resolveDeal` for its
   * state only — so the number shown to the player is the number that was rolled
   * (never a second draw; design/01 §0.3). Returns `null` when no run is loaded.
   */
  commitDeal(intent: DealIntent): DealResult | null;
  /** Advance the sim by `dtHours` of online in-game time. */
  tickBy(dtHours: number): void;
  /** Load a slot and settle any offline time since it was last played. */
  hydrate(slot: string): Promise<boolean>;
  /** Persist the current run to a slot, stamping the wall clock. */
  persist(slot: string): Promise<void>;
  /**
   * Clear the offline report once the return hook has been shown (so it presents
   * exactly once per app open — Prompt 14 acceptance).
   */
  acknowledgeOffline(): void;
  /** List saved slots (for the "continue" entry gate). */
  listSaves(): Promise<SlotMeta[]>;
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
  lastOfflineReport: null,

  newGame(seed) {
    const runSeed = seed ?? `run-${Date.now()}`;
    set({ state: createInitialState(runSeed), lastOfflineReport: null });
  },

  dispatch(intent) {
    withState(get, set, (state) => applyIntent(state, intent));
  },

  commitDeal(intent) {
    const { state } = get();
    if (!state) return null;
    const result = resolveDeal(state, intent);
    set({ state: result.state });
    // Keep the autosave current so a refresh resumes on the post-deal state.
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
    return result;
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
    if (realHoursAway > 0) {
      const { state, report } = settleOffline(loaded, realHoursAway);
      set({ state, lastOfflineReport: report });
    } else {
      set({ state: loaded, lastOfflineReport: null });
    }
    return true;
  },

  async persist(slot) {
    const { state, saveStore } = get();
    if (!state) return;
    const stamped: GameState = { ...state, lastPlayedRealTime: Date.now() };
    set({ state: stamped });
    await saveStore.save(slot, stamped);
  },

  acknowledgeOffline() {
    set({ lastOfflineReport: null });
  },

  listSaves() {
    return get().saveStore.list();
  },
}));

// --- Selector hooks (the thin read surface the UI consumes) ------------------

/** The current run, or `null` before one is created/loaded. */
export const useGameState = (): GameState | null => useGameStore((s) => s.state);

/** The most recent offline settlement to surface as a return hook (or `null`). */
export const useOfflineReport = (): OfflineReport | null =>
  useGameStore((s) => s.lastOfflineReport);

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
