import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  rngFor,
  settleOffline,
  addStash,
  upgradeStash,
  moveProduct,
  storeCash,
  setStashGuard,
  effectiveSeizurePct,
  effectiveCapacity,
  diversificationIndex,
  capacityRemaining,
  stashUnits,
  stashCapacity,
  resolveRaid,
  stashCost,
  stashUpgradeCost,
  getStashType,
  STASH_MAX_LEVEL,
  WIPED_CAPITAL_FLAG,
  spawnCrew,
  COUNTRIES,
  capitalFloorFor,
  footholdCost,
  netWorth,
  type GameState,
  type Stash,
  type RaidEvent,
} from '@/engine';

/** Build a stash of a given type with explicit cash/inventory (bypasses caps). */
function mkStash(
  id: string,
  type: Stash['type'],
  opts: { cash?: number; weed?: number; guardCrewId?: string } = {},
): Stash {
  const base = createInitialState('mk').stashes[0] as Stash;
  const stash: Stash = {
    id,
    name: id,
    countryId: 'x',
    type,
    dirtyCash: opts.cash ?? 0,
    inventory: { ...base.inventory, weed: opts.weed ?? 0 },
  };
  return opts.guardCrewId === undefined ? stash : { ...stash, guardCrewId: opts.guardCrewId };
}

/** Replace the run's stashes wholesale, immutably. */
function withStashes(state: GameState, stashes: Stash[]): GameState {
  return { ...state, stashes };
}

/** A CIA-tier raid event targeting a specific stash. */
function raidOn(targetStashId: string): RaidEvent {
  return { targetStashId, tier: 'cia', heatAtRoll: 90 };
}

describe('capacity — per-archetype (design/09 A.3)', () => {
  it('reports capacity and remaining space from the stash type', () => {
    const floor = mkStash('f', 'floor', { weed: 10 });
    expect(stashCapacity(floor)).toBe(getStashType('floor').capacity);
    expect(capacityRemaining(floor)).toBe(getStashType('floor').capacity - 10);
    expect(stashUnits(floor)).toBe(10);
  });
});

describe('addStash — build cost & upgrade curve (design/09 A.5)', () => {
  it('builds a stash and deducts the base cost from clean cash', () => {
    const base = { ...createInitialState('add'), cleanCash: 100_000 };
    const result = addStash(base, 'buried');
    expect(result.rejected).toBeUndefined();
    expect(result.stash?.type).toBe('buried');
    expect(result.state.cleanCash).toBe(100_000 - stashCost('buried', 0));
    expect(result.state.stashes).toHaveLength(base.stashes.length + 1);
    // A fresh stash starts empty.
    expect(stashUnits(result.stash as Stash)).toBe(0);
    expect((result.stash as Stash).dirtyCash).toBe(0);
  });

  it('a second build on the same spot rejects without mutating (one stash per spot)', () => {
    const start: GameState = { ...createInitialState('spot'), cleanCash: 1_000_000 };
    const first = addStash(start, 'buried');
    expect(first.rejected).toBeUndefined();
    // A second buried in the SAME country is rejected — upgrade the one you have.
    const second = addStash(first.state, 'buried');
    expect(second.rejected).toBe('already-present');
    expect(second.stash).toBeNull();
    expect(second.state).toBe(first.state); // no mutation
    // Home already holds a floor stash — building another floor rejects too.
    const dupFloor = addStash(start, 'floor');
    expect(dupFloor.rejected).toBe('already-present');
  });

  it('rejects an unaffordable build without mutating', () => {
    const broke = { ...createInitialState('poor'), cleanCash: 100 };
    const result = addStash(broke, 'safehouse');
    expect(result.rejected).toBe('insufficient-funds');
    expect(result.stash).toBeNull();
    expect(result.state).toBe(broke);
  });

  it('a negative net worth (loan debt) does NOT block a same-region open (no capital floor)', () => {
    const base = createInitialState('negworth');
    // A same-region country carries no capital floor (capitalFloorFor === 0).
    const sameRegion = COUNTRIES.find(
      (c) => c.id !== base.world.startingCountry.id && capitalFloorFor(base, c.id) === 0,
    );
    expect(sameRegion).toBeDefined();
    const target = (sameRegion as { id: string }).id;
    const cost = footholdCost(base, 'floor', target);
    // Cash covers the open, but a big loan pushes net worth deeply negative.
    const start: GameState = {
      ...base,
      cleanCash: cost,
      debt: { ...base.debt, active: true, principal: cost * 100, accruedInterest: 0 },
    };
    expect(netWorth(start)).toBeLessThan(0);
    const result = addStash(start, 'floor', { countryId: target });
    // Pre-fix this rejected as 'insufficient-capital' against a phantom $0 floor.
    expect(result.rejected).toBeUndefined();
    expect(result.stash?.countryId).toBe(target);
  });
});

