/**
 * Product conversion recipes (Ideas2 §4; design/11 §4) — cook cocaine into
 * crack, press weed into hash. A conversion is street work done AT a stash: it
 * consumes held units + a small dirty-cash batch cost, yields the derived
 * product into the same stash, and generates a little heat (a kitchen has a
 * smell). All v1 tuning HYPOTHESES held as config (prompts/README.md "Config,
 * not literals"; Prompt 26 centralizes).
 *
 * The economics are a deliberate trade-off, not free money: a batch adds
 * roughly 10–35% value over selling the input raw (see the bands in
 * config/countries.ts), and the derived products carry MORE heat per unit —
 * value-add at the cost of exposure. That trade-off is the deal loop.
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
  /** The scene line the UI renders on a completed batch (never a toast). */
  readonly prose: string;
}

export const CONVERSION_RECIPES: readonly ConversionRecipe[] = [
  {
    id: 'cook-crack',
    name: 'Cook crack',
    from: 'cocaine',
    fromQty: 10,
    to: 'crack',
    toQty: 40,
    costPerBatch: 400,
    heatPerBatch: 2,
    prose: 'Baking soda, a pot, a steady hand. The kitchen runs all night.',
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
