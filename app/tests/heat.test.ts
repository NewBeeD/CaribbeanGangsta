import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  applyIntent,
  tick,
  settleOffline,
  rngFor,
  addHeat,
  decayHeat,
  heatOf,
  effectiveHeat,
  homeCountryId,
  hottestCountry,
  hottestHeat,
  hire,
  currentTier,
  tierForHeat,
  tierDots,
  checkTierEscalation,
  applyHeatEscalation,
  setLieLow,
  isLyingLow,
  raidChance,
  rollRaid,
  HEAT_MIN,
  HEAT_MAX,
  HEAT_DECAY_RATE_PER_HOUR,
  NOTORIETY_SHARE,
  type GameState,
  type Stash,
} from '@/engine';

/** A run pinned to a specific HOME-country heat value (immutably). With zero
 * notoriety and heat nowhere else, home is the hottest country, so the global
 * tier/dots read exactly this value — the per-country analogue of the old
 * single-meter setup. */
function atHeat(state: GameState, heat: number): GameState {
  return {
    ...state,
    countryHeat: heat > 0 ? { [homeCountryId(state)]: heat } : {},
    notoriety: 0,
    leTierAck: tierForHeat(heat),
  };
}

describe('addHeat — the clamped per-country map (design/01 §1: a meter, not a wallet)', () => {
  it('clamps into [0, 100] from both ends', () => {
    const base = createInitialState('add');
    const home = homeCountryId(base);
    expect(heatOf(addHeat(atHeat(base, 95), 20, 't', home), home)).toBe(HEAT_MAX);
    expect(heatOf(addHeat(atHeat(base, 5), -20, 't', home), home)).toBe(HEAT_MIN);
    expect(heatOf(addHeat(atHeat(base, 40), 10, 't', home), home)).toBe(50);
  });

  it('lands in the named country only — other countries stay cold', () => {
    const base = atHeat(createInitialState('add-local'), 0);
    const heated = addHeat(base, 30, 't', 'mx');
    expect(heatOf(heated, 'mx')).toBe(30);
    expect(heatOf(heated, homeCountryId(base))).toBe(0);
  });

  it('feeds a NOTORIETY_SHARE slice of every gain into global notoriety', () => {
    const base = atHeat(createInitialState('add-noto'), 0);
    const heated = addHeat(base, 20, 't', 'mx');
    expect(heated.notoriety).toBeCloseTo(20 * NOTORIETY_SHARE, 6);
    // Cooling (negative amounts) never buys notoriety back down.
    const cooled = addHeat(heated, -10, 't', 'mx');
    expect(cooled.notoriety).toBeCloseTo(heated.notoriety, 6);
  });

  it('an omitted country lands on the hottest one (context-free fallback)', () => {
    const base = atHeat(createInitialState('add-fallback'), 0);
    const withHot = addHeat(base, 40, 't', 'mx');
    expect(hottestCountry(withHot)).toBe('mx');
    const bumped = addHeat(withHot, 5, 'contextless');
    expect(heatOf(bumped, 'mx')).toBeCloseTo(45, 6);
  });
});

