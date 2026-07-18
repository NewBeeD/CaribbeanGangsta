/**
 * Drug fronts (consignment) — product on loan from your PLUG (v23 user request;
 * extends design/10's borrowing economy). Where `debt.ts` fronts CASH, the plug
 * fronts PRODUCT: `takeConsignment` lands the package in your stash now, and
 * you owe its contract value at a premium (`CONSIGNMENT_MARKUP`) on a much
 * shorter clock — repayable from DIRTY or clean cash (the plug takes street
 * money), unlike the sharks' clean-only ledger.
 *
 * The short fuse is the point (the user's ask: shorter repay date, quicker
 * death): due in `CONSIGNMENT_DUE_DAYS` (~3) in-game days, then a TWO-rung
 * ladder (warned → marked) instead of five, then collector hits on a visible
 * 24h clock with the account closed for good after `CONSIGNMENT_LETHAL_AFTER_
 * HITS` (~2) go unanswered. Due date → death ≈ 5 played days.
 *
 * The design/10 §4 guarantees hold verbatim:
 *  1. **Opt-in** — a front only ever begins through an explicit `takeConsignment`.
 *  2. **Offline-frozen** — `consignmentStep` is registered ACTIVE-only in
 *     clock.ts; absence never grows what's owed, advances the ladder, or kills.
 *  3. **Telegraphed** — one rung/hit per step call, every hit preceded by its
 *     warning with the visible clock; the lethal end is always the shown last rung.
 *  4. **Terms in full up front** — `quoteConsignment` is exactly what
 *     `takeConsignment` commits; early/partial repayment is always free and
 *     resets the plug's patience.
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in →
 * new state out, no `Math.random`, no wall clock — this module never touches
 * the RNG stream at all (the fattest stash ties to the first, like the debt
 * collectors).
 */

import { findCountry, type ProductId } from './config/countries';
import {
  CONSIGNMENT_SIGNS,
  type ConsignmentRung,
} from './config/consignment';
import { HOURS_PER_DAY } from './config/lenders';
import { getMarketPrice, withMarketStock } from './deals';
import { hasPlug } from './plugs';
import {
  consignmentOwed,
  emptyConsignment,
  type Consignment,
  type GameState,
  type MarkedEnforcement,
  type PendingChoice,
  type Stash,
} from './state';
import { effectiveCapacityRemaining } from './storage';
import { productDisplayName } from './world';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The flag rung 2 sets — the plug's collectors are moving (the marked state). */
export const CONSIGNMENT_MARKED_FLAG = 'consignment-marked';

/**
 * The flag the terminal collector move sets. The STORE reads it after each
 * active tick and banks the run as `killed` through the single run-end path —
 * the engine tick never sets `runStatus` (GDD §8). Only ever set after the
 * fully-telegraphed final warning, and never offline.
 */
export const CONSIGNMENT_LETHAL_FLAG = 'consignment-collectors-lethal';

/** The beat kind queued at each ladder rung (the intervention window). */
export const CONSIGNMENT_DEFAULT_CHOICE = 'consignment-default';
/** The beat kind queued when a front is cleared in full (the payoff beat). */
export const CONSIGNMENT_CLEARED_CHOICE = 'consignment-cleared';
/** The beat kind of every collector warning/hit line while marked. */
export const CONSIGNMENT_COLLECTOR_CHOICE = 'consignment-collectors';

const dollars = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

// --- The fronted-value cap = f(street reputation) ----------------------------

/**
 * The maximum $ value (owed principal, markup included) the plug will front
 * right now — the same reputation curve as the sharks' borrow cap (design/10
 * §2): a rep-0 unknown draws the floor fraction of the max; the whole line
 * opens as street rep climbs. Pure and RNG-free.
 */
export function consignmentCap(state: GameState): number {
  const C = state.config.consignment;
  const repFrac = clamp(
    state.reputation.street / C.CONSIGNMENT_CAP_REPUTATION_SCALE,
    0,
    1,
  );
  const repMult =
    C.CONSIGNMENT_CAP_REPUTATION_FLOOR +
    (1 - C.CONSIGNMENT_CAP_REPUTATION_FLOOR) * repFrac;
  return Math.round(C.CONSIGNMENT_MAX_VALUE * repMult);
}

