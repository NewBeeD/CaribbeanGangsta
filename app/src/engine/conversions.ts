/**
 * Product conversions — cook crack, press hash (Ideas2 §4; design/11 §4).
 *
 * A conversion is street work done AT a stash: it consumes held input units
 * plus a small dirty-cash batch cost from that stash, yields the derived
 * product into the SAME stash, and adds a little heat (a kitchen has a smell).
 * Recipes live in `config/conversions.ts` (batch sizes, yields, costs — v1
 * hypotheses, Prompt 26 tunes).
 *
 * No roll, no gate: a conversion is a priced, deterministic transformation —
 * the risk lives downstream, in selling a hotter product (crack's heatPerUnit
 * and tierRisk exceed cocaine's). Rejections never mutate state, and outcomes
 * carry a scene key, never an error string (design/05 §4).
 */

import { getRecipe, type ConversionRecipe, type RecipeId } from './config/conversions';
import { PRODUCT_IDS } from './config/countries';
import { getStashType } from './config/stashes';
import { addHeat } from './heat';
import type { GameState, Inventory, Stash } from './state';

export interface ConvertIntent {
  readonly type: 'convert';
  readonly recipe: RecipeId;
  /** How many batches to run (integer ≥ 1). */
  readonly batches: number;
  /** The stash doing the work; defaults to the home stash. */
  readonly stashId?: string;
}

export type ConvertRejectReason =
  | 'invalid-qty'
  | 'no-stash'
  | 'insufficient-inventory'
  | 'insufficient-funds'
  | 'insufficient-capacity';

export interface ConvertResult {
  readonly state: GameState;
  readonly ok: boolean;
  readonly rejected?: ConvertRejectReason;
  /** Units of the input consumed / output produced (0 on rejection). */
  readonly consumed: number;
  readonly produced: number;
  /** Dirty cash spent on the batches (0 on rejection). */
  readonly cost: number;
  /** Narrative scene key (never a raw error string). */
  readonly sceneKey: string;
}

function stashUnits(stash: Stash): number {
  return PRODUCT_IDS.reduce((sum, id) => sum + (stash.inventory[id] ?? 0), 0);
}

function reject(state: GameState, rejected: ConvertRejectReason): ConvertResult {
  return {
    state,
    ok: false,
    rejected,
    consumed: 0,
    produced: 0,
    cost: 0,
    sceneKey: 'convert.reject',
  };
}

/** The most batches of `recipe` this stash can run right now (units/cash/space). */
export function maxBatches(recipeId: RecipeId, stash: Stash): number {
  const recipe = getRecipe(recipeId);
  const byUnits = Math.floor((stash.inventory[recipe.from] ?? 0) / recipe.fromQty);
  const byCash =
    recipe.costPerBatch > 0
      ? Math.floor(stash.dirtyCash / recipe.costPerBatch)
      : Number.MAX_SAFE_INTEGER;
  const netPerBatch = recipe.toQty - recipe.fromQty;
  const bySpace =
    netPerBatch > 0
      ? Math.floor(
          (getStashType(stash.type).capacity - stashUnits(stash)) / netPerBatch,
        )
      : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(byUnits, byCash, bySpace));
}

/**
 * Run `batches` of a recipe at the target stash: consume input units + batch
 * cost, yield the derived product in place, add the batch heat. Deterministic;
 * rejections leave `state` untouched.
 */
export function convert(state: GameState, intent: ConvertIntent): ConvertResult {
  const { batches } = intent;
  if (!Number.isInteger(batches) || batches <= 0) return reject(state, 'invalid-qty');

  const stash =
    intent.stashId !== undefined
      ? (state.stashes.find((s) => s.id === intent.stashId) ?? null)
      : (state.stashes[0] ?? null);
  if (!stash) return reject(state, 'no-stash');

  const recipe: ConversionRecipe = getRecipe(intent.recipe);
  const consumed = recipe.fromQty * batches;
  const produced = recipe.toQty * batches;
  const cost = recipe.costPerBatch * batches;

  if ((stash.inventory[recipe.from] ?? 0) < consumed) {
    return reject(state, 'insufficient-inventory');
  }
  if (stash.dirtyCash < cost) return reject(state, 'insufficient-funds');
  const netUnits = produced - consumed;
  if (
    netUnits > 0 &&
    stashUnits(stash) + netUnits > getStashType(stash.type).capacity
  ) {
    return reject(state, 'insufficient-capacity');
  }

  const inventory: Inventory = {
    ...stash.inventory,
    [recipe.from]: (stash.inventory[recipe.from] ?? 0) - consumed,
    [recipe.to]: (stash.inventory[recipe.to] ?? 0) + produced,
  };
  const nextStash: Stash = { ...stash, dirtyCash: stash.dirtyCash - cost, inventory };
  let next: GameState = {
    ...state,
    stashes: state.stashes.map((s) => (s.id === nextStash.id ? nextStash : s)),
  };
  next = addHeat(next, recipe.heatPerBatch * batches, `convert.${recipe.id}`);

  return {
    state: next,
    ok: true,
    consumed,
    produced,
    cost,
    sceneKey: `convert.${recipe.id}.done`,
  };
}
