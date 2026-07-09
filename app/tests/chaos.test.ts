import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  tick,
  settleOffline,
  restoreRng,
  getMarketPrice,
  PRODUCT_IDS,
  LOCATION_IDS,
  // chaos — config
  CHAOS_EVENTS,
  getChaosEvent,
  ALT_ROUTE_FLAG,
  CHAOS_MAJOR_DISRUPTION_FLAG,
  CHAOS_SUPPLY_SHOCK_FLAG,
  // chaos — engine
  chaosChance,
  rollChaos,
  applyChaos,
  chaosStep,
  type GameState,
  type ChaosEvent,
} from '@/engine';

/** Resolve a config event into a fired `ChaosEvent` (test helper). */
function firedEvent(id: (typeof CHAOS_EVENTS)[number]['id']): ChaosEvent {
  const cfg = getChaosEvent(id);
  return {
    id: cfg.id,
    name: cfg.name,
    major: cfg.major,
    telegraph: cfg.telegraph,
    beatKey: cfg.beatKey,
    effects: cfg.effects,
  };
}

/** Assert every market factor stays inside the `1 ± volatility` band (bounded). */
function expectFactorsInBand(state: GameState): void {
  for (const location of LOCATION_IDS) {
    for (const product of PRODUCT_IDS) {
      const vol =
        state.world.priceBoards.find((b) => b.product === product)?.volatility ?? 0;
      const { factor } = state.markets[location][product];
      expect(factor).toBeGreaterThanOrEqual(1 - vol - 1e-9);
      expect(factor).toBeLessThanOrEqual(1 + vol + 1e-9);
    }
  }
}

describe('chaos — reproducible per run seed (design/05 §2)', () => {
  it('is deterministic: same state → identical chaos outcome', () => {
    const a = createInitialState('chaos-seed');
    const b = createInitialState('chaos-seed');
    expect(chaosStep(a, 24)).toEqual(chaosStep(b, 24));
  });

  it('drives two runs of the same seed to byte-identical state through many ticks', () => {
    let a = createInitialState('reproduce');
    let b = createInitialState('reproduce');
    for (let i = 0; i < 200; i++) {
      a = tick(a, 24);
      b = tick(b, 24);
    }
    expect(a).toEqual(b);
  });

  it('does not perturb the main deal/raid RNG stream', () => {
    const base = createInitialState('independent');
    // chaosStep draws from an independent event stream, so the run's rngState is
    // untouched by a chaos roll.
    expect(chaosStep(base, 100).rngState).toEqual(base.rngState);
  });

  it('is a no-op at dt=0', () => {
    const base = createInitialState('noop');
    expect(chaosStep(base, 0)).toBe(base);
  });
});

describe('chaos — bounded, estimable effects (GDD §5.4)', () => {
  it('chance rises with the window but never exceeds 1', () => {
    expect(chaosChance(0)).toBe(0);
    expect(chaosChance(24)).toBeGreaterThan(0);
    expect(chaosChance(24)).toBeLessThan(1);
    expect(chaosChance(100_000)).toBeLessThanOrEqual(1);
  });

  it('a supply crash pushes prices UP but never past the volatility band', () => {
    const base = createInitialState('crash');
    const after = applyChaos(base, firedEvent('supply-crash'));
    expectFactorsInBand(after);
    // A price actually moved up somewhere.
    const before = getMarketPrice(base, PRODUCT_IDS[0]!, LOCATION_IDS[0]!);
    const now = getMarketPrice(after, PRODUCT_IDS[0]!, LOCATION_IDS[0]!);
    expect(now.sell).toBeGreaterThanOrEqual(before.sell);
  });

  it('a supply glut pushes prices DOWN but never past the volatility band', () => {
    const base = createInitialState('glut');
    const after = applyChaos(base, firedEvent('supply-glut'));
    expectFactorsInBand(after);
    expect(after.flags[CHAOS_SUPPLY_SHOCK_FLAG]).toBe(true);
  });

  it('a heat surge stays clamped to the 0–100 meter', () => {
    const hot = { ...createInitialState('surge'), heat: 98 };
    const after = applyChaos(hot, firedEvent('taskforce-surge'));
    expect(after.heat).toBeLessThanOrEqual(100);
    expect(after.heat).toBeGreaterThan(hot.heat);
  });

  it('a windfall adds a bounded, known amount of clean cash', () => {
    const base = createInitialState('windfall');
    const after = applyChaos(base, firedEvent('windfall'));
    expect(after.cleanCash).toBe(base.cleanCash + 5_000);
  });
});

describe('chaos — adaptive routes, not dead ends (design/05 §2; GDD §4.7)', () => {
  it('a major disruption OPENS an alternate corridor rather than collapsing', () => {
    const base = createInitialState('reroute');
    expect(base.flags[ALT_ROUTE_FLAG]).toBeUndefined();

    const after = applyChaos(base, firedEvent('hurricane'));
    // The corridor opened — the setback is recoverable.
    expect(after.flags[ALT_ROUTE_FLAG]).toBe(true);
    expect(after.flags[CHAOS_MAJOR_DISRUPTION_FLAG]).toBe(true);
    // The world did not dead-end: markets remain fully populated and in-band.
    expectFactorsInBand(after);
  });

  it('a non-major event does NOT open the alternate corridor', () => {
    const base = createInitialState('no-reroute');
    const after = applyChaos(base, firedEvent('windfall'));
    expect(after.flags[ALT_ROUTE_FLAG]).toBeUndefined();
    expect(after.flags[CHAOS_MAJOR_DISRUPTION_FLAG]).toBeUndefined();
  });

  it('every fired event telegraphs itself as a pending scene (never a silent hit)', () => {
    const base = createInitialState('telegraph');
    const after = applyChaos(base, firedEvent('big-bust'));
    const scene = after.pendingChoices.find((c) => c.kind === 'chaos');
    expect(scene).toBeDefined();
    expect(scene!.summary.length).toBeGreaterThan(0);
  });
});

describe('chaos — rolling & firing', () => {
  it('rollChaos fires at most one event per tick, drawn by weight', () => {
    const base = createInitialState('roll');
    const rng = restoreRng({ a: 12345, key: String(base.world.eventSeed) });
    // A huge window makes the roll near-certain, but the cap still holds.
    const events = rollChaos(base, rng, 100_000);
    expect(events.length).toBeLessThanOrEqual(1);
    if (events.length === 1) {
      expect(CHAOS_EVENTS.map((e) => e.id)).toContain(events[0]!.id);
    }
  });

  it('over a long run at least one chaos event eventually fires', () => {
    let s = createInitialState('eventual');
    let sawChaos = false;
    for (let i = 0; i < 400 && !sawChaos; i++) {
      s = tick(s, 24);
      sawChaos = s.pendingChoices.some((c) => c.kind === 'chaos');
    }
    expect(sawChaos).toBe(true);
  });
});

describe('chaos — offline is frozen/safe (GDD §6)', () => {
  it('settleOffline never triggers a chaos event (no chaos scene, no heat rise)', () => {
    const base = { ...createInitialState('offline-chaos'), heat: 40 };
    const { state: settled } = settleOffline(base, 5_000);
    expect(settled.pendingChoices.some((c) => c.kind === 'chaos')).toBe(false);
    expect(settled.heat).toBeLessThanOrEqual(base.heat);
    expect(settled.flags[ALT_ROUTE_FLAG]).toBeUndefined();
  });
});
