/**
 * The loan-shark roster & tuning (design/10 whole doc; GDD §4). Borrowing is the
 * one **capital SOURCE** in the economy — the mirror image of the clean-cash sinks
 * (fronts, payroll, storage) — and it plays two roles (design/10 §1):
 *
 *  1. **The come-up hook** — buy the shipment you can't afford yet, then sweat the
 *     repayment. Voluntary, front-loaded tension.
 *  2. **The lifeline out of the death spiral** — when you're wiped, a shark who
 *     still trusts you fronting cash is the only way back (Prompt 11 reads
 *     `lifelineOffer` before declaring a run terminal).
 *
 * This system sits closest to the dark-pattern line, so the four guarantees
 * (design/10 §4) are enforced in `debt.ts`, not just documented here. The one that
 * touches tuning: **absence is never punished — interest accrues ONLY per active
 * in-game day** (guarantee #2). These are v1 HYPOTHESES held as config, never
 * scattered literals (prompts/README.md "Config, not literals"; Prompt 26).
 *
 * Lenders are a progression of CHARACTERS (design/10 §2): higher tiers are cheaper
 * but their consequences are heavier — a real trade, not a strict upgrade. MVP
 * (§7) ships the street shark done well; the higher tiers are here so the roster,
 * unlock gates, and cap curve are complete from day one.
 */

/** The lenders, cheapest-consequence first (design/10 §2). */
export type LenderId = 'papa-cass' | 'money-man' | 'financier';

/** What a lender can do to you at the end of the ladder (design/10 §2, §5). */
export type ConsequenceCeiling = 'seize-stash' | 'seize-front' | 'lethal';

export interface LenderConfig {
  readonly id: LenderId;
  readonly name: string;
  /** Flavor handle shown in prose ("a street shark", "a cartel financier"). */
  readonly title: string;
  /** Max principal before reputation/collateral scaling, $ (design/10 §2). */
  readonly maxPrincipal: number;
  /** Interest per in-game WEEK, as a fraction (design/10 §2 — 20% / 10% / 5%). */
  readonly weeklyRate: number;
  /**
   * In-game days until the soft due date — when CONSEQUENCES begin, not a hard
   * wall (design/10 §3: ~2 in-game weeks for the street shark). A partial payment
   * resets it (patience), pushing the ladder back.
   */
  readonly softDueDays: number;
  /** The heaviest rung this lender can reach (design/10 §2 consequence ceiling). */
  readonly consequenceCeiling: ConsequenceCeiling;
  /**
   * Unlock gate (design/10 §2). `unlocksAtDay` gates the street shark to ~day 2
   * (post-competence, never before the player has felt a few wins — design/10 §6);
   * the higher tiers gate on a progression flag set by later systems.
   */
  readonly unlocksAtDay?: number;
  readonly requiresFlag?: string;
  /** Greed trait 0.7–1.3 — reserved for the NPC relationship layer (design/10 §2). */
  readonly greed: number;
  /** Where the lender relationship starts (0–100, hidden — reused from crew, §2). */
  readonly startingLoyalty: number;
}

/**
 * The roster (design/10 §2 table). Costs fall and consequence ceilings rise as you
 * climb — the cheaper money is the money that can get you killed.
 */
export const LENDERS: readonly LenderConfig[] = [
  {
    id: 'papa-cass',
    name: 'Papa Cass',
    title: 'a street shark',
    maxPrincipal: 2_000,
    weeklyRate: 0.2,
    softDueDays: 14, // ~2 in-game weeks (design/10 §3)
    consequenceCeiling: 'seize-stash',
    unlocksAtDay: 2, // the early come-up hook (design/10 §6)
    greed: 1.1,
    startingLoyalty: 55,
  },
  {
    id: 'money-man',
    name: 'The Money-Man',
    title: 'a neighborhood money-man',
    maxPrincipal: 25_000,
    weeklyRate: 0.1,
    softDueDays: 14,
    consequenceCeiling: 'seize-front',
    requiresFlag: 'district-controlled',
    greed: 1.05,
    startingLoyalty: 52,
  },
  {
    id: 'financier',
    name: 'The Financier',
    title: 'a cartel financier',
    maxPrincipal: 500_000,
    weeklyRate: 0.05,
    softDueDays: 21,
    consequenceCeiling: 'lethal',
    requiresFlag: 'international-routes',
    greed: 1.25,
    startingLoyalty: 48,
  },
] as const;

const LENDER_BY_ID: ReadonlyMap<LenderId, LenderConfig> = new Map(
  LENDERS.map((l) => [l.id, l]),
);

/** Resolve a lender config, throwing on an unknown id (closed-roster guard). */
export function getLender(id: LenderId): LenderConfig {
  const cfg = LENDER_BY_ID.get(id);
  if (!cfg) throw new Error(`getLender(): unknown lender "${id}"`);
  return cfg;
}

/** Look up a lender config WITHOUT throwing (tolerant prose/migration). */
export function findLender(id: string): LenderConfig | undefined {
  return LENDER_BY_ID.get(id as LenderId);
}

// --- Borrow cap = f(reputation, collateral) (design/10 §2) -------------------

