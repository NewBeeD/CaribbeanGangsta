/**
 * Product conversion recipes (Ideas2 §4; design/11 §4) — cook cocaine into
 * crack, press weed into hash. A conversion is street work done AT a stash: it
 * consumes held units + a small dirty-cash batch cost, yields the derived
 * product into the same stash, and generates a little heat (a kitchen has a
 * smell). All v1 tuning HYPOTHESES held as config (prompts/README.md "Config,
 * not literals"; Prompt 26 centralizes).
 *
 * The economics are a deliberate trade-off, not free money. Pressing hash adds
 * value over selling the weed raw at the cost of more heat per unit. Cooking
 * crack is the opposite bargain (design/12 Item 5): the recipe barely breaks
 * even on price (real ratio — crack ≈ half powder per gram), so its value isn't
 * the number; it's that the rocks go to the CREW to sell on the corners over
 * time (`toStreet`; `street.ts`), turning bulk seizure risk into a hands-off
 * income drip. That trade-off is the deal loop.
 */

import type { ProductId } from './countries';

export type RecipeId = 'cook-crack' | 'press-hash';

export interface ConversionRecipe {
  readonly id: RecipeId;
  readonly name: string;
  /** The product consumed, and units consumed per batch. */
  readonly from: ProductId;
  readonly fromQty: number;
  /** The product produced, and units produced per batch. */
  readonly to: ProductId;
  readonly toQty: number;
  /** Dirty-cash cost per batch (supplies, hands, a stove that never cools). */
  readonly costPerBatch: number;
  /** Heat generated per batch (a kitchen has a smell). */
  readonly heatPerBatch: number;
  /**
   * When true, the output is handed to the crew to sell on the corners over
   * time rather than deposited into the stash (design/12 Item 5; `street.ts`).
   * The cook is then bounded by the street QUEUE (crew-scaled), never by stash
   * space — and needs at least one crew member to have any corners at all.
   */
  readonly toStreet?: boolean;
  /** The scene line the UI renders on a completed batch (never a toast). */
  readonly prose: string;
}

export const CONVERSION_RECIPES: readonly ConversionRecipe[] = [
  {
    // Real ratio, not a value-add multiplier (design/12 Item 5c): 10 keys of
    // powder cut and cooked make ~18 units of rock — a modest mass gain, priced
    // at ~half of cocaine (config/countries.ts). It's a near-wash on price; the
    // payoff is `toStreet` — the crew moves the rocks over time (street.ts).
    id: 'cook-crack',
    name: 'Cook crack',
    from: 'cocaine',
    fromQty: 10,
    to: 'crack',
    toQty: 18,
    costPerBatch: 400,
    heatPerBatch: 2,
    toStreet: true,
    prose: 'Baking soda, a pot, a steady hand. The rocks go to the crew to work the corners.',
  },
  {
    id: 'press-hash',
    name: 'Press hash',
    from: 'weed',
    fromQty: 10,
    to: 'hash',
    toQty: 2,
    costPerBatch: 150,
    heatPerBatch: 0.5,
    prose: 'Screens, heat, and pressure — ten bricks of green go in, two dark slabs come out.',
  },
] as const;

const RECIPE_BY_ID: ReadonlyMap<RecipeId, ConversionRecipe> = new Map(
  CONVERSION_RECIPES.map((r) => [r.id, r]),
);

/**
 * Resolve a recipe config, throwing on an unknown id (closed union guard).
 * Pass an alternate `table` (e.g. `state.config.conversions.CONVERSION_RECIPES`)
 * to resolve against an injected tuning (Prompt 26).
 */
export function getRecipe(
  id: RecipeId,
  table: readonly ConversionRecipe[] = CONVERSION_RECIPES,
): ConversionRecipe {
  const recipe =
    table === CONVERSION_RECIPES ? RECIPE_BY_ID.get(id) : table.find((r) => r.id === id);
  if (!recipe) throw new Error(`getRecipe(): unknown recipe "${id}"`);
  return recipe;
}