describe('decayHeat — deterministic exponential cool-down (design/01 §4)', () => {
  it('decays at the configured rate over online hours', () => {
    const base = atHeat(createInitialState('decay'), 80);
    const home = homeCountryId(base);
    // Small empire (one stash) keeps the slowdown near-neutral; assert the shape.
    const oneHour = heatOf(decayHeat(base, 1), home);
    const expected = 80 * (1 - HEAT_DECAY_RATE_PER_HOUR / (1 + 1 * 0.04));
    expect(oneHour).toBeCloseTo(expected, 6);
    // Never negative, monotonically decreasing, deterministic.
    expect(decayHeat(base, 1)).toEqual(decayHeat(base, 1));
    expect(heatOf(decayHeat(base, 100), home)).toBeGreaterThanOrEqual(HEAT_MIN);
    expect(heatOf(decayHeat(base, 100), home)).toBeLessThan(oneHour);
  });

  it('each country cools independently — lying low in one leaves the other alone', () => {
    const base = atHeat(createInitialState('decay-iso'), 0);
    const two: GameState = { ...base, countryHeat: { jm: 60, mx: 60 } };
    const quiet = decayHeat(setLieLow(two, 'jm', true), 4);
    expect(heatOf(quiet, 'jm')).toBeLessThan(heatOf(quiet, 'mx'));
  });

  it('lying low decays FASTER than not (design/07 §5)', () => {
    const base = atHeat(createInitialState('lielow-decay'), 80);
    const home = homeCountryId(base);
    const normal = heatOf(decayHeat(base, 4), home);
    const lyingLow = heatOf(decayHeat(setLieLow(base, home, true), 4), home);
    expect(lyingLow).toBeLessThan(normal);
  });

  it('a beat cop on the payroll cools FASTER than none (Ideas2 item 2; design/09 B.2)', () => {
    // A loyal beat cop's `raid-tipoff` benefit is "cools local heat faster" —
    // the only cop-driven relief now the one-tap bribe lever is gone. Hiring adds
    // no stash/front/crew, so empire slowdown is identical: the cop is isolated.
    const funded = { ...atHeat(createInitialState('cop-decay'), 80), cleanCash: 100_000 };
    const home = homeCountryId(funded);
    const withCop = hire(funded, 'beat-cop').state;
    const normal = heatOf(decayHeat(funded, 4), home);
    const cooled = heatOf(decayHeat(withCop, 4), home);
    expect(cooled).toBeLessThan(normal);
  });

  it('notoriety sheds its own, far slower rate', () => {
    const base = { ...atHeat(createInitialState('noto-decay'), 0), notoriety: 50 };
    const home = homeCountryId(base);
    const day = decayHeat(base, 24);
    expect(day.notoriety).toBeLessThan(50);
    // Far slower than local heat over the same span.
    const local = decayHeat({ ...base, notoriety: 0, countryHeat: { [home]: 50 } }, 24);
    expect(day.notoriety).toBeGreaterThan(heatOf(local, home));
  });

  it('exposes per-country lie-low as a flag the laundering engine can read', () => {
    const base = createInitialState('lielow-flag');
    const home = homeCountryId(base);
    expect(isLyingLow(base, home)).toBe(false);
    const on = applyIntent(base, { type: 'lieLow', countryId: home, enabled: true });
    expect(isLyingLow(on, home)).toBe(true);
    const off = applyIntent(on, { type: 'lieLow', countryId: home, enabled: false });
    expect(isLyingLow(off, home)).toBe(false);
  });
});

describe('tiers — boundary classification (design/01 §4)', () => {
  it('classifies Local / DEA / CIA with boundaries going to the higher tier', () => {
    const base = createInitialState('tiers');
    expect(currentTier(atHeat(base, 0))).toBe('local');
    expect(currentTier(atHeat(base, 29.9))).toBe('local');
    expect(currentTier(atHeat(base, 30))).toBe('dea'); // boundary → higher tier
    expect(currentTier(atHeat(base, 59.9))).toBe('dea');
    expect(currentTier(atHeat(base, 60))).toBe('cia');
    expect(currentTier(atHeat(base, 100))).toBe('cia');
  });

  it('tierDots fills proportionally out of ten (design/07 §5)', () => {
    const base = createInitialState('dots');
    expect(tierDots(atHeat(base, 0))).toEqual({ filled: 0, total: 10 });
    expect(tierDots(atHeat(base, 55))).toEqual({ filled: 6, total: 10 });
    expect(tierDots(atHeat(base, 100))).toEqual({ filled: 10, total: 10 });
  });

  it('notoriety lifts EFFECTIVE heat everywhere — a cold port still reads warm', () => {
    const base = { ...atHeat(createInitialState('noto-eff'), 0), notoriety: 40 };
    const weight = base.config.heat.NOTORIETY_HEAT_WEIGHT;
    expect(effectiveHeat(base, 'somewhere-cold')).toBeCloseTo(40 * weight, 6);
    expect(hottestHeat(base)).toBeCloseTo(40 * weight, 6);
  });
});

/** Pin the HOME country's heat while keeping the rest of the state (escalation
 * tests mutate heat repeatedly on the same run). */
