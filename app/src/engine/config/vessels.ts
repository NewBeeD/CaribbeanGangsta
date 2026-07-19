/**
 * Owned vessels — the late-game money sink that ALSO transports (design/13 E;
 * Prompt 47; Ideas2.md round-4 "add more expensive avenues to spend larger
 * sums… invest in container ships that would also give the option to transport
 * drugs"). Where a CHARTER (config/transport.ts) is rented per leg with a
 * middleman's cut, buying the boat outright removes that cut entirely, discounts
 * every future leg, and raises its cargo cap on upgrade — a pure clean-cash sink
 * whose only return is cheaper, bigger, cut-free logistics.
 *
 * These are v1 balance HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"; Prompt 26 centralizes). Everything a
 * vessel does is DISCLOSED — the discounted leg cost and the raised cap show on
 * the quote before commit (fairness, design/01 §0.3).
 *
 * Open access (Ideas.md — the tested guardrail): every vessel is buyable from
 * minute one. The $5M–$50M price is the ONLY gate — never a license, never a
 * progression flag. Chartering the go-fast and container-ship modes stays open
 * to anyone who can pay the per-leg charter; the ONE exception is the semi-sub,
 * whose charter is sourced from the yards that build them (config/transport.ts
 * `SEMI_SUB_CHARTER_ORIGINS` — Colombia/Mexico, the user-signed rule). Owning
 * `owned-semi-sub` is what bases the sub anywhere — the $20M buy-in is a
 * capability unlock as well as a discount, still cash-gated, never flag-gated.
 *
 * A vessel OPERATES one charter `mode` (config/transport.ts) — owning the go-fast
 * vessel makes go-fast runs cut-free and discounted; owning the container-ship
 * vessel does the same for bulk. Single-buy per id (like the fixed front /
 * production rosters — Ideas2 item 1), then upgrade-only along the `×1.15` family
 * curve for BOTH cost and cargo cap.
 */

import type { TransportId } from './transport';

export type VesselId = 'owned-go-fast' | 'owned-container-ship' | 'owned-semi-sub';

export interface VesselConfig {
  readonly id: VesselId;
  readonly name: string;
  /** The charter mode this vessel operates as (config/transport.ts). */
  readonly mode: TransportId;
  /** Level-1 buy-in, paid from CLEAN cash ($5M–$50M class — the billionaire sink). */
  readonly buyIn: number;
  /** Cargo cap at Level 1; grows on the `×1.15` family curve per level. */
  readonly baseCargoCap: number;
  /** Fraction shaved off every leg's transport cost while you own it (0..1). */
  readonly legDiscount: number;
  /** One-line disclosed flavor shown on the fleet card (never a hidden trap). */
  readonly blurb: string;
}

/** Levels run 1–5 for every vessel — the same cap as fronts/production. */
export const VESSEL_MAX_LEVEL = 5;

/** Each level up costs 15% more than the last — the classic idle geometric curve. */
export const VESSEL_COST_GROWTH = 1.15;

/** Each level raises the cargo cap by 15% — the same family curve, applied to hold size. */
export const VESSEL_CARGO_GROWTH = 1.15;

/**
 * The fixed owned-vessel roster (design/13 E), ordered by buy-in. Each operates a
 * charter mode: the go-fast vessel is the cheapest entry (kills the 6% owner cut on
 * every volume run); the container ship is the flagship sink (bulk, cut-free,
 * steeply discounted); the semi-sub is the stealth flagship (extreme charter made
 * ownable). v1 numbers are HYPOTHESES — retune on the sim.
 */
export const VESSELS: readonly VesselConfig[] = [
  {
    id: 'owned-go-fast',
    name: 'Owned Go-Fast',
    mode: 'go-fast',
    buyIn: 5_000_000,
    baseCargoCap: 400,
    legDiscount: 0.4,
    blurb: 'Your own boat, your own driver — no more owner’s cut on the volume runs.',
  },
  {
    id: 'owned-semi-sub',
    name: 'Owned Semi-Sub',
    mode: 'semi-sub',
    buyIn: 20_000_000,
    baseCargoCap: 800,
    legDiscount: 0.5,
    blurb:
      'A submarine of your own — based wherever you are, not just the Colombia/Mexico yards. The lowest odds on the water.',
  },
  {
    id: 'owned-container-ship',
    name: 'Owned Container Ship',
    mode: 'container-ship',
    buyIn: 50_000_000,
    baseCargoCap: 2_000,
    legDiscount: 0.6,
    blurb: 'A freighter under your flag. Move the world’s weight for pennies a leg.',
  },
] as const;

const VESSEL_BY_ID: ReadonlyMap<VesselId, VesselConfig> = new Map(
  VESSELS.map((v) => [v.id, v]),
);

/**
 * Resolve a vessel config, throwing on an unknown id (closed-union guard). Pass an
 * alternate `table` (e.g. `state.config.vessels.VESSELS`) to resolve against an
 * injected tuning (Prompt 26).
 */
export function getVessel(
  id: VesselId,
  table: readonly VesselConfig[] = VESSELS,
): VesselConfig {
  const vessel = table === VESSELS ? VESSEL_BY_ID.get(id) : table.find((v) => v.id === id);
  if (!vessel) throw new Error(`getVessel(): unknown vessel "${id}"`);
  return vessel;
}
