/**
 * Country roster + product price bands — the economy's spawn data (design/01
 * §0a, §2, §2a). These are v1 tuning HYPOTHESES held as config, never scattered
 * literals (prompts/README.md "Config, not literals").
 *
 * Prices are real dollars per kg (per unit for arms), compiled from the design
 * economy table (design/01 §2). A product's `buy`/`sell` band is the run's spawn
 * range; a country's per-product `priceMultipliers` bias WHERE inside that band
 * this market lands — world generation clamps back into the band so a resolved
 * price never leaves its documented range (design/01 §2a).
 */

export type ProductId = 'weed' | 'synthetics' | 'cocaine' | 'arms';

/** An inclusive `[min, max]` numeric range. */
export interface Band {
  readonly min: number;
  readonly max: number;
}

export interface ProductPriceBand {
  readonly id: ProductId;
  readonly name: string;
  /** Source buy price band, $/unit. */
  readonly buy: Band;
  /** Wholesale sell price band, $/unit. */
  readonly sell: Band;
  /** Heat generated per unit moved (design/01 §2). */
  readonly heatPerUnit: number;
}

/** Canonical real-dollar price bands (design/01 §2 — single source of truth). */
export const PRODUCT_PRICE_BANDS: readonly ProductPriceBand[] = [
  {
    id: 'weed',
    name: 'Weed',
    buy: { min: 700, max: 1500 },
    sell: { min: 1200, max: 2500 },
    heatPerUnit: 0.1,
  },
  {
    id: 'synthetics',
    name: 'Synthetics',
    buy: { min: 2000, max: 5000 },
    sell: { min: 10000, max: 30000 },
    heatPerUnit: 0.4,
  },
  {
    id: 'cocaine',
    name: 'Cocaine',
    buy: { min: 1500, max: 3000 },
    sell: { min: 20000, max: 60000 },
    heatPerUnit: 1.0,
  },
  {
    id: 'arms',
    name: 'Arms',
    buy: { min: 500, max: 2000 },
    sell: { min: 750, max: 4000 },
    heatPerUnit: 2.5,
  },
] as const;

export const PRODUCT_IDS: readonly ProductId[] = PRODUCT_PRICE_BANDS.map((p) => p.id);

export interface CountryConfig {
  readonly id: string;
  readonly name: string;
  /** Starting dirty-cash band (design/01 §0a). Min stays comfortably above the
   * cheapest product so no country can spawn dead-on-arrival (design/01 §8.7). */
  readonly startingCash: Band;
  /** Baseline heat carried at run start (design/01 §4). */
  readonly heatBaseline: number;
  /** Baseline port protection 0..1 (higher = safer shipments). */
  readonly portProtectionBaseline: number;
  /** Per-product multiplier band applied to the price bands, then clamped. */
  readonly priceMultipliers: Readonly<Record<ProductId, Band>>;
  /** Shown-to-player opening story hooks (design/01 §0a — no hidden traps). */
  readonly openingHooks: readonly string[];
}

// Multiplier convention: <1 biases a market cheap, >1 biases it expensive. Bands
// are kept modest so clamping into the price band never collapses to a point.
const CHEAP: Band = { min: 0.75, max: 0.9 };
const NEUTRAL: Band = { min: 0.9, max: 1.1 };
const DEAR: Band = { min: 1.1, max: 1.3 };

export const COUNTRIES: readonly CountryConfig[] = [
  {
    id: 'san-cristo',
    name: 'San Cristo',
    startingCash: { min: 4000, max: 7000 },
    heatBaseline: 8,
    portProtectionBaseline: 0.35,
    priceMultipliers: {
      weed: NEUTRAL,
      synthetics: NEUTRAL,
      cocaine: CHEAP, // transshipment hub — coke arrives cheap
      arms: NEUTRAL,
    },
    openingHooks: [
      'A transshipment hub — coke moves through here cheap, but the DEA knows it too.',
      'A dock foreman owes your late cousin a favor.',
    ],
  },
  {
    id: 'puerto-verde',
    name: 'Puerto Verde',
    startingCash: { min: 5000, max: 9000 },
    heatBaseline: 5,
    portProtectionBaseline: 0.45,
    priceMultipliers: {
      weed: CHEAP, // green hills — weed grows local
      synthetics: DEAR,
      cocaine: NEUTRAL,
      arms: NEUTRAL,
    },
    openingHooks: [
      'The hills grow green — weed is cheap and plentiful to start.',
      'The local police captain is bored, underpaid, and reasonable.',
    ],
  },
  {
    id: 'marigot-bay',
    name: 'Marigot Bay',
    startingCash: { min: 6000, max: 10000 },
    heatBaseline: 4,
    portProtectionBaseline: 0.6,
    priceMultipliers: {
      weed: DEAR,
      synthetics: DEAR,
      cocaine: DEAR, // resort money — everything costs, but it's calm
      arms: DEAR,
    },
    openingHooks: [
      'Tourist money everywhere — prices run high, but the heat runs low.',
      'A resort accountant is looking for someone to move quiet cash.',
    ],
  },
  {
    id: 'port-lazaro',
    name: 'Port Lazaro',
    startingCash: { min: 3500, max: 6500 },
    heatBaseline: 14,
    portProtectionBaseline: 0.2,
    priceMultipliers: {
      weed: NEUTRAL,
      synthetics: CHEAP,
      cocaine: NEUTRAL,
      arms: CHEAP, // lawless free port — the Iron River runs through it
    },
    openingHooks: [
      'A lawless free port — arms are cheap, but the streets are hot.',
      'An arms broker will front you a crate on your name alone. For now.',
    ],
  },
] as const;
