/**
 * The Money screen's view-model (Prompt 18; design/07 §4, design/04 §1/§3). PURE
 * read selectors that turn the `GameState` into the return-payoff surface: the
 * clean-cash the empire is minting, the fronts and their priced next upgrade,
 * and the decisions queued on return. The screen composes these and dispatches
 * laundering intents through the store — it authors NO rate or upgrade-cost math
 * (README UI rule; the number shown is the number the engine uses — design/01
 * §0.3 fairness law).
 *
 * Fronts are the ONLY dirty→clean route (design/12 Item 12 — the bulk peso
 * exchange was removed so a front actually means something). Open access
 * (Ideas.md — Drug Lord 2; the [[open-access-design]] rule): every front is
 * buyable from minute one. Money is the only gate — options show their price and
 * affordability limits them, never a flag.
 *
 * The ethical spine (GDD §6, §8): absence forgoes gains but never risks progress.
 * Nothing this model exposes frames an absence as a loss — there is no "your fronts
 * are at risk" surface here, ever. The offline settlement (`OfflineReport`) is read
 * as gains + choices to allocate.
 */

import {
  FRONT_MAX_LEVEL,
  FRONT_TYPES,
  cleanCashRate,
  cryptoSwingFactor,
  frontLieutenantBonus,
  frontUpgradeCost,
  getFrontType,
  isConsequentialChoice,
  totalDirtyCash,
  washCleanRate,
  washCut,
  washEtaHours,
  washRate,
  type Front,
  type FrontType,
  type GameState,
} from '@/engine';

/** Total clean cash per real hour across every front — the header's accrual figure. */
export function totalCleanRate(state: GameState): number {
  return cleanCashRate(state);
}

/**
 * The clean $/h a single front mints right now — `ratePerLevel × level`, with the
 * crypto front's live swing and any delegated-lieutenant bonus folded in. Computed
 * exactly as the engine's private `frontRate`, so the per-front rows sum to
 * `totalCleanRate` (fairness: shown = accrued).
 */
export function frontRatePerHour(state: GameState, front: Front): number {
  const cfg = getFrontType(front.type as FrontType);
  const base = cfg.ratePerLevel * front.level;
  const swung = cfg.swing > 0 ? base * cryptoSwingFactor(state) : base;
  return swung * (1 + frontLieutenantBonus(state, front.id));
}

/** One owned front, priced for its next level (design/07 §4 FRONTS list). */
export interface FrontRow {
  readonly id: string;
  readonly type: FrontType;
  readonly name: string;
  readonly level: number;
  readonly maxLevel: number;
  readonly maxed: boolean;
  /** Clean $/h at the current level (crypto swing + delegation folded in). */
  readonly ratePerHour: number;
  /** Cost to reach the next level, `buy_in × 1.15^level` (0 when maxed). */
  readonly upgradeCost: number;
  /** Clean cash covers the next level. */
  readonly affordable: boolean;
  /** This front's rate swings live (crypto) — the shown rate is a snapshot. */
  readonly swings: boolean;
}

export function frontRows(state: GameState): readonly FrontRow[] {
  return state.fronts.map((f) => {
    const type = f.type as FrontType;
    const cfg = getFrontType(type);
    const maxed = f.level >= FRONT_MAX_LEVEL;
    const upgradeCost = maxed ? 0 : frontUpgradeCost(type, f.level);
    return {
      id: f.id,
      type,
      name: cfg.name,
      level: f.level,
      maxLevel: FRONT_MAX_LEVEL,
      maxed,
      ratePerHour: frontRatePerHour(state, f),
      upgradeCost,
      affordable: !maxed && state.cleanCash >= upgradeCost,
      swings: cfg.swing > 0,
    };
  });
}

/**
 * The front whose next upgrade to affordable-highlight — the cheapest upgrade the
 * player can actually pay for (design/07 §4 "affordable next step highlighted").
 * `null` when nothing is upgradable-and-affordable (nothing is emphasized, but every
 * upgrade still shows its price — money is the gate, not a hidden menu).
 */
export function nextAffordableUpgradeId(state: GameState): string | null {
  const affordable = frontRows(state).filter((r) => !r.maxed && r.affordable);
  if (affordable.length === 0) return null;
  return [...affordable].sort((a, b) => a.upgradeCost - b.upgradeCost)[0]!.id;
}

/** A front the player can open from clean cash — always offered (open access). */
export interface BuyFrontOption {
  readonly type: FrontType;
  readonly name: string;
  readonly buyIn: number;
  readonly ratePerLevel: number;
  readonly affordable: boolean;
}

/**
 * The buyable-once front roster (Ideas2 item 1). Every technique is offered from
 * minute one (open access — money is the only gate), but each is **single-buy**:
 * once owned it moves to the FRONTS upgrade list (`frontRows`) and drops out here,
 * so there is never a "buy another" affordance or a duplicate. When all six are
 * owned this is empty.
 */
