/**
 * Loan sharks — borrowing at interest (design/10 whole doc; GDD §4). This is the
 * one **capital SOURCE** in the economy and the game's main early-game pressure
 * engine: the **come-up hook** (buy the shipment you can't afford yet) and the
 * **only lifeline out of the death spiral** (a shark who still trusts you fronting
 * cash when you're wiped — design/10 §1).
 *
 * This system sits closest to the dark-pattern line, so design/10 §4's four
 * guarantees are ENFORCED here, not just documented:
 *
 *  1. **Opt-in / consent.** Debt only ever begins through an explicit `borrow`
 *     call — nothing here auto-enrolls the player.
 *  2. **Absence is never punished — debt is frozen offline.** Interest accrues
 *     ONLY per in-game day actually played, via `debtStep`, which `clock.ts`
 *     registers ACTIVE-ONLY. `settleOffline` never touches the ledger; the
 *     laundering guardrail asserts the owed balance can't rise while away.
 *  3. **Telegraphed, never silent.** Missing the soft due date advances a readable
 *     ladder (design/10 §5) one rung per call, each a story beat queued as a
 *     `PendingChoice` (the intervention window). The final rung can MARK the player
 *     (a Prompt-11 run-ending hook) — always the visible last rung, never a roll.
 *  4. **Frustration only as challenge that resolves to competence.** Terms are
 *     shown in full up front (`quoteLoan`); early/partial repayment is always free
 *     and resets the shark's patience.
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in → new
 * state out, no `Math.random`, no wall clock. The interest curve is a pure function
 * of days-played; the ONLY randomness is `defaultLadder` breaking ties when it
 * seizes an asset, which draws from the run's serialized `state.rngState`.
 */

import type { Rng } from './rng';
import { restoreRng } from './rng';
import { getFrontType, type FrontType } from './config/fronts';
import {
  CAP_COLLATERAL_FRACTION,
  CAP_REPUTATION_FLOOR,
  CAP_REPUTATION_SCALE,
  CEILING_MAX_RUNG,
  DEBT_ONTIME_REP_BONUS,
  DEBT_REPAY_REP_BONUS,
  HOURS_PER_DAY,
  INTEREST_DAYS_PER_WEEK,
  LADDER_DAYS_PER_RUNG,
  LADDER_INCOME_CUT,
  LADDER_SIGNS,
  LADDER_VIG_RATE_INCREASE,
  LIFELINE_CAPITAL_THRESHOLD,
  LIFELINE_MIN_REPUTATION,
  LIFELINE_OFFER_FRACTION,
  LENDERS,
  findLender,
  getLender,
  type LadderRung,
  type LenderId,
} from './config/lenders';
import {
  debtOwed,
  emptyDebt,
  totalDirtyCash,
  type Debt,
  type Front,
  type GameState,
  type PendingChoice,
  type Stash,
} from './state';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The flag rung 5 sets — read by Prompt 11 (endgame) to decide a marked run's fate. */
export const DEBT_MARKED_FLAG = 'debt-marked';

/** The beat kind queued at each default-ladder rung (the intervention window). */
export const DEBT_DEFAULT_CHOICE = 'debt-default';
/** The beat kind queued when a loan is cleared in full (design/10 §6 payoff beat). */
export const DEBT_CLEARED_CHOICE = 'debt-cleared';

// --- Borrow cap (design/10 §2; Ideas.md — open access) ------------------------
//
// Every lender's door is open from day one: what limits a broke, unknown player
// is the reputation/collateral-scaled cap below, never a hidden menu.

/** The seizable $ value of a pledged asset (a stash's dirty cash, or a front's build value). */
function assetValue(state: GameState, ref: string): number {
  const stash = state.stashes.find((s) => s.id === ref);
  if (stash) return stash.dirtyCash;
  const front = state.fronts.find((f) => f.id === ref);
  if (front) return getFrontType(front.type as FrontType).buyIn * front.level;
  return 0;
}

/**
 * The maximum principal a lender will extend right now: `cap = f(reputation,
 * collateral)` (design/10 §2). STREET reputation lifts the line from a floor
 * fraction of the lender's max toward the whole line; pledging collateral adds up
 * to `CAP_COLLATERAL_FRACTION` of that asset's value on top. Pure and RNG-free.
 */
