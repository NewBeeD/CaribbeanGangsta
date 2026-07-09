/**
 * The Debt / loan-shark screen's view-model (Prompt 21; design/10 whole doc, esp.
 * §3 mechanics, §4 ethical contract, §5 ladder). PURE read selectors that turn
 * `GameState` into the borrowing surface — the system closest to the dark-pattern
 * line, so the four guarantees (design/10 §4) are reinforced HERE in what's shown:
 *
 *  - **Terms in full, up front** (`borrowQuote`): principal, weekly rate, and the
 *    total-to-repay at the soft due date — no hidden balloon (§3, §4.4).
 *  - **Due-day in IN-GAME played time** (`activeLoan.daysUntilDue`): nothing implies
 *    real-world time grows the debt; interest freezes offline (§4.2).
 *  - **Free early/partial repayment** (`repayPlan`): buying patience never penalized.
 *  - **The ladder is telegraphed, the fatal rung always visible** (`ladderTelegraph`):
 *    the run-ending last rung is shown as the readable end, never a surprise (§5, §4.3).
 *
 * The screen composes these and dispatches borrow/repay intents through the store —
 * it authors NO interest/cap/ladder math (README UI rule; the number shown is the
 * number the engine uses — design/01 §0.3).
 */

import {
  CAP_COLLATERAL_FRACTION,
  CEILING_MAX_RUNG,
  DEBT_CLEARED_CHOICE,
  DEBT_DEFAULT_CHOICE,
  LADDER_MAX_RUNG,
  LADDER_SIGNS,
  LENDERS,
  borrowCap,
  debtOwed,
  findLender,
  getFrontType,
  getLender,
  lifelineOffer,
  quoteLoan,
  type ConsequenceCeiling,
  type Front,
  type FrontType,
  type GameState,
  type LadderRung,
  type LenderId,
} from '@/engine';

/** A weekly rate fraction (0.2) as a display percent (20). */
function ratePct(rate: number): number {
  return Math.round(rate * 100);
}

/** What a lender can ultimately do to you — the telegraphed END of the ladder (design/10 §2). */
const CONSEQUENCE_LABEL: Readonly<Record<ConsequenceCeiling, string>> = {
  'seize-stash': 'Can seize a stash if you default',
  'seize-front': 'Can seize a front if you default',
  lethal: 'Can end your run if you default',
};

// --- Active loan status (design/10 §3) ---------------------------------------

/**
 * The live loan, or `null` when the player owes nothing. `daysUntilDue` is in
 * IN-GAME played days (`dueDay − clock.day`); negative once overdue. `patienceProse`
 * reads the shark's relationship as prose, never a hidden loyalty bar.
 */
export interface ActiveLoan {
  readonly lenderId: LenderId;
  readonly lenderName: string;
  readonly lenderTitle: string;
  readonly principal: number;
  readonly accruedInterest: number;
  readonly owed: number;
  readonly weeklyRatePct: number;
  /** In-game day the soft due date falls on — consequences BEGIN here (design/10 §3). */
  readonly dueDay: number;
  /** In-game days until due; negative once overdue (played time, never real time). */
  readonly daysUntilDue: number;
  readonly overdue: boolean;
  readonly overdueDays: number;
  readonly ladderRung: number;
  /** The heaviest rung this lender can reach — the visible end of the ladder. */
  readonly ceilingRung: LadderRung;
  readonly patienceProse: string;
  /** A pledged asset's name, or `null` when the loan is unsecured. */
  readonly collateralLabel: string | null;
}

/** The shark's patience/relationship as prose (design/10 §3 status). */
function patienceProse(rung: number, daysUntilDue: number, name: string): string {
  if (rung >= 1) {
    // Past the soft due date — mirror the ladder sign the player is living through.
    return LADDER_SIGNS[rung as Exclude<LadderRung, 0>] ?? `${name} is out of patience.`;
  }
  if (daysUntilDue < 0) {
    return `You're past due. ${name} is waiting — pay something before he sends someone.`;
  }
  if (daysUntilDue <= 3) {
    return `The due date's close. ${name} expects to hear from you soon.`;
  }
  return `${name} isn't worried yet. Pay early and the line only gets bigger.`;
}

/** Name a pledged collateral ref (a stash or a front), or `null` if it names nothing. */
function collateralLabel(state: GameState, ref: string | undefined): string | null {
  if (ref === undefined) return null;
  const stash = state.stashes.find((s) => s.id === ref);
  if (stash) return stash.name;
  const front = state.fronts.find((f) => f.id === ref);
  if (front) return getFrontType(front.type as FrontType).name;
  return null;
}

