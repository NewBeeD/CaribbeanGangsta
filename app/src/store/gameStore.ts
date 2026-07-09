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
import {
  applyIntent,
  createInitialState,
  type CrewAssignment,
  type CrewMember,
  type GameState,
  type Intent,
} from '@/engine/state';
import { resolveDeal, type DealIntent, type DealResult } from '@/engine/deals';
import { addStash, type AddStashResult, type StashType } from '@/engine/storage';
import {
  assign,
  dismiss,
  loyaltyDelta,
  promote,
  recruit,
  train,
  type LoyaltyEvent,
  type LoyaltyResult,
  type PromoteResult,
  type PromoteTarget,
  type TrainResult,
} from '@/engine/crew';
import type { CrewSkill } from '@/engine/config/crew';
import { tick } from '@/engine/clock';
import {
  settleOffline,
  buyFront as buyFrontEngine,
  upgradeFront as upgradeFrontEngine,
  pesoExchange as pesoExchangeEngine,
  type OfflineReport,
  type FrontResult,
  type FrontType,
  type PesoExchangeResult,
} from '@/engine/laundering';
import { bribeToCoolHeat, setLieLow, type BribeCoolResult } from '@/engine/heat';
import { CloudSaveStore, LocalSaveStore, type SaveStore, type SlotMeta } from './persistence';

const MS_PER_HOUR = 3_600_000;

/** The single-slot autosave the app boots from / continues into (Prompt 14). */
export const AUTOSAVE_SLOT = 'autosave';

/**
 * A territory-expansion intent (Prompt 16): open or reinforce a foothold — build a
 * stash of `stashType` in `countryId`. Paid from CLEAN cash by the engine's
 * `addStash`; the country is what expands empire footprint/reach (`empireComposite`
 * counts distinct stash-countries as districts/routes).
 */
