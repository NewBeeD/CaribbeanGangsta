import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  addStash,
  capitalFloorFor,
  consolidationProgress,
  createInitialState,
  crewGateBlocksOpen,
  empireComposite,
  expansionCooldownRemaining,
  expansionOnCooldown,
  footholdCost,
  isCountryConsolidated,
  maxVulnerability,
  netWorth,
  raidChance,
  requiredLieutenants,
  spawnCrew,
  stashVulnerability,
  type GameState,
  type Stash,
} from '@/engine';

/** A run with cash on hand so expansion is affordable. */
function funded(seed: string, cash = 10_000_000): GameState {
  return { ...createInitialState(seed), cleanCash: cash };
}

/** The full roster entry (with region) for the run's home country. */
function homeCountry(state: GameState): typeof COUNTRIES[number] {
  return COUNTRIES.find((c) => c.id === state.world.startingCountry.id)!;
}

/** The countries that are NOT the run's home, in roster order. */
function others(state: GameState): readonly typeof COUNTRIES[number][] {
  const home = state.world.startingCountry.id;
  return COUNTRIES.filter((c) => c.id !== home);
}

function stashIn(state: GameState, countryId: string): Stash {
  return state.stashes.find((s) => s.countryId === countryId)!;
}

// --- Reach- and region-scaled cost (money gate, steeper) ---------------------

describe('territory cost — reach & region scaled (Ideas2 item 5)', () => {
  it('a later district costs more than the first foothold', () => {
    const s = funded('reach');
    const home = homeCountry(s);
    const near = others(s).filter((c) => c.region === home.region);
    const first = near[0]!;
    const second = near[1]!;

    const cost1 = footholdCost(s, 'floor', first.id);
    const held = addStash(s, 'floor', { countryId: first.id }).state;
    const cost2 = footholdCost(held, 'floor', second.id);
    expect(cost2).toBeGreaterThan(cost1);
  });

  it('a new far region costs more than a same-region hop at equal reach', () => {
    const s = funded('region');
    const home = homeCountry(s);
    const sameRegion = others(s).find((c) => c.region === home.region)!;
    const farRegion = others(s).find((c) => c.region === 'asia')!;
    expect(footholdCost(s, 'floor', farRegion.id)).toBeGreaterThan(
      footholdCost(s, 'floor', sameRegion.id),
    );
  });

  it('reinforcing a held country pays the plain step (no reach surcharge)', () => {
    const s = funded('reinforce');
    const home = s.world.startingCountry.id;
    // Same country, so it is a reinforce — cost must NOT carry the region/reach jump.
    const openNew = footholdCost(s, 'floor', others(s)[0]!.id);
    const reinforceHome = footholdCost(s, 'floor', home);
    expect(reinforceHome).toBeLessThan(openNew);
  });

  it('addStash charges exactly footholdCost (shown = paid)', () => {
    const s = funded('fairness');
    const target = others(s)[0]!;
    const cost = footholdCost(s, 'floor', target.id);
    const after = addStash(s, 'floor', { countryId: target.id }).state;
    expect(s.cleanCash - after.cleanCash).toBe(cost);
  });
});

// --- Opening a route: heat spike, exposure stamp, telegraph ------------------

describe('opening a route — takeover heat, exposure, telegraph', () => {
  it('stamps openedAtHours, spikes heat once, and queues an exposed hook', () => {
    const base = { ...funded('open'), heat: 10, clock: { hours: 100, day: 5, week: 1 } };
    const target = others(base)[0]!;
    const res = addStash(base, 'floor', { countryId: target.id });

    expect(res.stash?.openedAtHours).toBe(100);
    expect(res.state.heat).toBe(10 + base.config.territory.TERRITORY_TAKEOVER_HEAT);
    expect(res.state.pendingChoices.some((p) => p.kind === 'territory-exposed')).toBe(true);
  });

  it('a second stash of a type already held rejects — one stash per spot (Prompt 49)', () => {
    const base = { ...funded('reinforce-open'), heat: 10 };
    const home = base.world.startingCountry.id;
    // Home already holds its floor stash; building another floor there rejects,
    // stamps nothing, spikes no heat, and never mutates (you upgrade instead).
    const res = addStash(base, 'floor', { countryId: home });

    expect(res.rejected).toBe('already-present');
    expect(res.stash).toBeNull();
    expect(res.state).toBe(base);
  });
});

