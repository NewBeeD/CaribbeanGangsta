import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  SCHEMA_VERSION,
  addStash,
  battleCapture,
  battleStrength,
  claimForCountry,
  countryWealthIndex,
  createInitialState,
  declareWar,
  emptyArmory,
  openTurfWar,
  payTribute,
  protectionPerWeek,
  resolveBattle,
  settleOffline,
  spawnCrew,
  sueForTruce,
  toppleSpoils,
  truceCost,
  tunedConfig,
  turfIncomeStep,
  turfWarStep,
  warForCountry,
  winRepAvailable,
  type BattleCommitment,
  type GameState,
  type Rng,
  type WeaponTierId,
} from '@/engine';
import { migrateEnvelope } from '@/store';

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

// --- Rewards (design/15 Workstream A — Prompt 57) -------------------------------

describe('turf-war rewards', () => {
  const commit: BattleCommitment = { crewIds: [], arms: {} };

  it('a won battle captures rival arms per the kind table × aggression, named in the summary', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const war = s.turfWars[0]!;
    const expected = battleCapture(s, war);
    expect(Object.keys(expected).length).toBeGreaterThan(0); // defaults never drop nothing

    const r = resolveBattle(s, war.id, commit, fixedRng(0));
    expect(r.won).toBe(true);
    expect(r.captured).toEqual(expected);
    for (const [tier, units] of Object.entries(expected) as [WeaponTierId, number][]) {
      expect(r.state.armory[tier]).toBe((s.armory[tier] ?? 0) + units);
    }
    const summary = r.state.pendingChoices.at(-1)!.summary;
    expect(summary).toContain('took their guns');
  });

  it('a topple seizes dirty spoils into the contested country stash, telegraph naming the number', () => {
    const { state, rivalId, countryId } = warReady();
    let s = declareWar(state, countryId, rivalId).state;
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 1 })) };
    const spoils = toppleSpoils(s, rivalId);
    const dirtyBefore = s.stashes
      .filter((st) => st.countryId === countryId)
      .reduce((sum, st) => sum + st.dirtyCash, 0);

    const r = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(0));
    expect(r.toppled).toBe(true);
    expect(r.spoils).toBe(spoils);
    const dirtyAfter = r.state.stashes
      .filter((st) => st.countryId === countryId)
      .reduce((sum, st) => sum + st.dirtyCash, 0);
    expect(dirtyAfter).toBe(dirtyBefore + spoils);
    // The band the config targets: roughly recoups DECLARE_WAR_COST.
    expect(spoils).toBeGreaterThanOrEqual(150_000);
    expect(spoils).toBeLessThanOrEqual(500_000);
    const summary = r.state.pendingChoices.at(-1)!.summary;
    expect(summary).toContain(`$${spoils.toLocaleString('en-US')}`);
  });

  it('won battles pay street rep, clamped per war at WIN_REP_CAP_PER_WAR', () => {
    const { state, rivalId, countryId } = warReady();
    const cfg = state.config.turfWar;
    let s = openTurfWar(state, countryId, rivalId, 'rival').state;
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 60 })) };

    // First win: full BATTLE_WIN_REP, tracked on the war.
    const first = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(0));
    expect(first.repGained).toBe(cfg.BATTLE_WIN_REP);
    expect(first.state.reputation.street).toBe(s.reputation.street + cfg.BATTLE_WIN_REP);
    expect(first.state.turfWars[0]!.repEarned).toBe(cfg.BATTLE_WIN_REP);

    // A war that has already paid the cap pays nothing more.
    const capped = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, repEarned: cfg.WIN_REP_CAP_PER_WAR })) };
    expect(winRepAvailable(capped, capped.turfWars[0]!)).toBe(0);
    const r = resolveBattle(capped, capped.turfWars[0]!.id, commit, fixedRng(0));
    expect(r.repGained).toBe(0);
    expect(r.state.reputation.street).toBe(capped.reputation.street);
  });

  it('a loss pays nothing — no capture, no spoils, no rep', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const r = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(1));
    expect(r.won).toBe(false);
    expect(r.captured).toBeUndefined();
    expect(r.spoils).toBeUndefined();
    expect(r.repGained).toBeUndefined();
    expect(r.state.armory).toEqual(s.armory);
  });
});

// --- Protection turf (design/15 Workstream B — Prompt 58) -----------------------

