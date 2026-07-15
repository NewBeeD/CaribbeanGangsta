/**
 * Production roster — grow-ops (weed & strains) and drug factories (Ideas2 item 3;
 * Prompt 39). This is the "become a supplier" layer: where FRONTS turn time into
 * clean cash (config/fronts.ts), production turns time into PRODUCT UNITS deposited
 * into a stash. Same idle spine, same offline-freeze guarantee — product accrues on
 * ACTIVE ticks only (engine/production.ts), so absence forgoes yield but never
 * seizes it (GDD §6).
 *
 * These are v1 balance HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"; Prompt 26 centralizes). Every rate,
 * buy-in, and heat figure here is SHOWN in-game (estimable-but-fair, design/01
 * §0.3): the units/hr the Production screen displays is the number the engine
 * deposits.
 *
 * Two kinds share one shape (they run on the identical yield tick):
 *  - `grow`    — cultivate a plant product (weed / the premium `exotic` strain).
 *                STRAINS are grow-ops that differ in BOTH yield (`unitsPerHourPerLevel`)
 *                AND profit — the premium strain grows the high-value `exotic` line
 *                (config/countries.ts price band), so "more profit" falls out of the
 *                EXISTING one-price economy, no bespoke pricing math (design/12 Item 3).
 *                Grown weed still feeds `press-hash` exactly as today (conversions.ts).
 *  - `factory` — COOK a manufactured product (crack / meth / pills) at a steeper
 *                buy-in and much higher heat. Its output is bulk supply you sell
 *                INTO markets (or feed to the corners), so you become a supplier
 *                rather than only a buyer.
 *
 * Money is the only gate (Ideas.md — Drug Lord 2 open access): every op is offered
 * from minute one; the steep buy-in (and heat) is the limiter, never a flag. Each op
 * is buyable ONCE (single-buy, like the fixed front roster — Ideas2 item 1), then
 * upgrade-only along the unchanged `buy_in × 1.15^level` curve.
 */

import type { ProductId } from './countries';

export type ProductionKind = 'grow' | 'factory';

export type ProductionOpId =
  // Grow-ops — weed and its premium strain (the "different strains for more profit").
  | 'backyard-grow'
  | 'hydro-farm'
  | 'exotic-greenhouse'
  // Factories — cooked product, higher buy-in and heat (become a supplier).
  | 'crack-lab'
  | 'meth-superlab'
  | 'pill-press';

export interface ProductionOpConfig {
  readonly id: ProductionOpId;
  readonly name: string;
  readonly kind: ProductionKind;
  /** The product deposited into the stash each tick (a `ProductId`). */
  readonly product: ProductId;
  /** Buy-in for a Level-1 op, paid from CLEAN cash (production is a clean-cash sink). */
  readonly buyIn: number;
  /**
   * Product units produced per real hour **per level** (design/01 §3a idle spine).
   * An op's yield is `unitsPerHourPerLevel × level`, lifted by any assigned-
   * lieutenant delegation bonus (engine/production.ts). Shown in-game.
   */
  readonly unitsPerHourPerLevel: number;
  /** Passive heat added per online hour while the op runs (a grow/lab has a smell). */
  readonly heatPerHour: number;
  /** One-line disclosed flavor shown on the Production screen (never a hidden trap). */
  readonly blurb: string;
}

/** Levels run 1–5 for every op — the same cap as fronts (design/01 §3a). */
export const PRODUCTION_MAX_LEVEL = 5;

/** Each level up costs 15% more than the last — the classic idle geometric curve. */
export const PRODUCTION_COST_GROWTH = 1.15;

/**
 * The fixed production roster (Ideas2 item 3), ordered by buy-in. Grow-ops first
 * (cheap, low heat), factories second (steep, hot). Rates/buy-ins are v1
 * HYPOTHESES — retune against the Prompt 25 batch sim.
 *
 * Strain design (yield AND profit, all disclosed):
 *  - `backyard-grow`     grows cheap `weed` fast — the broke player's first op.
 *  - `hydro-farm`        grows far MORE `weed`/hr — pure mass at a higher buy-in.
 *  - `exotic-greenhouse` grows the premium `exotic` strain: fewer units/hr, but
 *                        each unit sells for multiples of weed (the profit lever).
 */
