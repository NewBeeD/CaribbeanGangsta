/**
 * The product table for the deal loop (design/01 §2, §2a; design/11; GDD §3
 * Loop 1).
 *
 * The canonical real-dollar price *bands* live in `config/countries.ts`
 * (`PRODUCT_PRICE_BANDS`, the single source of truth referenced across docs
 * 09–10). This module augments each product with the deal-loop behavior the
 * bands alone don't carry: its risk tier, its SOURCE REGION, and how its margin
 * responds to geographic distance from that source — all v1 tuning HYPOTHESES
 * held as config (prompts/README.md "Config, not literals"; Prompt 26
 * centralizes).
 *
 * Design structure encoded here (design/01 §2; Ideas.md — Drug Lord 2 open
 * access; Ideas2 — regional markets):
 *  - **Every product is dealable from minute one** wherever it trades. There is
 *    no progression gate — the buy price, the plug intro, and the heat are the
 *    gates. Weed is where a broke player starts because it's what he can
 *    afford, not because the rest is hidden.
 *  - **Cocaine is the margin engine**: a high `sellDistanceElasticity` makes its
 *    sell price widen sharply from Colombia → the islands → Miami/Europe.
 *  - **Arms are the high-heat premium tier**: top `tierRisk` and bust-heat spike.
 *  - **Margins scale with risk & heat** — higher tiers pay more precisely because
 *    they carry more seizure risk. That trade-off *is* the deal loop.
 */

import {
  PRODUCT_PRICE_BANDS,
  type Band,
  type ProductId,
  type Region,
} from './countries';

export interface ProductConfig {
  readonly id: ProductId;
  readonly name: string;
  /** Source buy-price band, $/unit (from `PRODUCT_PRICE_BANDS`). */
  readonly buy: Band;
  /** Wholesale sell-price band, $/unit (from `PRODUCT_PRICE_BANDS`). */
  readonly sell: Band;
  /** Heat generated per unit moved on a deal (design/01 §2). */
  readonly heatPerUnit: number;
  /** Product-tier contribution to bust probability, 0..1 (design/01 §2). */
  readonly tierRisk: number;
  /** The region this product sources from (design/11 §1 — geography). */
  readonly sourceRegion: Region;
  /**
   * How much the sell price grows per unit of region distance from the source:
   * at distance `d` the sell base is `sourceSell × (1 + d × sellDistanceElasticity)`.
   * Cocaine is high (the margin engine); weed is low (design/01 §2).
   */
  readonly sellDistanceElasticity: number;
  /** How much sourcing far from the source raises the buy base (smaller). */
  readonly buyDistanceElasticity: number;
  /** Heat spike multiplier applied to `heatPerUnit × qty` on a bust. */
  readonly bustHeatMultiplier: number;
}

/** Per-product deal-loop metadata, merged with the canonical price bands. */
const PRODUCT_META: Readonly<
  Record<
    ProductId,
    Pick<
      ProductConfig,
      | 'tierRisk'
      | 'sourceRegion'
      | 'sellDistanceElasticity'
      | 'buyDistanceElasticity'
      | 'bustHeatMultiplier'
    >
  >
> = {
  weed: {
    tierRisk: 0.1,
    sourceRegion: 'caribbean',
    sellDistanceElasticity: 0.3,
    buyDistanceElasticity: 0.1,
    bustHeatMultiplier: 3,
  },
  exotic: {
    tierRisk: 0.15,
    sourceRegion: 'caribbean',
    sellDistanceElasticity: 0.4,
    buyDistanceElasticity: 0.1,
    bustHeatMultiplier: 3,
  },
  hash: {
    tierRisk: 0.15,
    sourceRegion: 'asia',
    sellDistanceElasticity: 0.5,
    buyDistanceElasticity: 0.1,
    bustHeatMultiplier: 3,
  },
  synthetics: {
    tierRisk: 0.4,
    sourceRegion: 'europe',
    sellDistanceElasticity: 0.8,
    buyDistanceElasticity: 0.15,
    bustHeatMultiplier: 3,
  },
  cocaine: {
    tierRisk: 0.7,
    sourceRegion: 'latin-america',
    sellDistanceElasticity: 2.0, // the margin engine — widens hard with distance
    buyDistanceElasticity: 0.2,
    bustHeatMultiplier: 4,
  },
  crack: {
    // Cooked near its buyers, so distance matters little — the cook itself is
    // the value-add (config/conversions.ts).
    tierRisk: 0.8,
    sourceRegion: 'latin-america',
    sellDistanceElasticity: 0.3,
    buyDistanceElasticity: 0.15,
    bustHeatMultiplier: 4,
  },
  meth: {
    tierRisk: 0.5,
    sourceRegion: 'latin-america',
    sellDistanceElasticity: 1.0,
    buyDistanceElasticity: 0.15,
    bustHeatMultiplier: 4,
  },
  heroin: {
    tierRisk: 0.75,
    sourceRegion: 'asia',
    sellDistanceElasticity: 1.2,
    buyDistanceElasticity: 0.2,
    bustHeatMultiplier: 4,
  },
  fentanyl: {
    tierRisk: 0.95,
    sourceRegion: 'latin-america',
    sellDistanceElasticity: 1.5,
    buyDistanceElasticity: 0.2,
    bustHeatMultiplier: 5,
  },
  pills: {
    tierRisk: 0.4,
    sourceRegion: 'north-america',
    sellDistanceElasticity: 0.6,
    buyDistanceElasticity: 0.1,
    bustHeatMultiplier: 3,
  },
  arms: {
    tierRisk: 1.0, // high-heat premium tier
    sourceRegion: 'north-america',
    sellDistanceElasticity: 0.5,
    buyDistanceElasticity: 0.15,
    bustHeatMultiplier: 5,
  },
};

export const PRODUCTS: readonly ProductConfig[] = PRODUCT_PRICE_BANDS.map(
  (band) => ({
    id: band.id,
    name: band.name,
    buy: band.buy,
    sell: band.sell,
    heatPerUnit: band.heatPerUnit,
    ...PRODUCT_META[band.id],
  }),
);

const PRODUCT_BY_ID: ReadonlyMap<ProductId, ProductConfig> = new Map(
  PRODUCTS.map((p) => [p.id, p]),
);

/** Resolve a product config, throwing on an unknown id (closed union guard). */
export function getProduct(id: ProductId): ProductConfig {
  const product = PRODUCT_BY_ID.get(id);
  if (!product) throw new Error(`getProduct(): unknown product "${id}"`);
  return product;
}

/**
 * The premium weed strain pool (Ideas2 §5 — "more expensive form of weed…
 * random on the market"). World generation draws ONE per run as the shelf name
 * of the `exotic` product (`world.exoticStrain`), so the top of the weed market
 * reads fresh every run while the mechanics stay one tunable product line.
 */
export const EXOTIC_STRAINS: readonly string[] = [
  'Purple Haze',
  'Gorilla Glue #4',
  'Runtz',
  'Zkittlez',
  'Wedding Cake',
  'Gelato #33',
  'Granddaddy Purple',
  'White Widow',
] as const;
