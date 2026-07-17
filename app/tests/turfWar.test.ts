import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  addStash,
  battleStrength,
  createInitialState,
  declareWar,
  emptyArmory,
  openTurfWar,
  payTribute,
  resolveBattle,
  settleOffline,
  spawnCrew,
  sueForTruce,
  truceCost,
  tunedConfig,
  turfWarStep,
  warForCountry,
  type BattleCommitment,
  type GameState,
  type Rng,
} from '@/engine';

// A fixed-draw stub of the RNG — resolveBattle only ever calls `next()`. A draw
// BELOW the shown win chance wins; at/above it loses (shown = rolled).
function fixedRng(value: number): Rng {
  return { next: () => value } as unknown as Rng;
}

function foreignCountryId(state: GameState): string {
  return COUNTRIES.find((c) => c.id !== state.world.startingCountry.id)!.id;
}

/** A funded run holding a foreign country, with the first rival at high tension. */
function warReady(seed = 'turf'): {
  state: GameState;
  rivalId: string;
  countryId: string;
} {
  let s: GameState = { ...createInitialState(seed), cleanCash: 10_000_000 };
  const countryId = foreignCountryId(s);
  s = addStash(s, 'floor', { countryId }).state;
  const rivalId = s.world.rivals[0]!.id;
  s = { ...s, rivals: s.rivals.map((r) => (r.id === rivalId ? { ...r, tension: 90 } : r)) };
  return { state: s, rivalId, countryId };
}

// --- Opening a war -------------------------------------------------------------

describe('openTurfWar', () => {
  it('opens a war over a held country, taking ignition heat and a telegraph', () => {
    const { state, rivalId, countryId } = warReady();
    const before = state.heat;
    const r = openTurfWar(state, countryId, rivalId, 'rival');
    expect(r.war).toBeDefined();
    expect(warForCountry(r.state, countryId)?.rivalId).toBe(rivalId);
    expect(r.state.heat).toBeGreaterThan(before);
    expect(r.state.pendingChoices.length).toBeGreaterThan(state.pendingChoices.length);
  });

  it('refuses a country the player does not hold', () => {
    const { state, rivalId } = warReady();
    // A country with no stash.
    const unheld = COUNTRIES.find(
      (c) => !state.stashes.some((s) => s.countryId === c.id),
    )!.id;
    const r = openTurfWar(state, unheld, rivalId, 'rival');
    expect(r.war).toBeUndefined();
    expect(r.rejected).toBe('country-not-held');
    expect(r.state).toBe(state);
  });

  it('refuses a second war in a country already contested', () => {
    const { state, rivalId, countryId } = warReady();
    const first = openTurfWar(state, countryId, rivalId, 'rival');
    const second = openTurfWar(first.state, countryId, rivalId, 'rival');
    expect(second.rejected).toBe('already-at-war');
  });
});

// --- Battle strength (shown = rolled) -----------------------------------------

describe('battleStrength', () => {
  it('rises with committed crew and firepower, lifting the win chance', () => {
    const { state, rivalId, countryId } = warReady();
    const opened = openTurfWar(state, countryId, rivalId, 'rival');
    const war = opened.state.turfWars[0]!;

    const bare = battleStrength(opened.state, war, { crewIds: [], arms: {} });

    const armed: GameState = {
      ...opened.state,
      crew: [spawnCrew('deon')],
      armory: { ...emptyArmory(), military: 5 },
    };
    const strong = battleStrength(armed, war, {
      crewIds: ['crew-deon'],
      arms: { military: 5 },
    });

    expect(strong.playerStrength).toBeGreaterThan(bare.playerStrength);
    expect(strong.winChance).toBeGreaterThan(bare.winChance);
  });

  it('clamps the win chance so nothing is ever a sure thing', () => {
    const { state, rivalId, countryId } = warReady();
    const opened = openTurfWar(state, countryId, rivalId, 'rival');
    const war = opened.state.turfWars[0]!;
    const armed: GameState = {
      ...opened.state,
      armory: { ...emptyArmory(), military: 10_000 },
    };
    const b = battleStrength(armed, war, { arms: { military: 10_000 }, crewIds: [] });
    expect(b.winChance).toBeLessThanOrEqual(state.config.turfWar.BATTLE_WIN_CHANCE_MAX);
    expect(b.winChance).toBeGreaterThanOrEqual(state.config.turfWar.BATTLE_WIN_CHANCE_MIN);
  });
});

