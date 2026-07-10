import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  EXOTIC_STRAINS,
  PRODUCT_PRICE_BANDS,
  RIVAL_ARCHETYPES,
  START_COUNTRIES,
  VOLATILITY_RANGE,
  basePriceAt,
  createRng,
  describeStartingHand,
  generateWorld,
  getCountry,
  type ProductId,
} from '@/engine';

const bandById = new Map(PRODUCT_PRICE_BANDS.map((p) => [p.id, p] as const));
const archetypeNames = new Set(RIVAL_ARCHETYPES.map((a) => a.name));
const countryIds = new Set(COUNTRIES.map((c) => c.id));
const startIds = new Set(START_COUNTRIES.map((c) => c.id));

describe('generateWorld — determinism', () => {
  it('same seed → deep-equal world', () => {
    expect(generateWorld(createRng('seed-1'))).toEqual(generateWorld(createRng('seed-1')));
  });

  it('different seeds → different worlds', () => {
    expect(generateWorld(createRng('seed-1'))).not.toEqual(
      generateWorld(createRng('seed-2')),
    );
  });
});

describe('generateWorld — bounds', () => {
  it('every resolved price sits within its documented band; volatility in [0.20, 0.50]', () => {
    for (let s = 0; s < 250; s++) {
      const world = generateWorld(createRng(s));
      expect(world.priceBoards).toHaveLength(PRODUCT_PRICE_BANDS.length);
      for (const price of world.priceBoards) {
        const band = bandById.get(price.product)!;
        expect(price.buy).toBeGreaterThanOrEqual(band.buy.min);
        expect(price.buy).toBeLessThanOrEqual(band.buy.max);
        expect(price.sell).toBeGreaterThanOrEqual(band.sell.min);
        expect(price.sell).toBeLessThanOrEqual(band.sell.max);
        expect(price.volatility).toBeGreaterThanOrEqual(VOLATILITY_RANGE.min);
        expect(price.volatility).toBeLessThanOrEqual(VOLATILITY_RANGE.max);
      }
    }
  });

  it('starting country is START-ELIGIBLE (a Caribbean island) with cash inside its band', () => {
    for (let s = 0; s < 250; s++) {
      const { startingCountry } = generateWorld(createRng(s));
      expect(startIds.has(startingCountry.id)).toBe(true);
      const config = COUNTRIES.find((c) => c.id === startingCountry.id)!;
      expect(startingCountry.startingCash).toBeGreaterThanOrEqual(config.startingCash.min);
      expect(startingCountry.startingCash).toBeLessThanOrEqual(config.startingCash.max);
      expect(startingCountry.portProtection).toBeGreaterThanOrEqual(0);
      expect(startingCountry.portProtection).toBeLessThanOrEqual(1);
    }
  });

  it('rival count ∈ [2, 4] and each has a valid archetype', () => {
    for (let s = 0; s < 250; s++) {
      const { rivals } = generateWorld(createRng(s));
      expect(rivals.length).toBeGreaterThanOrEqual(2);
      expect(rivals.length).toBeLessThanOrEqual(4);
      for (const rival of rivals) {
        expect(archetypeNames.has(rival.archetype)).toBe(true);
        for (const trait of [rival.aggression, rival.cunning, rival.reach]) {
          expect(trait).toBeGreaterThanOrEqual(0);
          expect(trait).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('supplier geography covers the full roster with in-band cost/demand factors', () => {
    const { supplierGeography } = generateWorld(createRng('suppliers'));
    expect(supplierGeography.map((s) => s.countryId).sort()).toEqual(
      [...countryIds].sort(),
    );
    for (const supplier of supplierGeography) {
      const config = getCountry(supplier.countryId);
      expect(supplier.costFactor).toBeGreaterThanOrEqual(config.costBias.min);
      expect(supplier.costFactor).toBeLessThanOrEqual(config.costBias.max);
      expect(supplier.demandFactor).toBeGreaterThanOrEqual(config.demandBias.min);
      expect(supplier.demandFactor).toBeLessThanOrEqual(config.demandBias.max);
    }
  });

  it('draws the run’s exotic strain name from the pool (Ideas2 §5)', () => {
    const strains = new Set<string>();
    for (let s = 0; s < 50; s++) {
      const { exoticStrain } = generateWorld(createRng(s));
      expect(EXOTIC_STRAINS).toContain(exoticStrain);
      strains.add(exoticStrain);
    }
    expect(strains.size).toBeGreaterThan(1); // it actually varies across runs
  });
});

describe('generateWorld — no dead-on-arrival seeds (design/01 §8.7)', () => {
  it('every one of 1,000 seeds yields a playable world', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const world = generateWorld(createRng(seed));
      const cash = world.startingCountry.startingCash;

      // Positive starting cash.
      expect(cash).toBeGreaterThan(0);

      // At least one affordable product to buy into.
      const affordable = world.priceBoards.filter((p) => p.buy <= cash);
      expect(affordable.length).toBeGreaterThan(0);

      // A reachable first sale: some affordable product sells above its buy.
      const profitable = affordable.some((p) => p.sell > p.buy);
      expect(profitable).toBe(true);
    }
  });
});

describe('describeStartingHand — fairness (GDD §5.4, no hidden traps)', () => {
  it('surfaces exactly what the world holds', () => {
    const world = generateWorld(createRng('hand'));
    const hand = describeStartingHand(world);

    expect(hand.country).toBe(world.startingCountry.name);
    expect(hand.startingCash).toBe(world.startingCountry.startingCash);
    expect(hand.heatBaseline).toBe(world.startingCountry.heatBaseline);
    expect(hand.portProtection).toBe(world.startingCountry.portProtection);
    expect(hand.prices).toEqual(world.priceBoards);
    expect(hand.rivals.map((r) => r.name)).toEqual(world.rivals.map((r) => r.name));
  });

  it('names the genuinely cheapest LOCALLY TRADED product to buy into', () => {
    const world = generateWorld(createRng('cheapest'));
    const hand = describeStartingHand(world);
    const home = getCountry(world.startingCountry.id);
    const trueMin = home.traded
      .map((id: ProductId) => ({ product: id, buy: basePriceAt(world, id, home.id).buy }))
      .reduce((lo, p) => (p.buy < lo.buy ? p : lo));
    expect(hand.cheapestProduct.product).toBe(trueMin.product);
    expect(hand.cheapestProduct.buy).toBe(trueMin.buy);
  });
});