// --- Terms, shown in full up front (design/10 §4 guarantee #4) ---------------

/**
 * A front's terms — every one of them shown BEFORE the player confirms. This is
 * exactly what `takeConsignment` will commit to (the fairness law).
 */
export interface ConsignmentQuote {
  readonly countryId: string;
  readonly product: ProductId;
  readonly qty: number;
  /** The plug's per-unit contract price the front is valued at. */
  readonly unitPrice: number;
  /** $ owed on day one: `qty × unitPrice × CONSIGNMENT_MARKUP`. */
  readonly principal: number;
  readonly weeklyRate: number;
  /** The current fronted-value cap (so the UI can show headroom). */
  readonly cap: number;
  /** In-game day consequences would begin. */
  readonly dueDay: number;
  readonly dueDays: number;
  /** Total owed at the soft due date if left untouched — no hidden balloon. */
  readonly totalToRepayAtDue: number;
}

/** Compound `principal` forward `days` in-game days at `weeklyRate/daysPerWeek`. */
function compound(
  principal: number,
  weeklyRate: number,
  days: number,
  daysPerWeek: number,
): number {
  return principal * Math.pow(1 + weeklyRate / daysPerWeek, days);
}

/**
 * Quote a front's terms in full. Prices at the country's LIVE market price for
 * the product (the plug's drift-free contract price at a true source), marked
 * up by `CONSIGNMENT_MARKUP`. Pure — this is exactly what `takeConsignment`
 * commits.
 */
export function quoteConsignment(
  state: GameState,
  countryId: string,
  product: ProductId,
  qty: number,
): ConsignmentQuote {
  const C = state.config.consignment;
  const unitPrice = getMarketPrice(state, product, countryId).price;
  const principal = Math.round(qty * unitPrice * C.CONSIGNMENT_MARKUP);
  return {
    countryId,
    product,
    qty,
    unitPrice,
    principal,
    weeklyRate: C.CONSIGNMENT_WEEKLY_RATE,
    cap: consignmentCap(state),
    dueDay: state.clock.day + C.CONSIGNMENT_DUE_DAYS,
    dueDays: C.CONSIGNMENT_DUE_DAYS,
    totalToRepayAtDue: Math.round(
      compound(
        principal,
        C.CONSIGNMENT_WEEKLY_RATE,
        C.CONSIGNMENT_DUE_DAYS,
        state.config.lenders.INTEREST_DAYS_PER_WEEK,
      ),
    ),
  };
}

// --- Take (guarantee #1 — opt-in) --------------------------------------------

export type ConsignmentRejectReason =
  | 'consignment-active'
  | 'invalid-qty'
  | 'no-stash'
  /** The stash isn't standing in the plug's country — the package lands where
   * the plug is, never teleported. */
  | 'wrong-country'
  /** No connection: the plug fronts CONNECTIONS only (the one money gate). */
  | 'no-plug'
  /** This country's plug doesn't move that product. */
  | 'not-fronted'
  /** The street can only front what it holds (design/12 Item 10). */
  | 'no-supply'
  | 'exceeds-cap'
  | 'insufficient-capacity'
  | 'no-consignment'
  | 'insufficient-funds';

export interface TakeConsignmentResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** The terms committed to (or the terms that would have applied on rejection). */
  readonly quote: ConsignmentQuote;
  readonly rejected?: ConsignmentRejectReason;
}

/**
 * Take a front — the ONLY way a consignment begins (guarantee #1: opt-in). The
 * package lands in the stash standing in the plug's country, the street pool is
 * drawn down (one supply, however it's paid), and the ledger opens with the
 * short due date set. One front at a time (mirrors the sharks' MVP rule); a
 * front CAN run alongside a cash loan (separate ledgers). No cash moves, and a
 * clean handover adds ZERO heat (design/13 B1: heat comes from getting caught,
 * never from transacting). Rejects WITHOUT mutating.
 */
