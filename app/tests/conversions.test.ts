import { describe, expect, it } from 'vitest';
import {
  CONVERSION_RECIPES,
  STREET_QUEUE_PER_CREW,
  applyIntent,
  convert,
  convertBinding,
  createInitialState,
  heatOf,
  getMarketPrice,
  getRecipe,
  maxBatches,
  recruit,
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

/** A cook needs a crew to work the corners (design/12 Item 5b) — give the run one. */
const withCrew = (state: GameState): GameState => recruit(state, 'deon').state;

describe('conversion recipes — config sanity (Ideas2 §4; design/12 Item 5)', () => {
  it('ships cook-crack (cocaine → crack) and press-hash (weed → hash)', () => {
    const ids = CONVERSION_RECIPES.map((r) => r.id);
    expect(ids).toContain('cook-crack');
    expect(ids).toContain('press-hash');
    expect(getRecipe('cook-crack')).toMatchObject({ from: 'cocaine', to: 'crack', toStreet: true });
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
  it('cooks cocaine into rocks the CREW holds (not the shelf), booked at local price', () => {
    const recipe = getRecipe('cook-crack');
    const state = withCrew(
      seed(createInitialState('cook'), { cash: 10_000, inventory: { cocaine: 15 } }),
    );
    const localCrack = getMarketPrice(state, 'crack', home(state).countryId).price;
    const result = convert(state, { type: 'convert', recipe: 'cook-crack', batches: 1 });

    expect(result.ok).toBe(true);
    expect(result.consumed).toBe(recipe.fromQty);
    expect(result.produced).toBe(recipe.toQty);
    expect(result.cost).toBe(recipe.costPerBatch);
    const after = home(result.state);
    expect(after.inventory.cocaine).toBe(15 - recipe.fromQty);
    // The rock goes to the corners, never onto the stash shelf (design/12 Item 5).
    expect(after.inventory.crack).toBe(0);
    expect(result.state.streetStock.units).toBe(recipe.toQty);
    expect(result.state.streetStock.bookedUnitPrice).toBeCloseTo(localCrack);
    expect(after.dirtyCash).toBe(10_000 - recipe.costPerBatch);
    // The cook's heat lands where the stash sits (per-country heat, v30).
    expect(heatOf(result.state, home(state).countryId)).toBeGreaterThan(
      heatOf(state, home(state).countryId),
    );
  });

  it('a cook needs a crew — no crew, no corners (design/12 Item 5b)', () => {
    const state = seed(createInitialState('no-crew'), {
      cash: 10_000,
      inventory: { cocaine: 50 },
    });
    const result = convert(state, { type: 'convert', recipe: 'cook-crack', batches: 1 });
    expect(result.rejected).toBe('no-crew');
    expect(result.state).toBe(state);
  });

  it('clamps a cook to the crew’s corner queue, then rejects past it', () => {
    const state = withCrew(
      seed(createInitialState('queue'), { cash: 1_000_000, inventory: { cocaine: 10_000 } }),
    );
    const cap = STREET_QUEUE_PER_CREW * state.crew.length;
    const recipe = getRecipe('cook-crack');
    const max = maxBatches(state, 'cook-crack', home(state));
    expect(max).toBe(Math.floor(cap / recipe.toQty));
    expect(convert(state, { type: 'convert', recipe: 'cook-crack', batches: max }).ok).toBe(true);
    expect(
      convert(state, { type: 'convert', recipe: 'cook-crack', batches: max + 1 }).rejected,
    ).toBe('insufficient-capacity');
  });

  it('press-hash still yields into the stash (a non-street conversion is unchanged)', () => {
    const recipe = getRecipe('press-hash');
    const state = seed(createInitialState('hash'), { cash: 5_000, inventory: { weed: 30 } });
    const result = convert(state, { type: 'convert', recipe: 'press-hash', batches: 2 });
    expect(result.ok).toBe(true);
    const after = home(result.state);
    expect(after.inventory.weed).toBe(30 - recipe.fromQty * 2);
    expect(after.inventory.hash).toBe(recipe.toQty * 2);
    expect(result.state.streetStock.units).toBe(0); // hash never hits the corners
  });

  it('convertBinding names the binding constraint (no more "not enough on hand" mislabel)', () => {
    // Plenty of coke + cash but NO crew → the block is the crew, not the product
    // (design/12 Item 5a: the old UI blamed a crew/space shortfall on inventory).
    const noCrew = seed(createInitialState('bind'), {
      cash: 10_000,
      inventory: { cocaine: 50 },
    });
    expect(convertBinding(noCrew, 'cook-crack', home(noCrew))).toBe('no-crew');

    const crewed = withCrew(noCrew);
    const noCoke = seed(crewed, { cash: 10_000, inventory: { cocaine: 0 } });
    expect(convertBinding(noCoke, 'cook-crack', home(noCoke))).toBe('insufficient-inventory');

    const runnable = seed(crewed, { cash: 10_000, inventory: { cocaine: 50 } });
    expect(convertBinding(runnable, 'cook-crack', home(runnable))).toBeNull();
  });

  it('rejects bad batches / missing input / missing cash without mutating', () => {
    const state = seed(createInitialState('reject'), {
      cash: 0,
      inventory: { cocaine: 5 },
    });
    const zero = convert(state, { type: 'convert', recipe: 'cook-crack', batches: 0 });
    expect(zero.rejected).toBe('invalid-qty');
    expect(zero.state).toBe(state);

    // Inventory is checked before crew/queue, so a short cook still reads as inventory.
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
    const base = withCrew(
      seed(createInitialState('loan-cook'), { cash: 0, inventory: { cocaine: 10 } }),
    );
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
    const max = maxBatches(state, 'press-hash', home(state));
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
      const s = withCrew(
        seed(createInitialState('convert-det'), {
          cash: 5_000,
          inventory: { weed: 30, cocaine: 10 },
        }),
      );
      let next = applyIntent(s, { type: 'convert', recipe: 'press-hash', batches: 3 });
      next = applyIntent(next, { type: 'convert', recipe: 'cook-crack', batches: 1 });
      return next;
    };
    expect(run()).toEqual(run());
  });
});