export function activeLoan(state: GameState): ActiveLoan | null {
  const debt = state.debt;
  if (!debt.active || debt.lenderId === null) return null;
  const cfg = findLender(debt.lenderId);
  const name = cfg?.name ?? 'The shark';
  const daysUntilDue = debt.dueDay - state.clock.day;
  const ceilingRung = cfg ? CEILING_MAX_RUNG[cfg.consequenceCeiling] : (3 as LadderRung);
  return {
    lenderId: debt.lenderId as LenderId,
    lenderName: name,
    lenderTitle: cfg?.title ?? 'a lender',
    principal: Math.round(debt.principal),
    accruedInterest: Math.round(debt.accruedInterest),
    owed: Math.round(debtOwed(debt)),
    weeklyRatePct: ratePct(debt.rate),
    dueDay: debt.dueDay,
    daysUntilDue,
    overdue: daysUntilDue < 0,
    overdueDays: Math.max(0, -daysUntilDue),
    ladderRung: debt.ladderRung,
    ceilingRung,
    patienceProse: patienceProse(debt.ladderRung, daysUntilDue, name),
    collateralLabel: collateralLabel(state, debt.collateralRef),
  };
}

// --- Borrow flow (design/10 §2, §3) ------------------------------------------

/** One lender the player can borrow from — the whole roster is open (Ideas.md). */
export interface LenderOption {
  readonly id: LenderId;
  readonly name: string;
  readonly title: string;
  readonly weeklyRatePct: number;
  /** The current borrow cap = f(reputation, collateral) — the real limiter (design/10 §2). */
  readonly cap: number;
  readonly softDueDays: number;
  /** The telegraphed end of the ladder for this lender. */
  readonly consequenceLabel: string;
  readonly ceilingRung: LadderRung;
}

export function lenderOptions(state: GameState): readonly LenderOption[] {
  return LENDERS.map((cfg) => ({
    id: cfg.id,
    name: cfg.name,
    title: cfg.title,
    weeklyRatePct: ratePct(cfg.weeklyRate),
    cap: borrowCap(state, cfg.id),
    softDueDays: cfg.softDueDays,
    consequenceLabel: CONSEQUENCE_LABEL[cfg.consequenceCeiling],
    ceilingRung: CEILING_MAX_RUNG[cfg.consequenceCeiling],
  }));
}

/**
 * A loan's terms shown IN FULL before the player confirms (design/10 §3; guarantee
 * #4). `totalToRepayAtDue` is the balloon-free total at the soft due date; `dueDay`
 * and `softDueDays` are IN-GAME played time. This is exactly what `borrow` commits.
 */
export interface BorrowQuoteView {
  readonly lenderId: LenderId;
  readonly principal: number;
  readonly weeklyRatePct: number;
  readonly cap: number;
  readonly dueDay: number;
  readonly softDueDays: number;
  readonly totalToRepayAtDue: number;
  /** The interest portion of the total at due — the disclosed cost of the money. */
  readonly interestAtDue: number;
  /** Whether the requested amount is a valid, within-cap loan the engine will grant. */
  readonly withinCap: boolean;
}

export function borrowQuote(
  state: GameState,
  lenderId: LenderId,
  amount: number,
  collateralRef?: string,
): BorrowQuoteView {
  const quote = quoteLoan(state, lenderId, amount, collateralRef);
  return {
    lenderId,
    principal: Math.round(quote.principal),
    weeklyRatePct: ratePct(quote.weeklyRate),
    cap: quote.cap,
    dueDay: quote.dueDay,
    softDueDays: quote.softDueDays,
    totalToRepayAtDue: quote.totalToRepayAtDue,
    interestAtDue: Math.max(0, quote.totalToRepayAtDue - Math.round(quote.principal)),
    withinCap: amount > 0 && amount <= quote.cap,
  };
}

/** A pledgeable asset — collateral raises the cap, and defaulting transfers it (design/10 §3). */
export interface CollateralOption {
  readonly ref: string;
  readonly label: string;
  readonly kind: 'stash' | 'front';
  /** The asset's seizable $ value. */
  readonly value: number;
  /** Extra borrow headroom pledging it unlocks (`value × CAP_COLLATERAL_FRACTION`). */
  readonly addedHeadroom: number;
}

/** The front's seizable value — mirrors the debt engine's `assetValue`. */
function frontValue(front: Front): number {
  return getFrontType(front.type as FrontType).buyIn * front.level;
}

export function collateralOptions(state: GameState): readonly CollateralOption[] {
  const stashes: CollateralOption[] = state.stashes
    .filter((s) => s.dirtyCash > 0)
    .map((s) => ({
      ref: s.id,
      label: s.name,
      kind: 'stash' as const,
      value: Math.round(s.dirtyCash),
      addedHeadroom: Math.round(s.dirtyCash * CAP_COLLATERAL_FRACTION),
    }));
  const fronts: CollateralOption[] = state.fronts.map((f) => {
    const value = frontValue(f);
    return {
      ref: f.id,
      label: getFrontType(f.type as FrontType).name,
      kind: 'front' as const,
      value: Math.round(value),
      addedHeadroom: Math.round(value * CAP_COLLATERAL_FRACTION),
    };
  });
  return [...stashes, ...fronts];
}