function reheat(state: GameState, heat: number): GameState {
  return {
    ...state,
    countryHeat: heat > 0 ? { [homeCountryId(state)]: heat } : {},
  };
}

describe('tier escalation — telegraphed exactly once per crossing (design/07 §5)', () => {
  it('checkTierEscalation reports a crossing with a beat key, once', () => {
    const local = atHeat(createInitialState('esc'), 10); // ack = local
    const intoDea = reheat(local, 45); // heat rose, ack still local

    const first = checkTierEscalation(intoDea);
    expect(first.crossed).toBe(true);
    expect(first.newTier).toBe('dea');
    expect(first.beatKey).toBe('heat.tier.dea');

    // Applying the escalation advances the acknowledgement…
    const acked = applyHeatEscalation(intoDea);
    expect(acked.leTierAck).toBe('dea');
    // …so the very same crossing no longer reports as crossed.
    expect(checkTierEscalation(acked).crossed).toBe(false);
    // Re-applying is idempotent: no duplicate telegraph, no duplicate beat.
    const again = applyHeatEscalation(acked);
    expect(again).toBe(acked);
    expect(acked.beatsFired.filter((b) => b === 'heat.tier.dea')).toHaveLength(1);
  });

  it('queues a telegraph return-hook and fires the beat on the crossing tick', () => {
    const local = atHeat(createInitialState('esc-hook'), 10);
    const acked = applyHeatEscalation(reheat(local, 65)); // straight into CIA
    expect(acked.leTierAck).toBe('cia');
    expect(acked.beatsFired).toContain('heat.tier.cia');
    const hook = acked.pendingChoices.find((c) => c.kind === 'heat-escalation');
    expect(hook).toBeDefined();
    expect(hook?.summary).toMatch(/task force/i);
  });

  it('re-arms on the way down, but a re-crossing into a filed tier is silent', () => {
    const base = atHeat(createInitialState('rearm'), 10); // ack local
    const hot = applyHeatEscalation(reheat(base, 65)); // first CIA crossing — telegraphs
    // Cool back to Local — the acknowledgement drops, silently.
    const cooled = applyHeatEscalation(reheat(hot, 5));
    expect(cooled.leTierAck).toBe('local');
    expect(cooled.pendingChoices.length).toBe(hot.pendingChoices.length); // no new hook
    // Climbing back up still reads as a crossing…
    expect(checkTierEscalation(reheat(cooled, 40)).crossed).toBe(true);
    // …but the DEA file was NEVER opened this run (we jumped straight to CIA),
    // so this first DEA crossing telegraphs; the CIA one would not.
    const backToDea = applyHeatEscalation(reheat(cooled, 40));
    expect(backToDea.leTierAck).toBe('dea');
    expect(backToDea.pendingChoices.length).toBe(cooled.pendingChoices.length + 1);
    // Re-crossing into CIA — whose file is already open — escalates silently.
    const backToCia = applyHeatEscalation(reheat(backToDea, 65));
    expect(backToCia.leTierAck).toBe('cia');
    expect(backToCia.pendingChoices.length).toBe(backToDea.pendingChoices.length);
    expect(backToCia.beatsFired.filter((b) => b === 'heat.tier.cia')).toHaveLength(1);
  });

  it('an already-filed tier never re-notifies — the DEA only needs your name once', () => {
    const low = atHeat(createInitialState('refile'), 10); // ack local
    const filed = applyHeatEscalation(reheat(low, 45)); // first DEA crossing — telegraphs
    const cooled = applyHeatEscalation(reheat(filed, 5));
    const rehot = applyHeatEscalation(reheat(cooled, 45));
    expect(rehot.leTierAck).toBe('dea');
    expect(rehot.pendingChoices.length).toBe(filed.pendingChoices.length); // no repeat hook
  });

  it('the opening baseline never self-telegraphs on the first tick', () => {
    const start = createInitialState('baseline');
    expect(applyHeatEscalation(start)).toBe(start);
    expect(checkTierEscalation(start).crossed).toBe(false);
  });
});

