import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  applyIntent,
  tick,
  settleOffline,
  rngFor,
  addHeat,
  decayHeat,
  hire,
  currentTier,
  tierForHeat,
  tierDots,
  checkTierEscalation,
  applyHeatEscalation,
  setLieLow,
  raidChance,
  rollRaid,
  HEAT_MIN,
  HEAT_MAX,
  HEAT_DECAY_RATE_PER_HOUR,
  type GameState,
  type Stash,
} from '@/engine';

/** A run pinned to a specific heat value (immutably). */
function atHeat(state: GameState, heat: number): GameState {
  return { ...state, heat, leTierAck: tierForHeat(heat) };
}

describe('addHeat — the clamped scalar (design/01 §1: a meter, not a wallet)', () => {
  it('clamps into [0, 100] from both ends', () => {
    const base = createInitialState('add');
    expect(addHeat(atHeat(base, 95), 20).heat).toBe(HEAT_MAX);
    expect(addHeat(atHeat(base, 5), -20).heat).toBe(HEAT_MIN);
    expect(addHeat(atHeat(base, 40), 10).heat).toBe(50);
  });
});

describe('decayHeat — deterministic exponential cool-down (design/01 §4)', () => {
  it('decays at the configured rate over online hours', () => {
    const base = atHeat(createInitialState('decay'), 80);
    // Small empire (one stash) keeps the slowdown near-neutral; assert the shape.
    const oneHour = decayHeat(base, 1).heat;
    const expected = 80 * (1 - HEAT_DECAY_RATE_PER_HOUR / (1 + 1 * 0.04));
    expect(oneHour).toBeCloseTo(expected, 6);
    // Never negative, monotonically decreasing, deterministic.
    expect(decayHeat(base, 1)).toEqual(decayHeat(base, 1));
    expect(decayHeat(base, 100).heat).toBeGreaterThanOrEqual(HEAT_MIN);
    expect(decayHeat(base, 100).heat).toBeLessThan(oneHour);
  });

  it('lying low decays FASTER than not (design/07 §5)', () => {
    const base = atHeat(createInitialState('lielow-decay'), 80);
    const normal = decayHeat(base, 4).heat;
    const lyingLow = decayHeat(setLieLow(base, true), 4).heat;
    expect(lyingLow).toBeLessThan(normal);
  });

  it('a beat cop on the payroll cools FASTER than none (Ideas2 item 2; design/09 B.2)', () => {
    // A loyal beat cop's `raid-tipoff` benefit is "cools local heat faster" —
    // the only cop-driven relief now the one-tap bribe lever is gone. Hiring adds
    // no stash/front/crew, so empire slowdown is identical: the cop is isolated.
    const funded = { ...atHeat(createInitialState('cop-decay'), 80), cleanCash: 100_000 };
    const withCop = hire(funded, 'beat-cop').state;
    const normal = decayHeat(funded, 4).heat;
    const cooled = decayHeat(withCop, 4).heat;
    expect(cooled).toBeLessThan(normal);
  });

  it('exposes lyingLow as a flag the laundering engine can read', () => {
    const base = createInitialState('lielow-flag');
    expect(base.lyingLow).toBe(false);
    const on = applyIntent(base, { type: 'lieLow', enabled: true });
    expect(on.lyingLow).toBe(true);
    const off = applyIntent(on, { type: 'lieLow', enabled: false });
    expect(off.lyingLow).toBe(false);
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
});

describe('tier escalation — telegraphed exactly once per crossing (design/07 §5)', () => {
  it('checkTierEscalation reports a crossing with a beat key, once', () => {
    const local = atHeat(createInitialState('esc'), 10); // ack = local
    const intoDea = { ...local, heat: 45 }; // heat rose, ack still local

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
    const acked = applyHeatEscalation({ ...local, heat: 65 }); // straight into CIA
    expect(acked.leTierAck).toBe('cia');
    expect(acked.beatsFired).toContain('heat.tier.cia');
    const hook = acked.pendingChoices.find((c) => c.kind === 'heat-escalation');
    expect(hook).toBeDefined();
    expect(hook?.summary).toMatch(/task force/i);
  });

  it('re-arms on the way down so a re-crossing telegraphs again', () => {
    const hot = applyHeatEscalation(atHeat(createInitialState('rearm'), 65)); // ack cia
    // Cool back to Local — the acknowledgement drops, silently.
    const cooled = applyHeatEscalation({ ...hot, heat: 5 });
    expect(cooled.leTierAck).toBe('local');
    expect(cooled.pendingChoices.length).toBe(hot.pendingChoices.length); // no new hook
    // Climbing back into DEA telegraphs afresh.
    expect(checkTierEscalation({ ...cooled, heat: 40 }).crossed).toBe(true);
  });

  it('the opening baseline never self-telegraphs on the first tick', () => {
    const start = createInitialState('baseline');
    expect(applyHeatEscalation(start)).toBe(start);
    expect(checkTierEscalation(start).crossed).toBe(false);
  });
});

/** Put a run in a raid-prone posture: hot, with several fat stashes. */
function raidProne(seed: string): GameState {
  const base = atHeat(createInitialState(seed), 90);
  const mkStash = (id: string, cash: number): Stash => ({
    id,
    name: id,
    countryId: 'x',
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
        expect(raid.tier).toBe('cia');
      }
    }
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
      let s = atHeat(raidProne(seed), heat);
      let raids = 0;
      for (let i = 0; i < 400; i++) {
        const before = s.pendingChoices.filter((c) => c.kind === 'raid').length;
        s = tick(s, 24);
        // Heat drifts down via decay; re-pin it so we isolate the heat variable.
        const after = s.pendingChoices.filter((c) => c.kind === 'raid').length;
        raids += after - before;
        s = atHeat(s, heat);
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
      expect(settled.heat).toBe(base.heat); // frozen: no decay, no rise
      expect(settled.stashes).toEqual(base.stashes); // nothing seized
    }
  });
});