export interface BuildStashIntent {
  readonly stashType: StashType;
  readonly countryId: string;
  readonly name?: string;
}

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
  /**
   * Open or reinforce a territory foothold — build a stash (paid from CLEAN cash)
   * in a country, expanding empire footprint/reach immediately (Prompt 16). Returns
   * the full `AddStashResult` (its `rejected` reason on insufficient funds), or
   * `null` when no run is loaded. Autosaves on success so a refresh resumes on the
   * expanded empire.
   */
  buildStash(intent: BuildStashIntent): AddStashResult | null;
  /**
   * Crew actions (Prompt 17) — each wraps the pure `crew.ts` engine, commits the
   * new state, and autosaves so the roster survives a refresh. The UI authors no
   * loyalty/skill math; it only names the person and the intent.
   */
  /**
   * Laundering actions (Prompt 18) — each wraps the pure `laundering.ts` engine,
   * commits only when the operation lands (funds sufficed), and autosaves so the
   * fronts/exchange survive a refresh. The UI authors no rate/cost/haircut math.
   */
  /**
   * Upgrade a front one level, paid from CLEAN cash at `buy_in × 1.15^level`.
   * Commits + autosaves only when it lands (funds sufficed, not maxed); returns the
   * full `FrontResult` (its `rejected` reason otherwise), or `null` when no run loaded.
   */
  upgradeFront(frontId: string): FrontResult | null;
  /** Open a new Level-1 front of `type`, paid from CLEAN cash. Commits on success. */
  buyFront(type: FrontType): FrontResult | null;
  /**
   * Convert a lump of DIRTY cash held in a stash to CLEAN cash at the DISCLOSED
   * peso-exchange haircut (design/01 §3a). Commits + autosaves only when the
   * exchange goes through (amount valid, stash exists, funds suffice).
   */
  exchangePeso(amount: number, stashId?: string): PesoExchangeResult | null;
  /** Bring an archetype onto the crew (open access — money/relationships gate it, never a flag). */
  recruitCrew(archetypeId: string): CrewMember | null;
  /** Train a skill by a fixed step, paid from clean cash. Rejects (no commit) if maxed/short. */
  trainCrew(npcId: string, skill: CrewSkill): TrainResult | null;
  /** Promote to lieutenant delegating a front/territory; ripples grievance to the passed-over. */
  promoteCrew(npcId: string, target: PromoteTarget): PromoteResult | null;
  /** Set what a crew member is doing (guard wires them into the stash's seizure %). */
  assignCrew(npcId: string, assignment: CrewAssignment): void;
  /**
   * Apply a loyalty/treatment event (raise pay, confront, …) — the betrayal-arc
   * intervention lever (design/02 §4). The engine walks the arc back on the next
   * tick when loyalty recovers; this just records the treatment.
   */
  treatCrew(npcId: string, event: LoyaltyEvent): LoyaltyResult | null;
  /** Fire / cut loose a crew member (also clears any stash they guarded). */
  dismissCrew(npcId: string): void;
  /**
   * Heat levers (Prompt 19) — the Heat screen's reduce-heat controls. Each wraps
   * the pure `heat.ts` engine, commits, and autosaves so the tension state survives
   * a refresh. The UI authors no decay/heat math; it names the lever only.
   */
  /** Toggle "lie low" — heat cools faster, laundering income slows (design/07 §5). */
  setLieLow(enabled: boolean): void;
  /**
   * Pay a cop off from CLEAN cash to cool heat (design/07 §5's `[ Bribe a cop -$X ]`).
   * Commits + autosaves only when it lands (funds sufficed); returns the full
   * `BribeCoolResult` (its `rejected` reason otherwise), or `null` when no run loaded.
   */
  coolWithBribe(dollars?: number): BribeCoolResult | null;
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

  buildStash(intent) {
    const { state } = get();
    if (!state) return null;
    const opts =
      intent.name === undefined
        ? { countryId: intent.countryId }
        : { countryId: intent.countryId, name: intent.name };
    const result = addStash(state, intent.stashType, opts);
    // Only commit + autosave when a stash was actually built (funds sufficed).
    if (result.stash) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  upgradeFront(frontId) {
    const { state } = get();
    if (!state) return null;
    const result = upgradeFrontEngine(state, frontId);
    // Only commit + autosave when the upgrade landed (funds sufficed, not maxed).
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  buyFront(type) {
    const { state } = get();
    if (!state) return null;
    const result = buyFrontEngine(state, type);
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  exchangePeso(amount, stashId) {
    const { state } = get();
    if (!state) return null;
    const result =
      stashId === undefined
        ? pesoExchangeEngine(state, amount)
        : pesoExchangeEngine(state, amount, stashId);
    // Only commit + autosave when the exchange actually cleared.
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  recruitCrew(archetypeId) {
    const { state } = get();
    if (!state) return null;
    const result = recruit(state, archetypeId);
    set({ state: result.state });
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
    return result.crew;
  },

  trainCrew(npcId, skill) {
    const { state } = get();
    if (!state) return null;
    const result = train(state, npcId, skill);
    // Only commit + autosave when the session actually happened (funds/skill room).
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  promoteCrew(npcId, target) {
    const { state } = get();
    if (!state) return null;
    const result = promote(state, npcId, target);
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  assignCrew(npcId, assignment) {
    withState(get, set, (state) => assign(state, npcId, assignment));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  treatCrew(npcId, event) {
    const { state } = get();
    if (!state) return null;
    const result = loyaltyDelta(state, npcId, event);
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  dismissCrew(npcId) {
    withState(get, set, (state) => dismiss(state, npcId));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  setLieLow(enabled) {
    withState(get, set, (state) => setLieLow(state, enabled));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  coolWithBribe(dollars) {
    const { state } = get();
    if (!state) return null;
    const result = dollars === undefined ? bribeToCoolHeat(state) : bribeToCoolHeat(state, dollars);
    // Only commit + autosave when the bribe cleared (funds sufficed, amount valid).
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
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
