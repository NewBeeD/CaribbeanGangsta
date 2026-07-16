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
  dismissAllPendingChoices,
  type CrewAssignment,
  type CrewMember,
  type GameState,
  type Intent,
} from '@/engine/state';
import { resolveDeal, type DealIntent, type DealResult } from '@/engine/deals';
import {
  resolveArmsDeal,
  unlockArmsBroker as unlockArmsBrokerEngine,
  type ArmsIntent,
  type ArmsDealResult,
  type ArmsBrokerResult,
} from '@/engine/arms';
import {
  addStash,
  moveProduct as moveProductEngine,
  storeCash as storeCashEngine,
  setStashGuard as setStashGuardEngine,
  type AddStashResult,
  type MoveResult,
  type StashType,
} from '@/engine/storage';
import {
  payBribe as payBribeEngine,
  haggle as haggleEngine,
  hire as hireEngine,
  dismissOfficial as dismissOfficialEngine,
  respondToRaise as respondToRaiseEngine,
  type HaggleResult,
  type HireResult,
  type PayBribeResult,
  type RaiseResult,
} from '@/engine/corruption';
import type { OfficialId } from '@/engine/config/corruption';
import type { ProductId } from '@/engine/config/countries';
import {
  assign,
  assignProduction,
  unassignProduction,
  dismiss,
  loyaltyDelta,
  promote,
  recruit,
  train,
  type AssignProductionResult,
  type LoyaltyEvent,
  type LoyaltyResult,
  type PromoteResult,
  type PromoteTarget,
  type TrainResult,
} from '@/engine/crew';
import type { CrewSkill } from '@/engine/config/crew';
import {
  tick,
  serveSentence as serveSentenceEngine,
  type ServeSentenceResult,
} from '@/engine/clock';
import {
  settleOffline,
  buyFront as buyFrontEngine,
  upgradeFront as upgradeFrontEngine,
  type OfflineReport,
  type FrontResult,
  type FrontType,
} from '@/engine/laundering';
import {
  queueWash as queueWashEngine,
  cancelWash as cancelWashEngine,
  type WashResult,
} from '@/engine/wash';
import {
  buyProductionOp as buyProductionOpEngine,
  upgradeProductionOp as upgradeProductionOpEngine,
  setProductionPaused as setProductionPausedEngine,
  setProductionStash as setProductionStashEngine,
  type ProductionResult,
} from '@/engine/production';
import type { ProductionOpId } from '@/engine/config/production';
import { setLieLow } from '@/engine/heat';
import { buyPlug as buyPlugEngine, type PlugResult } from '@/engine/plugs';
import { convert as convertEngine, type ConvertResult } from '@/engine/conversions';
import type { RecipeId } from '@/engine/config/conversions';
import {
  ship as shipEngine,
  postBond as postBondEngine,
  callFavor as callFavorEngine,
  declineFavor as declineFavorEngine,
  type PostBondResult,
  type FavorResult,
  type ShipIntent,
  type ShipResult,
} from '@/engine/travel';
import {
  buyVessel as buyVesselEngine,
  upgradeVessel as upgradeVesselEngine,
  type VesselResult,
} from '@/engine/vessels';
import type { VesselId } from '@/engine/config/vessels';
import {
  borrow as borrowEngine,
  repay as repayEngine,
  type BorrowResult,
  type RepayResult,
} from '@/engine/debt';
import type { LenderId } from '@/engine/config/lenders';
import { applyChoice, cardForPending } from '@/engine/cards';
import {
  endRun,
  evaluatePrestige,
  runStats,
  type RunEndCause,
  type RunEndResult,
  type RunRecap,
} from '@/engine/endgame';
import { CloudSaveStore, LocalSaveStore, type SaveStore, type SlotMeta } from './persistence';
import {
  bankScore,
  emptyMeta,
  CloudMetaProgressStore,
  LocalMetaProgressStore,
  type MetaProgress,
  type MetaProgressStore,
} from './metaProgress';
import {
  entryFromRunEnd,
  LocalLeaderboard,
  MemoryStorage,
  LEADERBOARD_MAX_ENTRIES,
  type Leaderboard,
} from './leaderboard';
import {
  trackBorrow,
  trackBribe,
  trackCardChoice,
  trackDeal,
  trackFront,
  trackOfficialHired,
  trackOfflineSettled,
  trackRepay,
  trackRunEnded,
  trackRunStarted,
  trackSessionStart,
  trackShipmentLaunched,
  trackTick,
} from '@/telemetry';

const MS_PER_HOUR = 3_600_000;