export function borrowCap(
  state: GameState,
  lenderId: LenderId,
  collateralRef?: string,
): number {
  const cfg = getLender(lenderId);
  const repFrac = clamp(state.reputation.street / CAP_REPUTATION_SCALE, 0, 1);
  const repMult = CAP_REPUTATION_FLOOR + (1 - CAP_REPUTATION_FLOOR) * repFrac;
  const base = cfg.maxPrincipal * repMult;
  const collateral =
    collateralRef !== undefined ? assetValue(state, collateralRef) * CAP_COLLATERAL_FRACTION : 0;
  return Math.round(base + collateral);
}

// --- Loan terms, shown in full up front (design/10 §3; guarantee #4) ----------

/**
 * A loan's terms — every one of them shown BEFORE the player confirms (design/10
 * §3, guarantee #4: disclosure neutralizes darkness). `totalToRepayAtDue` is the
 * full amount owed if untouched until the soft due date — no hidden balloon.
 */
export interface LoanQuote {
  readonly lenderId: LenderId;
  /** Principal that would actually be lent — the request clamped to the cap. */
  readonly principal: number;
  /** Weekly interest rate as a fraction (design/10 §2). */
  readonly weeklyRate: number;
  /** The current borrow cap for these inputs (so the UI can show headroom). */
  readonly cap: number;
  /** In-game day consequences would begin (design/10 §3). */
  readonly dueDay: number;
  readonly softDueDays: number;
  /** Total owed at the soft due date if left untouched (principal + interest). */
  readonly totalToRepayAtDue: number;
}

/** Compound `principal` forward `days` in-game days at `weeklyRate/7` (the interest curve). */
function compound(principal: number, weeklyRate: number, days: number): number {
  return principal * Math.pow(1 + weeklyRate / INTEREST_DAYS_PER_WEEK, days);
}

/**
 * Quote a loan's terms in full (design/10 §3). The requested `amount` is clamped to
 * the borrow cap for display; `totalToRepayAtDue` is the disclosed balloon-free
 * total at the soft due date. Pure — this is exactly what `borrow` will commit to.
 */
export function quoteLoan(
  state: GameState,
  lenderId: LenderId,
  amount: number,
  collateralRef?: string,
): LoanQuote {
  const cfg = getLender(lenderId);
  const cap = borrowCap(state, lenderId, collateralRef);
  const principal = Math.max(0, Math.min(amount, cap));
  return {
    lenderId,
    principal,
    weeklyRate: cfg.weeklyRate,
    cap,
    dueDay: state.clock.day + cfg.softDueDays,
    softDueDays: cfg.softDueDays,
    totalToRepayAtDue: Math.round(compound(principal, cfg.weeklyRate, cfg.softDueDays)),
  };
}

// --- Borrow (design/10 §3; guarantee #1 opt-in) ------------------------------

export type DebtRejectReason =
  | 'loan-active'
  | 'invalid-amount'
  | 'exceeds-cap'
  | 'no-collateral'
  | 'no-loan'
  | 'insufficient-funds';

export interface BorrowResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** The terms committed to (or the terms that would have applied on rejection). */
  readonly quote: LoanQuote;
  readonly rejected?: DebtRejectReason;
}

/**
 * Take a loan (design/10 §3) — the ONLY way debt begins (guarantee #1: opt-in).
 * The principal is added to CLEAN cash (the capital source), and the ledger is
 * opened with the soft due date set. MVP is one loan at a time (design/10 §7), so
 * a second borrow while a loan is active is rejected. Rejects WITHOUT mutating on
 * a bad amount, an over-cap request, or a collateral ref that names nothing.
 * Terms come back on the result either way (`quote`).
 */
