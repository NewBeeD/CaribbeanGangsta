/**
 * Deal-loop locations — the legs of a smuggling route (design/01 §2; design/07
 * §1). A "location" is a market you can deal into; the further from the source a
 * leg sits, the more a distance-elastic product (cocaine especially) sells for —
 * this is the mechanical reason international routes read as a paradigm-shift
 * payoff (design/01 §2 "margin widens with distance from source").
 *
 * These are v1 tuning HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"). The run's home stash sits at the
 * `source` leg; travel and per-country geography are owned by later prompts (06,
 * routes) — Prompt 04 models the route as three abstract legs so the margin
 * curve is playable and testable now.
 */

export type LocationId = 'source' | 'mid-route' | 'wholesale';

export interface LocationConfig {
  readonly id: LocationId;
  readonly name: string;
  /**
   * Distance from the source, 0..1. Drives the per-product distance elasticity
   * (config/products.ts) that widens sell margins down the route.
   */
  readonly distanceFromSource: number;
  /**
   * Baseline seizure exposure of dealing at this leg, 0..1 — one input to the
   * displayed bust probability (design/01 §2). Longer legs are riskier.
   */
  readonly risk: number;
}

export const LOCATIONS: readonly LocationConfig[] = [
  { id: 'source', name: 'Source', distanceFromSource: 0, risk: 0.15 },
  { id: 'mid-route', name: 'Mid-Route', distanceFromSource: 0.5, risk: 0.35 },
  { id: 'wholesale', name: 'Wholesale', distanceFromSource: 1, risk: 0.55 },
] as const;

export const LOCATION_IDS: readonly LocationId[] = LOCATIONS.map((l) => l.id);

/** The leg the run's home stash starts at (design/01 §0a). */
export const SOURCE_LOCATION: LocationId = 'source';

const LOCATION_BY_ID: ReadonlyMap<LocationId, LocationConfig> = new Map(
  LOCATIONS.map((l) => [l.id, l]),
);

/** Resolve a location config, throwing on an unknown id (closed union guard). */
export function getLocation(id: LocationId): LocationConfig {
  const loc = LOCATION_BY_ID.get(id);
  if (!loc) throw new Error(`getLocation(): unknown location "${id}"`);
  return loc;
}
