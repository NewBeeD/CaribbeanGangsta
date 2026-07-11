/**
 * Per-run world generation (design/01 §0a; design/11; GDD §5.4).
 *
 * `generateWorld(rng)` turns a seed into a fully-specified, *playable and
 * readable* world: a starting island and its economy, the global source price
 * board, a per-country supplier geography (cost/demand/heat factors), a rival
 * roster, a chaos sub-seed, and the run's exotic strain name. Each run differs;
 * the player's SKILL (reading the board) is what transfers — the world is what
 * varies (design/01 §0.1).
 *
 * Pricing model (design/11 §1): one GLOBAL source board per product (resolved
 * within its documented band) + geography. A country's local base price is the
 * board stretched by the region distance from the product's source region
 * (per-product elasticity — cocaine widens hard) and scaled by the country's
 * per-run cost/demand factors and fixed product flavor. `basePriceAt` is that
 * projection; the live drift factor on top of it is owned by `deals.ts`.
 *
 * Determinism: every draw comes from independent `rng.fork()` sub-streams, so
 * one facet's rolls can never desync another's, and the same seed always yields
 * a deep-equal `World`.
 *
 * Fairness: the world is fully describable to the player — `describeStartingHand`
 * surfaces the starting hand with no concealed modifiers (GDD §5.4), and every
 * country's prices are visible from minute one (Ideas2 §2/§3 — the world market
 * board is open; money and geography are the only gates).
 */

import { createRng, type Rng } from './rng';
import {
  COUNTRIES,
  PRODUCT_PRICE_BANDS,
  REGION_DISTANCE,
  START_COUNTRIES,
  getCountry,
  requiresPlug,
  type CountryConfig,
  type ProductId,
} from './config/countries';
import {
  EXOTIC_STRAINS,
  PRODUCTS,
  getProduct,
  type ProductConfig,
} from './config/products';
import { RIVAL_ARCHETYPES, RIVAL_NAMES } from './config/rivals';
import { VOLATILITY_RANGE } from './config/world';
import { DEFAULT_GAME_CONFIG, type GameConfig, type WorldTuning } from './config';

// The volatility band moved to `config/world.ts` (Prompt 26); re-exported for
// the existing engine surface.
export { VOLATILITY_RANGE } from './config/world';