// --- Vulnerability window (emergent raid risk, offline-safe) -----------------

describe('vulnerability window — fresh turf runs hot, then fades', () => {
  it('a fresh foothold raises raid chance and fades to base over the window', () => {
    const base = { ...funded('vuln'), heat: 50 };
    const target = others(base)[0]!;
    const opened = addStash(base, 'floor', { countryId: target.id }).state;

    expect(maxVulnerability(opened)).toBeGreaterThan(0);
    const window = opened.config.territory.VULNERABILITY_WINDOW_HOURS;
    const settled: GameState = {
      ...opened,
      clock: { ...opened.clock, hours: opened.clock.hours + window },
    };

    expect(raidChance(opened, 1)).toBeGreaterThan(raidChance(settled, 1));
    expect(maxVulnerability(settled)).toBe(0);
  });

  it('the surcharge fades linearly across the window', () => {
    const base = funded('fade');
    const target = others(base)[0]!;
    const opened = addStash(base, 'floor', { countryId: target.id }).state;
    const fresh = stashIn(opened, target.id);
    const cfg = opened.config.territory;

    const half: GameState = {
      ...opened,
      clock: { ...opened.clock, hours: opened.clock.hours + cfg.VULNERABILITY_WINDOW_HOURS / 2 },
    };
    expect(stashVulnerability(half, fresh)).toBeCloseTo(
      (cfg.VULNERABILITY_RAID_MULTIPLIER - 1) * 0.5,
      5,
    );
  });

  it('an established (home) stash is never exposed', () => {
    const s = funded('established');
    expect(stashVulnerability(s, s.stashes[0]!)).toBe(0);
  });
});

// --- Consolidation hold (time gate — relaxes open access for territory) ------

describe('consolidation hold — a new district is contested until held', () => {
  it('a fresh district is contested and does not count toward reach until held', () => {
    const s = funded('consolidate');
    const target = others(s)[0]!;
    const compBefore = empireComposite(s);

    const opened = addStash(s, 'floor', { countryId: target.id }).state;
    expect(isCountryConsolidated(opened, target.id)).toBe(false);
    // Contested reach is not counted — composite is unchanged despite the new stash.
    expect(empireComposite(opened)).toBe(compBefore);

    const hold = opened.config.territory.CONSOLIDATION_HOURS;
    const later: GameState = {
      ...opened,
      clock: { ...opened.clock, hours: opened.clock.hours + hold },
    };
    expect(isCountryConsolidated(later, target.id)).toBe(true);
    expect(empireComposite(later)).toBeGreaterThan(compBefore);
  });

  it('consolidation progress runs 0→1 across the hold', () => {
    const s = funded('progress');
    const target = others(s)[0]!;
    const opened = addStash(s, 'floor', { countryId: target.id }).state;
    const fresh = stashIn(opened, target.id);
    const hold = opened.config.territory.CONSOLIDATION_HOURS;

    expect(consolidationProgress(opened, fresh)).toBe(0);
    const mid: GameState = {
      ...opened,
      clock: { ...opened.clock, hours: opened.clock.hours + hold / 2 },
    };
    expect(consolidationProgress(mid, fresh)).toBeCloseTo(0.5, 5);
  });
});

// --- Crew requirement (flag gate — relaxes open access for territory) --------

