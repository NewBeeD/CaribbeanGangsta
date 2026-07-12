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
import { getMarketPrice } from './deals';
import { addHeat } from './heat';
import { bookStreetStock, streetQueueRoom } from './street';
import { splitCharge, type GameState, type Inventory, type Stash } from './state';

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
  | 'insufficient-capacity'
  /** A `toStreet` cook with no crew to work the corners (design/12 Item 5b). */
  | 'no-crew';

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

const BIG = Number.MAX_SAFE_INTEGER;

/** The runnable-batch constraints for a recipe at a stash — the exact terms
 * `convert` enforces, so `maxBatches` and `convertBinding` agree with it. */
interface Constraints {
  /** Batches the held input allows. */
  readonly byUnits: number;
  /** Batches the stash's dirty cash + the run's clean cash allow. */
  readonly byCash: number;
  /** Batches the OUTPUT sink allows: stash space, or the crew's corner queue. */
  readonly byOutput: number;
  /** True when `byOutput` is 0 because a `toStreet` cook has no crew (5b). */
  readonly noCrew: boolean;
}

function constraintsFor(
  state: GameState,
  recipe: ConversionRecipe,
  stash: Stash,
): Constraints {
  const byUnits = Math.floor((stash.inventory[recipe.from] ?? 0) / recipe.fromQty);
  const byCash =
    recipe.costPerBatch > 0
      ? Math.floor((stash.dirtyCash + state.cleanCash) / recipe.costPerBatch)
      : BIG;

  // The output sink: a `toStreet` cook is bounded by the crew's corner queue
  // (crew-scaled — no crew, no cook, design/12 Item 5b); everything else is
  // bounded by stash space when it bulks up (net units per batch > 0).
  let byOutput: number;
  let noCrew = false;
  if (recipe.toStreet) {
    noCrew = state.crew.length === 0;
    byOutput = Math.floor(streetQueueRoom(state) / recipe.toQty);
  } else {
    const net = recipe.toQty - recipe.fromQty;
    byOutput =
      net > 0
        ? Math.floor(
            (getStashType(stash.type, state.config.stashes.STASH_TYPES).capacity -
              stashUnits(stash)) /
              net,
          )
        : BIG;
  }
  return { byUnits, byCash, byOutput, noCrew };
}

/**
 * The most batches of `recipe` this stash can run right now — the min of the
 * held input, the spendable cash (stash dirty + the run's clean pool, so a
 * borrowed stake can fund the cook, design/10), and the output sink (stash
 * space, or the crew's corner queue for a `toStreet` cook, design/12 Item 5).
 */
export function maxBatches(state: GameState, recipeId: RecipeId, stash: Stash): number {
  const recipe = getRecipe(recipeId, state.config.conversions.CONVERSION_RECIPES);
  const c = constraintsFor(state, recipe, stash);
  return Math.max(0, Math.min(c.byUnits, c.byCash, c.byOutput));
}

/**
 * The binding constraint that pins `maxBatches` to 0 right now, as a reject
 * reason — so the UI can name WHY a cook is blocked instead of the old
 * "Not enough on hand" mislabel that surfaced a space/cash/crew shortfall as
 * missing product (design/12 Item 5a). `null` when a batch is runnable. Reported
 * in the same order `convert` checks: inventory, then funds, then the output sink.
 */
export function convertBinding(
  state: GameState,
  recipeId: RecipeId,
  stash: Stash,
): ConvertRejectReason | null {
  const recipe = getRecipe(recipeId, state.config.conversions.CONVERSION_RECIPES);
  const c = constraintsFor(state, recipe, stash);
  if (Math.min(c.byUnits, c.byCash, c.byOutput) >= 1) return null;
  if (c.byUnits < 1) return 'insufficient-inventory';
  if (c.byCash < 1) return 'insufficient-funds';
  return c.noCrew ? 'no-crew' : 'insufficient-capacity';
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

  const recipe: ConversionRecipe = getRecipe(
    intent.recipe,
    state.config.conversions.CONVERSION_RECIPES,
  );
  const consumed = recipe.fromQty * batches;
  const produced = recipe.toQty * batches;
  const cost = recipe.costPerBatch * batches;

  if ((stash.inventory[recipe.from] ?? 0) < consumed) {
    return reject(state, 'insufficient-inventory');
  }
  // Batch costs draw dirty cash at the stash first, then clean cash covers the
  // shortfall (clean/borrowed capital spends anywhere — design/10).
  const charge = splitCharge(state, stash, cost);
  if (!charge) return reject(state, 'insufficient-funds');

  // The output has to have somewhere to go. A `toStreet` cook needs a crew to
  // work the corners and room in their queue (design/12 Item 5); everything
  // else needs stash space when it bulks up.
  if (recipe.toStreet) {
    if (state.crew.length === 0) return reject(state, 'no-crew');
    if (produced > streetQueueRoom(state)) return reject(state, 'insufficient-capacity');
  } else {
    const netUnits = produced - consumed;
    if (
      netUnits > 0 &&
      stashUnits(stash) + netUnits >
        getStashType(stash.type, state.config.stashes.STASH_TYPES).capacity
    ) {
      return reject(state, 'insufficient-capacity');
    }
  }

  // A `toStreet` cook only removes the input (the rock goes to the crew, not the
  // shelf); an ordinary conversion yields into the same stash.
  const inventory: Inventory = recipe.toStreet
    ? { ...stash.inventory, [recipe.from]: (stash.inventory[recipe.from] ?? 0) - consumed }
    : {
        ...stash.inventory,
        [recipe.from]: (stash.inventory[recipe.from] ?? 0) - consumed,
        [recipe.to]: (stash.inventory[recipe.to] ?? 0) + produced,
      };
  const nextStash: Stash = {
    ...stash,
    dirtyCash: stash.dirtyCash - charge.fromDirty,
    inventory,
  };
  let next: GameState = {
    ...state,
    cleanCash: state.cleanCash - charge.fromClean,
    stashes: state.stashes.map((s) => (s.id === nextStash.id ? nextStash : s)),
  };
  // Book the cooked rock into the crew's corner queue at the LOCAL price now —
  // the street-sales tick drips it back as dirty cash over time (street.ts).
  if (recipe.toStreet) {
    const localPrice = getMarketPrice(next, recipe.to, stash.countryId).price;
    next = bookStreetStock(next, produced, localPrice);
  }
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