export function takeConsignment(
  state: GameState,
  countryId: string,
  product: ProductId,
  qty: number,
  stashId: string,
): TakeConsignmentResult {
  const quote = quoteConsignment(state, countryId, product, qty);
  const reject = (rejected: ConsignmentRejectReason): TakeConsignmentResult => ({
    state,
    ok: false,
    quote,
    rejected,
  });

  if (state.consignment.active) return reject('consignment-active');
  if (!Number.isInteger(qty) || qty <= 0) return reject('invalid-qty');
  const stash = state.stashes.find((s) => s.id === stashId);
  if (!stash) return reject('no-stash');
  if (stash.countryId !== countryId) return reject('wrong-country');
  const country = findCountry(countryId);
  if (!country || !(country.plugFor ?? []).includes(product)) {
    return reject('not-fronted');
  }
  if (!hasPlug(state, countryId)) return reject('no-plug');
  const price = getMarketPrice(state, product, countryId);
  if (qty > price.stock) return reject('no-supply');
  if (quote.principal > quote.cap) return reject('exceeds-cap');
  if (qty > effectiveCapacityRemaining(state, stash)) {
    return reject('insufficient-capacity');
  }

  const fronted: Stash = {
    ...stash,
    inventory: { ...stash.inventory, [product]: (stash.inventory[product] ?? 0) + qty },
  };
  let next: GameState = {
    ...state,
    stashes: state.stashes.map((s) => (s.id === fronted.id ? fronted : s)),
    consignment: {
      countryId,
      product,
      qty,
      principal: quote.principal,
      rate: quote.weeklyRate,
      accruedInterest: 0,
      dueDay: quote.dueDay,
      ladderRung: 0,
      active: true,
    },
  };
  // The units came OFF the street (design/12 Item 10) — same pool as a cash buy.
  next = withMarketStock(next, countryId, product, Math.max(0, price.stock - qty));
  return { state: next, ok: true, quote };
}

// --- Repay (guarantee #4 — free, patience-resetting, dirty money welcome) ----

export interface RepayConsignmentResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** What was actually charged (never more than owed — early repayment is free). */
  readonly paid: number;
  /** How the charge split across the pools (dirty drawn fattest-stash-first). */
  readonly fromDirty: number;
  readonly fromClean: number;
  /** True when this payment cleared the front entirely. */
  readonly clearedInFull: boolean;
  readonly rejected?: ConsignmentRejectReason;
}

/** Draw `amount` of dirty cash across stashes, fattest first (ties to the
 * first). Returns the updated stash list and what was actually drawn. */
function drawDirty(
  state: GameState,
  amount: number,
): { stashes: readonly Stash[]; drawn: number } {
  let remaining = amount;
  const order = [...state.stashes].sort((a, b) => b.dirtyCash - a.dirtyCash);
  const cuts = new Map<string, number>();
  for (const s of order) {
    if (remaining <= 0) break;
    const take = Math.min(s.dirtyCash, remaining);
    if (take > 0) {
      cuts.set(s.id, take);
      remaining -= take;
    }
  }
  return {
    stashes: state.stashes.map((s) => {
      const cut = cuts.get(s.id);
      return cut ? { ...s, dirtyCash: s.dirtyCash - cut } : s;
    }),
    drawn: amount - remaining,
  };
}

/**
 * Repay toward the front — from DIRTY cash first (drawn fattest-stash-first),
 * then clean covering the shortfall. The plug takes street money: no wash cycle
 * stands between flipping the package and squaring the debt. Partial payments
 * RESET the plug's patience — due date pushed back out, ladder back to good
 * standing, the mark and any collector clock cleared. Clearing in full wipes
 * the ledger and lifts street reputation (a bigger line next time). Charges at
 * most what's owed, interest first. Rejects WITHOUT mutating.
 */