describe('crew gate — subsequent districts need a lieutenant', () => {
  it('the first expansions are free of the requirement; the next needs a lieutenant', () => {
    let s = funded('gate');
    const os = others(s);
    // First new country is allowed (reach still under the free tier).
    s = addStash(s, 'floor', { countryId: os[0]!.id }).state;

    // Opening another now trips the crew gate — rejected without mutation.
    const rejected = addStash(s, 'floor', { countryId: os[1]!.id });
    expect(rejected.stash).toBeNull();
    expect(rejected.rejected).toBe('needs-lieutenant');
    expect(rejected.state).toBe(s);

    // A non-wire lieutenant unlocks it — advance past the expansion cooldown so this
    // isolates the CREW gate (opening os[0] just started the cooldown clock).
    const cool = s.config.territory.TERRITORY_EXPANSION_COOLDOWN_HOURS;
    const withLt: GameState = {
      ...s,
      crew: [...s.crew, spawnCrew('deon', { id: 'lt', role: 'lieutenant' })],
      clock: { ...s.clock, hours: s.clock.hours + cool },
    };
    const ok = addStash(withLt, 'floor', { countryId: os[1]!.id });
    expect(ok.stash?.countryId).toBe(os[1]!.id);
  });

  it('a flipped (wire) lieutenant does not satisfy the gate', () => {
    let s = funded('gate-wire');
    const os = others(s);
    s = addStash(s, 'floor', { countryId: os[0]!.id }).state;
    const withWire: GameState = {
      ...s,
      crew: [...s.crew, spawnCrew('deon', { id: 'lt', role: 'lieutenant', isWire: true })],
    };
    expect(addStash(withWire, 'floor', { countryId: os[1]!.id }).rejected).toBe(
      'needs-lieutenant',
    );
  });
});

/** Seed the run holding ESTABLISHED footholds in `countryIds` (no openedAtHours — so
 *  they neither expose nor start a cooldown), on top of the home stash. */
function holding(state: GameState, countryIds: readonly string[]): GameState {
  const home = state.stashes[0]!;
  // Home is an established stash (no openedAtHours) — copies inherit that, so these
  // read as controlled from the start (no exposure, no cooldown).
  const extra: Stash[] = countryIds.map((id, i) => ({
    ...home,
    id: `held-${i}`,
    countryId: id,
  }));
  return { ...state, stashes: [home, ...extra] };
}

/** A lieutenant crew member (non-wire by default). */
function lts(count: number): ReturnType<typeof spawnCrew>[] {
  return Array.from({ length: count }, (_, i) =>
    spawnCrew('deon', { id: `lt-${i}`, role: 'lieutenant' }),
  );
}

// --- A. Scaling crew requirement (harder as the empire grows) ----------------

describe('crew gate SCALES — a wider empire needs more lieutenants', () => {
  it('one lieutenant covers the first tier; a wider empire needs a second', () => {
    const base = funded('scale');
    const os = others(base);
    // Hold 4 countries (home + 3): required = 1 + floor((4-2)/3) = 1.
    const four = holding(base, os.slice(0, 3).map((c) => c.id));
    expect(requiredLieutenants(four)).toBe(1);
    // Hold 5 countries (home + 4): required climbs to 2.
    const five = holding(base, os.slice(0, 4).map((c) => c.id));
    expect(requiredLieutenants(five)).toBe(2);

    const target = os[4]!.id; // an un-held country to open next
    // With five held and a single lieutenant, the next open is crew-blocked…
    const oneLt: GameState = { ...five, crew: [...five.crew, ...lts(1)] };
    expect(crewGateBlocksOpen(oneLt, target)).toBe(true);
    expect(addStash({ ...oneLt, cleanCash: 10_000_000 }, 'floor', { countryId: target }).rejected).toBe(
      'needs-lieutenant',
    );
    // …a second lieutenant clears it.
    const twoLt: GameState = { ...five, crew: [...five.crew, ...lts(2)] };
    expect(crewGateBlocksOpen(twoLt, target)).toBe(false);
  });
});

// --- B. Expansion cooldown (pace the blob) -----------------------------------

