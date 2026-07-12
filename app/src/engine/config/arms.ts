/**
 * Arms trade config — weapon tiers, the broker intro, and the pricing/heat/risk
 * tuning of the game's most dangerous market (design/12 Item 1; Prompt 35).
 *
 * Real-market grounding (design/12 Item 1). The trade runs on BROKERS, not
 * shelves: licensed grey-market dealers divert surplus state stock on forged
 * end-user certificates (EUCs — paper is the product, which is why a Customs
 * Chief matters, corruption.ts). The Caribbean/Latin corridor is the "Iron
 * River" — straw-purchased US guns flowing south — so arms SOURCE from
 * `north-america` and the base margin is thin. The money is DEMAND-DRIVEN:
 * coups, gang wars, and embargoes (the item-6 event system, as arms `MarketEvent`s)
 * spike prices far harder than any drug ever moves. An AK near a surplus
 * stockpile is $500–800; under embargo it clears $2,000–5,000+.
 *
 * Open access (Ideas.md; the [[open-access-design]] rule): the Broker intro is a
 * PURE MONEY gate — a plug-style one-time cash meeting (`ARMS_BROKER_COST`),
 * offered and priced from minute one, never a time/level/flag lock. A fresh run
 * simply can't afford $2.5M yet.
 *
 * Every number here is a v1 balance HYPOTHESIS held as config, never a scattered
 * literal (prompts/README.md "Config, not literals"; Prompt 26 centralizes — the
 * live values are read from `state.config.arms`). These tune TOGETHER with the
 * one-price economy (Prompt 32) and the corruption retainers (Prompt 36) — the
 * balancing note in design/12.
 */

import type { Band, Region } from './countries';

/** The weapon tiers sold on the Arms page — categories, not one SKU (design/12
 * Item 1). Rising price bands and the heaviest heat in the game (2.5 → 6.0;
 * the drug max is fentanyl at 2.0). NOT `ProductId`s — arms hold their own
 * armory keyed by these ids. */
export type WeaponTierId = 'pistols' | 'rifles' | 'automatic' | 'military';

export interface WeaponTierConfig {
  readonly id: WeaponTierId;
  readonly name: string;
  /** Per-run source price band, $/unit AT THE SOURCE REGION (the Iron River origin). */
  readonly price: Band;
  /** Heat generated per unit moved — the heaviest in the game (design/12 Item 1). */
  readonly heatPerUnit: number;
  /** Tier contribution to the arms bust probability, 0..1. */
  readonly tierRisk: number;
  /** One-line shelf blurb (shown on the Arms page). */
  readonly blurb: string;
}

/** The tier table (design/12 Item 1 — pistols → military, rising price + heat). */
export const WEAPON_TIERS: readonly WeaponTierConfig[] = [
  {
    id: 'pistols',
    name: 'Pistols',
    price: { min: 400, max: 900 },
    heatPerUnit: 2.5,
    tierRisk: 0.5,
    blurb: 'Straw-bought handguns off the Iron River. Cheap, quiet, everywhere.',
  },
  {
    id: 'rifles',
    name: 'Rifles',
    price: { min: 900, max: 2200 },
    heatPerUnit: 3.5,
    tierRisk: 0.65,
    blurb: 'Semi-auto long guns. Sport-store paper, cartel demand.',
  },
  {
    id: 'automatic',
    name: 'Automatic',
    price: { min: 2500, max: 5000 },
    heatPerUnit: 4.5,
    tierRisk: 0.8,
    blurb: 'Full-auto conversions and imports. The DEA and ATF both want you.',
  },
  {
    id: 'military',
    name: 'Military-grade',
    price: { min: 8000, max: 20000 },
    heatPerUnit: 6.0,
    tierRisk: 1.0,
    blurb: 'Crates off a diverted manifest — launchers, belt-feds. War-zone money.',
  },
] as const;

export const WEAPON_TIER_IDS: readonly WeaponTierId[] = WEAPON_TIERS.map((t) => t.id);

const TIER_BY_ID: ReadonlyMap<WeaponTierId, WeaponTierConfig> = new Map(
  WEAPON_TIERS.map((t) => [t.id, t]),
);

/** Resolve a weapon-tier config, throwing on an unknown id (closed-roster guard).
 * Pass an alternate `table` (e.g. `state.config.arms.WEAPON_TIERS`) for an
 * injected tuning (Prompt 26). */
