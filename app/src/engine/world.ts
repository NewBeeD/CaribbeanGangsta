/**
 * Per-run world generation (design/01 §0a; GDD §5.4).
 *
 * `generateWorld(rng)` turns a seed into a fully-specified, *playable and
 * readable* world: a starting country and its economy, resolved price boards, a
 * rival roster, a chaos sub-seed, and supplier geography. Each run differs; the
 * player's SKILL (reading the board) is what transfers — the world is what
 * varies (design/01 §0.1).
 *
 * Determinism: every draw comes from independent `rng.fork()` sub-streams, so
 * one facet's rolls can never desync another's, and the same seed always yields
 * a deep-equal `World`.
 *
 * Fairness: the world is fully describable to the player — `describeStartingHand`
 * surfaces the starting hand with no concealed modifiers (GDD §5.4).
 */

import type { Rng } from './rng';
import {
  COUNTRIES,
  PRODUCT_PRICE_BANDS,
  type Band,
  type CountryConfig,
  type ProductId,
} from './config/countries';
import {
  RIVAL_ARCHETYPES,
  RIVAL_COUNT,
  RIVAL_NAMES,
} from './config/rivals';

export const VOLATILITY_RANGE: Band = { min: 0.2, max: 0.5 } as const;

export interface ResolvedPrice {
  readonly product: ProductId;
  /** Resolved local buy base, $/unit — always within the product's buy band. */
  readonly buy: number;
  /** Resolved local wholesale sell base, $/unit — within the product's sell band. */
  readonly sell: number;
  /** Per-market price swing ∈ [0.20, 0.50]; live price = base × (1 ± volatility). */
  readonly volatility: number;
}

export interface StartingCountry {
  readonly id: string;
  readonly name: string;
  readonly startingCash: number;
  readonly heatBaseline: number;
  /** Resolved port protection 0..1. */
  readonly portProtection: number;
  readonly openingHooks: readonly string[];
}

export interface Rival {
  /** Unique per-run id, e.g. `rival-0`. */
  readonly id: string;
  readonly archetypeId: string;
  /** Display archetype name, e.g. "The Ghost". */
  readonly archetype: string;
  readonly name: string;
  readonly aggression: number;
  readonly cunning: number;
  readonly reach: number;
}

export interface SupplierMarket {
  readonly countryId: string;
  /** <1 = a cheap source this run, >1 = expensive. */
  readonly costFactor: number;
  /** >1 = a hot source this run (more heat to source from here). */
  readonly heatFactor: number;
  readonly cheap: boolean;
  readonly hot: boolean;
}

export type SupplierGeography = readonly SupplierMarket[];

