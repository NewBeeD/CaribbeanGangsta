import { describe, expect, it } from 'vitest';
import {
  CONVERSION_RECIPES,
  applyIntent,
  convert,
  createInitialState,
  getMarketPrice,
  getRecipe,
  maxBatches,
  type GameState,
  type ProductId,
  type Stash,
} from '@/engine';

/** Overwrite the home stash's cash/inventory, immutably. */
function seed(
  state: GameState,
  opts: { cash?: number; inventory?: Partial<Record<ProductId, number>> },
): GameState {
  const home = state.stashes[0] as Stash;
  const nextHome: Stash = {
    ...home,
    dirtyCash: opts.cash ?? home.dirtyCash,
    inventory: { ...home.inventory, ...(opts.inventory ?? {}) },
  };
  return { ...state, stashes: [nextHome, ...state.stashes.slice(1)] };
}

const home = (state: GameState): Stash => state.stashes[0] as Stash;

describe('conversion recipes — config sanity (Ideas2 §4)', () => {
  it('ships cook-crack (cocaine → crack) and press-hash (weed → hash)', () => {
    const ids = CONVERSION_RECIPES.map((r) => r.id);
    expect(ids).toContain('cook-crack');
    expect(ids).toContain('press-hash');
    expect(getRecipe('cook-crack')).toMatchObject({ from: 'cocaine', to: 'crack' });
    expect(getRecipe('press-hash')).toMatchObject({ from: 'weed', to: 'hash' });
  });

  it('every recipe consumes and produces positive integer units at a real cost', () => {
    for (const recipe of CONVERSION_RECIPES) {
      expect(recipe.fromQty).toBeGreaterThan(0);
      expect(recipe.toQty).toBeGreaterThan(0);
      expect(Number.isInteger(recipe.fromQty)).toBe(true);
      expect(Number.isInteger(recipe.toQty)).toBe(true);
      expect(recipe.costPerBatch).toBeGreaterThanOrEqual(0);
      expect(recipe.heatPerBatch).toBeGreaterThan(0); // a kitchen has a smell
    }
  });
});

describe('convert — deterministic transformation, never a roll', () => {
  it('cooks cocaine into crack: consumes input + batch cost, yields in place, adds heat', () => {
    // One batch: cooking bulks product up (1 key → 4 retail units), and the
    // home floor stash only holds 50 units — capacity is a real constraint.
    const recipe = getRecipe('cook-crack');
    const state = seed(createInitialState('cook'), {
      cash: 10_000,
      inventory: { cocaine: 15 },
    });
    const result = convert(state, { type: 'convert', recipe: 'cook-crack', batches: 1 });

    expect(result.ok).toBe(true);
    expect(result.consumed).toBe(recipe.fromQty);
    expect(result.produced).toBe(recipe.toQty);
    expect(result.cost).toBe(recipe.costPerBatch);
    const after = home(result.state);
    expect(after.inventory.cocaine).toBe(15 - recipe.fromQty);
    expect(after.inventory.crack).toBe(recipe.toQty);
    expect(after.dirtyCash).toBe(10_000 - recipe.costPerBatch);
    expect(result.state.heat).toBeGreaterThan(state.heat);
  });

  it('rejects a cook the stash has no room to hold (crack bulks up 1 → 4)', () => {
    const state = seed(createInitialState('cook-full'), {
      cash: 10_000,
      inventory: { cocaine: 30 },
    });
    const result = convert(state, { type: 'convert', recipe: 'cook-crack', batches: 2 });
    expect(result.rejected).toBe('insufficient-capacity');
    expect(result.state).toBe(state);
  });

  it('the cook is a value-add ON AVERAGE (reading the crack market is the skill)', () => {
    // Boards draw independently per run, so a single seed can price raw coke
    // above cooked crack — that volatility is the market-reading game. Across
    // many runs, though, cooking must pay or the recipe is a trap.
    const recipe = getRecipe('cook-crack');
    let cokeTotal = 0;
    let crackTotal = 0;
    for (let s = 0; s < 40; s++) {
      const state = createInitialState(`value-${s}`);
      const homeId = home(state).countryId;
      cokeTotal += getMarketPrice(state, 'cocaine', homeId).price * recipe.fromQty;
      crackTotal +=
        getMarketPrice(state, 'crack', homeId).price * recipe.toQty -
        recipe.costPerBatch;
    }
    expect(crackTotal).toBeGreaterThan(cokeTotal);
  });

  it('rejects bad batches / missing input / missing cash without mutating', () => {
    const state = seed(createInitialState('reject'), {
      cash: 0,
      inventory: { cocaine: 5 },
    });
    const zero = convert(state, { type: 'convert', recipe: 'cook-crack', batches: 0 });
    expect(zero.rejected).toBe('invalid-qty');
    expect(zero.state).toBe(state);

    const short = convert(state, { type: 'convert', recipe: 'cook-crack', batches: 1 });
    expect(short.rejected).toBe('insufficient-inventory');
    expect(short.state).toBe(state);

    const broke = seed(state, { cash: 0, inventory: { cocaine: 100 } });
    const unfunded = convert(broke, {
      type: 'convert',
      recipe: 'cook-crack',
      batches: 1,
    });
    expect(unfunded.rejected).toBe('insufficient-funds');
    expect(unfunded.state).toBe(broke);
  });

  it('clean (borrowed) cash covers the batch cost shortfall (design/10)', () => {
    const base = seed(createInitialState('loan-cook'), {
      cash: 0,
      inventory: { cocaine: 10 },
    });
    const funded: GameState = { ...base, cleanCash: 10_000 };
    const cooked = convert(funded, { type: 'convert', recipe: 'cook-crack', batches: 1 });
    expect(cooked.ok).toBe(true);
    expect(cooked.state.cleanCash).toBe(10_000 - cooked.cost);
    expect((cooked.state.stashes[0] as Stash).dirtyCash).toBe(0);
  });

  it('maxBatches is exactly what convert will accept', () => {
    const state = seed(createInitialState('max'), {
      cash: 500,
      inventory: { weed: 47 },
    });
    const max = maxBatches('press-hash', home(state), state.cleanCash);
    expect(max).toBeGreaterThan(0);
    expect(convert(state, { type: 'convert', recipe: 'press-hash', batches: max }).ok).toBe(
      true,
    );
    expect(
      convert(state, { type: 'convert', recipe: 'press-hash', batches: max + 1 }).ok,
    ).toBe(false);
  });

  it('dispatches through applyIntent deterministically', () => {
    const run = (): GameState => {
      const s = seed(createInitialState('convert-det'), {
        cash: 5_000,
        inventory: { weed: 30, cocaine: 10 },
      });
      let next = applyIntent(s, { type: 'convert', recipe: 'press-hash', batches: 3 });
      next = applyIntent(next, { type: 'convert', recipe: 'cook-crack', batches: 1 });
      return next;
    };
    expect(run()).toEqual(run());
  });
});