export function borrow(
  state: GameState,
  lenderId: LenderId,
  amount: number,
  collateralRef?: string,
): BorrowResult {
  const quote = quoteLoan(state, lenderId, amount, collateralRef);
  const reject = (rejected: DebtRejectReason): BorrowResult => ({ state, ok: false, quote, rejected });

  if (state.debt.active) return reject('loan-active');
  if (!(amount > 0)) return reject('invalid-amount');
  if (collateralRef !== undefined && assetValue(state, collateralRef) <= 0) {
    return reject('no-collateral');
  }
  if (amount > quote.cap) return reject('exceeds-cap');

  const cfg = getLender(lenderId);
  const debt: Debt = {
    lenderId,
    principal: amount,
    rate: cfg.weeklyRate,
    accruedInterest: 0,
    dueDay: state.clock.day + cfg.softDueDays,
    ladderRung: 0,
    active: true,
    ...(collateralRef !== undefined ? { collateralRef } : {}),
  };
  return {
    state: { ...state, cleanCash: state.cleanCash + amount, debt },
    ok: true,
    quote,
  };
}

// --- Interest (design/10 §3, §4.2; guarantee #2) -----------------------------

/**
 * Compound interest over `activeDaysElapsed` in-game days ACTUALLY PLAYED
 * (design/10 §3): the owed balance grows at `rate/7` per day, and the growth lands
 * in `accruedInterest` so `principal` stays a clean floor. Pure and RNG-free. A
 * no-op with no active loan or a non-positive elapse — which is why offline (frozen
 * clock, no `debtStep`) can never increase what is owed (guarantee #2, §4.2).
 */
export function accrueInterest(state: GameState, activeDaysElapsed: number): GameState {
  if (!state.debt.active || activeDaysElapsed <= 0) return state;
  const owed = debtOwed(state.debt);
  if (owed <= 0) return state;
  const grown = compound(owed, state.debt.rate, activeDaysElapsed);
  const accruedInterest = state.debt.accruedInterest + (grown - owed);
  return { ...state, debt: { ...state.debt, accruedInterest } };
}

// --- Repay (design/10 §3; guarantee #4 — free & patience-resetting) ----------

export interface RepayResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** What was actually charged (never more than owed — early repayment is free). */
  readonly paid: number;
  /** True when this payment cleared the loan entirely. */
  readonly clearedInFull: boolean;
  readonly rejected?: DebtRejectReason;
}

/**
 * Repay toward the loan from CLEAN cash (design/10 §3). Partial payments are
 * allowed and encouraged: they RESET the shark's patience (the soft due date is
 * pushed back out, halting escalation) — and early/partial repayment carries NO
 * penalty (charges at most what's owed, applying to accrued interest first, then
 * principal). Clearing the loan in full wipes the ledger and lifts street
 * reputation (a bigger line next time — design/10 §1), with an extra bump for a
 * clean, never-defaulted payoff. Rejects WITHOUT mutating on no loan, a bad amount,
 * or shortfall.
 */
export function repay(state: GameState, amount: number): RepayResult {
  if (!state.debt.active || state.debt.lenderId === null) {
    return { state, ok: false, paid: 0, clearedInFull: false, rejected: 'no-loan' };
  }
  if (!(amount > 0)) {
    return { state, ok: false, paid: 0, clearedInFull: false, rejected: 'invalid-amount' };
  }
  const owed = debtOwed(state.debt);
  const pay = Math.min(amount, owed); // free early repayment — never overpay
  if (state.cleanCash < pay) {
    return { state, ok: false, paid: 0, clearedInFull: false, rejected: 'insufficient-funds' };
  }

  const toInterest = Math.min(pay, state.debt.accruedInterest);
  const accruedInterest = state.debt.accruedInterest - toInterest;
  const principal = state.debt.principal - (pay - toInterest);
  const remaining = principal + accruedInterest;

  if (remaining <= 1e-6) {
    const clean = state.cleanCash - pay;
    const onTime = state.debt.ladderRung === 0 && state.clock.day <= state.debt.dueDay;
    const repBonus = DEBT_REPAY_REP_BONUS + (onTime ? DEBT_ONTIME_REP_BONUS : 0);
    const cfg = findLender(state.debt.lenderId);
    const cleared: GameState = {
      ...state,
      cleanCash: clean,
      debt: emptyDebt(),
      reputation: { ...state.reputation, street: state.reputation.street + repBonus },
      pendingChoices: [
        ...state.pendingChoices,
        {
          id: `debt-cleared-${state.clock.hours}`,
          kind: DEBT_CLEARED_CHOICE,
          summary: `Paid ${cfg?.name ?? 'the shark'} in full. The line stays open — and it just got bigger.`,
          createdAtHours: state.clock.hours,
        },
      ],
    };
    return { state: cleared, ok: true, paid: pay, clearedInFull: true };
  }

  // Partial payment: patience reset — push the soft due date back out (halts escalation).
  const cfg = getLender(state.debt.lenderId as LenderId);
  const debt: Debt = {
    ...state.debt,
    principal,
    accruedInterest,
    dueDay: state.clock.day + cfg.softDueDays,
  };
  return {
    state: { ...state, cleanCash: state.cleanCash - pay, debt },
    ok: true,
    paid: pay,
    clearedInFull: false,
  };
}

