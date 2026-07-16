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
  /**
   * Per-archetype ABSOLUTE ceiling, $/wk, on any single raise ask (design/13 F;
   * Prompt 48). `computeRaiseAsk` never returns above this OR `retainer ×
   * RAISE_MAX_MULTIPLE`, whichever is lower — so a billionaire-scale empire can't
   * push a DEA insider to $10B. The worked ladder: a late-game official maxes in
   * the low millions, never the billions the round-4 feedback saw.
   */
  readonly raiseCeiling: number;
}

/**
 * The roster (design/09 B.2; design/12 Item 13 — retainers retuned to realistic
 * weekly asks). Ranked cheapest → dearest: a beat cop is cheap local cover; a
 * judge is the biggest retainer in the game and can keep a run alive. Note the
 * player's ordering swaps rank vs. cost — the Customs Chief ($250k) now outranks
 * the DEA Insider ($100k) — so the list order mirrors the ask (design/12 Item 13).
 *
 * BALANCE (design/12 balancing note): these are 40–60× the old asks and only
 * carry AFTER the one-price economy retune + the arms/street income streams
 * (Prompts 32/34/35). Confirm a mid-game empire can afford a Judge via the
 * Prompt 25 batch sim before treating them as final.
 */
export const OFFICIALS: readonly OfficialConfig[] = [
  {
    id: 'beat-cop',
    name: 'Beat Cop',
    retainerPerWeek: 50_000,
    benefit: 'raid-tipoff',
    benefitSummary: 'Tips you off on local raids and cools local heat faster.',
    greed: 0.9,
    startingLoyalty: 62,
    comfortHeat: 55,
    raiseCeiling: 500_000,
  },
  {
    id: 'detective',
    name: 'DEA Insider',
    retainerPerWeek: 100_000,
    benefit: 'taskforce-warning',
    benefitSummary: 'Advance warning on task-force moves; buries one charge a season.',
    greed: 1.1,
    startingLoyalty: 52,
    comfortHeat: 62,
    raiseCeiling: 1_200_000,
  },
  {
    id: 'customs-chief',
    name: 'Customs Chief',
    retainerPerWeek: 250_000,
    benefit: 'port-seizure-floor',
    benefitSummary: 'Standing low seizure on their port — a permanent paid port.',
    greed: 1.05,
    startingLoyalty: 55,
    comfortHeat: 58,
    raiseCeiling: 3_000_000,
  },
  {
    id: 'politician',
    name: 'Local Politician',
    retainerPerWeek: 400_000,
    benefit: 'territory-protection',
    benefitSummary: 'Protects a front/territory, slows escalation, and lifts your standing.',
    greed: 1.2,
    startingLoyalty: 50,
    comfortHeat: 45,
    raiseCeiling: 5_000_000,
  },
  {
    id: 'judge',
    name: 'Judge',
    retainerPerWeek: 750_000,
    benefit: 'dismiss-charges',
    benefitSummary: 'Can dismiss charges — softens the prison end-state, keeping a run alive.',
    greed: 1.25,
    startingLoyalty: 48,
    comfortHeat: 40,
    raiseCeiling: 10_000_000,
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

// --- Raise sanity (design/13 F; Prompt 48) -----------------------------------
//
// Round-4 feedback: "The DEA agent keeps raising his price up to $10 billion."
// The raise ARC (pending/accept/refuse/grievance) is untouched — only the NUMBER
// and the CADENCE get bounds:
//   • the ask is capped at `retainer × RAISE_MAX_MULTIPLE` AND the archetype's
//     absolute `raiseCeiling` (above), whichever is lower;
//   • an official won't ask again inside `RAISE_MIN_WEEKS_BETWEEN` weeks.
// Worked ladder for a late-game DEA insider (base $100k, ceiling $1.2M): each
// accepted raise lifts the retainer at most ×1.5, so the sequence is
// 100k → 150k → 225k → 337k → … asymptotically capped at $1.2M — low millions at
// the very top, never billions, no matter how big/hot the empire grows.

/** Most a single raise can lift the CURRENT retainer (a multiplicative cap). */
export const RAISE_MAX_MULTIPLE = 1.5;
/** An official won't ask for another raise within this many in-game weeks. */
export const RAISE_MIN_WEEKS_BETWEEN = 4;

// --- Ports everywhere, priced by weight (design/13 F; Prompt 48) --------------
//
// Round-4 feedback: "Only Puerto Verde gives me the bribe option — I want this
// for all ports; major ports should charge much more for less time." Every port
// country can now quote/haggle/pay (`quoteBribe`/`payBribe` were always
// port-agnostic — this is the tiering + the surfacing). A MAJOR port (a big
// continental gateway — Miami/Rotterdam class) charges a MULTIPLE of the ask for
// a FRACTION of the standing duration; minor ports keep the cheap, long deal. The
// per-port greed/drift factors still give every port its own personality on top.

/** The big continental gateways — the "major port" tier (design/13 F). Content, like
 * the officials roster: a stable list of country ids, not a tunable number. */
export const MAJOR_PORT_COUNTRY_IDS: readonly string[] = [
  'miami',
  'new-york',
  'rotterdam',
  'london',
];

/** Whether a port country is a MAJOR gateway (pricier bribe, shorter hold). */
export function isMajorPort(countryId: string): boolean {
  return MAJOR_PORT_COUNTRY_IDS.includes(countryId);
}

/** A major port's bribe costs this multiple of the minor-port ask (design/13 F). */
export const PORT_MAJOR_ASK_MULTIPLE = 3;
/** …and holds for only this fraction of `PORT_PAID_DURATION_HOURS` (design/13 F). */
export const PORT_MAJOR_DURATION_FRACTION = 0.34;

// --- Call in a favor (design/13 F; Prompt 48) --------------------------------
//
// Round-4 feedback: "If my drugs come across law officials and I have someone on
// payroll, I should be given the option to call them." When a shipment is about
// to be lost AND a relevant official (customs / DEA / judge) is on payroll, loyal
// past the tested bar, and unflipped, the seizure resolves into a telegraphed
// CHOICE (`travel.ts` favor arc): call them — pay a fee scaled to cargo value +
// spend loyalty, the load survives — or let it go (today's seizure). Deterministic
// against the already-rolled interdiction; the fee and loyalty cost are shown
// before choosing. Burning favors feeds the flip arc (an official you lean on
// remembers).

/** The officials who can pull a load back off the dock (design/13 F). The favor
 * mapping: customs (port paperwork), DEA (the case), the judge (the charge). */
export const FAVOR_OFFICIAL_IDS: readonly OfficialId[] = [
  'customs-chief',
  'detective',
  'judge',
];

/** Favor fee = this fraction of the cargo's destination sell value (design/13 F). */
export const FAVOR_FEE_FRACTION = 0.2;
/** Loyalty spent when an official pulls a favor — a grievance that feeds the flip. */
export const FAVOR_LOYALTY_COST = -6;
/** An official must be at least this loyal (and unflipped) to answer the call. */
export const FAVOR_MIN_LOYALTY = 40;

// --- Massive-shipment coverage — SOFT, never gated (design/13 F; Prompt 48) ----
//
// Round-4 feedback: "For massive shipments to major countries, there should be a
// requirement to have officials on the payroll." Shipped as a DISCLOSED seizure
// SURCHARGE (a worse shown price on Prompt 47's itemized quote), NOT a hard lock —
// open access holds (design/13 Open decision 1; a hard gate needs an explicit
// sign-off recorded like the territory override). An above-threshold manifest into
// a MAJOR country WITHOUT relevant payroll coverage adds `MASSIVE_UNCOVERED_
// SURCHARGE` to the interdiction odds (inside the rolled number — shown = rolled);
// covered manifests add nothing.

/** Units at/above which a manifest counts as "massive" (design/13 F). */
export const MASSIVE_UNITS_THRESHOLD = 500;
/** …OR destination sell value at/above which it counts as massive, $ (design/13 F). */
export const MASSIVE_VALUE_THRESHOLD = 2_000_000;
/** Odds added to an uncovered massive run into a major country (design/13 F). */
export const MASSIVE_UNCOVERED_SURCHARGE = 0.18;
