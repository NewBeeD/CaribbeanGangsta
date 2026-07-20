/**
 * The product table for the deal loop (design/01 §2, §2a; design/11; design/12
 * Item 3; GDD §3 Loop 1).
 *
 * The canonical real-dollar source-price *bands* live in `config/countries.ts`
 * (`PRODUCT_PRICE_BANDS`, the single source of truth referenced across docs
 * 09–12). This module augments each product with the deal-loop behavior the
 * bands alone don't carry: its risk tier, its SOURCE REGION, and how its ONE
 * price stretches with geographic distance from that source — all v1 tuning
 * HYPOTHESES held as config (prompts/README.md "Config, not literals"; Prompt
 * 26 centralizes).
 *
 * Design structure encoded here (design/01 §2; Ideas.md — Drug Lord 2 open
 * access; design/12 Item 3 — the one-price economy):
 *  - **One price per drug per market.** A country's local base is
 *    `source price × (1 + distanceElasticity)^REGION_DISTANCE` — compound, so
 *    the stretch curve is convex: the islands pay a step over the source, the
 *    continental sinks pay multiples. Buying and selling both execute at that
 *    number; GEOGRAPHY IS THE WHOLE MARGIN ENGINE (no in-place flip exists).
 *  - **Every product is dealable from minute one** wherever it trades. There is
 *    no progression gate — the price, the plug intro, and the heat are the
 *    gates. Weed is where a broke player starts because it's what he can
 *    afford, not because the rest is hidden.
 *  - **Cocaine is the margin engine**: the top elasticity makes its price widen
 *    hard from Colombia → the islands → Miami → Europe.
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
  /** Source-region price band, $/unit (from `PRODUCT_PRICE_BANDS`). */
  readonly price: Band;
  /** Heat generated per unit moved on a deal (design/01 §2). */
  readonly heatPerUnit: number;
  /** Product-tier contribution to bust probability, 0..1 (design/01 §2). */
  readonly tierRisk: number;
  /** The region this product sources from (design/11 §1 — geography). */
  readonly sourceRegion: Region;
  /**
   * How the ONE price grows with region distance from the source — compound:
   * at distance `d` the local base is `source price × (1 + this)^d`
   * (design/12 Item 3 — geography is the whole margin engine). Cocaine is the
   * steepest curve in the game; crack is flat (cooked near its buyers).
   */
  readonly distanceElasticity: number;
  /** Heat spike multiplier applied to `heatPerUnit × qty` on a bust. */
  readonly bustHeatMultiplier: number;
}

/** Per-product deal-loop metadata, merged with the canonical price bands. */
const PRODUCT_META: Readonly<
  Record<
    ProductId,
    Pick<
      ProductConfig,
      'tierRisk' | 'sourceRegion' | 'distanceElasticity' | 'bustHeatMultiplier'
    >
  >
> = {
  weed: {
    tierRisk: 0.1,
    sourceRegion: 'caribbean',
    distanceElasticity: 1.5,
    bustHeatMultiplier: 3,
  },
  exotic: {
    tierRisk: 0.15,
    sourceRegion: 'caribbean',
    distanceElasticity: 1.8,
    bustHeatMultiplier: 3,
  },
  hash: {
    tierRisk: 0.15,
    sourceRegion: 'asia',
    distanceElasticity: 6,
    bustHeatMultiplier: 3,
  },
  shrooms: {
    // The islands' other starter crop — cheap, low-heat, modest stretch: a
    // second rung beside weed, not a second margin engine.
    tierRisk: 0.1,
    sourceRegion: 'caribbean',
    distanceElasticity: 2.2,
    bustHeatMultiplier: 3,
  },
  synthetics: {
    tierRisk: 0.4,
    sourceRegion: 'europe',
    distanceElasticity: 5,
    bustHeatMultiplier: 3,
  },
  lsd: {
    // Lab sheets out of North America — quiet per unit, and the stretch to the
    // European party capitals is the play.
    tierRisk: 0.3,
    sourceRegion: 'north-america',
    distanceElasticity: 3.5,
    bustHeatMultiplier: 3,
  },
  ketamine: {
    // Sourced half a world away like hash/heroin — the distance from Asia to
    // the Atlantic club markets is the margin.
    tierRisk: 0.35,
    sourceRegion: 'asia',
    distanceElasticity: 5.5,
    bustHeatMultiplier: 3,
  },
  cocaine: {
    tierRisk: 0.7,
    sourceRegion: 'latin-america',
    distanceElasticity: 25, // the margin engine — widens hard with distance
    bustHeatMultiplier: 4,
  },
  crack: {
    // Tracks roughly half of coke's price wherever both trade — cooked near
    // its buyers, the cook itself is the value-add (config/conversions.ts).
    tierRisk: 0.8,
    sourceRegion: 'latin-america',
    distanceElasticity: 12,
    bustHeatMultiplier: 4,
  },
  meth: {
    tierRisk: 0.5,
    sourceRegion: 'latin-america',
    distanceElasticity: 16,
    bustHeatMultiplier: 4,
  },
  heroin: {
    tierRisk: 0.75,
    sourceRegion: 'asia',
    distanceElasticity: 8,
    bustHeatMultiplier: 4,
  },
  fentanyl: {
    tierRisk: 0.95,
    sourceRegion: 'latin-america',
    distanceElasticity: 22,
    bustHeatMultiplier: 5,
  },
  pills: {
    tierRisk: 0.4,
    sourceRegion: 'north-america',
    distanceElasticity: 4,
    bustHeatMultiplier: 3,
  },
  arms: {
    tierRisk: 1.0, // high-heat premium tier
    sourceRegion: 'north-america',
    distanceElasticity: 2.5,
    bustHeatMultiplier: 5,
  },
};

export const PRODUCTS: readonly ProductConfig[] = PRODUCT_PRICE_BANDS.map(
  (band) => ({
    id: band.id,
    name: band.name,
    price: band.price,
    heatPerUnit: band.heatPerUnit,
    ...PRODUCT_META[band.id],
  }),
);

const PRODUCT_BY_ID: ReadonlyMap<ProductId, ProductConfig> = new Map(
  PRODUCTS.map((p) => [p.id, p]),
);

/**
 * Resolve a product config, throwing on an unknown id (closed union guard).
 * Pass an alternate `table` (e.g. `state.config.products.PRODUCTS`) to resolve
 * against an injected tuning (Prompt 26).
 */
export function getProduct(
  id: ProductId,
  table: readonly ProductConfig[] = PRODUCTS,
): ProductConfig {
  const product =
    table === PRODUCTS ? PRODUCT_BY_ID.get(id) : table.find((p) => p.id === id);
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