// --- Repay flow (design/10 §3; guarantee #4 — free & patience-resetting) ------

/**
 * The repay surface: what's owed, what the player can cover from CLEAN cash, and a
 * suggested partial that buys patience. Early/partial repayment is ALWAYS free
 * (design/10 §3) — the screen states so; `repay` charges at most what's owed.
 */
export interface RepayPlan {
  readonly owed: number;
  readonly cleanCash: number;
  /** The full payoff amount (== owed); affordable only when clean cash covers it. */
  readonly fullAmount: number;
  readonly canPayFull: boolean;
  /** A suggested partial (half the balance, capped by clean cash) that resets patience. */
  readonly partialAmount: number;
  readonly canPayPartial: boolean;
}

export function repayPlan(state: GameState): RepayPlan {
  const owed = Math.round(debtOwed(state.debt));
  const clean = state.cleanCash;
  const partial = Math.min(Math.max(1, Math.round(owed / 2)), clean, owed);
  return {
    owed,
    cleanCash: clean,
    fullAmount: owed,
    canPayFull: owed > 0 && clean >= owed,
    partialAmount: partial,
    // A partial only makes sense while there's still a balance left after it.
    canPayPartial: owed > 0 && clean > 0 && partial < owed,
  };
}

// --- The default ladder, telegraphed (design/10 §5; guarantee #3) ------------

/**
 * One rung of a lender's readable escalation ladder (design/10 §5). Every rung up
 * to the lender's ceiling is shown up front — the fatal last rung is ALWAYS the
 * visible end, never a surprise (guarantee #3, §4.3).
 */
export interface LadderStep {
  readonly rung: LadderRung;
  readonly sign: string;
  /** True for the run-ending rung 5 — surfaced as the visible end, never hidden. */
  readonly fatal: boolean;
  /** True once the active loan has actually reached this rung (design/10 §5). */
  readonly reached: boolean;
}

/**
 * The full telegraphed ladder for `lenderId`, rung 1 → the lender's ceiling
 * (design/10 §5). The whole escalation is visible before the player borrows, so
 * consequences are estimable and the fatal end is never a hidden roll.
 */
export function ladderTelegraph(state: GameState, lenderId: LenderId): readonly LadderStep[] {
  const cfg = getLender(lenderId);
  const ceiling = CEILING_MAX_RUNG[cfg.consequenceCeiling];
  const debt = state.debt;
  const onThisLoan = debt.active && debt.lenderId === lenderId;
  const steps: LadderStep[] = [];
  for (let rung = 1 as LadderRung; rung <= ceiling; rung = (rung + 1) as LadderRung) {
    steps.push({
      rung,
      sign: LADDER_SIGNS[rung as Exclude<LadderRung, 0>],
      fatal: rung === LADDER_MAX_RUNG,
      reached: onThisLoan && debt.ladderRung >= rung,
    });
  }
  return steps;
}

/**
 * A queued debt story-beat surfaced as a readable scene (design/10 §5). Default
 * scenes are the ladder's telegraphed rungs (the intervention window); a cleared
 * scene is the payoff. The full card presenter with negotiate/favor/remove agency
 * lands in Prompt 22 — here they surface as prose with the pay/partial interventions.
 */
export interface DebtScene {
  readonly id: string;
  readonly kind: 'default' | 'cleared';
  readonly text: string;
}

export function debtScenes(state: GameState): readonly DebtScene[] {
  const scenes: DebtScene[] = [];
  for (const c of state.pendingChoices) {
    if (c.kind === DEBT_DEFAULT_CHOICE) {
      scenes.push({ id: c.id, kind: 'default', text: c.summary });
    } else if (c.kind === DEBT_CLEARED_CHOICE) {
      scenes.push({ id: c.id, kind: 'cleared', text: c.summary });
    }
  }
  return scenes;
}

// --- Lifeline out of the spiral (design/10 §1) -------------------------------

/**
 * The lifeline credit offer surfaced when the player is wiped and reputation keeps
 * the door open (design/10 §1) — the way back, presented prominently. `amount` is
 * clamped to the current borrow cap so taking it is a loan the engine will grant.
 * `null` when not wiped, a loan is already active, or rep won't carry it.
 */
export interface LifelineView {
  readonly lenderId: LenderId;
  readonly amount: number;
  readonly weeklyRatePct: number;
  readonly reason: string;
}

export function lifeline(state: GameState): LifelineView | null {
  const offer = lifelineOffer(state);
  if (!offer) return null;
  const cap = borrowCap(state, offer.lenderId);
  return {
    lenderId: offer.lenderId,
    amount: Math.min(offer.amount, cap),
    weeklyRatePct: ratePct(offer.weeklyRate),
    reason: offer.reason,
  };
}
