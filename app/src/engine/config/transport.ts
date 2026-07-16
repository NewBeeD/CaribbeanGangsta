/**
 * Transport modes — the priced ways product crosses water (design/11 §3;
 * Ideas2 §1/§3; Prompt 30). These are v1 tuning HYPOTHESES held as config,
 * never scattered literals (prompts/README.md "Config, not literals"; Prompt 26
 * centralizes).
 *
 * Open access (Ideas.md — the tested guardrail): every mode is buyable from
 * minute one. Cash is the only gate — no license, no progression flag. The
 * trade-off IS the choice: the go-fast is big and quick but rides hot and its
 * owner takes a cut of the cargo; the ferry is cheap and low-profile but slow
 * and small; the plane is dear, fastest, and middling risk.
 *
 * The interdiction-odds weights below are the inputs to `travel.
 * interdictionChance` — the ONE number shown on the quote and rolled on
 * arrival (the fairness law, design/01 §0.3).
 */

export type TransportId =
  | 'go-fast'
  | 'ferry'
  | 'plane'
  // Bulk charter modes (design/13 E; Prompt 47) — scale the water so a player can
  // move FAR more units per leg. Pure config rows; `travel.ts` prices any mode.
  | 'container-ship'
  | 'semi-sub';

export interface TransportConfig {
  readonly id: TransportId;
  readonly name: string;
  /** $ cost per unit of REGION_DISTANCE for the leg. */
  readonly costPerDistance: number;
  /** Max units carried per shipment. */
  readonly cargoCap: number;
  /** In-game hours per unit of distance (shipments resolve on ONLINE ticks). */
  readonly hoursPerDistance: number;
  /** Baseline interdiction exposure 0..1 — one input to the displayed odds. */
  readonly baseRisk: number;
  /** Fraction of the cargo's sell VALUE owed to the boat's owner (go-fast only, Ideas2 §1). */
  readonly ownerCutPct?: number;
}

export const TRANSPORTS: readonly TransportConfig[] = [
  {
    // Big cargo, fast, rides hot — and the boat's owner takes his taste of the
    // load's value (Ideas2 §1). The volume play.
    id: 'go-fast',
    name: 'Go-Fast Boat',
    costPerDistance: 20_000,
    cargoCap: 400,
    hoursPerDistance: 18,
    baseRisk: 0.35,
    // Cut retune (design/13 E; Prompt 47) — the middleman took too much: 0.10 →
    // 0.06. An OWNED go-fast vessel pays no owner cut at all (engine/vessels.ts).
    ownerCutPct: 0.06,
  },
  {
    // Cheapest and lowest-profile thing on the water — but slow, and it only
    // holds what fits in a couple of crates. The patient play.
    id: 'ferry',
    name: 'Island Ferry',
    costPerDistance: 6_000,
    cargoCap: 60,
    hoursPerDistance: 48,
    baseRisk: 0.08,
  },
  {
    // Fastest by far, moderate exposure, small hold, charter prices. The
    // time-is-money play.
    id: 'plane',
    name: 'Charter Plane',
    costPerDistance: 45_000,
    cargoCap: 100,
    hoursPerDistance: 6,
    baseRisk: 0.18,
  },
  {
    // BULK — the freight play (design/13 E; Prompt 47). Hidden among legitimate
    // container traffic, it moves an order of magnitude more than any go-fast at
    // the CHEAPEST per unit-distance and the LOWEST mode risk — but it is the
    // slowest thing on the water, and a seizure loses a fortune (its own balance:
    // no cut/discount softens a lost 2,000-unit load). v1 numbers are HYPOTHESES,
    // retune on the sim.
    id: 'container-ship',
    name: 'Container Ship',
    costPerDistance: 4_000,
    cargoCap: 2_000,
    hoursPerDistance: 72,
    baseRisk: 0.06,
  },
  {
    // The STEALTH play (design/13 E; Prompt 47). Very low mode risk (nothing sees
    // it coming) and moderate speed, at an EXTREME charter price — the premium you
    // pay for the lowest displayed odds of any mode carrying the same load. A big
    // hold, but far under the container ship. v1 numbers are HYPOTHESES.
    id: 'semi-sub',
    name: 'Semi-Submersible',
    costPerDistance: 60_000,
    cargoCap: 800,
    hoursPerDistance: 30,
    baseRisk: 0.04,
  },
] as const;

const TRANSPORT_BY_ID: ReadonlyMap<TransportId, TransportConfig> = new Map(
  TRANSPORTS.map((t) => [t.id, t]),
);

/**
 * Resolve a transport config, throwing on an unknown id (closed union guard).
 * Pass an alternate `table` (e.g. `state.config.transport.TRANSPORTS`) to
 * resolve against an injected tuning (Prompt 26).
 */
