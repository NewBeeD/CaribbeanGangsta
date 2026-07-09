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
import type {
  CrewAgenda,
  CrewRole,
  CrewSkills,
  CrewTrait,
} from './config/crew';

/**
 * Bump when the persisted `GameState` shape changes; add a matching entry to the
 * migration table in `store/persistence.ts`. Older saves migrate or reject
 * cleanly (Prompt 03 acceptance).
 *
 * v2: added `markets` (live per-location price drift, Prompt 04).
 * v3: added `lyingLow` + `leTierAck` (heat/law-enforcement engine, Prompt 05).
 * v4: added `type` + `guardCrewId` to `Stash` (contraband storage, Prompt 06).
 * v5: expanded `CrewMember` to the full relatedness model — traits/skills/agenda/
 *     memory/betrayal arcs (crew engine, Prompt 08).
 * v6: expanded `Corruption` — full `OfficialTie` payroll model (retainer/greed/
 *     memory/flip arc/pending raise), `paidPorts`, and weekly-payroll bookkeeping
 *     (the corruption network, Prompt 09).
 * v7: expanded `Debt` — the loan-shark ledger (`lenderId`/`rate`/`accruedInterest`/
 *     `dueDay`/`collateralRef`/`ladderRung`) replacing the `interestRatePerHour`
 *     stub (debt & loan sharks, Prompt 10).
 */
export const SCHEMA_VERSION = 7 as const;

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

/**
 * One thing a crew member REMEMBERS you did (design/02 §3 — the world remembers).
 * Every loyalty shift writes one; later dialogue/loyalty checks read the log, so a
 * betrayed character never acts as if the wrong didn't happen (§3 consistency law).
 */
export interface MemoryEntry {
  /** In-game hours when it happened (ordering; consistency across save/load). */
  readonly atHours: number;
  /** The loyalty-event kind that wrote it (`LoyaltyEventKind`), free-form here. */
  readonly kind: string;
  /** Prose, from the NPC's side ("You left Deon to take the fall in Kingston."). */
  readonly note: string;
  /** The loyalty delta this event applied (signed). */
  readonly delta: number;
}

/**
 * The betrayal arc — a TELEGRAPHED story beat, never a dice roll (design/02 §4).
 * It steps `warning → point-of-no-return → flipped`, one stage at a time, driven
 * purely by loyalty + agenda + how you treated them; each stage carries a readable
 * `sign`, and raising loyalty (pay/promote/confront) walks it back down. When it
 * reaches `flipped` the crew member becomes a wire (`CrewMember.isWire`).
 */
export type BetrayalStage = 'warning' | 'point-of-no-return' | 'flipped';

export interface BetrayalArc {
  readonly stage: BetrayalStage;
  readonly startedAtHours: number;
  readonly advancedAtHours: number;
  /** The readable sign for the current stage (shown to the player as prose). */
  readonly sign: string;
}

/** What a crew member is currently doing (design/02 §5). `targetId` names the asset. */
export interface CrewAssignment {
  readonly kind: 'idle' | 'guard' | 'front' | 'territory' | 'deal-crew';
  /** The stash/front/territory id this assignment references, when applicable. */
  readonly targetId?: string;
}

/**
 * A crew member as a PERSON, not a stat line (design/02 §1). `loyalty` is hidden
 * (0–100) and surfaced only through prose (`describeLoyalty`) — the UI never shows
 * the number. Prompt 08 (`crew.ts`) owns loyalty shifts, memory, and betrayal arcs.
 */
export interface CrewMember {
  readonly id: string;
  /** The config archetype this crew was spawned from (design/02 §7). */
  readonly archetypeId: string;
  readonly name: string;
  readonly role: CrewRole;
  readonly traits: readonly CrewTrait[];
  readonly skills: CrewSkills;
  /** Hidden 0–100; surfaced via prose/behavior, NEVER as a bar (design/02 §1). */
  readonly loyalty: number;
  /** Shared history with the player — the perspective-taking hook (design/02 §2). */
  readonly bond: string;
  /** Hidden goal — the emergent-conflict seed the player infers (design/02 §6). */
  readonly agenda: CrewAgenda;
  readonly memoryLog: readonly MemoryEntry[];
  readonly assignment: CrewAssignment;
  /** Present once a betrayal arc has begun (design/02 §4). Absent = no arc. */
  readonly activeArc?: BetrayalArc;
  /** True once flipped: an embedded wire feeding heat/LE (design/02 §4; Prompt 05/09). */
  readonly isWire?: boolean;
  /** The single family/personal high-stakes relationship (design/02 §7). */
  readonly isFamily?: boolean;
}

/**
 * A standing raise the official is asking for (design/09 B.2 v1.1). Present on an
 * `OfficialTie` once they've asked for more; the player accepts / negotiates /
 * refuses. Ignoring or refusing it counts as an underpayment (feeds the flip arc).
 */
export interface RaiseAsk {
  /** The new weekly retainer they want (computed from the documented formula). */
  readonly newRetainer: number;
  readonly askedAtHours: number;
  /** Readable reason surfaced as prose ("business is booming and so is the risk"). */
  readonly reason: string;
}

