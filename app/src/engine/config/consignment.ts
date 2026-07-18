/**
 * Drug fronts (consignment) tuning — product on loan from your PLUG (user
 * request; extends design/10's borrowing economy). Where a loan shark fronts
 * CASH, the plug fronts PRODUCT: the package lands in your stash now, and you
 * owe its contract value (at a premium) on a much shorter clock — with a much
 * shorter walk to the lethal end when you don't pay.
 *
 * This is deliberately the scariest credit in the game (the user's ask: shorter
 * repay date, quicker death), but the design/10 §4 guarantees hold verbatim:
 *  1. Opt-in — a front only ever begins through an explicit `takeConsignment`.
 *  2. Offline-frozen — interest/ladder/hits advance ONLY on active ticks.
 *  3. Telegraphed — every rung and hit is preceded by its warning with a
 *     visible clock; the lethal end is always the shown last rung.
 *  4. Terms in full up front — `quoteConsignment` is exactly what commits, and
 *     early/partial repayment is always free and resets the plug's patience.
 *
 * Open access (Ideas.md): the gate is holding the plug — a pure money gate
 * (`plugCost`), never a flag. These are v1 HYPOTHESES held as config
 * (prompts/README.md "Config, not literals"; Prompt 26).
 */

// --- The terms (short fuse by design) ----------------------------------------

/**
 * In-game days until the soft due date — consequences begin here. A third of
 * the street shark's window (design/10 §3): the plug wants his money while the
 * package is still warm. A partial payment resets it (patience).
 */
export const CONSIGNMENT_DUE_DAYS = 3;

/**
 * The plug's premium for fronting: owed principal = qty × contract price ×
 * this. The come-up math still works — street margins over the contract price
 * clear 1.15× easily — but a front is never cheaper than paying cash.
 */
export const CONSIGNMENT_MARKUP = 1.15;

/**
 * Interest per in-game WEEK as a fraction, compounding at `rate/7` per ACTIVE
 * day (same curve as the sharks, `INTEREST_DAYS_PER_WEEK`). Steep — 50%/wk —
 * but with a 3-day window the real teeth are the deadline, not the curve.
 */
export const CONSIGNMENT_WEEKLY_RATE = 0.5;

// --- The fronted-value cap = f(street reputation) ----------------------------
//
// Same shape as the lenders' borrow cap (design/10 §2): STREET reputation lifts
// the line from a floor fraction of the max toward the whole line. No
// collateral term — the fronted package IS the plug's stake in you.

/** Max fronted $ value (the owed principal, markup included) at full reputation. */
export const CONSIGNMENT_MAX_VALUE = 15_000;

/** Fraction of the max a rep-0 unknown can draw (a taster package, not a brick). */
export const CONSIGNMENT_CAP_REPUTATION_FLOOR = 0.2;

/** Street rep at which the whole line opens (mirrors `CAP_REPUTATION_SCALE`). */
export const CONSIGNMENT_CAP_REPUTATION_SCALE = 100;

// --- The compressed default ladder (quicker death — the user's ask) ----------
//
// Two readable rungs instead of five: overdue +1 day = the warning; +2 days =
// MARKED. Then the plug's collectors move on a visible 24h clock — two
// telegraphed hits, then the final warning, then the account is closed and the
// run ends `killed`. Due date → death ≈ 5 played days, warned at every step.

/** The plug's ladder: 0 = good standing, 1 = warned, 2 = marked. */
export type ConsignmentRung = 0 | 1 | 2;

/** Days overdue per ladder rung (rung 1 at +1, rung 2 — marked — at +2). */
export const CONSIGNMENT_LADDER_DAYS_PER_RUNG = 1;

/** Prose for each rung — the "sign" surfaced to the player (design/10 §5). */
export const CONSIGNMENT_SIGNS: Readonly<Record<Exclude<ConsignmentRung, 0>, string>> = {
  1: "The plug's man found you. \"He fronted you that package in good faith.\" The clock is running.",
  2: "You're marked. The plug doesn't send letters — pay up, fast, or his people start taking.",
};

/** ACTIVE in-game hours between collector moves once marked — the visible clock. */
export const CONSIGNMENT_ENFORCEMENT_PERIOD_HOURS = 24;

/** Fraction of the fattest stash's dirty cash a collector hit takes. */
export const CONSIGNMENT_CASH_CUT = 0.25;

/**
 * Hits that go unanswered before the marker turns LETHAL — half the sharks'
 * count (design/10 §5 rung 5): the plug's patience is as short as his due date.
 * Still never a cheap dice death: hit 1 (cash) and hit 2 (repossession) land
 * first, each warned, and the final warning precedes the kill. Escapable at any
 * point by repaying to zero; ACTIVE-only, so absence never advances it.
 */
export const CONSIGNMENT_LETHAL_AFTER_HITS = 2;

// --- Repaying builds the relationship (design/10 §1, §6) ---------------------

/**
 * Clearing a front lifts STREET reputation — a history of paying the plug is
 * what grows the fronted line (the same curve the cap reads). Slightly below
 * the sharks' bonus: the window is shorter, so clears come faster.
 */
export const CONSIGNMENT_REPAY_REP_BONUS = 3;