describe('expansion cooldown — opens are paced, reinforcing is not', () => {
  it('blocks a second open until the cooldown clears, then allows it', () => {
    // Enough lieutenants + cash so ONLY the cooldown can bite; same-region so no
    // capital floor and home region is cheap.
    const base: GameState = { ...funded('cooldown'), crew: [...funded('cooldown').crew, ...lts(3)], heat: 0 };
    const home = homeCountry(base);
    const sameRegion = others(base).filter((c) => c.region === home.region);
    const first = addStash(base, 'floor', { countryId: sameRegion[0]!.id }).state;

    expect(expansionOnCooldown(first)).toBe(true);
    const blocked = addStash(first, 'floor', { countryId: sameRegion[1]!.id });
    expect(blocked.rejected).toBe('expansion-cooldown');
    expect(blocked.state).toBe(first);

    const cool = base.config.territory.TERRITORY_EXPANSION_COOLDOWN_HOURS;
    const later: GameState = { ...first, clock: { ...first.clock, hours: first.clock.hours + cool } };
    expect(expansionCooldownRemaining(later)).toBe(0);
    expect(addStash(later, 'floor', { countryId: sameRegion[1]!.id }).stash?.countryId).toBe(
      sameRegion[1]!.id,
    );
  });

  it('reinforcing a held country is NOT on cooldown', () => {
    const base: GameState = { ...funded('cooldown-reinforce'), crew: [...funded('cd').crew, ...lts(3)] };
    const opened = addStash(base, 'floor', { countryId: others(base)[0]!.id }).state;
    expect(expansionOnCooldown(opened)).toBe(true);
    // A non-'floor' stash in the HOME country is a reinforce (isHeldCountry) — allowed.
    const reinforce = addStash(opened, 'buried', { countryId: opened.world.startingCountry.id });
    expect(reinforce.rejected).toBeUndefined();
  });
});

// --- C. Heat ceiling (expansion is loud) -------------------------------------

describe('heat ceiling — too hot to open new turf', () => {
  it('blocks opening at/above the ceiling, allows it once cool', () => {
    const ceiling = createInitialState('heat').config.territory.TERRITORY_MAX_HEAT_TO_EXPAND;
    const target = (s: GameState) => others(s)[0]!.id; // same-region, first open (no crew/cooldown)

    const hot: GameState = { ...funded('too-hot'), heat: ceiling };
    const blocked = addStash(hot, 'floor', { countryId: target(hot) });
    expect(blocked.rejected).toBe('too-hot');
    expect(blocked.state).toBe(hot);

    const cool: GameState = { ...funded('cool'), heat: ceiling - 1 };
    expect(addStash(cool, 'floor', { countryId: target(cool) }).stash).not.toBeNull();
  });
});

// --- D. Cross-region capital floor (no leapfrogging) -------------------------

describe('cross-region capital floor — net worth gates the far continent', () => {
  it('same-region opens have no floor even when nearly broke', () => {
    const base = funded('same-region', 50_000);
    const home = homeCountry(base);
    const sameRegion = others(base).find((c) => c.region === home.region)!;
    expect(capitalFloorFor(base, sameRegion.id)).toBe(0);
    expect(addStash(base, 'floor', { countryId: sameRegion.id }).stash).not.toBeNull();
  });

  it('a new region rejects below the floor and opens at/above it (shown = enforced)', () => {
    const asia = COUNTRIES.find((c) => c.region === 'asia')!;
    const zero = funded('capital', 0);
    const floor = capitalFloorFor(zero, asia.id);
    expect(floor).toBeGreaterThan(0);
    // A fresh run carries some starting dirty cash — offset clean cash off that base
    // so net worth lands exactly on the floor boundary.
    const base = netWorth(zero);

    const below: GameState = { ...zero, cleanCash: floor - 1 - base };
    expect(netWorth(below)).toBe(floor - 1);
    expect(addStash(below, 'floor', { countryId: asia.id }).rejected).toBe('insufficient-capital');

    const at: GameState = { ...zero, cleanCash: floor - base };
    expect(netWorth(at)).toBe(floor);
    expect(addStash(at, 'floor', { countryId: asia.id }).stash?.countryId).toBe(asia.id);
  });
});
