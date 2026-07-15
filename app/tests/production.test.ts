import { describe, expect, it } from 'vitest';
import {
  CREW_ARCHETYPES,
  LIEUTENANT_FRONT_BONUS,
  PRODUCTION_MAX_LEVEL,
  assign,
  buyProductionOp,
  convert,
  createInitialState,
  effectiveCapacity,
  getMarketPrice,
  getProductionOp,
  productionUpgradeCost,
  productionYieldRate,
  productionStep,
  spawnCrew,
  stashUnits,
  tick,
  upgradeProductionOp,
  type GameState,
} from '@/engine';

/** A run with `clean` clean cash on hand (rest of the state fresh). */
function withClean(seed: string, clean: number): GameState {
  return { ...createInitialState(seed), cleanCash: clean };
}

const HOME = (s: GameState) => s.stashes[0]!;

describe('buyProductionOp — single-buy, money is the only gate', () => {
  it('buys a Level-1 op, charging clean cash and minting the stable per-type id', () => {
    const s = withClean('buy', 50_000);
    const cfg = getProductionOp('backyard-grow');
    const r = buyProductionOp(s, 'backyard-grow');

    expect(r.rejected).toBeUndefined();
    expect(r.op).toEqual({ id: 'prod-backyard-grow', type: 'backyard-grow', level: 1 });
    expect(r.state.cleanCash).toBe(50_000 - cfg.buyIn);
    expect(r.state.productionOps).toHaveLength(1);
  });

  it('rejects a second buy of an owned op with already-owned, without mutating', () => {
    const s = withClean('dup', 200_000);
    const once = buyProductionOp(s, 'backyard-grow').state;
    const twice = buyProductionOp(once, 'backyard-grow');

    expect(twice.rejected).toBe('already-owned');
    expect(twice.state).toBe(once); // no mutation
    expect(twice.state.productionOps).toHaveLength(1);
  });

  it('rejects insufficient funds without mutating', () => {
    const s = withClean('broke', 100);
    const r = buyProductionOp(s, 'meth-superlab');
    expect(r.rejected).toBe('insufficient-funds');
    expect(r.state).toBe(s);
  });
});

describe('upgradeProductionOp — the buy_in × 1.15^level curve', () => {
  it('charges buy_in × 1.15^level and raises the level', () => {
    const s = withClean('up', 100_000);
    const bought = buyProductionOp(s, 'backyard-grow').state;
    const cost = productionUpgradeCost('backyard-grow', 1);
    const r = upgradeProductionOp(bought, 'prod-backyard-grow');

    expect(r.rejected).toBeUndefined();
    expect(r.op?.level).toBe(2);
    expect(r.state.cleanCash).toBe(bought.cleanCash - cost);
    expect(cost).toBe(Math.round(getProductionOp('backyard-grow').buyIn * 1.15));
  });

  it('rejects an unknown op, a maxed op, and a shortfall — no mutation', () => {
    const s = withClean('up-reject', 5_000);
    const bought = buyProductionOp(s, 'backyard-grow').state;
    expect(upgradeProductionOp(bought, 'prod-nope').rejected).toBe('no-op');

    // Drive to max level, then reject the next upgrade.
    let maxed = { ...bought, cleanCash: 10_000_000 };
    for (let i = 1; i < PRODUCTION_MAX_LEVEL; i++) {
      maxed = upgradeProductionOp(maxed, 'prod-backyard-grow').state;
    }
    expect(maxed.productionOps[0]!.level).toBe(PRODUCTION_MAX_LEVEL);
    const over = upgradeProductionOp(maxed, 'prod-backyard-grow');
    expect(over.rejected).toBe('max-level');
    expect(over.state).toBe(maxed);

    // A shortfall (level-1 op, not enough clean for the next level).
    const poor = { ...bought, cleanCash: 0 };
    expect(upgradeProductionOp(poor, 'prod-backyard-grow').rejected).toBe('insufficient-funds');
  });
});

