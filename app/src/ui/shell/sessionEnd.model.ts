/**
 * The session-end hook's view-model (Prompt 22; GDD §11, design/07 §3). PURE reads
 * that guarantee a natural stopping point never lands on a clean, empty state — there
 * is always an **open loop**: one thread resolving, one decision pending, and income
 * accruing. That open loop is the return hook (GDD §11).
 *
 * The ethical line (GDD §8, §11): the pull is an *interesting choice*, never guilt or
 * loss-aversion — nothing here frames leaving as a loss or a risk. Every line is drawn
 * from real state signals (fronts minting, heat cooling, a crew arc, a queued scene),
 * and there is always a fallback so `openLoop` is never empty. No mutation, no logic
 * the engine owns — costs/rates come straight from engine selectors.
 */

import {
  FRONT_MAX_LEVEL,
  FRONT_TYPES,
  cleanCashRate,
  frontUpgradeCost,
  getFrontType,
  plugQuotes,
  totalDirtyCash,
  type FrontType,
  type GameState,
} from '@/engine';
import { widestSpread } from '@/ui/screens/worldMarket.model';

/** The always-present open loop shown at a stopping point (design/07 §3, GDD §11). */
export interface OpenLoop {
  /** One thread resolving *now* (income minting, heat cooling, a crew arc, …). */
  readonly resolving: string;
  /** One decision still open — a queued scene, or the best next move within reach. */
  readonly pending: string;
  /** Clean cash per hour still accruing while away (the income line). */
  readonly incomeRate: number;
}

/** The thread currently in motion — the "something resolving" signal (GDD §11). */
function resolvingThread(state: GameState): string {
  if (state.crew.some((c) => c.activeArc !== undefined)) {
    return 'Someone close is drifting — that plays out whether you watch or not.';
  }
  if (state.lyingLow && state.heat > 0) {
    return 'You’re lying low; the heat is bleeding off hour by hour.';
  }
  if (state.fronts.length > 0) {
    return 'Your fronts keep turning quiet hours into clean money.';
  }
  if (totalDirtyCash(state) > 0) {
    return 'Dirty cash is sitting in the stashes, waiting on a wash.';
  }
  return 'The block keeps moving whether you’re watching or not.';
}

/** True when clean cash covers this front's next-level cost (open access — money gates). */
function hasAffordableUpgrade(state: GameState): boolean {
  return state.fronts.some(
    (f) =>
      f.level < FRONT_MAX_LEVEL &&
      state.cleanCash >= frontUpgradeCost(f.type as FrontType, f.level),
  );
}

/** True when clean cash covers opening any new front. */
function hasAffordableNewFront(state: GameState): boolean {
  return FRONT_TYPES.some((cfg) => state.cleanCash >= cfg.buyIn);
}

/** A cross-country spread must at least this-many-x the buy to be worth the line. */
export const SPREAD_HOOK_MULTIPLE = 4;

/**
 * An affordable plug intro (Prompt 31; Ideas2 §2) — a REAL "one more day" move:
 * the meeting is priced from minute one, and being able to pay it is news.
 */
function affordablePlugLine(state: GameState): string | null {
  const quote = plugQuotes(state).find((q) => !q.connected && state.cleanCash >= q.cost);
  if (!quote) return null;
  const cost = `$${Math.round(quote.cost).toLocaleString('en-US')}`;
  return `${quote.countryName} will take the meeting — ${cost} opens the source.`;
}

/** A wide cross-country margin on the world board (Prompt 31; Ideas2 §3). */
function marginLine(state: GameState): string | null {
  const spread = widestSpread(state);
  if (!spread || spread.multiple < SPREAD_HOOK_MULTIPLE) return null;
  const buy = `$${Math.round(spread.buy).toLocaleString('en-US')}`;
  const sell = `$${Math.round(spread.sell).toLocaleString('en-US')}`;
  return `${spread.productName} buys at ${buy} in ${spread.buyCountryName} and sells at ${sell} in ${spread.sellCountryName} — the water in between is the margin.`;
}

/**
 * The decision still open — the "something pending" signal (GDD §11). A queued scene
 * takes priority (it's a real choice waiting); otherwise the best move within reach,
 * framed as opportunity, never obligation. Always returns a line (never leave clean).
 */
function pendingDecision(state: GameState): string {
  const queued = state.pendingChoices[0];
  if (queued) return queued.summary;
  const plug = affordablePlugLine(state);
  if (plug) return plug;
  if (hasAffordableUpgrade(state)) return 'A front upgrade is within reach — more clean per hour.';
  if (hasAffordableNewFront(state)) return 'Open a front and it banks money while you’re gone.';
  const margin = marginLine(state);
  if (margin) return margin;
  if (totalDirtyCash(state) > 0) return 'Dirty cash is ready to wash into spendable clean.';
  const first = getFrontType(FRONT_TYPES[0]!.id);
  return `Save toward a ${first.name.toLowerCase()} — your first idle income.`;
}

/**
 * The open loop for the current state (GDD §11). Guarantees three live threads at any
 * stopping point: something resolving, something pending, and income accruing. Pure.
 */
export function openLoop(state: GameState): OpenLoop {
  return {
    resolving: resolvingThread(state),
    pending: pendingDecision(state),
    incomeRate: cleanCashRate(state),
  };
}
