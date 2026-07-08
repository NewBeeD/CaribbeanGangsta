/**
 * The single `GameState` shape — the whole truth of one run — plus the pure,
 * immutable reducer entry point (`applyIntent`) and the deterministic run
 * constructor (`createInitialState`).
 *
 * Everything the sim needs lives here so a run round-trips through save/load as
 * plain JSON-cloneable data (no functions, no class instances): the serialized
 * `rngState` is what lets randomness resume EXACTLY where it left off (design/01
 * §0.3 fairness; Prompt 03 acceptance).
 *
 * Purity/determinism rules (prompts/README.md): no `Math.random`, no
 * `Date.now()` here — time is injected via `clock.ts`. Reducers take state in
 * and return NEW immutable state; they never mutate their input.
 *
 * Many sub-shapes below (fronts, crew, corruption, debt, stashes) are minimal
 * stubs owned/fleshed-out by later prompts. They exist now so the state shape is
 * stable and every field round-trips from day one.
 */

import { createRng, restoreRng, type Rng, type RngState } from './rng';
import { generateWorld, type World } from './world';
import { PRODUCT_IDS, type ProductId } from './config/countries';
import {
  createInitialMarkets,
  resolveDeal,
  type BuyIntent,
  type Markets,
  type SellIntent,
} from './deals';
import { setLieLow, tierForHeat, type LeTier, type LieLowIntent } from './heat';
import { STARTING_STASH_TYPE, type StashType } from './config/stashes';

/**
 * Bump when the persisted `GameState` shape changes; add a matching entry to the
 * migration table in `store/persistence.ts`. Older saves migrate or reject
 * cleanly (Prompt 03 acceptance).
 *
 * v2: added `markets` (live per-location price drift, Prompt 04).
 * v3: added `lyingLow` + `leTierAck` (heat/law-enforcement engine, Prompt 05).
 * v4: added `type` + `guardCrewId` to `Stash` (contraband storage, Prompt 06).
 */
export const SCHEMA_VERSION = 4 as const;

export type RunStatus = 'active' | 'dead' | 'prison' | 'retired';

/** In-game time. `hours` is the accumulated total; day/week are derived from it. */
export interface Clock {
  /** Accumulated in-game hours since the run began (fractional allowed). */
  readonly hours: number;
  /** 1-based in-game day. */
  readonly day: number;
  /** 1-based in-game week. */
  readonly week: number;
}

/** Three separate reputation tracks = three viable paths (design/01 §1). */
export interface Reputation {
  readonly street: number;
  readonly business: number;
  readonly political: number;
}

/** Units held per product. Every product id is always present (0 if none). */
export type Inventory = Readonly<Record<ProductId, number>>;

/**
 * A location holding DIRTY cash and product (design/01 §1 — dirty cash is located
 * and seizable). `type` selects the archetype (capacity, base seizure %, travel
 * delay, cost — config/stashes.ts); `guardCrewId`, when set, ties a crew member's
 * loyalty into the effective seizure % (an inside job — design/09 A.3a). Prompt 06
 * (`storage.ts`) owns capacity enforcement and raid resolution.
 */
export interface Stash {
  readonly id: string;
  readonly name: string;
  readonly countryId: string;
  readonly type: StashType;
  readonly dirtyCash: number;
  readonly inventory: Inventory;
  /** Crew member guarding this stash (design/09 A.3a). Absent = unguarded. */
  readonly guardCrewId?: string;
}

/** A laundering front (idle engine). Prompt 07 owns rates and accrual. */
export interface Front {
  readonly id: string;
  readonly type: string;
  readonly level: number;
}

/** An NPC crew member. Prompt 08 owns loyalty/memory/betrayal arcs. */
export interface CrewMember {
  readonly id: string;
  readonly name: string;
  readonly loyalty: number;
}

/** A bought official. Prompt 09 owns bribes/payroll/flips. */
export interface OfficialTie {
  readonly id: string;
  readonly loyalty: number;
}

export interface Corruption {
  readonly officials: readonly OfficialTie[];
  readonly payrollPerWeek: number;
}

/**
 * Loan-shark debt. Prompt 10 owns the interest curve and default ladder.
 * Invariant (guardrail): offline settlement NEVER increases what is owed.
 */
export interface Debt {
  readonly principal: number;
  readonly interestRatePerHour: number;
  /** Interest only accrues while active AND the player is online (design/10 §4.2). */
  readonly active: boolean;
}

/** Per-run relationship layer over `world.rivals`. Prompt 08/12 flesh this out. */
export interface RivalState {
  /** Matches the `id` of a `world.rivals` entry. */
  readonly id: string;
  readonly tension: number;
  readonly toppled: boolean;
}

/**
 * A queued return-hook: an event/choice waiting to be presented to the player
 * (e.g. on return from offline). Prompts 12/13 give these real payloads.
 */
export interface PendingChoice {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  /** In-game hours at which it was queued (for ordering/expiry). */
  readonly createdAtHours: number;
}

/**
 * Peak trackers. Score banks from PEAK values the instant a run ends, so a
 * late-game wipe still records the height climbed to (design/01 §7). Lives on
 * state but is what `endgame.ts` (Prompt 11) banks to the persistent leaderboard.
 */
export interface HighScore {
  readonly peakNetWorth: number;
  readonly peakCleanCash: number;
  readonly peakEmpireSize: number;
}