describe('productionStep — ACTIVE-only yield into the home stash, capped', () => {
  it('deposits units/hr × level × dtHours of the op product and adds heat', () => {
    const s = withClean('grow', 50_000);
    const bought = buyProductionOp(s, 'backyard-grow').state; // weed, 0.8/h
    const out = productionStep(bought, 20, 'active');

    expect(out.stashes[0]!.inventory.weed).toBeCloseTo(0.8 * 20);
    // Heat tracks output — a running grow smells (0.05/h × 20h).
    expect(out.heat).toBeCloseTo(bought.heat + 0.05 * 20);
  });

  it('never exceeds effectiveCapacity — overflow is simply not produced', () => {
    const s = withClean('cap', 200_000);
    const bought = buyProductionOp(s, 'hydro-farm').state; // weed, 2.0/h
    const cap = effectiveCapacity(bought, HOME(bought));
    // Preload the home stash to one unit under the cap.
    const near: GameState = {
      ...bought,
      stashes: bought.stashes.map((x, i) =>
        i === 0 ? { ...x, inventory: { ...x.inventory, weed: cap - 1 } } : x,
      ),
    };
    const out = productionStep(near, 1_000, 'active'); // would produce 2,000

    expect(stashUnits(out.stashes[0]!)).toBeCloseTo(cap);
    expect(stashUnits(out.stashes[0]!)).toBeLessThanOrEqual(cap + 1e-9);
  });

  it('is frozen offline and a no-op with no ops — absence never yields (GDD §6)', () => {
    const bought = buyProductionOp(withClean('off', 50_000), 'backyard-grow').state;
    expect(productionStep(bought, 10, 'offline')).toBe(bought);
    expect(productionStep(bought, 0, 'active')).toBe(bought);
    const empty = withClean('none', 50_000);
    expect(productionStep(empty, 10, 'active')).toBe(empty);
  });

  it('is driven by the live clock — tick() deposits product', () => {
    const bought = buyProductionOp(withClean('tick', 50_000), 'backyard-grow').state;
    const t = tick(bought, 5);
    expect(t.stashes[0]!.inventory.weed).toBeGreaterThan(0);
  });
});

describe('integer inventory (design/13 A1) — whole units only, remainder carried', () => {
  it('deposits only whole units over fractional ticks; the remainder carries, not drops', () => {
    let s = buyProductionOp(withClean('int', 50_000), 'backyard-grow').state; // weed, 0.8/h
    for (let i = 0; i < 40; i++) s = productionStep(s, 0.5, 'active'); // 20h in 0.5h ticks

    const weed = s.stashes[0]!.inventory.weed;
    expect(Number.isInteger(weed)).toBe(true); // nothing fractional ever lands
    const pending = s.productionOps[0]!.pendingYield ?? 0;
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(pending).toBeLessThan(1); // the carry is always sub-unit
    // Total yield over time equals the shown rate — deposited + carried, no loss.
    expect(weed + pending).toBeCloseTo(0.8 * 20);
  });

  it('every inventory quantity stays an integer through the live clock', () => {
    let s = buyProductionOp(withClean('int-tick', 50_000), 'backyard-grow').state;
    for (let i = 0; i < 30; i++) s = tick(s, 0.37);
    for (const stash of s.stashes) {
      for (const qty of Object.values(stash.inventory)) {
        expect(Number.isInteger(qty)).toBe(true);
      }
    }
  });

  it('a full stash idles the op without losing the carried fraction (and emits no heat)', () => {
    const bought = buyProductionOp(withClean('int-idle', 200_000), 'hydro-farm').state;
    const cap = effectiveCapacity(bought, HOME(bought));
    const full: GameState = {
      ...bought,
      stashes: bought.stashes.map((x, i) =>
        i === 0 ? { ...x, inventory: { ...x.inventory, weed: cap } } : x,
      ),
      productionOps: bought.productionOps.map((o) => ({ ...o, pendingYield: 0.9 })),
    };
    const out = productionStep(full, 3, 'active');
    expect(stashUnits(out.stashes[0]!)).toBe(cap); // never past the cap
    expect(out.productionOps[0]!.pendingYield).toBeCloseTo(0.9); // the carry survives
    expect(out.heat).toBeCloseTo(full.heat); // an idled lab is cold
  });
});