/**
 * How much STREET reputation lifts the borrow cap toward the lender's max — the
 * "history of paying up keeps the door open" term (design/10 §1). At 0 rep you can
 * only draw `CAP_REPUTATION_FLOOR` of the max; at `CAP_REPUTATION_SCALE` rep you
 * can draw the whole line.
 */
export const CAP_REPUTATION_FLOOR = 0.35;
export const CAP_REPUTATION_SCALE = 100;

/**
 * Collateral (a pledged stash/front) lets you borrow beyond the reputation cap up
 * to this fraction of the collateral's value (design/10 §2/§3). Defaulting
 * transfers that one asset — the anti-wipe rule (design/09) still holds.
 */
export const CAP_COLLATERAL_FRACTION = 0.6;

// --- Interest (design/10 §3, §4.2) -------------------------------------------

/**
 * Interest compounds per in-game DAY at `weeklyRate / 7` — and ONLY during active
 * play (guarantee #2, design/10 §4.2). One played week ≈ `(1+rate/7)^7`, so the
 * street shark's $1,500 @20%/wk grows to ~$1,800 after a played week (design/10
 * §3 worked example). `debt.ts` owns the curve; this constant names the divisor.
 */
export const INTEREST_DAYS_PER_WEEK = 7;

/** In-game hours per day — converts a tick's `dtHours` into days-played. */
export const HOURS_PER_DAY = 24;

// --- Default escalation ladder (design/10 §5) --------------------------------

/**
 * The readable, telegraphed default ladder (design/10 §5). Advanced ONE rung at a
 * time, only past the soft due date, each rung a story beat with player agency
 * (pay / partial / negotiate / favor / remove). `0` = current/in-good-standing.
 */
export type LadderRung = 0 | 1 | 2 | 3 | 4 | 5;

export const LADDER_MAX_RUNG: LadderRung = 5;

/** Prose for each rung — the "sign" surfaced to the player (design/10 §5). */
export const LADDER_SIGNS: Readonly<Record<Exclude<LadderRung, 0>, string>> = {
  1: 'The vig just went up. A quiet warning that the clock is running.',
  2: 'Muscle paid you a visit. "Papa Cass says hi." A scare — no more, yet.',
  3: 'They took a stash to cover what you owe. One place, not everything.',
  4: 'They moved on one of your fronts. You can win it back over time.',
  5: "You're marked. With no way to pay and no protection, this can end the run.",
};

/**
 * Rung 1 (vig): the shark quietly raises the weekly rate by this much (design/10
 * §5). A warning felt in the balance, walked back the moment you pay down.
 */
export const LADDER_VIG_RATE_INCREASE = 0.05;

/**
 * When rung 3 (stash seizure) can't take a whole location without wiping you — you
 * have only one stash left — the shark takes a CUT of the cash there instead
 * (design/10 §5 "a cut of income"). Preserves the anti-wipe rule: you never lose
 * your last location.
 */
export const LADDER_INCOME_CUT = 0.25;

/**
 * The heaviest rung each consequence ceiling can reach (design/10 §2, §5). The
 * street shark stops at seizing a stash (MVP §7 — the first three rungs); heavier
 * lenders can take a front, and only the cartel financier reaches the lethal,
 * run-ending rung.
 */
export const CEILING_MAX_RUNG: Readonly<Record<ConsequenceCeiling, LadderRung>> = {
  'seize-stash': 3,
  'seize-front': 4,
  lethal: 5,
};

/**
 * Advancing the ladder charges at most one rung per in-game DAY overdue (design/10
 * §5 — one readable rung at a time). So a week overdue is a week of telegraphed
 * escalation, never an instant wipe. `debtStep` walks toward the day-derived target
 * one rung per tick call, exactly like the crew/official flip arcs.
 */
export const LADDER_DAYS_PER_RUNG = 1;

// --- Lifeline (design/10 §1; Prompt 11 hook) ---------------------------------

/**
 * A wiped player (operating capital at/below this) can be offered a credit lifeline
 * IF reputation warrants (design/10 §1). Matches storage's wipe threshold so "the
 * spiral" reads the same everywhere. Prompt 11 checks `lifelineOffer` before
 * declaring a run terminal.
 */
export const LIFELINE_CAPITAL_THRESHOLD = 100;

/**
 * Minimum STREET reputation for the door to stay open when wiped (design/10 §1 —
 * rep is survival). Below it, no one will front you and the spiral may be terminal.
 */
export const LIFELINE_MIN_REPUTATION = 15;

/** Fraction of the lender's max the lifeline offer extends (a modest hand up, not a fortune). */
export const LIFELINE_OFFER_FRACTION = 0.5;

// --- Repaying builds the relationship (design/10 §1, §6) ---------------------

/**
 * Clearing a loan lifts STREET reputation — a history of paying up is what keeps
 * the shark's door open and grows your line (design/10 §1). A clean, on-time
 * payoff (never defaulted) earns the extra bump.
 */
export const DEBT_REPAY_REP_BONUS = 4;
export const DEBT_ONTIME_REP_BONUS = 4;