export interface GameState {
  readonly schemaVersion: number;
  /** The seed this run was generated from (for display / replay). */
  readonly seed: string;
  /** Serialized RNG stream — restored on load so rolls resume byte-identically. */
  readonly rngState: RngState;
  readonly world: World;
  readonly clock: Clock;
  /** Live per-location price drift for the deal loop (Prompt 04). */
  readonly markets: Markets;
  /** Safe, launderable money (design/01 §1). Dirty cash lives in `stashes`. */
  readonly cleanCash: number;
  readonly reputation: Reputation;
  readonly heat: number;
  /** "Lie low" mode: heat decays faster, laundering income slows (Prompt 05/07). */
  readonly lyingLow: boolean;
  /**
   * Highest LE tier already TELEGRAPHED to the player. Escalation fires only when
   * the live tier climbs above this, then advances it — so a crossing telegraphs
   * exactly once (design/07 §5). Drops back down as heat cools, re-arming.
   */
  readonly leTierAck: LeTier;
  /** Loose aggregate inventory; Prompt 06 locates units into `stashes`. */
  readonly inventory: Inventory;
  readonly stashes: readonly Stash[];
  readonly fronts: readonly Front[];
  readonly crew: readonly CrewMember[];
  readonly corruption: Corruption;
  readonly debt: Debt;
  readonly rivals: readonly RivalState[];
  /** Progression / onboarding gates, keyed by name. */
  readonly flags: Readonly<Record<string, boolean>>;
  /** Ids of narrative beats already fired (design/05 — fire-once bookkeeping). */
  readonly beatsFired: readonly string[];
  /** The return-hook queue (events/choices awaiting presentation). */
  readonly pendingChoices: readonly PendingChoice[];
  readonly highScore: HighScore;
  readonly runStatus: RunStatus;
  /**
   * Epoch-ms wall-clock stamp of the last active session, written by the store
   * (never by the engine). Lets the store compute `realHoursAway` for
   * `settleOffline` on the next load. `null` until first persisted.
   */
  readonly lastPlayedRealTime: number | null;
}

/** An inventory with every product present at zero. */
export function emptyInventory(): Inventory {
  const inv = {} as Record<ProductId, number>;
  for (const id of PRODUCT_IDS) inv[id] = 0;
  return inv;
}

/** Sum of dirty cash across all stashes (dirty cash is located — design/01 §1). */
export function totalDirtyCash(state: GameState): number {
  return state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
}

/** Net worth = all dirty cash + clean cash. Basis of the peak high score. */
export function netWorth(state: GameState): number {
  return totalDirtyCash(state) + state.cleanCash;
}

/** A rough empire-size composite (design/01 §7). Expanded in Prompt 11. */
export function empireSize(state: GameState): number {
  return state.stashes.length + state.fronts.length + state.crew.length;
}

/**
 * Deterministically build the opening state for a run from `seed`.
 *
 * The run's RNG stream continues from where world generation left off, and its
 * snapshot is stored in `rngState` — so a save taken now and reloaded later
 * yields the exact same next deal roll (Prompt 03 acceptance).
 */
export function createInitialState(seed: number | string): GameState {
  const rng = createRng(seed);
  const world = generateWorld(rng);
  const country = world.startingCountry;

  const homeStash: Stash = {
    id: 'stash-home',
    name: 'Home Stash',
    countryId: country.id,
    type: STARTING_STASH_TYPE,
    dirtyCash: country.startingCash,
    inventory: emptyInventory(),
  };

  const rivals: readonly RivalState[] = world.rivals.map((r) => ({
    id: r.id,
    tension: 0,
    toppled: false,
  }));

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    seed: world.seed,
    rngState: rng.getState(),
    world,
    clock: { hours: 0, day: 1, week: 1 },
    markets: createInitialMarkets(),
    cleanCash: 0,
    reputation: { street: 0, business: 0, political: 0 },
    heat: country.heatBaseline,
    lyingLow: false,
    // Acknowledge the opening tier so the baseline never self-telegraphs on tick 1.
    leTierAck: tierForHeat(country.heatBaseline),
    inventory: emptyInventory(),
    stashes: [homeStash],
    fronts: [],
    crew: [],
    corruption: { officials: [], payrollPerWeek: 0 },
    debt: { principal: 0, interestRatePerHour: 0, active: false },
    rivals,
    flags: {},
    beatsFired: [],
    pendingChoices: [],
    highScore: {
      peakNetWorth: country.startingCash,
      peakCleanCash: 0,
      peakEmpireSize: 1,
    },
    runStatus: 'active',
    lastPlayedRealTime: null,
  };

  return state;
}

/**
 * Restore the run's live RNG from the persisted snapshot. Callers that consume
 * randomness must write the RNG's new state back with `withRngState` so the
 * stream never rewinds. (Reserved for later deal/heat/chaos prompts.)
 */
export function rngFor(state: GameState): Rng {
  return restoreRng(state.rngState);
}

/** Return a copy of `state` with the RNG snapshot advanced to `rng`. */
export function withRngState(state: GameState, rng: Rng): GameState {
  return { ...state, rngState: rng.getState() };
}

/**
 * The intent union — every player action the store can dispatch. The deal
 * variants (Prompt 04) are the first real actions; later prompts add bribe,
 * launder, borrow, … and their handler cases.
 */
export type Intent =
  | { readonly type: 'noop' }
  | BuyIntent
  | SellIntent
  | LieLowIntent;

/**
 * Pure reducer entry point: intent in -> new immutable state out. Never mutates
 * `state`. Deal intents delegate to `resolveDeal`, keeping only the new state;
 * callers that need the deal's scene key / fairness numbers call `resolveDeal`
 * directly (see `deals.ts`).
 */
export function applyIntent(state: GameState, intent: Intent): GameState {
  switch (intent.type) {
    case 'noop':
      return state;
    case 'buy':
    case 'sell':
      return resolveDeal(state, intent).state;
    case 'lieLow':
      return setLieLow(state, intent.enabled);
  }
}