/**
 * A bought official on standing payroll (design/09 B.2). Reuses the crew
 * relatedness spine: hidden `loyalty` (0–100), a `memoryLog` of how you've treated
 * them, and a TELEGRAPHED `activeArc` (the same `BetrayalArc` staging the crew
 * engine uses) that ends in `isWire` when LE turns them. `greed` (0.7–1.3) scales
 * their asks; `retainerPerWeek` is the CURRENT retainer (raised over time via
 * `pendingRaise`). Prompt 09 (`corruption.ts`) owns all of it.
 */
export interface OfficialTie {
  /** Unique instance id (stable across repeat hires of the same archetype). */
  readonly id: string;
  /** The config archetype this tie was hired from (`OfficialId`). */
  readonly officialId: string;
  readonly name: string;
  /** Current weekly retainer, $ (raised over time — design/09 B.2 v1.1). */
  readonly retainerPerWeek: number;
  /** Hidden 0–100; surfaced via prose/behavior, never as a bar (design/02 §1). */
  readonly loyalty: number;
  /** Greed trait 0.7–1.3 — scales bribe/raise asks (design/09 B.1/B.2). */
  readonly greed: number;
  /** Heat (0–100) above which they get nervous and distance themselves (B.2). */
  readonly comfortHeat: number;
  readonly hiredAtHours: number;
  /** The last in-game week their retainer was charged (weekly-boundary bookkeeping). */
  readonly lastPaidWeek: number;
  readonly memoryLog: readonly MemoryEntry[];
  /** Present once a flip arc has begun (design/09 B.2; reuses the crew arc). */
  readonly activeArc?: BetrayalArc;
  /** True once flipped: LE turned them into a wire feeding heat (design/09 B.2). */
  readonly isWire?: boolean;
  /** A standing raise they're currently asking for (design/09 B.2 v1.1). */
  readonly pendingRaise?: RaiseAsk;
}

/**
 * A port whose official has been paid (design/09 B.1/A.3) — container stashes at
 * this port get the reduced seizure floor. `portId` matches a container stash's
 * `countryId`. `paidUntilHours` bounds a one-off port bribe (drifts/expires); a
 * standing customs chief leaves it absent (paid while they're on the payroll).
 */
export interface PaidPort {
  readonly portId: string;
  /** The reduced seizure % locked in for container stashes here, 0..1. */
  readonly seizurePct: number;
  readonly paidAtHours: number;
  /** In-game hours the payment lapses at; absent = standing (never expires). */
  readonly paidUntilHours?: number;
}

export interface Corruption {
  readonly officials: readonly OfficialTie[];
  /** Sum of current retainers across officials, $/wk (derived, kept in sync). */
  readonly payrollPerWeek: number;
  readonly paidPorts: readonly PaidPort[];
  /** Last in-game week the weekly payroll was settled (boundary bookkeeping). */
  readonly lastPayrollWeek: number;
}

/**
 * The loan-shark ledger — a capital SOURCE and the game's main early-game pressure
 * engine (design/10; Prompt 10 owns the interest curve and default ladder). MVP is
 * one loan at a time (design/10 §7): `lenderId === null` means no active loan.
 *
 * Invariant (guarantee #2, design/10 §4.2): offline settlement NEVER increases what
 * is owed and NEVER advances the ladder. Interest accrues only per in-game day
 * ACTUALLY PLAYED — the `debt-interest` tick step is active-only.
 */
export interface Debt {
  /** The lender this loan is from (`LenderId`), or `null` when there is no loan. */
  readonly lenderId: string | null;
  /** Principal borrowed, $ — fixed once borrowed; growth lands in `accruedInterest`. */
  readonly principal: number;
  /** Current weekly interest rate as a fraction (the vig raises it — design/10 §5). */
  readonly rate: number;
  /** Interest accrued to date, $ (kept separate so `principal` is a clean floor). */
  readonly accruedInterest: number;
  /** In-game day the soft due date falls on — consequences BEGIN here (design/10 §3). */
  readonly dueDay: number;
  /** A pledged stash/front id put up as collateral (design/10 §3). Absent = none. */
  readonly collateralRef?: string;
  /** Current default-ladder rung 0–5 (design/10 §5). 0 = in good standing. */
  readonly ladderRung: number;
  /** Interest accrues only while `active` AND the player is online (design/10 §4.2). */
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
  /**
   * The beat that queued this choice (Prompt 22). Lets the story-card presenter
   * resolve the scene via `cardForBeat` without parsing the id. Absent on plain
   * return-hooks (offline `settleOffline` allocations) that carry no card.
   */
  readonly beatId?: string;
  /**
   * A chained story card queued directly (a choice's `firesCard`; Prompt 22). The
   * presenter resolves it via `getCard`. Absent on beat-sourced / return-hook choices.
   */
  readonly cardId?: string;
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

/** A ledger with no active loan — the run's starting (and post-repayment) debt. */
export function emptyDebt(): Debt {
  return {
    lenderId: null,
    principal: 0,
    rate: 0,
    accruedInterest: 0,
    dueDay: 0,
    ladderRung: 0,
    active: false,
  };
}

/** Total owed = principal + accrued interest (what a full repayment must cover). */
export function debtOwed(debt: Debt): number {
  return debt.principal + debt.accruedInterest;
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
    corruption: { officials: [], payrollPerWeek: 0, paidPorts: [], lastPayrollWeek: 1 },
    debt: emptyDebt(),
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