describe('protection turf', () => {
  const commit: BattleCommitment = { crewIds: [], arms: {} };
  const HOURS_PER_WEEK = 24 * 7;

  /** Win a rival-initiated war outright, leaving a fresh 'defense' claim. */
  function defendedTurf(seed = 'turf-claim'): {
    state: GameState;
    countryId: string;
  } {
    const { state, rivalId, countryId } = warReady(seed);
    let s = openTurfWar(state, countryId, rivalId, 'rival').state;
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 1 })) };
    const r = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(0));
    expect(r.warEnded).toBe(true);
    return { state: r.state, countryId };
  }

  it('a defensive war fought off stakes a defense claim, telegraph naming the weekly figure', () => {
    const { state, rivalId, countryId } = warReady();
    let s = openTurfWar(state, countryId, rivalId, 'rival').state;
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 1 })) };
    const perWeek = protectionPerWeek(s, countryId);
    const r = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(0));
    expect(r.warEnded).toBe(true);
    expect(r.toppled).toBe(false);
    expect(r.protectionPerWeek).toBe(perWeek);
    expect(claimForCountry(r.state, countryId)?.source).toBe('defense');
    const summary = r.state.pendingChoices.at(-1)!.summary;
    expect(summary).toContain(`$${perWeek.toLocaleString('en-US')}`);
  });

  it('a topple stakes a topple claim on the same drip', () => {
    const { state, rivalId, countryId } = warReady();
    let s = declareWar(state, countryId, rivalId).state;
    s = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 1 })) };
    const r = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(0));
    expect(r.toppled).toBe(true);
    expect(claimForCountry(r.state, countryId)?.source).toBe('topple');
    expect(r.protectionPerWeek).toBe(protectionPerWeek(s, countryId));
  });

  it('a bought truce never creates a claim — pay-for-peace is not dominance', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const r = sueForTruce(s, s.turfWars[0]!.id);
    expect(r.rejected).toBeUndefined();
    expect(claimForCountry(r.state, countryId)).toBeUndefined();
  });

  it('a loss and a mid-war win stake nothing', () => {
    const { state, rivalId, countryId } = warReady();
    const s = openTurfWar(state, countryId, rivalId, 'rival').state;
    const lost = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(1));
    expect(claimForCountry(lost.state, countryId)).toBeUndefined();
    // A win that does NOT end the war (pressure stays high) claims nothing yet.
    const high = { ...s, turfWars: s.turfWars.map((w) => ({ ...w, pressure: 90 })) };
    const midWin = resolveBattle(high, high.turfWars[0]!.id, commit, fixedRng(0));
    expect(midWin.warEnded).toBeUndefined();
    expect(claimForCountry(midWin.state, countryId)).toBeUndefined();
  });

  it('drips perWeek pro-rated over the tick into the claimed country stash, dirty', () => {
    const { state, countryId } = defendedTurf();
    const perWeek = protectionPerWeek(state, countryId);
    const before = state.stashes.find((s) => s.countryId === countryId)!.dirtyCash;
    const after = turfIncomeStep(state, HOURS_PER_WEEK);
    const stash = after.stashes.find((s) => s.countryId === countryId)!;
    expect(stash.dirtyCash).toBeCloseTo(before + perWeek, 6);
    // Pro-rating: half the hours, half the drip.
    const half = turfIncomeStep(state, HOURS_PER_WEEK / 2);
    expect(half.stashes.find((s) => s.countryId === countryId)!.dirtyCash).toBeCloseTo(
      before + perWeek / 2,
      6,
    );
  });

  it('scales off the country STATIC wealth index, never the player stake (anti-compounding)', () => {
    const { state, countryId } = defendedTurf();
    const cfg = state.config.turfWar;
    expect(protectionPerWeek(state, countryId)).toBe(
      Math.round(cfg.PROTECTION_PCT * countryWealthIndex(countryId) * cfg.PROTECTION_BASE_PER_WEEK),
    );
    // Parking $1M more in the country changes the drip not one dollar.
    const parked: GameState = {
      ...state,
      stashes: state.stashes.map((s) =>
        s.countryId === countryId ? { ...s, dirtyCash: s.dirtyCash + 1_000_000 } : s,
      ),
    };
    expect(protectionPerWeek(parked, countryId)).toBe(protectionPerWeek(state, countryId));
  });

  it('a new war over claimed turf suspends the drip; resolution resumes it', () => {
    const { state, countryId } = defendedTurf();
    // A second rival moves on the profitable turf.
    const nextRival = state.world.rivals.find(
      (r) => !state.rivals.find((rs) => rs.id === r.id)?.toppled,
    )!;
    const contested = openTurfWar(state, countryId, nextRival.id, 'rival').state;
    const during = turfIncomeStep(contested, HOURS_PER_WEEK);
    expect(during.stashes.find((s) => s.countryId === countryId)!.dirtyCash).toBe(
      contested.stashes.find((s) => s.countryId === countryId)!.dirtyCash,
    );
    expect(claimForCountry(during, countryId)).toBeDefined(); // suspended, not lost
    // Fight the war off — the drip resumes.
    const rewon = resolveBattle(
      { ...contested, turfWars: contested.turfWars.map((w) => ({ ...w, pressure: 1 })) },
      contested.turfWars[0]!.id,
      commit,
      fixedRng(0),
    ).state;
    const resumed = turfIncomeStep(rewon, HOURS_PER_WEEK);
    expect(
      resumed.stashes.find((s) => s.countryId === countryId)!.dirtyCash,
    ).toBeGreaterThan(rewon.stashes.find((s) => s.countryId === countryId)!.dirtyCash);
  });

  it('the claim lapses for good when the last stash in the country is gone', () => {
    const { state, countryId } = defendedTurf();
    const sold: GameState = {
      ...state,
      stashes: state.stashes.filter((s) => s.countryId !== countryId),
    };
    const after = turfIncomeStep(sold, 1);
    expect(claimForCountry(after, countryId)).toBeUndefined();
  });

  it('a terminal seizure removes the claim with the ground', () => {
    const { state, countryId } = defendedTurf();
    const cfg = state.config.turfWar;
    const nextRival = state.world.rivals[1]!;
    let s = openTurfWar(state, countryId, nextRival.id, 'rival').state;
    s = {
      ...s,
      turfWars: s.turfWars.map((w) => ({
        ...w,
        pressure: cfg.PRESSURE_SEIZE_THRESHOLD,
        lossCount: cfg.SEIZE_COUNTRY_AFTER_LOSSES - 1,
      })),
    };
    const r = resolveBattle(s, s.turfWars[0]!.id, commit, fixedRng(1));
    expect(r.seizedCountry).toBe(true);
    expect(claimForCountry(r.state, countryId)).toBeUndefined();
  });

  it('offline earns zero — settleOffline moves neither stash cash nor claims', () => {
    const { state, countryId } = defendedTurf();
    const dirtyBefore = state.stashes.find((s) => s.countryId === countryId)!.dirtyCash;
    const { state: settled } = settleOffline(state, 72);
    expect(settled.stashes.find((s) => s.countryId === countryId)!.dirtyCash).toBe(dirtyBefore);
    expect(settled.turfClaims).toEqual(state.turfClaims);
  });
});