describe('upgradeStash — levels for space (design/13 G; Prompt 49)', () => {
  it('raises effective capacity on the shown curve and charges base × 1.15^level', () => {
    const start: GameState = { ...createInitialState('upg'), cleanCash: 1_000_000 };
    const home = start.stashes[0] as Stash;
    const capL1 = effectiveCapacity(start, home);
    const cost = stashUpgradeCost('floor', 1, start.config.stashes);

    const up = upgradeStash(start, home.id);
    expect(up.rejected).toBeUndefined();
    expect(up.stash?.level).toBe(2);
    expect(start.cleanCash - up.state.cleanCash).toBe(cost);
    const capL2 = effectiveCapacity(up.state, up.state.stashes[0] as Stash);
    expect(capL2).toBeGreaterThan(capL1); // steeper hold at level 2
  });

  it('rejects an unaffordable or maxed upgrade without mutating', () => {
    const broke = { ...createInitialState('upg-broke'), cleanCash: 0 };
    const short = upgradeStash(broke, broke.stashes[0]!.id);
    expect(short.rejected).toBe('insufficient-funds');
    expect(short.state).toBe(broke);
    expect(upgradeStash(broke, 'nope').rejected).toBe('no-stash');

    // A stash already at the cap can't be upgraded further.
    const maxed: GameState = {
      ...createInitialState('upg-max'),
      cleanCash: 1_000_000,
      stashes: [{ ...(createInitialState('upg-max').stashes[0] as Stash), level: STASH_MAX_LEVEL }],
    };
    const res = upgradeStash(maxed, maxed.stashes[0]!.id);
    expect(res.rejected).toBe('max-level');
    expect(res.state).toBe(maxed);
  });
});

describe('moveProduct — capacity + access-speed enforced (design/09 A.3)', () => {
  it('moves product and reports the slower stash’s travel delay', () => {
    const home = mkStash('home', 'floor', { weed: 30 });
    const cache = mkStash('cache', 'buried');
    const state = withStashes(createInitialState('move'), [home, cache]);

    const result = moveProduct(state, 'home', 'cache', 'weed', 20);
    expect(result.ok).toBe(true);
    expect(result.travelDelayHours).toBe(getStashType('buried').travelDelayHours);
    const from = result.state.stashes.find((s) => s.id === 'home') as Stash;
    const to = result.state.stashes.find((s) => s.id === 'cache') as Stash;
    expect(from.inventory.weed).toBe(10);
    expect(to.inventory.weed).toBe(20);
  });

  it('rejects a move that would exceed the destination capacity, without mutating', () => {
    const from = mkStash('from', 'buried', { weed: 40 });
    const to = mkStash('to', 'floor', { weed: 45 }); // floor cap 50
    const state = withStashes(createInitialState('cap'), [from, to]);
    const result = moveProduct(state, 'from', 'to', 'weed', 10); // 45 + 10 > 50
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe('insufficient-capacity');
    expect(result.state).toBe(state);
  });

  it('rejects bad qty, unknown/same stash, and shortfalls', () => {
    const a = mkStash('a', 'floor', { weed: 5 });
    const b = mkStash('b', 'floor');
    const state = withStashes(createInitialState('bad'), [a, b]);
    expect(moveProduct(state, 'a', 'b', 'weed', 0).rejected).toBe('invalid-qty');
    expect(moveProduct(state, 'a', 'a', 'weed', 1).rejected).toBe('invalid-move');
    expect(moveProduct(state, 'a', 'zzz', 'weed', 1).rejected).toBe('no-stash');
    expect(moveProduct(state, 'a', 'b', 'weed', 6).rejected).toBe('insufficient-inventory');
  });
});