export function getWeaponTier(
  id: WeaponTierId,
  table: readonly WeaponTierConfig[] = WEAPON_TIERS,
): WeaponTierConfig {
  const tier = table === WEAPON_TIERS ? TIER_BY_ID.get(id) : table.find((t) => t.id === id);
  if (!tier) throw new Error(`getWeaponTier(): unknown weapon tier "${id}"`);
  return tier;
}

// --- The Broker intro (design/12 Item 1 — a pure money gate) -------------------

/** One-time clean-cash intro to open the Arms page's trade (design/12 Item 1).
 * "The broker takes meetings at two and a half." A money gate, buyable from
 * minute one if you can pay — never a progression flag. */
export const ARMS_BROKER_COST = 2_500_000;

/** Heat the broker meeting itself generates (shown before commit — fairness).
 * The DEA watches who buys their way into this room; it's a big, one-time spike. */
export const ARMS_BROKER_HEAT = 15;

// --- Geography (the Iron River — design/12 Item 1) ----------------------------

/** Arms source region: straw-purchased US guns flowing south (the Iron River). */
export const ARMS_SOURCE_REGION: Region = 'north-america';

/** How the base arms price stretches with region distance from the source —
 * compound `(1 + this)^distance`, deliberately MODEST: arms sit near-flat at
 * low margin, and the money is in conflict events, not geography (Item 1). */
export const ARMS_DISTANCE_ELASTICITY = 1.6;

// --- Live market: drift + finite stock (mirrors design/12 Item 10) ------------

/** Per-tier price swing band amplitude — small, so arms read flat between
 * conflicts (the conflict event is the swing, not the drift). */
export const ARMS_VOLATILITY = 0.12;

/** Stock seed band per arms market, scaled by the country's demand character —
 * arms move in smaller counts than kilos, so the pools are shallow. */
export const ARMS_STOCK_SEED_BAND: Band = { min: 40, max: 120 };

/** Units an arms market re-ups per ACTIVE in-game day (design/12 Item 10 —
 * frozen offline). */
export const ARMS_RESTOCK_PER_DAY = 20;

/** Fraction of a sale's units that re-enter the market pool (goods circulate). */
export const ARMS_SELL_RESTOCK_FRACTION = 0.25;

/** How hard a drained pool biases the drift up (scarcity pricing — Item 10). */
export const ARMS_SCARCITY_PRICE_WEIGHT = 0.15;

// --- Heat & seizure (the heaviest-risk market — design/12 Item 1) -------------

/** Fraction of a unit's move heat that a BUY carries (a sale carries the full
 * `heatPerUnit`; a buy is quieter, like the drug loop's `BUY_HEAT_FACTOR`). */
export const ARMS_BUY_HEAT_FACTOR = 0.5;

/** Selling into a CONFLICT SPIKE (an up-event covering the market) adds bonus
 * heat = `qty × tier.heatPerUnit × this` — the risk/reward the player asked for
 * (design/12 Item 1: war-zone money is loud money). */
export const ARMS_CONFLICT_HEAT_MULT = 0.5;

// --- Bust probability on an arms sale (its own model, arms are riskier) -------
// Same fairness law as the drug loop (design/01 §0.3): the number shown is the
// number rolled. The Customs Chief's EUC paper is the one relief (Item 1/13).

export const ARMS_BUST_BASE = 0.05;
export const ARMS_BUST_HEAT_WEIGHT = 0.2;
export const ARMS_BUST_LOCATION_WEIGHT = 0.15;
export const ARMS_BUST_TIER_WEIGHT = 0.2;
export const ARMS_BUST_QTY_WEIGHT = 0.15;
/** Units at which the quantity term maxes out (arms move small — Item 1). */
export const ARMS_BUST_QTY_FULL_RISK = 20;
export const ARMS_BUST_MIN = 0.02;
/** Higher ceiling than the drug loop — arms are the most dangerous trade. */
export const ARMS_BUST_MAX = 0.6;

/** Heat multiplier on a busted arms sale (`qty × heatPerUnit × this`) — a
 * seizure this size makes noise. */
export const ARMS_BUST_HEAT_MULT = 2;

/** How much a paid, un-flipped Customs Chief cuts the arms seizure odds — the
 * EUC paperwork tie-in (design/12 Item 1: paper is the product; corruption.ts
 * `hasCustomsProtection`). A flat reduction on the shown-and-rolled bust %. */
export const ARMS_CUSTOMS_SEIZURE_RELIEF = 0.15;
