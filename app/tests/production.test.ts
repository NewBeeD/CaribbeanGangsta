import { describe, expect, it } from 'vitest';
import {
  heatOf, homeCountryId,
  CREW_ARCHETYPES,
  LIEUTENANT_FRONT_BONUS,
  PRODUCTION_MAX_LEVEL,
  assignProduction,
  unassignProduction,
  buyProductionOp,
  convert,
  createInitialState,
  effectiveCapacity,
  getMarketPrice,
  getProductionOp,
  productionUpgradeCost,
  productionYieldRate,
  productionStep,
  setProductionPaused,
  setProductionStash,
  spawnCrew,
  stashUnits,
  tick,
  upgradeProductionOp,
  type GameState,
  type Stash,
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
  it('deposits floor(units/hr × level × dtHours) of the op product and adds heat', () => {
    const s = withClean('grow', 50_000);
    const cfg = getProductionOp('backyard-grow');
    const bought = buyProductionOp(s, 'backyard-grow').state;
    const out = productionStep(bought, 20, 'active');

    // Rates come from config (retunes stay in config/production.ts); integer units.
    expect(out.stashes[0]!.inventory.weed).toBe(Math.floor(cfg.unitsPerHourPerLevel * 20));
    // Heat tracks output — a running grow smells (heatPerHour × 20h, HOME-country noise).
    expect(heatOf(out, homeCountryId(out))).toBeCloseTo(
      heatOf(bought, homeCountryId(bought)) + cfg.heatPerHour * 20,
    );
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

    // Re-assert the freeze with the new op field present (design/13 C): a running,
    // home-routed op still deposits NOTHING while offline.
    const withFields: GameState = {
      ...bought,
      productionOps: bought.productionOps.map((o) => ({ ...o, paused: false })),
    };
    expect(productionStep(withFields, 100, 'offline')).toBe(withFields);
  });

  it('is driven by the live clock — tick() deposits product', () => {
    const bought = buyProductionOp(withClean('tick', 50_000), 'backyard-grow').state;
    const t = tick(bought, 20); // enough game-hours to bank a whole unit at the v2 rate
    expect(t.stashes[0]!.inventory.weed).toBeGreaterThan(0);
  });
});

describe('integer inventory (design/13 A1) — whole units only, remainder carried', () => {
  it('deposits only whole units over fractional ticks; the remainder carries, not drops', () => {
    const cfg = getProductionOp('backyard-grow');
    let s = buyProductionOp(withClean('int', 50_000), 'backyard-grow').state;
    for (let i = 0; i < 40; i++) s = productionStep(s, 0.5, 'active'); // 20h in 0.5h ticks

    const weed = s.stashes[0]!.inventory.weed;
    expect(Number.isInteger(weed)).toBe(true); // nothing fractional ever lands
    const pending = s.productionOps[0]!.pendingYield ?? 0;
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(pending).toBeLessThan(1); // the carry is always sub-unit
    // Total yield over time equals the shown rate — deposited + carried, no loss.
    expect(weed + pending).toBeCloseTo(cfg.unitsPerHourPerLevel * 20);
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
    expect(heatOf(out, homeCountryId(full))).toBeCloseTo(heatOf(full, homeCountryId(full))); // an idled lab is cold
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
    s = productionStep(s, 100, 'active'); // grow well past a 10-weed press batch
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

    const assigned = assignProduction(withLt, 'lt-1', op.id).state;
    const boosted = productionYieldRate(assigned, assigned.productionOps[0]!);
    expect(boosted).toBeCloseTo(base * (1 + LIEUTENANT_FRONT_BONUS));
    expect(boosted).toBeGreaterThan(base);

    const off = unassignProduction(assigned, 'lt-1', op.id);
    expect(productionYieldRate(off, off.productionOps[0]!)).toBeCloseTo(base);
  });

  it('a flipped (wire) lieutenant contributes no bonus', () => {
    const bought = buyProductionOp(withClean('wire', 50_000), 'backyard-grow').state;
    const wire = spawnCrew(CREW_ARCHETYPES[0]!.id, {
      id: 'lt-w',
      role: 'lieutenant',
      isWire: true,
      productionOpIds: ['prod-backyard-grow'],
    });
    const s: GameState = { ...bought, crew: [wire] };
    const cfg = getProductionOp('backyard-grow');
    expect(productionYieldRate(s, s.productionOps[0]!)).toBeCloseTo(cfg.unitsPerHourPerLevel);
  });
});

/** Append a second stash in `countryId` (empty inventory) so destination tests have
 *  somewhere to route yield. Mirrors the home stash's shape. */
function withExtraStash(s: GameState, id: string, countryId: string): GameState {
  const home = s.stashes[0]!;
  const empty = Object.fromEntries(
    Object.keys(home.inventory).map((k) => [k, 0]),
  ) as Stash['inventory'];
  const stash: Stash = { ...home, id, name: id, countryId, dirtyCash: 0, inventory: empty };
  return { ...s, stashes: [...s.stashes, stash] };
}

