/**
 * Country roster + product price bands — the economy's spawn data (design/01
 * §0a, §2, §2a; design/11 — regional markets). These are v1 tuning HYPOTHESES
 * held as config, never scattered literals (prompts/README.md "Config, not
 * literals").
 *
 * Ideas2.md expansion (design/11):
 *  - **Every country is a market.** A country's `traded` list is its regional
 *    drug culture — meth/fentanyl/pills don't sell in the Caribbean; they live in
 *    the big continental markets (Ideas2 §5). Prices for every country are always
 *    VISIBLE (fairness — no concealed markets); `traded` only bounds where a deal
 *    can execute.
 *  - **Sources & plugs** (Ideas2 §2): a country with `plugFor` products is a TRUE
 *    SOURCE (Colombia coke, Mexico meth/fentanyl, Golden Crescent heroin/hash).
 *    Buying those products there requires the plug — a one-time cash intro
 *    (`plugCost`). Money is the only gate (Ideas.md open access): the plug is
 *    buyable from minute one if you can pay; no time/flag gate. Plug prices are
 *    the cheapest standing prices in the game (`plugPriceFactor` off the board).
 *  - **Geography is the margin engine**: a product's sell price stretches with
 *    the REGION distance from its source region (see `REGION_DISTANCE` +
 *    per-product elasticity in config/products.ts) — the mechanical reason
 *    moving product toward Miami/Europe reads as a paradigm shift (design/01 §2).
 *
 * Prices are real dollars per kg (per unit for arms), compiled from the design
 * economy table (design/01 §2) and extended for the Ideas2 roster. A product's
 * `buy`/`sell` band is the run's spawn range for the global source board; where a
 * market lands around that board is the country's `costBias`/`demandBias`
 * (resolved per run into the supplier geography) and fixed `productBias` flavor.
 */

export type ProductId =
  | 'weed'
  | 'exotic'
  | 'hash'
  | 'synthetics'
  | 'cocaine'
  | 'crack'
  | 'meth'
  | 'heroin'
  | 'fentanyl'
  | 'pills'
  | 'arms';

/** An inclusive `[min, max]` numeric range. */
export interface Band {
  readonly min: number;
  readonly max: number;
}

// --- Regions (design/11 §1) ---------------------------------------------------

/** The world's trade regions. Countries live in one; products source from one. */
export type Region =
  | 'caribbean'
  | 'latin-america'
  | 'north-america'
  | 'europe'
  | 'asia';

/**
 * Region-to-region trade distance, 0..1 — the geographic input to the margin
 * engine. A product's sell price at a country stretches with the distance from
 * the product's source region to the country's region (config/products.ts
 * elasticities). Symmetric; same-region distance is 0.
 */
export const REGION_DISTANCE: Readonly<
  Record<Region, Readonly<Record<Region, number>>>
> = {
  caribbean: {
    caribbean: 0,
    'latin-america': 0.25,
    'north-america': 0.35,
    europe: 0.75,
    asia: 1.0,
  },
  'latin-america': {
    caribbean: 0.25,
    'latin-america': 0,
    'north-america': 0.4,
    europe: 0.85,
    asia: 1.0,
  },
  'north-america': {
    caribbean: 0.35,
    'latin-america': 0.4,
    'north-america': 0,
    europe: 0.7,
    asia: 0.9,
  },
  europe: {
    caribbean: 0.75,
    'latin-america': 0.85,
    'north-america': 0.7,
    europe: 0,
    asia: 0.6,
  },
  asia: {
    caribbean: 1.0,
    'latin-america': 1.0,
    'north-america': 0.9,
    europe: 0.6,
    asia: 0,
  },
} as const;

export interface ProductPriceBand {
  readonly id: ProductId;
  readonly name: string;
  /** Source buy price band, $/unit. */
  readonly buy: Band;
  /** Wholesale sell price band at the source region, $/unit. */
  readonly sell: Band;
  /** Heat generated per unit moved (design/01 §2). */
  readonly heatPerUnit: number;
}