export const PRODUCTION_OPS: readonly ProductionOpConfig[] = [
  {
    id: 'backyard-grow',
    name: 'Backyard Grow',
    kind: 'grow',
    product: 'weed',
    buyIn: 3_000,
    unitsPerHourPerLevel: 0.8,
    heatPerHour: 0.05,
    blurb: 'A few lights in a back room. Cheap green, and plenty of it.',
  },
  {
    id: 'hydro-farm',
    name: 'Hydroponic Farm',
    kind: 'grow',
    product: 'weed',
    buyIn: 12_000,
    unitsPerHourPerLevel: 2.0,
    heatPerHour: 0.15,
    blurb: 'Racks, nutrients, and timers — serious weight of weed every day.',
  },
  {
    id: 'exotic-greenhouse',
    name: 'Exotic Greenhouse',
    kind: 'grow',
    product: 'exotic',
    buyIn: 40_000,
    unitsPerHourPerLevel: 1.2,
    heatPerHour: 0.25,
    blurb: 'Boutique high-THC strains. Slower to grow, but the buyers pay a premium.',
  },
  {
    id: 'crack-lab',
    name: 'Crack Lab',
    kind: 'factory',
    product: 'crack',
    buyIn: 60_000,
    unitsPerHourPerLevel: 2.5,
    heatPerHour: 0.5,
    blurb: 'A stove that never cools, cooking rock for the corners.',
  },
  {
    id: 'pill-press',
    name: 'Pill Press',
    kind: 'factory',
    product: 'pills',
    buyIn: 90_000,
    unitsPerHourPerLevel: 3.0,
    heatPerHour: 0.6,
    blurb: 'Binders, dyes, a stolen die set — pressing product by the thousand.',
  },
  {
    id: 'meth-superlab',
    name: 'Meth Superlab',
    kind: 'factory',
    product: 'meth',
    buyIn: 120_000,
    unitsPerHourPerLevel: 2.0,
    heatPerHour: 0.9,
    blurb: 'Industrial glassware in the desert. The purest product — and the hottest.',
  },
] as const;

const OP_BY_ID: ReadonlyMap<ProductionOpId, ProductionOpConfig> = new Map(
  PRODUCTION_OPS.map((o) => [o.id, o]),
);

/**
 * Resolve a production-op config, throwing on an unknown id (closed-union guard).
 * Pass an alternate `ops` (e.g. `state.config.production.PRODUCTION_OPS`) to
 * resolve against an injected tuning (Prompt 26).
 */
export function getProductionOp(
  id: ProductionOpId,
  ops: readonly ProductionOpConfig[] = PRODUCTION_OPS,
): ProductionOpConfig {
  const cfg = ops === PRODUCTION_OPS ? OP_BY_ID.get(id) : ops.find((o) => o.id === id);
  if (!cfg) throw new Error(`getProductionOp(): unknown production op "${id}"`);
  return cfg;
}

/**
 * Cost to raise an op from `level` → `level + 1`: `buy_in × 1.15^level` (design/01
 * §3). Mirrors `frontUpgradeCost` — a next affordable step always in reach (design/01
 * §0.4). `tuning` injects an alternate roster/growth (`state.config.production`).
 */
export function productionUpgradeCost(
  id: ProductionOpId,
  level: number,
  tuning?: {
    readonly PRODUCTION_OPS?: readonly ProductionOpConfig[];
    readonly PRODUCTION_COST_GROWTH?: number;
  },
): number {
  const buyIn = getProductionOp(id, tuning?.PRODUCTION_OPS ?? PRODUCTION_OPS).buyIn;
  const growth = tuning?.PRODUCTION_COST_GROWTH ?? PRODUCTION_COST_GROWTH;
  return Math.round(buyIn * Math.pow(growth, level));
}
