/**
 * The corruption network's roster & tuning (design/09 System B; GDD §4.9). Two
 * tiers: **one-off port bribes** (variable, per-shipment) and **standing payroll**
 * (recurring, for police & politicians). Both are the *buy-your-way-to-safety*
 * layer and the main **sink for clean cash** (giving the idle laundering payoff
 * somewhere meaningful to go — design/09 Integration).
 *
 * These are v1 tuning HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"; Prompt 26 centralizes). Payroll is
 * **optional, deterministic power** — you pay, you get the benefit — with a
 * *telegraphed* flip risk as the only uncertainty (design/09 B.3; not a loot box,
 * not pay-to-win). The engine (`corruption.ts`) reuses the crew betrayal machinery
 * for the flip arc, so a bought official is an NPC you manage, not a stat toggle.
 */

// --- Payroll roster (design/09 B.2) ------------------------------------------

/** The buyable officials (design/09 B.2). A small, high-impact subset (MVP). */
export type OfficialId =
  | 'beat-cop'
  | 'detective'
  | 'customs-chief'
  | 'politician'
  | 'judge';

/** What a payrolled official does for you (design/09 B.2). */
export type OfficialBenefit =
  | 'raid-tipoff' // local raid warnings + faster local heat decay
  | 'taskforce-warning' // advance warning on task-force moves; bury a charge
  | 'port-seizure-floor' // a standing paid port (permanent version of B.1)
  | 'territory-protection' // protects a front/territory; slows escalation; +rep
  | 'dismiss-charges'; // a judge — softens the prison end-state (Prompt 11 hook)

export interface OfficialConfig {
  readonly id: OfficialId;
  readonly name: string;
  /** Base weekly retainer, $ (the CURRENT retainer rises over time — B.2 v1.1). */
  readonly retainerPerWeek: number;
  readonly benefit: OfficialBenefit;
  /** One-line prose describing the standing benefit (shown in the UI). */
  readonly benefitSummary: string;
  /** Greed trait 0.7–1.3 — scales their asks (design/09 B.1/B.2). */
  readonly greed: number;
  /** Where loyalty starts (0–100, hidden). */
  readonly startingLoyalty: number;
  /**
   * Heat (0–100) above which the official gets nervous and starts to distance
   * themselves — their comfort threshold (design/09 B.2). Higher-tier officials
   * risk more, so their thresholds are higher; a skittish politician's is low.
   */
  readonly comfortHeat: number;
}

/**
 * The roster (design/09 B.2). Costs and benefits mirror the design table: a beat
 * cop is cheap local cover; a judge is a big retainer that can keep a run alive.
 */
export const OFFICIALS: readonly OfficialConfig[] = [
  {
    id: 'beat-cop',
    name: 'Beat Cop',
    retainerPerWeek: 1_500,
    benefit: 'raid-tipoff',
    benefitSummary: 'Tips you off on local raids and cools local heat faster.',
    greed: 0.9,
    startingLoyalty: 62,
    comfortHeat: 55,
  },
  {
    id: 'detective',
    name: 'DEA Insider',
    retainerPerWeek: 8_000,
    benefit: 'taskforce-warning',
    benefitSummary: 'Advance warning on task-force moves; buries one charge a season.',
    greed: 1.1,
    startingLoyalty: 52,
    comfortHeat: 62,
  },
  {
    id: 'customs-chief',
    name: 'Customs Chief',
    retainerPerWeek: 6_000,
    benefit: 'port-seizure-floor',
    benefitSummary: 'Standing low seizure on their port — a permanent paid port.',
    greed: 1.05,
    startingLoyalty: 55,
    comfortHeat: 58,
  },
  {
    id: 'politician',
    name: 'Local Politician',
    retainerPerWeek: 12_000,
    benefit: 'territory-protection',
    benefitSummary: 'Protects a front/territory, slows escalation, and lifts your standing.',
    greed: 1.2,
    startingLoyalty: 50,
    comfortHeat: 45,
  },
  {
    id: 'judge',
    name: 'Judge',
    retainerPerWeek: 20_000,
    benefit: 'dismiss-charges',
    benefitSummary: 'Can dismiss charges — softens the prison end-state, keeping a run alive.',
    greed: 1.25,
    startingLoyalty: 48,
    comfortHeat: 40,
  },
] as const;

const OFFICIAL_BY_ID: ReadonlyMap<OfficialId, OfficialConfig> = new Map(
  OFFICIALS.map((o) => [o.id, o]),
);