describe('storeCash — located dirty cash (design/09 A.3a)', () => {
  it('moves dirty cash between stashes and rejects a shortfall', () => {
    const a = mkStash('a', 'safehouse', { cash: 5000 });
    const b = mkStash('b', 'floor');
    const state = withStashes(createInitialState('cash'), [a, b]);

    const ok = storeCash(state, 'a', 'b', 2000);
    expect(ok.ok).toBe(true);
    expect((ok.state.stashes.find((s) => s.id === 'a') as Stash).dirtyCash).toBe(3000);
    expect((ok.state.stashes.find((s) => s.id === 'b') as Stash).dirtyCash).toBe(2000);

    expect(storeCash(state, 'a', 'b', 9999).rejected).toBe('insufficient-funds');
    expect(storeCash(state, 'a', 'b', 0).rejected).toBe('invalid-amount');
  });
});

describe('effectiveSeizurePct — guard loyalty raises risk (design/09 A.3a)', () => {
  it('a low-loyalty guard raises seizure above a loyal one; unguarded vault is penalized', () => {
    const vault = mkStash('vault', 'safehouse');
    const state: GameState = {
      ...withStashes(createInitialState('guard'), [vault]),
      crew: [
        spawnCrew('deon', { id: 'loyal', loyalty: 100 }),
        spawnCrew('reyes', { id: 'rat', loyalty: 0 }),
      ],
    };
    const base = getStashType('safehouse').seizurePct;

    const loyal = effectiveSeizurePct(setStashGuard(state, 'vault', 'loyal'), 'vault');
    const disloyal = effectiveSeizurePct(setStashGuard(state, 'vault', 'rat'), 'vault');
    const unguarded = effectiveSeizurePct(state, 'vault'); // requiresGuard, none set

    expect(loyal).toBeCloseTo(base, 6); // a fully loyal guard adds nothing
    expect(disloyal).toBeGreaterThan(loyal);
    expect(unguarded).toBeGreaterThan(loyal);
  });

  it('clearing a guard removes the field entirely (exactOptional-safe)', () => {
    const vault = mkStash('vault', 'floor');
    const state = withStashes(createInitialState('clear'), [vault]);
    const guarded = setStashGuard(state, 'vault', 'someone');
    expect((guarded.stashes[0] as Stash).guardCrewId).toBe('someone');
    const cleared = setStashGuard(guarded, 'vault', undefined);
    expect('guardCrewId' in (cleared.stashes[0] as Stash)).toBe(false);
  });
});

describe('resolveRaid — fairness law (design/09 A.4)', () => {
  it('displayed seizure % equals the value rolled against', () => {
    const cache = mkStash('c', 'buried', { weed: 50 });
    const state = withStashes(createInitialState('fair-one'), [cache]);
    const raid = raidOn('c');
    const result = resolveRaid(state, raid, rngFor(state));
    expect(result.displayedSeizurePct).toBe(effectiveSeizurePct(state, 'c'));
    expect(result.seized).toBe(result.rolledValue < result.displayedSeizurePct);
  });

  it('observed seizure frequency ≈ displayed % over many raids', () => {
    const cache = mkStash('c', 'buried'); // 0.40, unguarded but not requiresGuard, cash 0
    const base = withStashes(createInitialState('fair-mc'), [cache]);
    const pct = effectiveSeizurePct(base, 'c');
    const raid = raidOn('c');

    const N = 50_000;
    let seized = 0;
    let rngState = base.rngState;
    for (let i = 0; i < N; i++) {
      const trial: GameState = { ...base, rngState };
      const result = resolveRaid(trial, raid, rngFor(trial));
      expect(result.displayedSeizurePct).toBe(pct); // never drifts
      if (result.seized) seized++;
      rngState = result.state.rngState;
    }
    expect(seized / N).toBeCloseTo(pct, 2); // within ~0.005
  });
});