export function repayConsignment(state: GameState, amount: number): RepayConsignmentResult {
  const noPay = (rejected: ConsignmentRejectReason): RepayConsignmentResult => ({
    state,
    ok: false,
    paid: 0,
    fromDirty: 0,
    fromClean: 0,
    clearedInFull: false,
    rejected,
  });
  if (!state.consignment.active || state.consignment.countryId === null) {
    return noPay('no-consignment');
  }
  if (!(amount > 0)) return noPay('invalid-qty');

  const owed = consignmentOwed(state.consignment);
  const pay = Math.min(amount, owed); // free early repayment — never overpay
  const dirtyAvailable = state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
  if (dirtyAvailable + state.cleanCash < pay) return noPay('insufficient-funds');

  const { stashes, drawn } = drawDirty(state, pay);
  const fromClean = pay - drawn;

  const toInterest = Math.min(pay, state.consignment.accruedInterest);
  const accruedInterest = state.consignment.accruedInterest - toInterest;
  const principal = state.consignment.principal - (pay - toInterest);
  const remaining = principal + accruedInterest;

  const C = state.config.consignment;
  const plugName = findCountry(state.consignment.countryId)?.name ?? 'the plug';

  // Same shown-$0 ⟺ cleared rule as the sharks (debt.ts): a sub-dollar residue
  // must never strand an "active" front displaying as $0 owed.
  if (remaining < 0.5) {
    const cleared: GameState = {
      ...state,
      stashes,
      cleanCash: state.cleanCash - fromClean,
      consignment: emptyConsignment(),
      flags: { ...state.flags, [CONSIGNMENT_MARKED_FLAG]: false },
      reputation: {
        ...state.reputation,
        street: state.reputation.street + C.CONSIGNMENT_REPAY_REP_BONUS,
      },
      pendingChoices: [
        ...state.pendingChoices,
        {
          id: `consignment-cleared-${state.clock.hours}`,
          kind: CONSIGNMENT_CLEARED_CHOICE,
          summary: `Squared up with the ${plugName} connection. Fronts come easier to people who pay.`,
          createdAtHours: state.clock.hours,
        },
      ],
    };
    return { state: cleared, ok: true, paid: pay, fromDirty: drawn, fromClean, clearedInFull: true };
  }

  // Partial payment: patience reset — due date back out, ladder and mark cleared.
  const { enforcement: _clock, ...ledger } = state.consignment;
  const consignment: Consignment = {
    ...ledger,
    principal,
    accruedInterest,
    dueDay: state.clock.day + C.CONSIGNMENT_DUE_DAYS,
    ladderRung: 0,
  };
  return {
    state: {
      ...state,
      stashes,
      cleanCash: state.cleanCash - fromClean,
      consignment,
      flags: { ...state.flags, [CONSIGNMENT_MARKED_FLAG]: false },
    },
    ok: true,
    paid: pay,
    fromDirty: drawn,
    fromClean,
    clearedInFull: false,
  };
}

// --- The compressed ladder + collector clock (guarantee #3) ------------------

/** The fattest stash by dirty cash (ties to the first) — the collectors' target. */
function fattestStash(state: GameState): Stash | null {
  if (state.stashes.length === 0) return null;
  return state.stashes.reduce((top, s) => (s.dirtyCash > top.dirtyCash ? s : top));
}

function queueScene(
  state: GameState,
  kind: string,
  id: string,
  summary: string,
): GameState {
  const scene: PendingChoice = { id, kind, summary, createdAtHours: state.clock.hours };
  return { ...state, pendingChoices: [...state.pendingChoices, scene] };
}

/** Hit: take `CONSIGNMENT_CASH_CUT` of the fattest stash's dirty cash. */
function collectorCashHit(state: GameState): { state: GameState; note: string } {
  const target = fattestStash(state);
  const taken = target
    ? Math.round(target.dirtyCash * state.config.consignment.CONSIGNMENT_CASH_CUT)
    : 0;
  if (!target || taken <= 0) {
    return {
      state,
      note: "The plug's people tossed your spots and found nothing worth taking — this time.",
    };
  }
  const cut: Stash = { ...target, dirtyCash: target.dirtyCash - taken };
  return {
    state: { ...state, stashes: state.stashes.map((s) => (s.id === cut.id ? cut : s)) },
    note: `The plug's people hit ${target.name} — ${dollars(taken)} dirty gone against the front.`,
  };
}