export interface ResolvedPrice {
  readonly product: ProductId;
  /** Resolved global source buy base, $/unit — always within the product's buy band. */
  readonly buy: number;
  /** Resolved global source sell base, $/unit — within the product's sell band. */
  readonly sell: number;
  /** Per-product price swing ∈ [0.20, 0.50]; live price = base × (1 ± volatility). */
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
  /** Buy-side factor: <1 = a cheap source this run, >1 = expensive. */
  readonly costFactor: number;
  /** Sell-side factor: >1 = strong demand this run (better sell prices). */
  readonly demandFactor: number;
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
  /** The GLOBAL source price board, one entry per product (design/11 §1). */
  readonly priceBoards: readonly ResolvedPrice[];
  readonly rivals: readonly Rival[];
  /** Sub-seed handed to the Chaos Engine (Prompt 12) for reproducible timing. */
  readonly eventSeed: number;
  readonly supplierGeography: SupplierGeography;
  /** This run's premium weed strain name — the `exotic` product's shelf name. */
  readonly exoticStrain: string;
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

function resolvePriceBoards(rng: Rng, config: GameConfig): readonly ResolvedPrice[] {
  const volatility = config.world.VOLATILITY_RANGE;
  return config.products.PRODUCTS.map((product) => ({
    product: product.id,
    buy: rng.float(product.buy.min, product.buy.max),
    sell: rng.float(product.sell.min, product.sell.max),
    volatility: rng.float(volatility.min, volatility.max),
  }));
}

function resolveRivals(rng: Rng, world: WorldTuning): readonly Rival[] {
  const count = rng.int(world.RIVAL_COUNT.min, world.RIVAL_COUNT.max);
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

/** A neutral supplier entry (also the fallback for legacy/foreign country ids). */
export function neutralSupplier(countryId: string): SupplierMarket {
  return {
    countryId,
    costFactor: 1,
    demandFactor: 1,
    heatFactor: 1,
    cheap: false,
    hot: false,
  };
}

function resolveSupplierGeography(rng: Rng, world: WorldTuning): SupplierGeography {
  const heatRange = world.SUPPLIER_HEAT_FACTOR_RANGE;
  return COUNTRIES.map((country) => {
    const costFactor = rng.float(country.costBias.min, country.costBias.max);
    const demandFactor = rng.float(country.demandBias.min, country.demandBias.max);
    const heatFactor = rng.float(heatRange.min, heatRange.max);
    return {
      countryId: country.id,
      costFactor,
      demandFactor,
      heatFactor,
      cheap: costFactor < world.CHEAP_SUPPLIER_THRESHOLD,
      hot: heatFactor > world.HOT_SUPPLIER_THRESHOLD,
    };
  });
}

/**
 * Generate a full per-run world from a seeded RNG (design/01 §0a; design/11).
 * `config` injects the tuning (variety bounds, price bands) — default v1
 * (Prompt 26); the same seed under the same config yields a deep-equal world.
 */
export function generateWorld(rng: Rng, config: GameConfig = DEFAULT_GAME_CONFIG): World {
  // Only the Caribbean home islands are start-eligible (design/11 §1); the wider
  // world is reachable through footholds and plugs, never as a spawn.
  const country = rng.fork('country').pick(START_COUNTRIES);
  const startingCountry = resolveCountry(rng.fork('country-resolve'), country);
  const priceBoards = resolvePriceBoards(rng.fork('prices'), config);
  const rivals = resolveRivals(rng.fork('rivals'), config.world);
  const eventSeed = rng.fork('events').int(0, 2_147_483_647);
  const supplierGeography = resolveSupplierGeography(rng.fork('suppliers'), config.world);
  const exoticStrain = rng.fork('strain').pick(EXOTIC_STRAINS);

  return {
    seed: rng.getState().key,
    startingCountry,
    priceBoards,
    rivals,
    eventSeed,
    supplierGeography,
    exoticStrain,
  };
}

/**
 * A pre-v8 world as stored in old saves: only the original four products on the
 * board, suppliers without `demandFactor`, and no `exoticStrain`. Used by the
 * v7→v8 persistence migration.
 */
export interface LegacyWorld
  extends Omit<World, 'supplierGeography' | 'exoticStrain'> {
  readonly supplierGeography: readonly (Omit<SupplierMarket, 'demandFactor'> & {
    readonly demandFactor?: number;
  })[];
  readonly exoticStrain?: string;
}

/**
 * Upgrade a pre-v8 world to the regional-markets shape (design/11): resolve
 * boards for the products the save has never seen, extend the supplier
 * geography to the full roster with per-country demand factors, and draw the
 * run's exotic strain. Deterministic from the save's own seed (a dedicated
 * `::migrate-v8` stream), so migrating the same save twice yields the same
 * world. Everything the old save already resolved is preserved verbatim.
 */
export function hydrateLegacyWorld(legacy: LegacyWorld): World {
  const rng = createRng(`${legacy.seed}::migrate-v8`);

  const priceBoards: ResolvedPrice[] = PRODUCT_PRICE_BANDS.map((band) => {
    const existing = legacy.priceBoards.find((b) => b.product === band.id);
    if (existing) return existing;
    return {
      product: band.id,
      buy: rng.float(band.buy.min, band.buy.max),
      sell: rng.float(band.sell.min, band.sell.max),
      volatility: rng.float(VOLATILITY_RANGE.min, VOLATILITY_RANGE.max),
    };
  });

  const supplierGeography: SupplierMarket[] = COUNTRIES.map((country) => {
    const existing = legacy.supplierGeography.find(
      (s) => s.countryId === country.id,
    );
    const demandFactor =
      existing?.demandFactor ??
      rng.float(country.demandBias.min, country.demandBias.max);
    if (existing) return { ...existing, demandFactor };
    const costFactor = rng.float(country.costBias.min, country.costBias.max);
    // Migration literals, deliberately FROZEN at the v8 values (not read from
    // config): retuning `config/world.ts` must never change what an old save
    // deterministically migrates into.
    const heatFactor = rng.float(0.8, 1.5);
    return {
      countryId: country.id,
      costFactor,
      demandFactor,
      heatFactor,
      cheap: costFactor < 0.95,
      hot: heatFactor > 1.2,
    };
  });

  return {
    ...legacy,
    priceBoards,
    supplierGeography,
    exoticStrain: legacy.exoticStrain ?? rng.pick(EXOTIC_STRAINS),
  };
}

// --- Price projection (design/11 §1) -----------------------------------------

/** The run's resolved global source board for `product` (throws if absent). */
export function boardFor(world: World, product: ProductId): ResolvedPrice {
  const board = world.priceBoards.find((b) => b.product === product);
  if (!board) throw new Error(`boardFor(): no price board for "${product}"`);
  return board;
}

function supplierFor(world: World, countryId: string): SupplierMarket {
  return (
    world.supplierGeography.find((s) => s.countryId === countryId) ??
    neutralSupplier(countryId)
  );
}

export interface BasePrice {
  /** Local base buy price, $/unit (before live drift). */
  readonly buy: number;
  /** Local base sell price, $/unit (before live drift). */
  readonly sell: number;
  readonly volatility: number;
  /** True when the buy side is the plug's fixed contract price (Ideas2 §2). */
  readonly plugPriced: boolean;
}

/**
 * The BASE local price of `product` at `countryId` (design/11 §1): the global
 * source board stretched by region distance from the product's source region
 * (per-product elasticity), scaled by the country's per-run cost/demand factors
 * and fixed product flavor. At a TRUE SOURCE (`plugFor`), the buy side is the
 * plug's fixed contract price — `board.buy × plugPriceFactor`, the cheapest
 * standing price in the game, drift-free and readable (Ideas2 §2).
 *
 * Live prices are this base × the country's drift factor (`deals.getMarketPrice`);
 * prices are computable for EVERY country — visibility is never gated, only
 * deal execution is (`isTraded` / the plug).
 */
export function basePriceAt(
  world: World,
  product: ProductId,
  countryId: string,
  products: readonly ProductConfig[] = PRODUCTS,
): BasePrice {
  const cfg = getProduct(product, products);
  const country = getCountry(countryId);
  const board = boardFor(world, product);
  const supplier = supplierFor(world, countryId);
  const bias = country.productBias?.[product] ?? 1;
  const dist = REGION_DISTANCE[country.region][cfg.sourceRegion];

  const plugPriced = requiresPlug(countryId, product);
  const buy = plugPriced
    ? board.buy * (country.plugPriceFactor ?? 1)
    : board.buy * (1 + dist * cfg.buyDistanceElasticity) * supplier.costFactor * bias;
  const sell =
    board.sell *
    (1 + dist * cfg.sellDistanceElasticity) *
    supplier.demandFactor *
    bias;

  return { buy, sell, volatility: board.volatility, plugPriced };
}

/** The shelf name a product renders under — the run's strain for `exotic`. */
export function productDisplayName(world: World, product: ProductId): string {
  if (product === 'exotic') return world.exoticStrain;
  return getProduct(product).name;
}

export interface StartingHand {
  readonly country: string;
  readonly startingCash: number;
  readonly heatBaseline: number;
  readonly portProtection: number;
  readonly openingHooks: readonly string[];
  /** The cheapest LOCALLY TRADED product to buy into — the obvious first move. */
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
  const home = getCountry(world.startingCountry.id);
  const cheapest = home.traded
    .map((id) => ({ product: id, buy: basePriceAt(world, id, home.id).buy }))
    .reduce((lo, p) => (p.buy < lo.buy ? p : lo));
  return {
    country: world.startingCountry.name,
    startingCash: world.startingCountry.startingCash,
    heatBaseline: world.startingCountry.heatBaseline,
    portProtection: world.startingCountry.portProtection,
    openingHooks: world.startingCountry.openingHooks,
    cheapestProduct: cheapest,
    prices: world.priceBoards,
    rivals: world.rivals.map((r) => ({
      name: r.name,
      archetype: r.archetype,
      aggression: r.aggression,
    })),
  };
}