/**
 * Live-clock pacing (Ideas2 §6): 30 real seconds = 1 in-game hour. The engine
 * stays pure — time is INJECTED via `tick()` — so this wall-clock ratio lives in
 * the store (which owns `Date.now()`), never in `GameConfig` (config/index.ts
 * deliberately keeps structural time anchors like hours-per-day off the tunable
 * surface). Change this one number to re-pace the whole game clock.
 */
const REAL_SECONDS_PER_GAME_HOUR = 30;
const GAME_HOURS_PER_MS = 1 / (REAL_SECONDS_PER_GAME_HOUR * 1000);
/** How often the live loop injects elapsed real time as in-game hours. */
const CLOCK_INTERVAL_MS = 1000;
/** Throttle for the live-clock autosave so an idle session still survives a refresh. */
const LIVE_AUTOSAVE_EVERY_MS = 30_000;

/**
 * Pure map: real milliseconds elapsed → in-game hours to advance (the 30s = 1h
 * ratio). Exported so the pacing is unit-testable without wall-clock timers.
 */
export function gameHoursForElapsedMs(elapsedMs: number): number {
  return Math.max(0, elapsedMs) * GAME_HOURS_PER_MS;
}

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

/**
 * Everything the run-end recap presents (Prompt 23; design/07 §6): the engine's
 * banked result plus the cross-run chase context — was it a personal best, how
 * short otherwise, and where it landed on the (local) board. Built by
 * `endCurrentRun` the moment a run ends, and REBUILT (without re-banking) when an
 * already-ended save hydrates, so a refresh still shows the fall.
 */
export interface RunEndSummary {
  readonly cause: RunEndCause;
  /** The banked score = peak net worth (design/01 §7 — a late wipe still shows the height). */
  readonly score: number;
  readonly recap: RunRecap;
  /** Prestige unlock ids this run earned (non-power — GDD §7). */
  readonly unlockedPrestige: readonly string[];
  /** The personal best BEFORE this run banked (what this run was chasing). */
  readonly previousBest: number;
  readonly newPersonalBest: boolean;
  /** How far short of the best this run fell ($0 when it IS the new best). */
  readonly shortBy: number;
  /** 1-based position on the local all-time board, or `null` when unranked. */
  readonly rank: number | null;
}