/** Put a run in a raid-prone posture: hot at home, with several fat stashes there. */
function raidProne(seed: string): GameState {
  const base = atHeat(createInitialState(seed), 90);
  const home = homeCountryId(base);
  const mkStash = (id: string, cash: number): Stash => ({
    id,
    name: id,
    countryId: home,
    type: 'floor',
    dirtyCash: cash,
    inventory: (base.stashes[0] as Stash).inventory,
  });
  return {
    ...base,
    stashes: [mkStash('s1', 10_000), mkStash('s2', 50_000), mkStash('s3', 5_000)],
  };
}

describe('raids — whether/where, single target, determinism (design/01 §4)', () => {
  it('targets EXACTLY one stash when one fires', () => {
    const state = raidProne('raid-one');
    let rngState = state.rngState;
    for (let i = 0; i < 500; i++) {
      const trial: GameState = { ...state, rngState };
      const rng = rngFor(trial);
      const raid = rollRaid(trial, rng, 24);
      rngState = rng.getState();
      if (raid) {
        expect(state.stashes.map((s) => s.id)).toContain(raid.targetStashId);
        expect(raid.countryId).toBe(homeCountryId(state));
        expect(raid.tier).toBe('cia');
      }
    }
  });

  it('raids strike where the heat is — a cold country with product is not the target', () => {
    const base = raidProne('raid-where');
    const home = homeCountryId(base);
    const cold: Stash = { ...(base.stashes[0] as Stash), id: 'cold', countryId: 'mx' };
    const state: GameState = { ...base, stashes: [...base.stashes, cold] };
    let rngState = state.rngState;
    let fired = 0;
    for (let i = 0; i < 500 && fired < 20; i++) {
      const trial: GameState = { ...state, rngState };
      const rng = rngFor(trial);
      const raid = rollRaid(trial, rng, 24);
      rngState = rng.getState();
      if (raid) {
        fired += 1;
        // Home runs 90 heat; mx runs stone cold (zero rate) — the country pick
        // is rate-weighted, so the cold stash is never the one hit.
        expect(raid.countryId).toBe(home);
      }
    }
    expect(fired).toBeGreaterThan(0);
  });

  it('raid chance rises with heat and with empire size', () => {
    const calm = atHeat(createInitialState('rc'), 20);
    const hot = atHeat(createInitialState('rc'), 90);
    expect(raidChance(hot, 24)).toBeGreaterThan(raidChance(calm, 24));

    const small = raidChance(hot, 24);
    const big = raidChance(
      { ...hot, stashes: [...hot.stashes, ...raidProne('rc2').stashes] },
      24,
    );
    expect(big).toBeGreaterThan(small);
  });

  it('observed raid frequency rises with heat over many ticks', () => {
    const countRaids = (seed: string, heat: number): number => {
      let s = raidProne(seed);
      s = reheat(s, heat);
      let raids = 0;
      for (let i = 0; i < 400; i++) {
        const before = s.pendingChoices.filter((c) => c.kind === 'raid').length;
        s = tick(s, 24);
        // Heat drifts down via decay; re-pin it so we isolate the heat variable.
        const after = s.pendingChoices.filter((c) => c.kind === 'raid').length;
        raids += after - before;
        s = { ...reheat(s, heat), notoriety: 0 };
      }
      return raids;
    };
    expect(countRaids('freq', 90)).toBeGreaterThan(countRaids('freq', 25));
  });

  it('is deterministic under a fixed seed', () => {
    const run = (): GameState => {
      let s = raidProne('det');
      for (let i = 0; i < 30; i++) s = tick(s, 12);
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe('offline is safe — raids never fire while away (GDD §6)', () => {
  it('settleOffline triggers no raid and no heat change, for any hours away', () => {
    const base = raidProne('offline-safe');
    for (const hours of [1, 24, 500, 10_000]) {
      const { state: settled } = settleOffline(base, hours);
      expect(settled.pendingChoices.filter((c) => c.kind === 'raid')).toHaveLength(0);
      expect(settled.countryHeat).toEqual(base.countryHeat); // frozen: no decay, no rise
      expect(settled.notoriety).toBe(base.notoriety);
      expect(settled.stashes).toEqual(base.stashes); // nothing seized
    }
  });
});