describe('strains — differ in yield AND profit, all disclosed', () => {
  it('the exotic strain grows a higher-value product than the weed grows', () => {
    const s = withClean('strain', 500_000);
    const home = HOME(s).countryId;
    const weedPrice = getMarketPrice(s, 'weed', home).price;
    const exoticPrice = getMarketPrice(s, 'exotic', home).price;
    // Profit lever: the premium strain's product is worth multiples of weed.
    expect(exoticPrice).toBeGreaterThan(weedPrice);

    // Yield lever: the two weed grows and the exotic grow all differ in units/hr.
    const backyard = getProductionOp('backyard-grow').unitsPerHourPerLevel;
    const hydro = getProductionOp('hydro-farm').unitsPerHourPerLevel;
    const exotic = getProductionOp('exotic-greenhouse').unitsPerHourPerLevel;
    expect(new Set([backyard, hydro, exotic]).size).toBe(3);
    expect(getProductionOp('exotic-greenhouse').product).toBe('exotic');
  });
});

describe('press-hash still consumes grown weed exactly as today (no regression)', () => {
  it('grows weed, then presses it into hash 10:1', () => {
    let s = withClean('press', 50_000);
    s = buyProductionOp(s, 'backyard-grow').state;
    s = productionStep(s, 20, 'active'); // ~16 weed grown
    const weedBefore = s.stashes[0]!.inventory.weed;
    expect(weedBefore).toBeGreaterThan(10);

    const r = convert(s, { type: 'convert', recipe: 'press-hash', batches: 1 });
    expect(r.ok).toBe(true);
    expect(r.state.stashes[0]!.inventory.weed).toBeCloseTo(weedBefore - 10);
    expect(r.state.stashes[0]!.inventory.hash).toBeGreaterThan(0);
  });
});

describe('crew delegation — reuse the front-lieutenant path', () => {
  it('a lieutenant assigned to an op adds the disclosed bonus; unassigning restores base', () => {
    const bought = buyProductionOp(withClean('lt', 50_000), 'backyard-grow').state;
    const lt = spawnCrew(CREW_ARCHETYPES[0]!.id, { id: 'lt-1', role: 'lieutenant' });
    const withLt: GameState = { ...bought, crew: [lt] };
    const op = withLt.productionOps[0]!;
    const base = productionYieldRate(withLt, op);

    const assigned = assign(withLt, 'lt-1', { kind: 'production', targetId: op.id });
    const boosted = productionYieldRate(assigned, assigned.productionOps[0]!);
    expect(boosted).toBeCloseTo(base * (1 + LIEUTENANT_FRONT_BONUS));
    expect(boosted).toBeGreaterThan(base);

    const off = assign(assigned, 'lt-1', { kind: 'idle' });
    expect(productionYieldRate(off, off.productionOps[0]!)).toBeCloseTo(base);
  });

  it('a flipped (wire) lieutenant contributes no bonus', () => {
    const bought = buyProductionOp(withClean('wire', 50_000), 'backyard-grow').state;
    const wire = spawnCrew(CREW_ARCHETYPES[0]!.id, {
      id: 'lt-w',
      role: 'lieutenant',
      isWire: true,
      assignment: { kind: 'production', targetId: 'prod-backyard-grow' },
    });
    const s: GameState = { ...bought, crew: [wire] };
    const cfg = getProductionOp('backyard-grow');
    expect(productionYieldRate(s, s.productionOps[0]!)).toBeCloseTo(cfg.unitsPerHourPerLevel);
  });
});

describe('factories — become a supplier (output reaches your stash to sell)', () => {
  it('a crack lab deposits sellable crack into the home stash', () => {
    const s = withClean('factory', 100_000);
    const bought = buyProductionOp(s, 'crack-lab').state;
    const out = productionStep(bought, 10, 'active');
    const home = out.stashes[0]!;
    expect(home.inventory.crack).toBeGreaterThan(0);
    // The product is real bulk supply — it has a live market price to sell into.
    expect(getMarketPrice(out, 'crack', home.countryId).price).toBeGreaterThan(0);
  });
});