// --- Default escalation ladder (design/10 §5; guarantee #3) ------------------

/** The most valuable stash's $ value, for choosing what a defaulting shark takes. */
function stashValue(s: Stash): number {
  return s.dirtyCash;
}

/**
 * Seize exactly ONE asset for rung 3 (design/10 §5, anti-wipe). Prefer the pledged
 * collateral stash. Otherwise, if the player has more than one stash, the shark
 * takes the most valuable one (ties broken by `rng`) — but NEVER their last
 * location: with only one stash left, he takes a CUT of the cash there instead, so
 * you always keep a place to operate from.
 */
function seizeOneStash(state: GameState, rng: Rng): GameState {
  const collat = state.debt.collateralRef;
  const pledged = collat !== undefined ? state.stashes.find((s) => s.id === collat) : undefined;
  if (pledged) {
    return { ...state, stashes: state.stashes.filter((s) => s.id !== pledged.id) };
  }
  if (state.stashes.length === 0) return state;
  if (state.stashes.length === 1) {
    const only = state.stashes[0]!;
    const cut: Stash = { ...only, dirtyCash: Math.round(only.dirtyCash * (1 - LADDER_INCOME_CUT)) };
    return { ...state, stashes: [cut] };
  }
  const maxVal = Math.max(...state.stashes.map(stashValue));
  const top = state.stashes.filter((s) => stashValue(s) === maxVal);
  const target = rng.pick(top);
  return { ...state, stashes: state.stashes.filter((s) => s.id !== target.id) };
}

/**
 * Seize exactly ONE front for rung 4 (design/10 §5). Prefer the pledged collateral
 * front; otherwise take the lowest-level one (recoverable over time). No-op if the
 * player has no fronts.
 */
function seizeOneFront(state: GameState, rng: Rng): GameState {
  const collat = state.debt.collateralRef;
  const pledged = collat !== undefined ? state.fronts.find((f) => f.id === collat) : undefined;
  if (pledged) {
    return { ...state, fronts: state.fronts.filter((f) => f.id !== pledged.id) };
  }
  if (state.fronts.length === 0) return state;
  const minLevel = Math.min(...state.fronts.map((f) => f.level));
  const low = state.fronts.filter((f: Front) => f.level === minLevel);
  const target = rng.pick(low);
  return { ...state, fronts: state.fronts.filter((f) => f.id !== target.id) };
}

/** Apply one rung's in-fiction effect and queue its telegraphed story beat. */
function applyRung(state: GameState, rng: Rng, rung: LadderRung): GameState {
  let next: GameState = { ...state, debt: { ...state.debt, ladderRung: rung } };
  switch (rung) {
    case 1: // vig — the shark quietly raises the rate (a warning felt in the balance).
      next = { ...next, debt: { ...next.debt, rate: next.debt.rate + LADDER_VIG_RATE_INCREASE } };
      break;
    case 2: // a visit — a scare, explicitly HEAT-FREE (design/10 §5). No state effect.
      break;
    case 3: // collateral / a stash taken — exactly one asset (anti-wipe).
      next = seizeOneStash(next, rng);
      break;
    case 4: // a front / corner taken — recoverable over time.
      next = seizeOneFront(next, rng);
      break;
    case 5: // marked — the telegraphed final rung; Prompt 11 decides the run's fate.
      next = { ...next, flags: { ...next.flags, [DEBT_MARKED_FLAG]: true } };
      break;
  }
  const sign = LADDER_SIGNS[rung as Exclude<LadderRung, 0>];
  const scene: PendingChoice = {
    id: `debt-default-${rung}-${state.clock.hours}`,
    kind: DEBT_DEFAULT_CHOICE,
    summary: sign,
    createdAtHours: state.clock.hours,
  };
  return { ...next, pendingChoices: [...next.pendingChoices, scene] };
}