export interface World {
  /** The seed this world was generated from (for display / replay). */
  readonly seed: string;
  readonly startingCountry: StartingCountry;
  readonly priceBoards: readonly ResolvedPrice[];
  readonly rivals: readonly Rival[];
  /** Sub-seed handed to the Chaos Engine (Prompt 12) for reproducible timing. */
  readonly eventSeed: number;
  readonly supplierGeography: SupplierGeography;
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * Resolve a base price inside `band`, biased by a country `multiplier` band, and
 * clamped so the result never leaves `band` (design/01 §2a acceptance).
 */
function resolvePrice(rng: Rng, band: Band, multiplier: Band): number {
  const mult = rng.float(multiplier.min, multiplier.max);
  const effMin = clamp(band.min * mult, band.min, band.max);
  const effMax = clamp(band.max * mult, band.min, band.max);
  return rng.float(effMin, effMax);
}

function resolveCountry(rng: Rng, config: CountryConfig): StartingCountry {
  return {
    id: config.id,
    name: config.name,
    startingCash: rng.int(config.startingCash.min, config.startingCash.max),
    heatBaseline: config.heatBaseline,
    portProtection: config.portProtectionBaseline,
    openingHooks: config.openingHooks,
  };
}

function resolvePriceBoards(
  rng: Rng,
  config: CountryConfig,
): readonly ResolvedPrice[] {
  return PRODUCT_PRICE_BANDS.map((product) => {
    const multiplier = config.priceMultipliers[product.id];
    return {
      product: product.id,
      buy: resolvePrice(rng, product.buy, multiplier),
      sell: resolvePrice(rng, product.sell, multiplier),
      volatility: rng.float(VOLATILITY_RANGE.min, VOLATILITY_RANGE.max),
    };
  });
}

function resolveRivals(rng: Rng): readonly Rival[] {
  const count = rng.int(RIVAL_COUNT.min, RIVAL_COUNT.max);
  const namePool = [...RIVAL_NAMES];
  const rivals: Rival[] = [];
  for (let i = 0; i < count; i++) {
    const archetype = rng.pick(RIVAL_ARCHETYPES);
    // Draw a name without repeats while the pool lasts; fall back if exhausted.
    const name =
      namePool.length > 0
        ? namePool.splice(rng.int(0, namePool.length - 1), 1)[0]!
        : rng.pick(RIVAL_NAMES);
    rivals.push({
      id: `rival-${i}`,
      archetypeId: archetype.id,
      archetype: archetype.name,
      name,
      aggression: rng.float(archetype.aggression.min, archetype.aggression.max),
      cunning: rng.float(archetype.cunning.min, archetype.cunning.max),
      reach: rng.float(archetype.reach.min, archetype.reach.max),
    });
  }
  return rivals;
}

function resolveSupplierGeography(rng: Rng): SupplierGeography {
  return COUNTRIES.map((country) => {
    const costFactor = rng.float(0.8, 1.2);
    const heatFactor = rng.float(0.8, 1.5);
    return {
      countryId: country.id,
      costFactor,
      heatFactor,
      cheap: costFactor < 0.95,
      hot: heatFactor > 1.2,
    };
  });
}

/** Generate a full per-run world from a seeded RNG (design/01 §0a). */
export function generateWorld(rng: Rng): World {
  const country = rng.fork('country').pick(COUNTRIES);
  const startingCountry = resolveCountry(rng.fork('country-resolve'), country);
  const priceBoards = resolvePriceBoards(rng.fork('prices'), country);
  const rivals = resolveRivals(rng.fork('rivals'));
  const eventSeed = rng.fork('events').int(0, 2_147_483_647);
  const supplierGeography = resolveSupplierGeography(rng.fork('suppliers'));

  return {
    seed: rng.getState().key,
    startingCountry,
    priceBoards,
    rivals,
    eventSeed,
    supplierGeography,
  };
}

export interface StartingHand {
  readonly country: string;
  readonly startingCash: number;
  readonly heatBaseline: number;
  readonly portProtection: number;
  readonly openingHooks: readonly string[];
  /** The cheapest product to buy into — the obvious first move. */
  readonly cheapestProduct: { readonly product: ProductId; readonly buy: number };
  readonly prices: readonly ResolvedPrice[];
  readonly rivals: readonly {
    readonly name: string;
    readonly archetype: string;
    readonly aggression: number;
  }[];
}

/**
 * The shown-to-player summary of a run's opening state (GDD §5.4 — surface the
 * starting hand, no hidden traps). Pure projection of `World`, nothing hidden.
 */
export function describeStartingHand(world: World): StartingHand {
  const cheapest = world.priceBoards.reduce((lo, p) => (p.buy < lo.buy ? p : lo));
  return {
    country: world.startingCountry.name,
    startingCash: world.startingCountry.startingCash,
    heatBaseline: world.startingCountry.heatBaseline,
    portProtection: world.startingCountry.portProtection,
    openingHooks: world.startingCountry.openingHooks,
    cheapestProduct: { product: cheapest.product, buy: cheapest.buy },
    prices: world.priceBoards,
    rivals: world.rivals.map((r) => ({
      name: r.name,
      archetype: r.archetype,
      aggression: r.aggression,
    })),
  };
}