// --- Resolving a battle --------------------------------------------------------

describe('resolveBattle', () => {
  const commit: BattleCommitment = { crewIds: [], arms: {} };

  it('a win de-escalates the war', () => {
    const { state, rivalId, countryId } = warReady();
    let s = openTurfWar(state, countryId, rivalId, 'rival').state;
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 60 })) };
    const warId = s.turfWars[0]!.id;
    const r = resolveBattle(s, warId, commit, fixedRng(0)); // draw 0 < any winChance → win
    expect(r.won).toBe(true);
    expect(warForCountry(r.state, countryId)!.pressure).toBeLessThan(60);
  });

  it('a player-declared war won to resolution topples the rival', () => {
    const { state, rivalId, countryId } = warReady();
    let s = declareWar(state, countryId, rivalId).state;
    // Drop pressure near the resolve floor so one win ends it.
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 1 })) };
    const warId = s.turfWars[0]!.id;
    const r = resolveBattle(s, warId, commit, fixedRng(0));
    expect(r.won).toBe(true);
    expect(r.warEnded).toBe(true);
    expect(r.toppled).toBe(true);
    expect(r.state.rivals.find((rv) => rv.id === rivalId)?.toppled).toBe(true);
  });

  it('a loss raises pressure, heat and loss count, drops street rep, taxes the country', () => {
    const { state, rivalId, countryId } = warReady();
    const s0 = { ...state, reputation: { ...state.reputation, street: 50 } };
    const s = openTurfWar(s0, countryId, rivalId, 'rival').state;
    const warId = s.turfWars[0]!.id;
    const heatBefore = s.heat;
    const r = resolveBattle(s, warId, commit, fixedRng(1)); // draw 1 ≥ winChance → loss
    const war = warForCountry(r.state, countryId)!;
    expect(r.won).toBe(false);
    expect(war.pressure).toBeGreaterThan(0);
    expect(war.lossCount).toBe(1);
    expect(war.tributeActive).toBe(true);
    expect(r.state.heat).toBeGreaterThan(heatBefore);
    expect(r.state.reputation.street).toBeLessThan(50);
  });

  it('consumes committed weapons whether the fight is won or lost', () => {
    const { state, rivalId, countryId } = warReady();
    const armed: GameState = {
      ...openTurfWar(state, countryId, rivalId, 'rival').state,
      armory: { ...emptyArmory(), rifles: 6 },
    };
    const warId = armed.turfWars[0]!.id;
    const lost = resolveBattle(armed, warId, { crewIds: [], arms: { rifles: 4 } }, fixedRng(1));
    expect(lost.state.armory.rifles).toBe(2); // 6 − 4 committed, spent on a loss
  });

  it('seizes the country only past BOTH the pressure and loss-count thresholds', () => {
    const { state, rivalId, countryId } = warReady();
    const cfg = state.config.turfWar;
    let s = openTurfWar(state, countryId, rivalId, 'rival').state;
    // Right at the brink: high pressure, one loss short of the count.
    s = {
      ...s,
      turfWars: s.turfWars.map((w) => ({
        ...w,
        pressure: cfg.PRESSURE_SEIZE_THRESHOLD,
        lossCount: cfg.SEIZE_COUNTRY_AFTER_LOSSES - 1,
      })),
    };
    const warId = s.turfWars[0]!.id;
    const r = resolveBattle(s, warId, { crewIds: [], arms: {} }, fixedRng(1));
    expect(r.seizedCountry).toBe(true);
    expect(r.state.stashes.some((st) => st.countryId === countryId)).toBe(false);
    expect(warForCountry(r.state, countryId)).toBeUndefined();
  });

  it('never seizes the home country — home ground can only be taxed', () => {
    const s0 = { ...createInitialState('home-war'), cleanCash: 1_000_000 };
    const home = s0.world.startingCountry.id;
    const rivalId = s0.world.rivals[0]!.id;
    const cfg = s0.config.turfWar;
    let s = openTurfWar(s0, home, rivalId, 'rival').state;
    s = {
      ...s,
      turfWars: s.turfWars.map((w) => ({
        ...w,
        pressure: 100,
        lossCount: cfg.SEIZE_COUNTRY_AFTER_LOSSES + 2,
      })),
    };
    const warId = s.turfWars[0]!.id;
    const r = resolveBattle(s, warId, { crewIds: [], arms: {} }, fixedRng(1));
    expect(r.seizedCountry).toBeUndefined();
    expect(r.state.stashes.some((st) => st.countryId === home)).toBe(true);
  });
});