describe('pause (design/13 C) — a cold lab yields nothing and emits no heat', () => {
  it('a paused op deposits nothing and adds no heat over any dtHours', () => {
    const bought = buyProductionOp(withClean('pause', 100_000), 'crack-lab').state;
    const paused = setProductionPaused(bought, 'prod-crack-lab', true);
    expect(paused.productionOps[0]!.paused).toBe(true);

    const out = productionStep(paused, 50, 'active');
    expect(stashUnits(out.stashes[0]!)).toBe(0); // no yield
    // No heat — the lab is cold (no local movement, no notoriety).
    expect(out.countryHeat).toEqual(paused.countryHeat);
    expect(out.notoriety).toBe(paused.notoriety);
  });

  it('unpausing resumes at the same accumulator — the carried remainder is not lost', () => {
    const bought = buyProductionOp(withClean('resume', 50_000), 'backyard-grow').state;
    const seeded: GameState = {
      ...bought,
      productionOps: bought.productionOps.map((o) => ({ ...o, pendingYield: 0.9, paused: true })),
    };
    // Paused: a step changes nothing (yield frozen, carry untouched).
    const idle = productionStep(seeded, 3, 'active');
    expect(idle.productionOps[0]!.pendingYield).toBeCloseTo(0.9);

    // Resume, then a tiny step tips the 0.9 carry over 1.0 → one whole unit banks.
    const resumed = setProductionPaused(idle, 'prod-backyard-grow', false);
    expect(resumed.productionOps[0]!.paused).toBe(false);
    const out = productionStep(resumed, 1, 'active'); // + ~0.16 → 1.06
    expect(out.stashes[0]!.inventory.weed).toBe(1);
  });

  it('setProductionPaused no-ops on an unknown op or a redundant set (no mutation)', () => {
    const bought = buyProductionOp(withClean('pause-noop', 50_000), 'backyard-grow').state;
    expect(setProductionPaused(bought, 'prod-nope', true)).toBe(bought);
    expect(setProductionPaused(bought, 'prod-backyard-grow', false)).toBe(bought);
  });
});

describe('destination (design/13 C) — physical yield, same-country only', () => {
  it('an assigned op deposits into its stash and only there; home stays empty', () => {
    const home = (s: GameState) => s.stashes[0]!;
    const base = buyProductionOp(withClean('dest', 50_000), 'backyard-grow').state;
    const country = home(base).countryId;
    const withStash = withExtraStash(base, 'stash-2', country);
    const routed = setProductionStash(withStash, 'prod-backyard-grow', 'stash-2');
    expect(routed.productionOps[0]!.stashId).toBe('stash-2');

    const out = productionStep(routed, 100, 'active');
    expect(stashUnits(out.stashes[0]!)).toBe(0); // home untouched
    expect(out.stashes.find((s) => s.id === 'stash-2')!.inventory.weed).toBeGreaterThan(0);
  });

  it('selecting home clears the assignment; unassigned deposits home exactly as before', () => {
    const base = buyProductionOp(withClean('dest-home', 50_000), 'backyard-grow').state;
    const country = base.stashes[0]!.countryId;
    const withStash = withExtraStash(base, 'stash-2', country);
    const routed = setProductionStash(withStash, 'prod-backyard-grow', 'stash-2');
    const back = setProductionStash(routed, 'prod-backyard-grow', base.stashes[0]!.id);
    expect(back.productionOps[0]!.stashId).toBeUndefined(); // home stored as absent

    const out = productionStep(back, 100, 'active');
    expect(out.stashes[0]!.inventory.weed).toBeGreaterThan(0);
    expect(stashUnits(out.stashes.find((s) => s.id === 'stash-2')!)).toBe(0);
  });

  it('rejects a cross-country destination without mutating — yield never teleports', () => {
    const base = buyProductionOp(withClean('dest-far', 50_000), 'backyard-grow').state;
    const foreign = base.stashes[0]!.countryId === 'colombia' ? 'jamaica' : 'colombia';
    const withStash = withExtraStash(base, 'stash-far', foreign);
    const out = setProductionStash(withStash, 'prod-backyard-grow', 'stash-far');
    expect(out).toBe(withStash); // rejected, no mutation
    expect(out.productionOps[0]!.stashId).toBeUndefined();
  });

  it('a full destination idles the op without spilling into another stash', () => {
    const base = buyProductionOp(withClean('dest-full', 200_000), 'hydro-farm').state;
    const country = base.stashes[0]!.countryId;
    const withStash = withExtraStash(base, 'stash-2', country);
    const routed = setProductionStash(withStash, 'prod-hydro-farm', 'stash-2');
    const cap = effectiveCapacity(routed, routed.stashes[0]!);
    const full: GameState = {
      ...routed,
      stashes: routed.stashes.map((x) =>
        x.id === 'stash-2' ? { ...x, inventory: { ...x.inventory, weed: cap } } : x,
      ),
    };
    const out = productionStep(full, 1_000, 'active');
    expect(stashUnits(out.stashes.find((s) => s.id === 'stash-2')!)).toBe(cap); // never past cap
    expect(stashUnits(out.stashes[0]!)).toBe(0); // no spill to home
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