/** Hit: repossess what's left of the fronted product (falls back to cash). The
 * repossession does NOT reduce the ledger — like every collector hit, it's
 * pressure against the marker, not a payment (mirrors debt.ts). */
function collectorRepossessHit(state: GameState): { state: GameState; note: string } {
  const product = state.consignment.product;
  if (product === null) return collectorCashHit(state);
  let remaining = state.consignment.qty;
  const cuts = new Map<string, number>();
  for (const s of state.stashes) {
    if (remaining <= 0) break;
    const take = Math.min(Math.floor(s.inventory[product] ?? 0), remaining);
    if (take > 0) {
      cuts.set(s.id, take);
      remaining -= take;
    }
  }
  const taken = state.consignment.qty - remaining;
  if (taken <= 0) return collectorCashHit(state); // already flipped it all — cash then
  const next: GameState = {
    ...state,
    stashes: state.stashes.map((s) => {
      const cut = cuts.get(s.id);
      return cut
        ? { ...s, inventory: { ...s.inventory, [product]: (s.inventory[product] ?? 0) - cut } }
        : s;
    }),
  };
  return {
    state: next,
    note: `The plug's people took back ${taken} ${productDisplayName(state.world, product)} — and you still owe the balance.`,
  };
}

/**
 * What the NEXT collector move will be — the warning each hit is preceded by.
 * Once the count reaches the lethal threshold the warning turns final.
 */
function collectorWarning(state: GameState, stage: number, atHours: number): string {
  const inHours = Math.max(0, Math.round(atHours - state.clock.hours));
  if (stage >= state.config.consignment.CONSIGNMENT_LETHAL_AFTER_HITS) {
    return (
      `The plug is done collecting. Pay the front in full now, or in ${inHours} ` +
      `played hours his people close the account — for good.`
    );
  }
  const move =
    stage === 0
      ? `they take a cut of the cash at ${fattestStash(state)?.name ?? 'your stash'}`
      : 'they come for what they can find — cash or the product itself';
  return `You're marked over the front. Pay up, or in ${inHours} played hours ${move}.`;
}

/** Apply the stage-th collector hit (0-based). Past the ladder, cash repeats. */
function collectorHit(state: GameState, stage: number): { state: GameState; note: string } {
  if (stage === 0) return collectorCashHit(state);
  if (stage === 1) return collectorRepossessHit(state);
  return collectorCashHit(state);
}

/** Whether the plug's collectors have closed the account — the run-ending hook
 * the store turns into a `killed` run-end (mirrors `collectorsClosedAccount`). */
export function consignmentClosedAccount(state: GameState): boolean {
  return state.flags[CONSIGNMENT_LETHAL_FLAG] === true;
}

/** Whether rung 2 has marked the player over the front. */
export function isConsignmentMarked(state: GameState): boolean {
  return state.flags[CONSIGNMENT_MARKED_FLAG] === true;
}

/** Apply one rung's effect and queue its telegraphed sign (at most one/call). */
function applyRung(state: GameState, rung: Exclude<ConsignmentRung, 0>): GameState {
  let next: GameState = {
    ...state,
    consignment: { ...state.consignment, ladderRung: rung },
  };
  if (rung === 2) {
    next = { ...next, flags: { ...next.flags, [CONSIGNMENT_MARKED_FLAG]: true } };
  }
  return queueScene(
    next,
    CONSIGNMENT_DEFAULT_CHOICE,
    `consignment-default-${rung}-${state.clock.hours}`,
    CONSIGNMENT_SIGNS[rung],
  );
}