export function buyFrontOptions(state: GameState): readonly BuyFrontOption[] {
  const owned = new Set(state.fronts.map((f) => f.type));
  return FRONT_TYPES.filter((cfg) => !owned.has(cfg.id)).map((cfg) => ({
    type: cfg.id,
    name: cfg.name,
    buyIn: cfg.buyIn,
    ratePerLevel: cfg.ratePerLevel,
    affordable: state.cleanCash >= cfg.buyIn,
  }));
}

/** Total dirty cash across all stashes — the "dirty vs clean" readout. */
export function totalDirty(state: GameState): number {
  return totalDirtyCash(state);
}

/**
 * The money-mule wash desk (the batched dirty→clean converter). A PURE read of
 * the wash queue + its throughput: how much dirty is on hand to commit, how much
 * is mid-deposit with the mules, the clean cash landing per hour, the cut they
 * skim, and the ETA to clear. The screen shows these and dispatches `queueWash` /
 * `cancelWash` — it authors no rate/cut/eta math (the ETA shown is `queued / rate`).
 */
export interface WashView {
  /** Dirty cash sitting in stashes, available to send to the mules, $. */
  readonly availableDirty: number;
  /** Dirty cash mid-deposit with the mules right now, $ (0 = idle). */
  readonly queuedDirty: number;
  /** A batch is currently draining. */
  readonly active: boolean;
  /** Clean cash the queue lands per real hour while draining (throughput after cut). */
  readonly cleanPerHour: number;
  /** Dirty dollars the mules clear per hour (the drain rate). */
  readonly ratePerHour: number;
  /** The mules'/banks' skim as a fraction (0..1) — shown as the cost of laundering. */
  readonly cut: number;
  /** In-game hours to finish the current queue (0 when idle). */
  readonly etaHours: number;
}

export function washView(state: GameState): WashView {
  const queuedDirty = state.wash.queuedDirty;
  return {
    availableDirty: totalDirtyCash(state),
    queuedDirty,
    active: queuedDirty > 0,
    cleanPerHour: washCleanRate(state),
    ratePerHour: washRate(state),
    cut: washCut(state),
    etaHours: washEtaHours(state),
  };
}

/**
 * A decision waiting on return — a hook to allocate, surfaced as prose plus the
 * screen it routes into (design/07 §4). These are the return-hooks from `settleOffline`
 * (buyer/crew/rival); a tap drops the player onto the screen that resolves it and clears
 * the hook. Beat/chained-card scenes are NOT listed here — the story-card presenter
 * (Prompt 22) shows those as in-world interrupt scenes instead.
 */
export interface PendingDecision {
  readonly id: string;
  readonly summary: string;
  /** Which shell screen this hook leads into, keyed off the choice `kind`. */
  readonly route: string;
}

/** Map a pending-choice kind to the screen that resolves it (presenter lands in 22). */
function routeForKind(kind: string): string {
  switch (kind) {
    case 'crew':
    case 'crew-betrayal':
      return 'crew';
    case 'rival':
    case 'territory-exposed':
      return 'empire';
    case 'raid':
      return 'storage';
    case 'official-flip':
      return 'corruption';
    case 'debt-default':
    case 'debt-cleared':
      return 'debt';
    case 'shipment-arrived':
    case 'shipment-seized':
      return 'transport';
    case 'wash-pickup':
    case 'cash-seized':
      return 'money';
    case 'heat-escalation':
      return 'heat';
    case 'buyer':
    default:
      return 'deals';
  }
}

export function pendingDecisions(state: GameState): readonly PendingDecision[] {
  return state.pendingChoices
    // Card-bearing scenes (beats + chained cards) present as interrupt scenes, not
    // routed decisions — leave those to the story-card presenter (Prompt 22).
    .filter((c) => !isConsequentialChoice(c))
    .map((c) => ({
      id: c.id,
      summary: c.summary,
      route: routeForKind(c.kind),
    }));
}

/** The Money feed shows at most this many notifications (design/13 A5). */
export const PENDING_FEED_LIMIT = 5;

/**
 * The "Waiting on you" notification feed, capped (design/13 A5 — user addition 3):
 * only the `PENDING_FEED_LIMIT` NEWEST dismissible decisions render, with a
 * "+N older" count behind them, plus what Clear all would touch. Consequential
 * choices (story cards with real branches) are counted separately — they present
 * as interrupt scenes, are excluded from Clear all, and are labeled as such.
 */
export interface PendingFeed {
  /** The newest dismissible decisions, newest first, capped at the limit. */
  readonly latest: readonly PendingDecision[];
  /** Dismissible decisions collapsed behind the cap. */
  readonly olderCount: number;
  /** Everything a Clear all would dismiss (the whole dismissible queue). */
  readonly clearableCount: number;
  /** Card-bearing choices Clear all leaves untouched (labeled on the card). */
  readonly consequentialCount: number;
}

export function pendingFeed(state: GameState): PendingFeed {
  const all = pendingDecisions(state);
  // The queue is append-ordered, so the newest sit at the end — surface those.
  const newestFirst = [...all].reverse();
  return {
    latest: newestFirst.slice(0, PENDING_FEED_LIMIT),
    olderCount: Math.max(0, all.length - PENDING_FEED_LIMIT),
    clearableCount: all.length,
    consequentialCount: state.pendingChoices.filter(isConsequentialChoice).length,
  };
}