/**
 * Advance the default ladder AT MOST ONE readable rung toward the day-derived
 * target (design/10 §5; guarantee #3) — and only past the soft due date. The
 * target climbs one rung per in-game day overdue, capped at the lender's
 * consequence ceiling (the street shark stops at seizing a stash — MVP §7). Each
 * advance is a story beat with agency (pay / partial / negotiate / favor / remove).
 * A partial payment resets patience and pushes the due date out, dropping the
 * target back to 0 so escalation halts. NEVER a silent roll: the only randomness is
 * breaking ties when choosing which asset to seize.
 */
export function defaultLadder(state: GameState, rng: Rng): GameState {
  if (!state.debt.active || state.debt.lenderId === null) return state;
  const overdueDays = state.clock.day - state.debt.dueDay;
  if (overdueDays <= 0) return state; // consequences begin only past the soft due date

  const cfg = findLender(state.debt.lenderId);
  const ceiling = cfg ? CEILING_MAX_RUNG[cfg.consequenceCeiling] : 3;
  const target = clamp(Math.floor(overdueDays / LADDER_DAYS_PER_RUNG), 1, ceiling) as LadderRung;
  if (state.debt.ladderRung >= target) return state;

  return applyRung(state, rng, (state.debt.ladderRung + 1) as LadderRung);
}

// --- The debt tick step (registered active-only in clock.ts) -----------------

/**
 * The `debt-interest` tick step (design/10 §3, §5). Over `dtHours` of ONLINE time:
 * accrue interest per day played, then advance the default ladder at most one
 * telegraphed rung if the soft due date has passed. Active-only — `clock.ts` never
 * runs it offline, so absence never grows what's owed or advances the ladder
 * (guarantee #2, §4.2). Deterministic; only a seizure consumes the run's RNG.
 */
export function debtStep(state: GameState, dtHours: number): GameState {
  if (!state.debt.active || state.debt.lenderId === null || dtHours <= 0) return state;
  let next = accrueInterest(state, dtHours / HOURS_PER_DAY);
  if (next.clock.day - next.debt.dueDay > 0) {
    const rng = restoreRng(next.rngState);
    next = { ...defaultLadder(next, rng), rngState: rng.getState() };
  }
  return next;
}

// --- Lifeline out of the spiral (design/10 §1; Prompt 11 hook) ----------------

/**
 * A credit offer surfaced when the player is wiped (design/10 §1). It's the lifeline
 * that separates a scary setback from a dead run — but only if reputation warrants
 * (rep is survival). Prompt 11 checks this before declaring the spiral terminal.
 */
export interface LenderOffer {
  readonly lenderId: LenderId;
  readonly amount: number;
  readonly weeklyRate: number;
  /** Readable prose surfaced to the player ("because you've always been good for it"). */
  readonly reason: string;
}

/**
 * Offer a lifeline loan IF the player is wiped (operating capital at/below the
 * threshold) AND their street reputation keeps the door open (design/10 §1).
 * Returns `null` otherwise — including when a loan is already active — which lets
 * Prompt 11 treat a null offer as a genuinely terminal spiral. The lifeline is
 * always the street shark's: a wiped player goes back to the street for a stake,
 * a modest hand up rather than a fortune. Pure and RNG-free.
 */
export function lifelineOffer(state: GameState): LenderOffer | null {
  if (state.debt.active) return null;
  const capital = state.cleanCash + totalDirtyCash(state);
  if (capital > LIFELINE_CAPITAL_THRESHOLD) return null;
  if (state.reputation.street < LIFELINE_MIN_REPUTATION) return null;

  const lender = LENDERS[0]!;
  return {
    lenderId: lender.id,
    amount: Math.round(lender.maxPrincipal * LIFELINE_OFFER_FRACTION),
    weeklyRate: lender.weeklyRate,
    reason: `${lender.name} will front you a stake — because you've always been good for it.`,
  };
}

/** Whether rung 5 has marked the player (read by Prompt 11 to decide a run's fate). */
export function isDebtMarked(state: GameState): boolean {
  return state.flags[DEBT_MARKED_FLAG] === true;
}
