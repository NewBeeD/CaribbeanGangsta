import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  addStash,
  consolidationProgress,
  createInitialState,
  empireComposite,
  footholdCost,
  isCountryConsolidated,
  maxVulnerability,
  raidChance,
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

    // A non-wire lieutenant unlocks it.
    const withLt: GameState = {
      ...s,
      crew: [...s.crew, spawnCrew('deon', { id: 'lt', role: 'lieutenant' })],
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