/** Canonical real-dollar price bands (design/01 §2; design/11 — single source of truth). */
export const PRODUCT_PRICE_BANDS: readonly ProductPriceBand[] = [
  {
    id: 'weed',
    name: 'Weed',
    buy: { min: 700, max: 1500 },
    sell: { min: 1200, max: 2500 },
    heatPerUnit: 0.1,
  },
  {
    // The premium high-THC line (Ideas2 §5). Its shelf name is a per-run strain
    // draw (world.exoticStrain) so the market reads fresh every run.
    id: 'exotic',
    name: 'Exotic',
    buy: { min: 2500, max: 6000 },
    sell: { min: 6000, max: 14000 },
    heatPerUnit: 0.15,
  },
  {
    // Pressed/converted from weed (config/conversions.ts) or bought at the
    // Golden Crescent source (Ideas2 §4).
    id: 'hash',
    name: 'Hash',
    buy: { min: 800, max: 2000 },
    sell: { min: 6000, max: 14000 },
    heatPerUnit: 0.15,
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
    // Cooked from cocaine (config/conversions.ts; Ideas2 §4). A unit is a
    // quarter of a coke unit (1 coke cooks into 4 crack), so the bands sit at
    // roughly a quarter of coke's — the cook's value-add shows in the yield,
    // and the cooked key draws more total heat than the raw one.
    id: 'crack',
    name: 'Crack',
    buy: { min: 600, max: 1200 },
    sell: { min: 8000, max: 22500 },
    heatPerUnit: 0.35,
  },
  {
    id: 'meth',
    name: 'Meth',
    buy: { min: 800, max: 2000 },
    sell: { min: 8000, max: 25000 },
    heatPerUnit: 0.8,
  },
  {
    id: 'heroin',
    name: 'Heroin',
    buy: { min: 2500, max: 6000 },
    sell: { min: 25000, max: 70000 },
    heatPerUnit: 1.2,
  },
  {
    id: 'fentanyl',
    name: 'Fentanyl',
    buy: { min: 3000, max: 8000 },
    sell: { min: 40000, max: 120000 },
    heatPerUnit: 2.0,
  },
  {
    id: 'pills',
    name: 'Pills',
    buy: { min: 1500, max: 4000 },
    sell: { min: 8000, max: 20000 },
    heatPerUnit: 0.5,
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
  readonly region: Region;
  /** Whether a run can START here. Only the Caribbean home islands qualify. */
  readonly startEligible: boolean;
  /**
   * Baseline seizure exposure of dealing in this market, 0..1 — one input to the
   * displayed bust probability (design/01 §2; replaces the old abstract
   * route-leg risk).
   */
  readonly risk: number;
  /** Starting dirty-cash band (design/01 §0a). Min stays comfortably above the
   * cheapest product so no country can spawn dead-on-arrival (design/01 §8.7). */
  readonly startingCash: Band;
  /** Baseline heat carried at run start (design/01 §4). */
  readonly heatBaseline: number;
  /** Baseline port protection 0..1 (higher = safer shipments). */
  readonly portProtectionBaseline: number;
  /**
   * The products that TRADE here (Ideas2 §5 — regional drug cultures). Prices
   * elsewhere are still visible; deals only execute where the product trades.
   */
  readonly traded: readonly ProductId[];
  /** Per-run buy-side bias band (resolved into supplierGeography.costFactor). */
  readonly costBias: Band;
  /** Per-run sell-side bias band (resolved into supplierGeography.demandFactor). */
  readonly demandBias: Band;
  /** Fixed per-product flavor multiplier on BOTH sides (e.g. weed cheap in the
   * green hills). Absent products are neutral (×1). */
  readonly productBias?: Partial<Readonly<Record<ProductId, number>>>;
  /** Products this country is the TRUE SOURCE of (Ideas2 §2). Buying them here
   * requires the plug; with it, they trade at the cheapest standing price. */
  readonly plugFor?: readonly ProductId[];
  /** One-time cash intro to establish the plug (money is the only gate). */
  readonly plugCost?: number;
  /** Plug buy price = board buy × this factor — the cheapest standing price. */
  readonly plugPriceFactor?: number;
  /** Shown-to-player opening story hooks (design/01 §0a — no hidden traps). */
  readonly openingHooks: readonly string[];
}

/** The Caribbean regional drug culture: what moves on the islands (Ideas2 §5). */
const CARIBBEAN_TRADED: readonly ProductId[] = [
  'weed',
  'exotic',
  'hash',
  'synthetics',
  'cocaine',
  'crack',
  'arms',
];

export const COUNTRIES: readonly CountryConfig[] = [
  // --- The Caribbean home islands (start-eligible) ---------------------------
  {
    id: 'san-cristo',
    name: 'San Cristo',
    region: 'caribbean',
    startEligible: true,
    risk: 0.25,
    startingCash: { min: 4000, max: 7000 },
    heatBaseline: 8,
    portProtectionBaseline: 0.35,
    traded: CARIBBEAN_TRADED,
    costBias: { min: 0.85, max: 1.1 },
    demandBias: { min: 0.85, max: 1.1 },
    productBias: { cocaine: 0.85 }, // transshipment hub — coke arrives cheap
    openingHooks: [
      'A transshipment hub — coke moves through here cheap, but the DEA knows it too.',
      'A dock foreman owes your late cousin a favor.',
    ],
  },
  {
    id: 'puerto-verde',
    name: 'Puerto Verde',
    region: 'caribbean',
    startEligible: true,
    risk: 0.2,
    startingCash: { min: 5000, max: 9000 },
    heatBaseline: 5,
    portProtectionBaseline: 0.45,
    traded: CARIBBEAN_TRADED,
    costBias: { min: 0.85, max: 1.1 },
    demandBias: { min: 0.85, max: 1.1 },
    productBias: { weed: 0.8, exotic: 0.85 }, // green hills — weed grows local
    openingHooks: [
      'The hills grow green — weed is cheap and plentiful to start.',
      'The local police captain is bored, underpaid, and reasonable.',
    ],
  },
  {
    id: 'marigot-bay',
    name: 'Marigot Bay',
    region: 'caribbean',
    startEligible: true,
    risk: 0.15,
    startingCash: { min: 6000, max: 10000 },
    heatBaseline: 4,
    portProtectionBaseline: 0.6,
    traded: CARIBBEAN_TRADED,
    costBias: { min: 1.0, max: 1.25 }, // resort money — everything costs
    demandBias: { min: 1.0, max: 1.25 }, // …but the tourists pay for it
    openingHooks: [
      'Tourist money everywhere — prices run high, but the heat runs low.',
      'A resort accountant is looking for someone to move quiet cash.',
    ],
  },
  {
    id: 'port-lazaro',
    name: 'Port Lazaro',
    region: 'caribbean',
    startEligible: true,
    risk: 0.35,
    startingCash: { min: 3500, max: 6500 },
    heatBaseline: 14,
    portProtectionBaseline: 0.2,
    traded: CARIBBEAN_TRADED,
    costBias: { min: 0.8, max: 1.0 },
    demandBias: { min: 0.85, max: 1.1 },
    productBias: { arms: 0.75, synthetics: 0.85 }, // the Iron River runs through it
    openingHooks: [
      'A lawless free port — arms are cheap, but the streets are hot.',
      'An arms broker will front you a crate on your name alone. For now.',
    ],
  },

  // --- The wider world (Ideas2 §2/§5) — reachable, never start-eligible ------
  {
    id: 'colombia',
    name: 'Colombia',
    region: 'latin-america',
    startEligible: false,
    risk: 0.35,
    startingCash: { min: 5000, max: 8000 },
    heatBaseline: 12,
    portProtectionBaseline: 0.3,
    traded: ['weed', 'exotic', 'cocaine', 'arms'],
    costBias: { min: 0.7, max: 0.9 },
    demandBias: { min: 0.7, max: 0.9 },
    plugFor: ['cocaine'],
    plugCost: 220_000,
    plugPriceFactor: 0.55,
    openingHooks: [
      'The true source. Nobody buys off the cartel without an introduction — and introductions cost.',
      'With the plug, kilos move at prices the islands only whisper about.',
    ],
  },
  {
    id: 'mexico',
    name: 'Mexico',
    region: 'latin-america',
    startEligible: false,
    risk: 0.45,
    startingCash: { min: 5000, max: 8000 },
    heatBaseline: 16,
    portProtectionBaseline: 0.25,
    traded: ['weed', 'cocaine', 'meth', 'heroin', 'fentanyl', 'arms'],
    costBias: { min: 0.7, max: 0.95 },
    demandBias: { min: 0.75, max: 0.95 },
    productBias: { meth: 0.85 }, // superlab country
    plugFor: ['cocaine', 'meth', 'fentanyl'],
    plugCost: 300_000,
    plugPriceFactor: 0.65,
    openingHooks: [
      'Superlab country — meth and fentanyl at the source, coke on the same trucks.',
      'The plaza bosses take a meeting fee. After that, the price list changes.',
    ],
  },
  {
    id: 'miami',
    name: 'Miami',
    region: 'north-america',
    startEligible: false,
    risk: 0.55,
    startingCash: { min: 8000, max: 12000 },
    heatBaseline: 20,
    portProtectionBaseline: 0.4,
    traded: [...PRODUCT_IDS], // the demand sink — everything moves here
    costBias: { min: 1.1, max: 1.35 },
    demandBias: { min: 1.3, max: 1.6 },
    openingHooks: [
      'The demand sink — everything sells here, at numbers that make the islands look like pocket change.',
      'The DEA works Miami like a second job. Margins this wide are never quiet.',
    ],
  },
  {
    id: 'rotterdam',
    name: 'Rotterdam',
    region: 'europe',
    startEligible: false,
    risk: 0.4,
    startingCash: { min: 7000, max: 11000 },
    heatBaseline: 10,
    portProtectionBaseline: 0.45,
    traded: ['weed', 'hash', 'synthetics', 'cocaine', 'heroin', 'pills'],
    costBias: { min: 1.0, max: 1.25 },
    demandBias: { min: 1.25, max: 1.5 },
    productBias: { hash: 0.9 },
    plugFor: ['synthetics'],
    plugCost: 150_000,
    plugPriceFactor: 0.6,
    openingHooks: [
      'Europe pays continental prices — the longest route in the game, and the widest coke margin.',
      'The lab scene here IS the synthetics source. The plug is a chemist, not a cartel.',
    ],
  },
  {
    id: 'golden-crescent',
    name: 'Golden Crescent',
    region: 'asia',
    startEligible: false,
    risk: 0.5,
    startingCash: { min: 4000, max: 7000 },
    heatBaseline: 15,
    portProtectionBaseline: 0.2,
    traded: ['hash', 'heroin', 'arms'],
    costBias: { min: 0.65, max: 0.85 },
    demandBias: { min: 0.65, max: 0.85 },
    plugFor: ['heroin', 'hash'],
    plugCost: 180_000,
    plugPriceFactor: 0.55,
    openingHooks: [
      'Heroin and hash at the wellhead — half a world from your buyers.',
      'The brokers here deal in trust and cash, in that order.',
    ],
  },
] as const;

export const COUNTRY_IDS: readonly string[] = COUNTRIES.map((c) => c.id);

/** The start-eligible roster (the Caribbean home islands). */
export const START_COUNTRIES: readonly CountryConfig[] = COUNTRIES.filter(
  (c) => c.startEligible,
);

const COUNTRY_BY_ID: ReadonlyMap<string, CountryConfig> = new Map(
  COUNTRIES.map((c) => [c.id, c]),
);

/** Resolve a country config, throwing on an unknown id (closed-roster guard). */
export function getCountry(id: string): CountryConfig {
  const country = COUNTRY_BY_ID.get(id);
  if (!country) throw new Error(`getCountry(): unknown country "${id}"`);
  return country;
}

/** Look up a country config without throwing (for legacy/foreign stash ids). */
export function findCountry(id: string): CountryConfig | undefined {
  return COUNTRY_BY_ID.get(id);
}

/** Whether `product` trades at `countryId` (Ideas2 §5 regional cultures). */
export function isTraded(countryId: string, product: ProductId): boolean {
  return findCountry(countryId)?.traded.includes(product) ?? false;
}

/** Whether buying `product` at this country requires the plug (a true source). */
export function requiresPlug(countryId: string, product: ProductId): boolean {
  return findCountry(countryId)?.plugFor?.includes(product) ?? false;
}