/**
 * The `consignment` tick step (registered ACTIVE-only in clock.ts). Over
 * `dtHours` of ONLINE time: accrue interest per day played, then advance AT
 * MOST ONE telegraphed move — a ladder rung (warned at +1 day overdue, marked
 * at +2), or, once marked, the collector clock: warning card → hit →
 * warning → hit → final warning → the account closed (`CONSIGNMENT_LETHAL_
 * FLAG`; the store ends the run `killed`). Deterministic, RNG-free; offline
 * never runs it, so absence never grows the debt, escalates, or kills.
 */
export function consignmentStep(state: GameState, dtHours: number): GameState {
  if (!state.consignment.active || state.consignment.countryId === null || dtHours <= 0) {
    return state;
  }

  // Interest per active day played — same curve as the sharks (design/10 §3).
  let next = state;
  const owed = consignmentOwed(next.consignment);
  if (owed > 0) {
    const grown = compound(
      owed,
      next.consignment.rate,
      dtHours / HOURS_PER_DAY,
      next.config.lenders.INTEREST_DAYS_PER_WEEK,
    );
    next = {
      ...next,
      consignment: {
        ...next.consignment,
        accruedInterest: next.consignment.accruedInterest + (grown - owed),
      },
    };
  }

  const C = next.config.consignment;
  const overdueDays = next.clock.day - next.consignment.dueDay;

  // The ladder first: one readable rung per step call, only past the due date.
  if (overdueDays > 0) {
    const target = clamp(
      Math.floor(overdueDays / C.CONSIGNMENT_LADDER_DAYS_PER_RUNG),
      0,
      2,
    ) as ConsignmentRung;
    if (next.consignment.ladderRung < target) {
      return applyRung(next, (next.consignment.ladderRung + 1) as Exclude<ConsignmentRung, 0>);
    }
  }

  // Marked: the collector clock (one telegraphed move per step call).
  if (!isConsignmentMarked(next)) return next;
  if (consignmentClosedAccount(next)) return next; // store is ending the run

  const enforcement = next.consignment.enforcement;
  if (enforcement === undefined) {
    // Freshly marked: the warning goes out first — the visible clock starts.
    const started: MarkedEnforcement = {
      stage: 0,
      nextAtHours: next.clock.hours + C.CONSIGNMENT_ENFORCEMENT_PERIOD_HOURS,
    };
    return queueScene(
      { ...next, consignment: { ...next.consignment, enforcement: started } },
      CONSIGNMENT_COLLECTOR_CHOICE,
      `consignment-collectors-warn-0-${next.clock.hours}`,
      collectorWarning(next, 0, started.nextAtHours),
    );
  }

  if (next.clock.hours < enforcement.nextAtHours) return next;
  const stage = enforcement.stage;

  // The lethal move: enough telegraphed hits went unanswered, and the final
  // warning was already shown — the plug closes the account. Earned, escapable
  // (repay clears the mark instantly), and active-only.
  if (stage >= C.CONSIGNMENT_LETHAL_AFTER_HITS) {
    return queueScene(
      { ...next, flags: { ...next.flags, [CONSIGNMENT_LETHAL_FLAG]: true } },
      CONSIGNMENT_COLLECTOR_CHOICE,
      `consignment-collectors-kill-${next.clock.hours}`,
      'You ignored every warning over the front. The plug closed the account — this is where it ends.',
    );
  }

  // The warned hit lands — then the NEXT move's warning goes out.
  const hit = collectorHit(next, stage);
  const advanced: MarkedEnforcement = {
    stage: stage + 1,
    nextAtHours: next.clock.hours + C.CONSIGNMENT_ENFORCEMENT_PERIOD_HOURS,
  };
  next = { ...hit.state, consignment: { ...hit.state.consignment, enforcement: advanced } };
  next = queueScene(
    next,
    CONSIGNMENT_COLLECTOR_CHOICE,
    `consignment-collectors-hit-${stage}-${state.clock.hours}`,
    hit.note,
  );
  return queueScene(
    next,
    CONSIGNMENT_COLLECTOR_CHOICE,
    `consignment-collectors-warn-${stage + 1}-${state.clock.hours}`,
    collectorWarning(next, stage + 1, advanced.nextAtHours),
  );
}