// --- Player offense ------------------------------------------------------------

describe('declareWar', () => {
  it('charges the up-front cost + heat and opens a player war', () => {
    const { state, rivalId, countryId } = warReady();
    const cost = state.config.turfWar.DECLARE_WAR_COST;
    const r = declareWar(state, countryId, rivalId);
    expect(r.war?.initiatedBy).toBe('player');
    expect(r.state.cleanCash).toBe(state.cleanCash - cost);
    expect(r.state.heat).toBeGreaterThan(state.heat);
  });

  it('rejects without mutating when the player cannot afford it', () => {
    const { state, rivalId, countryId } = warReady();
    const broke = { ...state, cleanCash: 0 };
    const r = declareWar(broke, countryId, rivalId);
    expect(r.rejected).toBe('cant-afford');
    expect(r.state).toBe(broke);
  });
});

// --- Truce & tribute -----------------------------------------------------------

describe('truce & tribute', () => {
  it('a truce ends the war for the shown lump sum', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const warId = s.turfWars[0]!.id;
    const cost = truceCost(s, countryId);
    const r = sueForTruce(s, warId);
    expect(r.rejected).toBeUndefined();
    expect(warForCountry(r.state, countryId)).toBeUndefined();
    expect(r.state.cleanCash).toBe(s.cleanCash - cost);
  });

  it('paying tribute drops pressure without ending the war', () => {
    const { state, rivalId, countryId } = warReady();
    let s = openTurfWar(state, countryId, rivalId, 'rival').state;
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 70 })) };
    const warId = s.turfWars[0]!.id;
    const r = payTribute(s, warId);
    const war = warForCountry(r.state, countryId);
    expect(war).toBeDefined();
    expect(war!.pressure).toBeLessThan(70);
    expect(war!.tributeActive).toBe(true);
  });
});

// --- The tick step: escalation, ignition, offline safety ----------------------

describe('turfWarStep', () => {
  it('grows the pressure of an active war over played hours', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const grown = turfWarStep(s, 10);
    expect(grown.turfWars[0]!.pressure).toBeGreaterThan(s.turfWars[0]!.pressure);
  });

  it('ignites a rival war from held ground when tension is high', () => {
    const cfg = tunedConfig({
      turfWar: { IGNITION_RATE_PER_HOUR: 50, IGNITION_TENSION_THRESHOLD: 0 },
    });
    let s: GameState = { ...createInitialState('ignite', cfg), cleanCash: 1_000_000 };
    s = addStash(s, 'floor', { countryId: foreignCountryId(s) }).state;
    const after = turfWarStep(s, 1);
    expect(after.turfWars.length).toBeGreaterThan(0);
  });

  it('never opens or escalates a war while the player is away (offline-frozen)', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const pressureBefore = s.turfWars[0]!.pressure;
    const { state: settled } = settleOffline(s, 72);
    expect(settled.turfWars.length).toBe(s.turfWars.length);
    expect(settled.turfWars[0]!.pressure).toBe(pressureBefore);
  });
});

// --- Determinism ---------------------------------------------------------------

describe('turf-war determinism', () => {
  it('same seed + same commitment yields byte-identical battle outcomes', () => {
    const a = warReady('det');
    const b = warReady('det');
    const sa = openTurfWar(a.state, a.countryId, a.rivalId, 'rival').state;
    const sb = openTurfWar(b.state, b.countryId, b.rivalId, 'rival').state;
    const ra = resolveBattle(sa, sa.turfWars[0]!.id, { crewIds: [], arms: {} });
    const rb = resolveBattle(sb, sb.turfWars[0]!.id, { crewIds: [], arms: {} });
    expect(ra.won).toBe(rb.won);
    expect(ra.state.turfWars).toEqual(rb.state.turfWars);
  });

  it('a battle draws from its own stream — the main deal/raid RNG is untouched', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const r = resolveBattle(s, s.turfWars[0]!.id, { crewIds: [], arms: {} });
    expect(r.state.rngState).toEqual(s.rngState);
  });
});