/** Resolve an official config, throwing on an unknown id (closed-roster guard). */
export function getOfficial(id: OfficialId): OfficialConfig {
  const cfg = OFFICIAL_BY_ID.get(id);
  if (!cfg) throw new Error(`getOfficial(): unknown official "${id}"`);
  return cfg;
}

/** Look up an official config WITHOUT throwing (for tolerant prose/migration). */
export function findOfficial(id: string): OfficialConfig | undefined {
  return OFFICIAL_BY_ID.get(id as OfficialId);
}

/** A one-time political-reputation bump when a politician joins the payroll (B.2). */
export const POLITICIAN_REP_BONUS = 10;

// --- Port bribes — variable, per-shipment (design/09 B.1) --------------------

/**
 * Base bribe as a fraction of shipment value (design/09 B.1: ~5–20%, starts ~8%).
 * The asking price scales this by heat, rival pressure, greed, and rep discount.
 */
export const PORT_BRIBE_BASE_FRACTION = 0.08;
export const PORT_BRIBE_MIN_FRACTION = 0.05;
export const PORT_BRIBE_MAX_FRACTION = 0.2;

/** Base per-shipment seizure risk at a port before paying (design/09 B.1: 30%). */
export const PORT_BASE_SEIZURE = 0.3;
/** Seizure a PAID port drops to (design/09 B.1/A.3: ~3%). Matches the container floor. */
export const PORT_PAID_SEIZURE = 0.03;

/** Port-official greed band (design/09 B.1) — derived deterministically per port. */
export const PORT_GREED_MIN = 0.7;
export const PORT_GREED_MAX = 1.3;

/**
 * How long a one-off port bribe holds the reduced seizure before it lapses
 * (design/09 B.1 "prices drift each cycle"). A standing customs chief has no
 * expiry. One in-game week.
 */
export const PORT_PAID_DURATION_HOURS = 168;

/**
 * Amplitude of the per-cycle drift on a port's asking price (design/09 B.1) —
 * a deterministic oscillation in in-game time (never a hidden roll), so the
 * "cheap port this week" isn't guaranteed next week. A bonus to catch, never a
 * punishment to miss (the ethical line).
 */
export const PORT_PRICE_DRIFT = 0.1;
export const PORT_DRIFT_PERIOD_HOURS = 168;

/** Haggle: fraction knocked off the ask on success (design/09 B.1 — a readable gamble). */
export const HAGGLE_DISCOUNT = 0.15;
/** Haggle: the shown-and-rolled chance the official refuses THIS run (fairness law). */
export const HAGGLE_REFUSE_CHANCE = 0.35;

// --- Shared price drivers (design/09 B.1/B.2) --------------------------------

/** Rival tension (0–100) is normalized by this into rival bidding pressure. */
export const RIVAL_TENSION_SCALE = 100;
/** Cap on rival pressure so a bidding war can't run the price away infinitely. */
export const RIVAL_PRESSURE_CAP = 0.5;

/** Combined business+political reputation is normalized by this into a discount. */
export const REP_DISCOUNT_SCALE = 200;
/** Most a high-reputation player knocks off a bribe/retainer ask (design/09 B.1). */
export const MAX_REP_DISCOUNT = 0.4;

// --- Payroll loyalty & raise tuning (design/09 B.2) --------------------------

export const OFFICIAL_LOYALTY_MIN = 0;
export const OFFICIAL_LOYALTY_MAX = 100;

/** Paying a retainer on time slowly builds trust. */
export const RETAINER_PAID_LOYALTY = 2;
/** Missing a week entirely — the loudest grievance, drives the flip. */
export const RETAINER_MISSED_LOYALTY = -14;
/** Paying old rate while ignoring/refusing a raise = an underpayment (B.2 v1.1). */
export const RETAINER_UNDERPAY_LOYALTY = -8;
/** Accepting a raise reassures them. */
export const RAISE_ACCEPT_LOYALTY = 3;

/**
 * Minimum fractional jump over the current retainer for a computed ask to be
 * WORTH raising (design/09 B.2 v1.1): a content official in a calm, small empire
 * doesn't bother asking. Growth + heat + greed are what push it over this line.
 */
export const RAISE_MIN_MARGIN = 0.05;

/** Reputation.business (0–100) is normalized by this into the `Δbusiness` term. */
export const BUSINESS_LEVEL_SCALE = 100;
