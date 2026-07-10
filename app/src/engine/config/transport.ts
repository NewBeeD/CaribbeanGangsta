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

export type TransportId = 'go-fast' | 'ferry' | 'plane';

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
    ownerCutPct: 0.1,
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
] as const;

const TRANSPORT_BY_ID: ReadonlyMap<TransportId, TransportConfig> = new Map(
  TRANSPORTS.map((t) => [t.id, t]),
);

/** Resolve a transport config, throwing on an unknown id (closed union guard). */
export function getTransport(id: TransportId): TransportConfig {
  const transport = TRANSPORT_BY_ID.get(id);
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

/** Each courier's cut, as a fraction of the cargo's sell value at the destination. */
export const COURIER_CUT_PCT = 0.05;
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