export function getTransport(
  id: TransportId,
  table: readonly TransportConfig[] = TRANSPORTS,
): TransportConfig {
  const transport =
    table === TRANSPORTS ? TRANSPORT_BY_ID.get(id) : table.find((t) => t.id === id);
  if (!transport) throw new Error(`getTransport(): unknown transport "${id}"`);
  return transport;
}

// --- Interdiction odds tuning (design/11 §3; the fairness clamp) --------------

/** The interdiction window: displayed odds always land inside it (like the
 * deal loop's bust window) BEFORE escort reductions apply on top. */
export const INTERDICTION_MIN = 0.02;
export const INTERDICTION_MAX = 0.75;

/** Flat exposure every shipment carries just by existing. */
export const INTERDICTION_BASE = 0.02;

// Weights of each input to the displayed interdiction odds — f(mode, leg
// distance, cargo heat, destination risk, port protection, paid ports,
// escorts). Chosen so the clamp is reachable from both ends: a small ferry hop
// into a protected paid port floors near the minimum; a heavy go-fast run into
// Miami ceils high.
export const MODE_RISK_WEIGHT = 0.6;
export const DISTANCE_RISK_WEIGHT = 0.15;
export const CARGO_HEAT_WEIGHT = 0.25;
export const DEST_RISK_WEIGHT = 0.2;
export const PORT_PROTECTION_WEIGHT = 0.15;
/** Flat odds relief when the origin or destination port is paid (design/09 A.3). */
export const PAID_PORT_RELIEF = 0.1;
/** Cargo heat (`heatPerUnit × qty`) at which the cargo term saturates its weight. */
export const CARGO_HEAT_FULL_RISK = 100;

/**
 * Cross-country legs are never free: same-region hops (island to island) are
 * priced/timed/risked at least this REGION_DISTANCE. (Same-COUNTRY moves stay
 * instant and free via `storage.moveProduct`.)
 */
export const MIN_LEG_DISTANCE = 0.15;

// --- Couriers & escorts (Ideas2 §1 — go yourself vs send someone) -------------

/**
 * Each courier's cut, as a fraction of the cargo's sell value at the destination.
 * Cut retune (design/13 E; Prompt 47) — couriers took too much: 0.05 → 0.03.
 */
export const COURIER_CUT_PCT = 0.03;
/**
 * Multiplicative odds reduction per escort — each courier BEYOND the first
 * rides shotgun, and each strictly lowers the displayed odds (added security)
 * while adding their cut. Applied after the clamp, so more escorts always help.
 */
export const ESCORT_ODDS_REDUCTION = 0.15;
/**
 * Units a courier with an ACTIVE betrayal arc skims on arrival, as a fraction
 * of the cargo (floored to whole units). TELEGRAPHED, never a hidden roll
 * (design/02 §4): the arc's signs are visible, and the quote discloses the
 * exact skim before the player commits.
 */
export const COURIER_SKIM_PCT = 0.05;
/**
 * Heat factor when a CONSIGNED shipment is interdicted: the courier takes the
 * fall, so only this fraction of the solo bust spike lands on the player
 * (solo runs carry the full spike — Ideas2 §1).
 */
export const CONSIGNED_BUST_HEAT_FACTOR = 0.25;

// --- Self-run arrest (design/13 B4; Prompt 44) ---------------------------------
//
// A shipment with NO courier consigned is a run YOU helmed — the launch quote
// says so ("You're driving — if this is stopped, you're in the cuffs"). If it's
// interdicted, you're arrested: a telegraphed, consensual interrupt — post bond
// (a clean-cash hit scaled to net worth, plus a heat spike) or serve the
// sentence (`clock.serveSentence`: the sim fast-forwards `ARREST_SENTENCE_HOURS`
// in the incarcerated tick mode — costs and threats keep running, income
// freezes — then the run resumes). The bond is the ONLY reprieve: a payrolled
// judge never buries an arrest (design/13 open decision 2, settled). Consigned
// runs never fire this (the courier takes the fall —
// `CONSIGNED_BUST_HEAT_FACTOR` above).

/** Bond = max(`net worth × this`, `ARREST_BOND_MIN`), payable from CLEAN cash. */
export const ARREST_BOND_FRACTION = 0.15;
export const ARREST_BOND_MIN = 25_000;
/** Heat spike on posting bond — you walked, but they printed your name. */
export const ARREST_BOND_HEAT = 15;
/**
 * The sentence when no bond is posted: one in-game week, served as an instant
 * fast-forward at the moment of the choice (never wall-clock time — the
 * offline-freeze guarantee holds). A week guarantees at least one corruption
 * retainer cycle bills while nobody's earning.
 */
export const ARREST_SENTENCE_HOURS = 168;