describe('resolveRaid — diversification is survival (design/09 A.2)', () => {
  /** Advance the RNG until the raid on `id` actually seizes, returning the result. */
  function untilSeized(state: GameState, id: string) {
    let rngState = state.rngState;
    for (let i = 0; i < 2000; i++) {
      const trial: GameState = { ...state, rngState };
      const result = resolveRaid(trial, raidOn(id), rngFor(trial));
      if (result.seized) return result;
      rngState = result.state.rngState;
    }
    throw new Error('no seizure in 2000 tries');
  }

  it('a diversified player loses <40% of product to one raid and is not wiped', () => {
    const stashes = [
      mkStash('s1', 'buried', { weed: 100, cash: 20_000 }),
      mkStash('s2', 'buried', { weed: 100, cash: 20_000 }),
      mkStash('s3', 'buried', { weed: 100, cash: 20_000 }),
    ];
    const state = withStashes(createInitialState('diverse'), stashes);

    const result = untilSeized(state, 's1');
    expect(result.productLossFraction).toBeLessThan(0.4); // ~1/3
    expect(result.wipedOperatingCapital).toBe(false); // 40k cash survives elsewhere
    // Only the raided location is touched; the others are byte-identical.
    const after = result.state.stashes;
    expect(after.find((s) => s.id === 's2')).toEqual(stashes[1]);
    expect(after.find((s) => s.id === 's3')).toEqual(stashes[2]);
    expect((after.find((s) => s.id === 's1') as Stash).inventory.weed).toBe(0);
    expect((after.find((s) => s.id === 's1') as Stash).dirtyCash).toBe(0);
  });

  it('an over-concentrated player can be wiped (flag set, run NOT ended)', () => {
    const all = mkStash('all', 'floor', { weed: 300, cash: 20_000 });
    const state: GameState = {
      ...withStashes(createInitialState('concentrated'), [all]),
      cleanCash: 0,
    };
    const result = untilSeized(state, 'all');
    expect(result.productLossFraction).toBe(1); // everything gone
    expect(result.wipedOperatingCapital).toBe(true);
    expect(result.state.flags[WIPED_CAPITAL_FLAG]).toBe(true);
    // Storage never ends the run itself — that's Prompt 11.
    expect(result.state.runStatus).toBe('active');
  });

  it('a miss (or a decoy) loses nothing', () => {
    const decoy = mkStash('decoy', 'decoy');
    const real = mkStash('real', 'buried', { weed: 100, cash: 5000 });
    const state = withStashes(createInitialState('decoy'), [decoy, real]);
    // A decoy has 0% seizure — a raid on it can never take anything.
    const result = resolveRaid(state, raidOn('decoy'), rngFor(state));
    expect(result.seized).toBe(false);
    expect(result.productUnitsLost).toBe(0);
    expect(result.state.stashes).toEqual(state.stashes);
  });
});

describe('diversificationIndex — telemetry signal (design/09 telemetry)', () => {
  it('is 0 when concentrated in one stash and rises as value spreads', () => {
    const one = withStashes(createInitialState('div1'), [
      mkStash('a', 'floor', { cash: 1000 }),
    ]);
    expect(diversificationIndex(one)).toBe(0);

    const two = withStashes(createInitialState('div2'), [
      mkStash('a', 'floor', { cash: 1000 }),
      mkStash('b', 'floor', { cash: 1000 }),
    ]);
    expect(diversificationIndex(two)).toBeCloseTo(0.5, 6);
  });

  it('is 0 for an empty (no-value) run', () => {
    const empty = withStashes(createInitialState('div0'), [mkStash('a', 'floor')]);
    expect(diversificationIndex(empty)).toBe(0);
  });
});

describe('offline is safe — raids never resolve while away (GDD §6)', () => {
  it('settleOffline seizes nothing and touches no stash', () => {
    const hot: GameState = {
      ...createInitialState('offline'),
      heat: 95,
      stashes: [mkStash('s1', 'floor', { weed: 40, cash: 50_000 })],
    };
    for (const hours of [1, 100, 10_000]) {
      const { state: settled } = settleOffline(hot, hours);
      expect(settled.stashes).toEqual(hot.stashes); // nothing seized
      expect(settled.flags[WIPED_CAPITAL_FLAG]).toBeUndefined();
    }
  });
});

describe('a seized raid discloses its numbers in the scene (design/13 A6)', () => {
  it('the raid feed line carries the dirty $ and the units taken', async () => {
    const { raidStep } = await import('@/engine');
    const base = createInitialState('raid-amounts');
    const stocked = (s: GameState): GameState => ({
      ...s,
      heat: 95,
      stashes: [
        {
          ...base.stashes[0]!,
          dirtyCash: 12_400,
          inventory: { ...base.stashes[0]!.inventory, weed: 40 },
        },
      ],
    });

    let s = stocked(base);
    let scene: GameState['pendingChoices'][number] | undefined;
    for (let i = 0; i < 2_000 && !scene; i++) {
      s = raidStep(s, 24);
      scene = s.pendingChoices.find(
        (c) => c.kind === 'raid' && c.summary.includes('seized'),
      );
      if (!scene) s = stocked(s); // re-stock so the next roll has real stakes
    }

    expect(scene).toBeTruthy();
    // Dirty cash never silently vanishes — the loss line names its numbers.
    expect(scene!.summary).toContain('$12,400 dirty');
    expect(scene!.summary).toContain('40 units seized');
  });
});
