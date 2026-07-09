/**
 * The Money screen's view-model (Prompt 18; design/07 §4, design/04 §1/§3). PURE
 * read selectors that turn the `GameState` into the return-payoff surface: the
 * clean-cash the empire is minting, the fronts and their priced next upgrade, the
 * disclosed peso exchange, and the decisions queued on return. The screen composes
 * these and dispatches laundering intents through the store — it authors NO rate,
 * upgrade-cost, or haircut math (README UI rule; the number shown is the number the
 * engine uses — design/01 §0.3 fairness law).
 *
 * Open access (Ideas.md — Drug Lord 2; the [[open-access-design]] rule): every front
 * is buyable from minute one and the peso exchange is always live. Money is the only
 * gate — options show their price and affordability limits them, never a flag.
 *
 * The ethical spine (GDD §6, §8): absence forgoes gains but never risks progress.
 * Nothing this model exposes frames an absence as a loss — there is no "your fronts
 * are at risk" surface here, ever. The offline settlement (`OfflineReport`) is read
 * as gains + choices to allocate.
 */

import {
  FRONT_MAX_LEVEL,
  FRONT_TYPES,
  PESO_EXCHANGE_HAIRCUT,
  cleanCashRate,
  cryptoSwingFactor,
  frontLieutenantBonus,
  frontUpgradeCost,
  getFrontType,
  pesoExchangeQuote,
  totalDirtyCash,
  type Front,
  type FrontType,
  type GameState,
} from '@/engine';

/** The DISCLOSED dirty→clean discount, as a percent for the UI label. */
export const PESO_HAIRCUT_PCT = Math.round(PESO_EXCHANGE_HAIRCUT * 100);

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

/** The whole front roster as buy options — every one live from minute one. */
export function buyFrontOptions(state: GameState): readonly BuyFrontOption[] {
  return FRONT_TYPES.map((cfg) => ({
    type: cfg.id,
    name: cfg.name,
    buyIn: cfg.buyIn,
    ratePerLevel: cfg.ratePerLevel,
    affordable: state.cleanCash >= cfg.buyIn,
  }));
}

/** A stash holding exchangeable dirty cash — the peso exchange's sources. */
export interface DirtyStashRow {
  readonly id: string;
  readonly name: string;
  readonly dirtyCash: number;
  /** Clean cash received for exchanging it ALL, at the disclosed haircut. */
  readonly cleanIfExchanged: number;
}

/**
 * Every stash carrying dirty cash, richest first — dirty is LOCATED (it lives in
 * stashes; design/07 §4). Each row carries the exact clean payout for exchanging
 * its whole balance, so the haircut is shown before any commit (fairness law).
 */
export function dirtyStashRows(state: GameState): readonly DirtyStashRow[] {
  return state.stashes
    .filter((s) => s.dirtyCash > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      dirtyCash: s.dirtyCash,
      cleanIfExchanged: pesoExchangeQuote(s.dirtyCash).clean,
    }))
    .sort((a, b) => b.dirtyCash - a.dirtyCash);
}

/** Total dirty cash across all stashes — the "dirty vs clean" readout. */
export function totalDirty(state: GameState): number {
  return totalDirtyCash(state);
}

/**
 * A decision waiting on return — a hook to allocate, surfaced as prose plus the
 * screen it routes into (design/07 §4). The story-card presenter (Prompt 22) will
 * take over resolution; until then a hook drops the player onto the relevant screen.
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
      return 'crew';
    case 'rival':
      return 'empire';
    case 'buyer':
    default:
      return 'deals';
  }
}

export function pendingDecisions(state: GameState): readonly PendingDecision[] {
  return state.pendingChoices.map((c) => ({
    id: c.id,
    summary: c.summary,
    route: routeForKind(c.kind),
  }));
}