export interface GameStore {
  /** Current run, or `null` before a game is created/loaded. */
  readonly state: GameState | null;
  /** Save backend (swappable; defaults to on-device IndexedDB). */
  readonly saveStore: SaveStore;
  /** Cross-run meta store (its own IndexedDB — survives permadeath). */
  readonly metaStore: MetaProgressStore;
  /** The leaderboard adapter (local-first; the remote is a drop-in stub). */
  readonly leaderboard: Leaderboard;
  /** The loaded cross-run meta profile (personal best, prestige, runs played). */
  readonly meta: MetaProgress;
  /** The most recent run-end recap, or `null` while a run is alive. */
  readonly lastRunEnd: RunEndSummary | null;
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
   * Storage actions (Prompt 20) — each wraps the pure `storage.ts` engine, commits
   * only when the operation lands (valid + funds/inventory sufficed), and autosaves
   * so the stash layout survives a refresh. The UI authors no seizure/capacity math.
   */
  /** Move `qty` of a product between stashes; the result reports the travel delay. */
  moveStashProduct(
    fromId: string,
    toId: string,
    product: ProductId,
    qty: number,
  ): MoveResult | null;
  /** Move dirty cash between stashes (dirty cash is located); reports travel delay. */
  moveStashCash(fromId: string, toId: string, amount: number): MoveResult | null;
  /** Assign (or, with `crewId: undefined`, clear) the crew member guarding a stash. */
  assignStashGuard(stashId: string, crewId: string | undefined): void;
  /**
   * Corruption actions (Prompt 20) — each wraps the pure `corruption.ts` engine,
   * commits when the operation lands, and autosaves. The UI authors no price/loyalty
   * math; it only shows the disclosed numbers and dispatches the intent.
   */
  /** Pay a port bribe from CLEAN cash (pass `agreedAsk` from a successful haggle). */
  payPortBribe(portId: string, shipmentValue: number, agreedAsk?: number): PayBribeResult | null;
  /**
   * Haggle a port bribe — a readable gamble (design/09 B.1). ALWAYS commits the
   * advanced RNG snapshot (the roll was consumed; re-rolling would be unfair), and
   * returns the result so the UI can show the discounted ask or the refusal.
   */
  hagglePortBribe(portId: string, shipmentValue: number): HaggleResult | null;
  /** Put an official on the payroll (customs chief needs the `portId` it covers). */
  hireOfficial(officialId: OfficialId, portId?: string): HireResult | null;
  /** Cut an official loose — the clean break (drops any standing paid port). */
  fireOfficial(officialId: string): void;
  /** Accept (raise their retainer) or refuse (an underpayment) a pending raise-ask. */
  respondToRaise(officialId: string, accept: boolean): RaiseResult | null;
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
   * Send the mules: commit `amount` of located dirty cash to the wash queue — the
   * batched dirty→clean converter. It drains to clean over ONLINE time at the mule
   * throughput (`washStep` on the live clock), landing at `1 − WASH_CUT`. Commits +
   * autosaves only when it lands (positive amount, enough dirty on hand); returns
   * the full `WashResult` (its `rejected` reason otherwise), or `null` when no run.
   */
  queueWash(amount: number): WashResult | null;
  /** Call the mules off: return the un-deposited dirty cash to a stash and empty the queue. */
  cancelWash(): void;
  /**
   * Production actions (Prompt 39; Ideas2 item 3) — buy/upgrade a grow-op or drug
   * factory. Each wraps the pure `production.ts` engine, commits only when it lands
   * (funds sufficed, not owned/maxed), and autosaves so the ops survive a refresh.
   * The UI authors no yield/cost math. Crew delegation goes through
   * `assignProductionOp`/`unassignProductionOp` (design/13 D — a lieutenant runs up
   * to two ops, so it's its own capacity-checked path, not the single `assignCrew`).
   */
  /** Buy the Level-1 grow-op/factory of `id`, paid from CLEAN cash (single-buy). */
  buyProductionOp(id: ProductionOpId): ProductionResult | null;
  /** Upgrade a production op one level, paid from CLEAN cash at `buy_in × 1.15^level`. */
  upgradeProductionOp(opId: string): ProductionResult | null;
  /** Pause or resume an op — a paused op yields nothing and emits no heat (free both ways). */
  setProductionPaused(opId: string, paused: boolean): void;
  /** Route an op's yield to a same-country destination stash (home when it's `stashes[0]`). */
  setProductionStash(opId: string, stashId: string): void;
  /**
   * Owned vessels — the late-game logistics money sink (design/13 E; Prompt 47).
   * Commit + autosave only on success (funds sufficed, not owned/maxed). The UI
   * authors no cost/cap math — the fleet card reads `vesselCargoCap`/`vesselUpgradeCost`.
   */
  /** Buy the Level-1 vessel of `id`, paid from CLEAN cash (single-buy per id). */
  buyVessel(id: VesselId): VesselResult | null;
  /** Upgrade a vessel one level, paid from CLEAN cash at `buy_in × 1.15^level`. */
  upgradeVessel(vesselId: string): VesselResult | null;
  /** Bring an archetype onto the crew (open access — money/relationships gate it, never a flag). */
  recruitCrew(archetypeId: string): CrewMember | null;
  /** Train a skill by a fixed step, paid from clean cash. Rejects (no commit) if maxed/short. */
  trainCrew(npcId: string, skill: CrewSkill): TrainResult | null;
  /** Promote to lieutenant delegating a front/territory; ripples grievance to the passed-over. */
  promoteCrew(npcId: string, target: PromoteTarget): PromoteResult | null;
  /** Set what a crew member is doing (guard wires them into the stash's seizure %). */
  assignCrew(npcId: string, assignment: CrewAssignment): void;
  /**
   * Put a lieutenant on a production op (design/13 D; Prompt 46). Up to two ops per
   * lieutenant; a third rejects `lieutenant-at-capacity` (no commit). Returns the
   * full `AssignProductionResult` (its `rejected` reason otherwise), or `null` when
   * no run is loaded — the screen surfaces the readable reject copy.
   */
  assignProductionOp(npcId: string, opId: string): AssignProductionResult | null;
  /** Pull a lieutenant off a production op, freeing a span-of-control slot. */
  unassignProductionOp(npcId: string, opId: string): void;
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
   * Debt actions (Prompt 21) — borrowing at interest, the come-up hook & the
   * lifeline out of the spiral (design/10). Each wraps the pure `debt.ts` engine,
   * commits only when it lands, and autosaves so the ledger survives a refresh. The
   * UI authors no interest/cap/ladder math; it shows disclosed terms and dispatches.
   */
  /**
   * Take a loan from `lenderId` (opt-in only — guarantee #1). Commits + autosaves
   * only when it lands (amount valid, within cap, no active loan); returns the full
   * `BorrowResult` (its `rejected` reason otherwise), or `null` when no run loaded.
   */
  borrowLoan(lenderId: LenderId, amount: number, collateralRef?: string): BorrowResult | null;
  /**
   * Repay toward the loan from CLEAN cash — partial/early is always free and resets
   * the shark's patience (guarantee #4). Commits + autosaves only when it lands
   * (funds sufficed, a loan is active); returns the full `RepayResult`, or `null`.
   */
  repayLoan(amount: number): RepayResult | null;
  /**
   * Story-card presenter (Prompt 22) — resolve a queued scene's chosen option. Folds
   * the choice's declarative effects through the engine (`applyChoice`, the ONE place a
   * card touches state), removes the now-resolved pending choice from the queue, and
   * autosaves. A no-op when no run is loaded or the choice can't be resolved to a card.
   */
  resolveCardChoice(choiceId: string, choiceIndex: number): void;
  /**
   * Clear a queued return-hook once it's been acted on (Prompt 22) — the hook did its
   * job (pulled the player into the screen that resolves it), so it leaves the queue.
   * Autosaves so the cleared queue survives a refresh.
   */
  dismissPendingChoice(choiceId: string): void;
  /**
   * Clear every safely-dismissible pending choice at once (design/13 A5 — the
   * Money feed's "Clear all"). Routes through the pure `dismissAllPendingChoices`,
   * which mirrors the single-dismiss default path and leaves consequential
   * (card-bearing) choices untouched. Autosaves.
   */
  clearPendingChoices(): void;
  /**
   * World-market actions (Prompt 31) — each wraps the pure engine, commits only
   * when the operation lands, and autosaves. The UI authors no price/odds math;
   * it shows the disclosed quote and dispatches the intent.
   */
  /**
   * Buy the one-time plug intro to a true source (Ideas2 §2 — a pure money
   * gate). Cost and meeting heat are disclosed by `plugQuote` BEFORE this is
   * called; returns the full `PlugResult` so the outcome renders as a scene.
   */
  buyPlugIntro(countryId: string): PlugResult | null;
  /**
   * Run conversion batches at a stash (cook crack / press hash — Ideas2 §4).
   * Deterministic, no roll; commits + autosaves only when it lands. Returns the
   * full `ConvertResult` (consumed/produced/cost + scene key) or `null`.
   */
  convertProduct(recipe: RecipeId, batches: number, stashId?: string): ConvertResult | null;
  /**
   * Launch a cross-country shipment (Prompt 30/31). The quote — cost, cuts,
   * eta, and the EXACT interdiction odds rolled on arrival — is disclosed by
   * `quoteShipment` before commit (fairness law). Commits + autosaves only when
   * the launch lands; returns the full `ShipResult` or `null`.
   */
  shipCargo(intent: ShipIntent): ShipResult | null;
  /**
   * Resolve a pending self-run ARREST interrupt (design/13 B4; Prompt 44) —
   * the bond-or-sentence choice the launch quote disclosed. `'bond'` pays the
   * shown `arrestBond` from clean cash (+ the heat spike) and the run
   * continues; `'serve'` fast-forwards the disclosed sentence through the
   * engine's incarcerated pipeline (`clock.serveSentence` — costs and threats
   * run, income freezes) and the run RESUMES. Neither path ends the run; the
   * bond is the only reprieve from the time (a payrolled judge never buries an
   * arrest — the bond was already the reprieve).
   */
  resolveArrest(choiceId: string, choice: 'bond' | 'serve'): Promise<PostBondResult | ServeSentenceResult | null>;
  /**
   * Resolve a pending "call in a favor" interrupt (design/13 F; Prompt 48) — the
   * choice queued when a payrolled official could pull an interdicted load back.
   * `'call'` pays the disclosed favor fee from clean cash + spends the official's
   * loyalty and DELIVERS the exact load; `'let-go'` declines and takes today's
   * seizure. Commits + autosaves only when the resolution lands; returns the
   * `FavorResult` or `null`.
   */
  resolveFavor(choiceId: string, choice: 'call' | 'let-go'): FavorResult | null;
  /**
   * Arms trade (Prompt 35; design/12 Item 1) — each wraps the pure `arms.ts`
   * engine, commits only when the operation lands, and autosaves. The UI authors
   * no price/heat/odds math; it shows the disclosed numbers and dispatches.
   */
  /**
   * Pay the arms-broker intro from CLEAN cash (a pure money gate). Cost + meeting
   * heat are disclosed by `armsBrokerQuote` before commit; commits + autosaves
   * only when it lands. Returns the full `ArmsBrokerResult` or `null`.
   */
  unlockArmsBroker(): ArmsBrokerResult | null;
  /**
   * Resolve an arms buy/sell with a SINGLE bust roll (sells), apply the new
   * state, and return the full `ArmsDealResult` (scene key + fairness numbers) so
   * the UI renders the outcome scene. Mirrors `commitDeal`. Returns `null` when
   * no run is loaded.
   */
  commitArmsDeal(intent: ArmsIntent): ArmsDealResult | null;
  /**
   * Run-end (Prompt 23; design/01 §7): end the run through the engine's `endRun`,
   * bank the peak score into meta (survives permadeath), submit the line to the
   * leaderboard, and build the `lastRunEnd` recap the run-end screen renders. A
   * judge-granted comeback banks NOTHING — the run continues. Only ever called
   * from an explicit, telegraphed in-game decision (GDD §8 — absence never kills).
   */
  endCurrentRun(cause: RunEndCause): Promise<RunEndResult | null>;
  /**
   * Abandon the live run mid-run and start over (design/12 Item 2). Routes
   * through `endCurrentRun` with the `abandoned` cause — the ONE banking path —
   * so the score-so-far banks like a retirement (no penalty), the Run-End screen
   * shows the fall, and `startNextRun` reseeds a fresh world. Destructive: the
   * caller confirms first. A no-op when no active run is loaded.
   */
  abandonRun(): Promise<RunEndResult | null>;
  /**
   * The dare taken: start the next run in a NEW random world (fresh seed —
   * design/01 §0a). Clears the recap and autosaves the newborn run.
   */
  startNextRun(): void;
  /** (Re)load the cross-run meta profile from the meta store. */
  refreshMeta(): Promise<void>;
  /** Advance the sim by `dtHours` of online in-game time. */
  tickBy(dtHours: number): void;
  /**
   * Start the live in-game clock (Ideas2 §6): real time advances the sim so the
   * world keeps moving even when the player isn't acting — shipments arrive, heat
   * cools, interest accrues, the street re-ups. This is what makes time follow
   * the clock, not the play. Idempotent; the caller (AppShell) runs it while a run
   * is active and the tab is visible, and stops it otherwise.
   */
  startClock(): void;
  /** Stop the live in-game clock (tab hidden / run ended / unmount). Idempotent. */
  stopClock(): void;
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

/** Monotonic tail so two runs minted in the same millisecond still get distinct seeds. */
let runMint = 0;

/** Live-clock loop handle + last wall-clock reads (module-scoped: one loop per app). */
let clockHandle: ReturnType<typeof setInterval> | null = null;
let lastClockReadAt = 0;
let lastLiveSaveAt = 0;

/** Map a persisted terminal `runStatus` back onto the cause that produced it. */
function causeForStatus(state: GameState): RunEndCause {
  return state.runStatus === 'dead'
    ? 'killed'
    : state.runStatus === 'prison'
      ? 'prison'
      : 'retired';
}

/** 1-based all-time rank of the entry matching `seed`+`score`, or `null` if unranked. */
async function rankOnBoard(
  leaderboard: Leaderboard,
  seed: string,
  score: number,
): Promise<number | null> {
  try {
    const board = await leaderboard.top(LEADERBOARD_MAX_ENTRIES, 'all-time');
    const i = board.findIndex((e) => e.seed === seed && e.score === score);
    return i >= 0 ? i + 1 : null;
  } catch {
    return null;
  }
}

/**
 * Rebuild a `RunEndSummary` for an ALREADY-ENDED run that just hydrated (a refresh
 * on the fall screen). Everything is re-derived from the banked peaks in the save +
 * the persisted meta — nothing is re-banked, so runs-played/prestige can't double.
 */
async function summarizeEndedRun(
  state: GameState,
  meta: MetaProgress,
  leaderboard: Leaderboard,
): Promise<RunEndSummary> {
  const cause = causeForStatus(state);
  const score = state.highScore.peakNetWorth;
  const stats = runStats(state);
  const recap: RunRecap = {
    cause,
    seed: state.seed,
    day: state.clock.day,
    week: state.clock.week,
    peakNetWorth: state.highScore.peakNetWorth,
    peakCleanCash: state.highScore.peakCleanCash,
    peakEmpireSize: state.highScore.peakEmpireSize,
    rivalsToppled: stats.rivalsToppled,
  };
  // Meta already includes this run, so matching the best means this run set it.
  const newPersonalBest = score > 0 && score >= meta.personalBest;
  return {
    cause,
    score,
    recap,
    unlockedPrestige: evaluatePrestige(stats),
    previousBest: meta.personalBest,
    newPersonalBest,
    shortBy: newPersonalBest ? 0 : Math.max(0, meta.personalBest - score),
    rank: await rankOnBoard(leaderboard, state.seed, score),
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  saveStore: safeLocalSaveStore(),
  metaStore: safeMetaStore(),
  leaderboard: safeLeaderboard(),
  meta: emptyMeta(),
  lastRunEnd: null,
  lastOfflineReport: null,

  newGame(seed) {
    const runSeed = seed ?? `run-${Date.now()}-${runMint++}`;
    const state = createInitialState(runSeed);
    set({ state, lastOfflineReport: null, lastRunEnd: null });
    trackSessionStart('new-run', state);
    trackRunStarted(state);
  },

  dispatch(intent) {
    withState(get, set, (state) => applyIntent(state, intent));
  },

  commitDeal(intent) {
    const { state } = get();
    if (!state) return null;
    const result = resolveDeal(state, intent);
    set({ state: result.state });
    trackDeal(intent, result);
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

  moveStashProduct(fromId, toId, product, qty) {
    const { state } = get();
    if (!state) return null;
    const result = moveProductEngine(state, fromId, toId, product, qty);
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  moveStashCash(fromId, toId, amount) {
    const { state } = get();
    if (!state) return null;
    const result = storeCashEngine(state, fromId, toId, amount);
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  assignStashGuard(stashId, crewId) {
    withState(get, set, (state) => setStashGuardEngine(state, stashId, crewId));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  payPortBribe(portId, shipmentValue, agreedAsk) {
    const { state } = get();
    if (!state) return null;
    const result =
      agreedAsk === undefined
        ? payBribeEngine(state, portId, shipmentValue)
        : payBribeEngine(state, portId, shipmentValue, { agreedAsk });
    // Only commit + autosave when the bribe cleared (funds sufficed).
    if (result.ok) {
      set({ state: result.state });
      trackBribe(portId, shipmentValue, result);
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  hagglePortBribe(portId, shipmentValue) {
    const { state } = get();
    if (!state) return null;
    const result = haggleEngine(state, portId, shipmentValue);
    // Always commit — the RNG draw was consumed; a re-roll on retry would be unfair.
    set({ state: result.state });
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
    return result;
  },

  hireOfficial(officialId, portId) {
    const { state } = get();
    if (!state) return null;
    const result =
      portId === undefined
        ? hireEngine(state, officialId)
        : hireEngine(state, officialId, { portId });
    // Only commit + autosave when the hire landed (funds sufficed, not a duplicate).
    if (result.official) {
      set({ state: result.state });
      trackOfficialHired(result);
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  fireOfficial(officialId) {
    withState(get, set, (state) => dismissOfficialEngine(state, officialId));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  respondToRaise(officialId, accept) {
    const { state } = get();
    if (!state) return null;
    const result = respondToRaiseEngine(state, officialId, accept);
    if (!result.rejected) {
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
      trackFront('upgraded', state, result);
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
      trackFront('opened', state, result);
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  queueWash(amount) {
    const { state } = get();
    if (!state) return null;
    const result = queueWashEngine(state, amount);
    // Only commit + autosave when the mules took the job (valid amount, enough dirty).
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  cancelWash() {
    withState(get, set, (state) => cancelWashEngine(state));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  buyProductionOp(id) {
    const { state } = get();
    if (!state) return null;
    const result = buyProductionOpEngine(state, id);
    // Only commit + autosave when the op was bought (funds sufficed, not owned).
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  upgradeProductionOp(opId) {
    const { state } = get();
    if (!state) return null;
    const result = upgradeProductionOpEngine(state, opId);
    // Only commit + autosave when the upgrade landed (funds sufficed, not maxed).
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  setProductionPaused(opId, paused) {
    withState(get, set, (state) => setProductionPausedEngine(state, opId, paused));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  setProductionStash(opId, stashId) {
    withState(get, set, (state) => setProductionStashEngine(state, opId, stashId));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  buyVessel(id) {
    const { state } = get();
    if (!state) return null;
    const result = buyVesselEngine(state, id);
    // Only commit + autosave when the vessel was bought (funds sufficed, not owned).
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  upgradeVessel(vesselId) {
    const { state } = get();
    if (!state) return null;
    const result = upgradeVesselEngine(state, vesselId);
    // Only commit + autosave when the upgrade landed (funds sufficed, not maxed).
    if (!result.rejected) {
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

  assignProductionOp(npcId, opId) {
    const { state } = get();
    if (!state) return null;
    const result = assignProduction(state, npcId, opId);
    if (!result.rejected) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  unassignProductionOp(npcId, opId) {
    withState(get, set, (state) => unassignProduction(state, npcId, opId));
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

  borrowLoan(lenderId, amount, collateralRef) {
    const { state } = get();
    if (!state) return null;
    const result =
      collateralRef === undefined
        ? borrowEngine(state, lenderId, amount)
        : borrowEngine(state, lenderId, amount, collateralRef);
    // Only commit + autosave when the loan actually opened (opt-in, within cap).
    if (result.ok) {
      set({ state: result.state });
      trackBorrow(state, lenderId, result, collateralRef);
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  repayLoan(amount) {
    const { state } = get();
    if (!state) return null;
    const result = repayEngine(state, amount);
    // Only commit + autosave when the payment cleared (funds sufficed, loan active).
    if (result.ok) {
      set({ state: result.state });
      trackRepay(state, result);
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  resolveCardChoice(choiceId, choiceIndex) {
    const { state } = get();
    if (!state) return;
    const choice = state.pendingChoices.find((c) => c.id === choiceId);
    if (!choice) return;
    // Apply the choice's effects (when it resolves to a card), then drop the resolved
    // scene from the queue — a chained `firesCard` enqueued by `applyChoice` survives.
    const card = cardForPending(state, choice);
    const applied = card ? applyChoice(state, card.id, choiceIndex) : state;
    set({
      state: {
        ...applied,
        pendingChoices: applied.pendingChoices.filter((c) => c.id !== choiceId),
      },
    });
    if (card) trackCardChoice(card.id, choiceIndex);
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  dismissPendingChoice(choiceId) {
    withState(get, set, (state) => ({
      ...state,
      pendingChoices: state.pendingChoices.filter((c) => c.id !== choiceId),
    }));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  clearPendingChoices() {
    withState(get, set, (state) => dismissAllPendingChoices(state));
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  buyPlugIntro(countryId) {
    const { state } = get();
    if (!state) return null;
    const result = buyPlugEngine(state, countryId);
    // Only commit + autosave when the intro landed (funds sufficed, a real source).
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  convertProduct(recipe, batches, stashId) {
    const { state } = get();
    if (!state) return null;
    const intent =
      stashId === undefined
        ? ({ type: 'convert', recipe, batches } as const)
        : ({ type: 'convert', recipe, batches, stashId } as const);
    const result = convertEngine(state, intent);
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  shipCargo(intent) {
    const { state } = get();
    if (!state) return null;
    const result = shipEngine(state, intent);
    // Only commit + autosave when the launch landed (validated + funded).
    if (result.ok) {
      set({ state: result.state });
      trackShipmentLaunched(result);
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  unlockArmsBroker() {
    const { state } = get();
    if (!state) return null;
    const result = unlockArmsBrokerEngine(state);
    // Only commit + autosave when the intro landed (funds sufficed, not a repeat).
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  commitArmsDeal(intent) {
    const { state } = get();
    if (!state) return null;
    const result = resolveArmsDeal(state, intent);
    // Commit on success/bust (a sell's roll was consumed); a rejection is a no-op.
    if (result.outcome !== 'rejected') {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  async resolveArrest(choiceId, choice) {
    const { state } = get();
    if (!state) return null;
    if (choice === 'bond') {
      const result = postBondEngine(state, choiceId);
      if (result.ok) {
        set({ state: result.state });
        void get().persist(AUTOSAVE_SLOT).catch(() => {});
      }
      return result;
    }
    // Serve: the engine fast-forwards the disclosed sentence and the run
    // resumes (design/13 B4, sentence variant). The served week is one giant
    // tick, so telemetry sees everything it did (raids, arrivals, arcs).
    const result = serveSentenceEngine(state, choiceId);
    if (result.ok) {
      set({ state: result.state });
      trackTick(state, result.state);
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  resolveFavor(choiceId, choice) {
    const { state } = get();
    if (!state) return null;
    const result =
      choice === 'call'
        ? callFavorEngine(state, choiceId)
        : declineFavorEngine(state, choiceId);
    if (result.ok) {
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
    }
    return result;
  },

  async endCurrentRun(cause) {
    const { state, metaStore, leaderboard } = get();
    if (!state || state.runStatus !== 'active') return null;

    const result = endRun(state, cause);
    trackRunEnded(state, result);
    if (result.comeback) {
      // A payrolled judge buried the charge — the run continues; nothing banks.
      set({ state: result.state });
      void get().persist(AUTOSAVE_SLOT).catch(() => {});
      return result;
    }

    set({ state: result.state });

    // Bank into meta — read the persisted prior FIRST so `previousBest` is the
    // number this run was chasing, then fold and save. Persistence hiccups never
    // block the recap (the fall must always show).
    let prior = get().meta;
    try {
      prior = await metaStore.loadMeta();
    } catch {
      /* keep the in-memory profile */
    }
    const banked = bankScore(prior, result);
    try {
      await metaStore.saveMeta(banked);
    } catch {
      /* on-device meta unavailable — the in-memory profile still updates */
    }

    // Submit the banked line to the (local-first) leaderboard, then find its rank.
    const entry = entryFromRunEnd(result, Date.now());
    try {
      await leaderboard.submit(entry);
    } catch {
      /* a stub/offline board never blocks the recap */
    }

    set({
      meta: banked,
      lastRunEnd: {
        cause: result.cause,
        score: result.score,
        recap: result.recap,
        unlockedPrestige: result.unlockedPrestige,
        previousBest: prior.personalBest,
        newPersonalBest: result.score > prior.personalBest,
        shortBy: Math.max(0, prior.personalBest - result.score),
        rank: await rankOnBoard(leaderboard, entry.seed, entry.score),
      },
    });
    // Persist the ENDED run — a refresh comes back to the fall, not a live run.
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
    return result;
  },

  async abandonRun() {
    // The ONLY banking path is `endCurrentRun` (the run-end model) — abandon just
    // routes through it with the `abandoned` cause, banking the score-so-far like
    // a retirement and landing on the Run-End screen (design/12 Item 2).
    return get().endCurrentRun('abandoned');
  },

  startNextRun() {
    // `newGame` mints a fresh wall-clock seed → a brand-new random world (design/01 §0a).
    get().newGame();
    void get().persist(AUTOSAVE_SLOT).catch(() => {});
  },

  async refreshMeta() {
    try {
      set({ meta: await get().metaStore.loadMeta() });
    } catch {
      /* no meta backend — keep the in-memory profile */
    }
  },

  tickBy(dtHours) {
    const { state } = get();
    if (!state) return;
    const next = tick(state, dtHours);
    set({ state: next });
    // Everything the tick did (raids, beats, arrivals, the spiral) as telemetry.
    trackTick(state, next);
  },

  startClock() {
    if (clockHandle !== null) return; // already running — idempotent
    lastClockReadAt = Date.now();
    lastLiveSaveAt = lastClockReadAt;
    clockHandle = setInterval(() => {
      const store = get();
      const s = store.state;
      // Only a living run advances; a dead/ended run freezes on the fall screen.
      if (!s || s.runStatus !== 'active') return;
      const now = Date.now();
      const dtHours = gameHoursForElapsedMs(now - lastClockReadAt);
      lastClockReadAt = now;
      if (dtHours > 0) store.tickBy(dtHours);
      // Throttled autosave so an idle session (no player actions) still persists
      // its advanced clock and re-stamps lastPlayedRealTime for offline settlement.
      if (now - lastLiveSaveAt >= LIVE_AUTOSAVE_EVERY_MS) {
        lastLiveSaveAt = now;
        void store.persist(AUTOSAVE_SLOT).catch(() => {});
      }
    }, CLOCK_INTERVAL_MS);
  },

  stopClock() {
    if (clockHandle !== null) {
      clearInterval(clockHandle);
      clockHandle = null;
    }
  },

  async hydrate(slot) {
    const { saveStore, leaderboard } = get();
    const loaded = await saveStore.load(slot);
    if (!loaded) return false;

    // An ended run hydrates straight back onto the fall: no offline settlement
    // (the run is over), and the recap is REBUILT from the banked peaks + meta —
    // never re-banked, so a refresh can't double-count the score.
    if (loaded.runStatus !== 'active') {
      await get().refreshMeta();
      const summary = await summarizeEndedRun(loaded, get().meta, leaderboard);
      set({ state: loaded, lastOfflineReport: null, lastRunEnd: summary });
      trackSessionStart('continue', loaded);
      return true;
    }

    // Settle the gap since this save was last played (frozen/safe accrual).
    const away = loaded.lastPlayedRealTime;
    const realHoursAway =
      away === null ? 0 : Math.max(0, (Date.now() - away) / MS_PER_HOUR);
    if (realHoursAway > 0) {
      const { state, report } = settleOffline(loaded, realHoursAway);
      set({ state, lastOfflineReport: report, lastRunEnd: null });
      trackSessionStart('continue', state);
      // The return payoff + the offline-freeze guarantee audit (design/10 §6).
      trackOfflineSettled(loaded, state, report);
    } else {
      set({ state: loaded, lastOfflineReport: null, lastRunEnd: null });
      trackSessionStart('continue', loaded);
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

/** The cross-run meta profile (personal best, prestige, runs played). */
export const useMeta = (): MetaProgress => useGameStore((s) => s.meta);

/** The run-end recap to present, or `null` while a run is alive (Prompt 23). */
export const useRunEnd = (): RunEndSummary | null => useGameStore((s) => s.lastRunEnd);

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

/** On-device meta store when IndexedDB exists, else the cloud stub (never throws on import). */
function safeMetaStore(): MetaProgressStore {
  try {
    return new LocalMetaProgressStore();
  } catch {
    return new CloudMetaProgressStore();
  }
}

/** The local board over `localStorage`, else an in-memory board (never throws on import). */
function safeLeaderboard(): Leaderboard {
  try {
    return new LocalLeaderboard();
  } catch {
    return new LocalLeaderboard({ storage: new MemoryStorage() });
  }
}