// --- Migration (v25 → v26: protection turf) -------------------------------------

describe('v25 → v26 migration', () => {
  it('seeds an empty claim list and the protection knobs; nothing seized', () => {
    const { state, rivalId, countryId } = warReady('mig-58');
    const current = openTurfWar(state, countryId, rivalId, 'rival').state;
    // A real v25 save: no turfClaims field, config without the protection knobs.
    const legacyTurfWar = { ...current.config.turfWar } as Record<string, unknown>;
    delete legacyTurfWar.PROTECTION_PCT;
    delete legacyTurfWar.PROTECTION_BASE_PER_WEEK;
    const { turfClaims: _turfClaims, ...rest } = current;
    const legacy = {
      ...rest,
      config: { ...current.config, turfWar: legacyTurfWar },
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      slot: 's',
      schemaVersion: 25,
      savedAt: 0,
      seed: current.seed,
      runStatus: current.runStatus,
      day: current.clock.day,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    const m = migrated as GameState;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.turfClaims).toEqual([]);
    expect(m.config.turfWar.PROTECTION_PCT).toBeGreaterThan(0);
    expect(m.config.turfWar.PROTECTION_BASE_PER_WEEK).toBeGreaterThan(0);
    // Nothing the player holds moved.
    expect(m.cleanCash).toBe(current.cleanCash);
    expect(m.stashes).toEqual(current.stashes);
    expect(m.turfWars).toEqual(current.turfWars);
    expect(m.rngState).toEqual(current.rngState);
  });
});

// --- Migration (v24 → v25: repEarned + reward knobs) ----------------------------

describe('v24 → v25 migration', () => {
  it('seeds repEarned on in-flight wars and lands the reward knobs; nothing seized', () => {
    const { state, rivalId, countryId } = warReady('mig-57');
    const current = openTurfWar(state, countryId, rivalId, 'rival').state;
    // A real v24 save: wars without repEarned, config without the reward knobs.
    const legacyTurfWar = { ...current.config.turfWar } as Record<string, unknown>;
    delete legacyTurfWar.CAPTURE_UNITS_BY_KIND;
    delete legacyTurfWar.TOPPLE_SPOILS_BASE;
    delete legacyTurfWar.BATTLE_WIN_REP;
    delete legacyTurfWar.WIN_REP_CAP_PER_WAR;
    const legacy = {
      ...current,
      config: { ...current.config, turfWar: legacyTurfWar },
      turfWars: current.turfWars.map((w) => {
        const { repEarned: _repEarned, ...rest } = w;
        return rest;
      }),
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      slot: 's',
      schemaVersion: 24,
      savedAt: 0,
      seed: current.seed,
      runStatus: current.runStatus,
      day: current.clock.day,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    const m = migrated as GameState;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.turfWars[0]!.repEarned).toBe(0);
    expect(m.config.turfWar.CAPTURE_UNITS_BY_KIND).toBeDefined();
    expect(m.config.turfWar.TOPPLE_SPOILS_BASE).toBeGreaterThan(0);
    expect(m.config.turfWar.WIN_REP_CAP_PER_WAR).toBeGreaterThan(0);
    // Nothing the player holds moved.
    expect(m.cleanCash).toBe(current.cleanCash);
    expect(m.stashes).toEqual(current.stashes);
    expect(m.armory).toEqual(current.armory);
    expect(m.rngState).toEqual(current.rngState);
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
