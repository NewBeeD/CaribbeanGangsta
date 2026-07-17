import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  resolveDeal,
  PRODUCT_IDS,
  type GameState,
} from '@/engine';
import {
  fairnessReport,
  hasFirstMove,
  runBatchSim,
  simulateRun,
  COCAINE_SHARE_TARGET,
  FAIRNESS_MIN_SAMPLES,
  type AnyTelemetryEvent,
} from '@/telemetry';

const PRODUCT = PRODUCT_IDS[0]!;

/** A pile of deterministic seeds for the batch runs. */
function seeds(n: number, prefix = 'sim'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

describe('dead-on-arrival check (design/01 §8.7 — target ~0)', () => {
  it('a fresh world always has a first move', () => {
    for (const seed of seeds(25, 'doa')) {
      expect(hasFirstMove(createInitialState(seed))).toBe(true);
    }
  });

  it('a hand with no money anywhere is dead on arrival', () => {
    const base = createInitialState('doa-broke');
    const broke: GameState = {
      ...base,
      cleanCash: 0,
      stashes: base.stashes.map((s) => ({ ...s, dirtyCash: 0 })),
    };
    expect(hasFirstMove(broke)).toBe(false);
  });
});

describe('headless batch sim (Prompt 25 acceptance; design/01 §8)', () => {
  it('a run on the same seed reproduces exactly (seeded RNG, pure engine)', () => {
    expect(simulateRun('sim-repro')).toEqual(simulateRun('sim-repro'));
  });

  it('many seeds report dead-on-arrival = 0 and a sane run-length distribution', () => {
    const batch = runBatchSim(seeds(40));

    // The tune-first number: no generated world lacks a first move.
    expect(batch.deadOnArrival).toEqual([]);
    expect(batch.runs).toHaveLength(40);

    // Every run is bounded by the retirement horizon and ends with a real cause.
    for (const run of batch.runs) {
      expect(run.days).toBeGreaterThanOrEqual(1);
      expect(run.days).toBeLessThanOrEqual(85);
      expect(run.score).toBeGreaterThanOrEqual(0);
      expect(['killed', 'busted', 'retired']).toContain(run.cause);
    }

    // An arc, not a coin flip (design/01 §8.6): the median run survives well
    // past its first week (the cautious policy typically reaches retirement).
    expect(batch.medianDays).toBeGreaterThan(7);

    // Report coherence: a spiral end never reads as a chosen retirement.
    for (const run of batch.runs) {
      if (run.endedBySpiral) expect(run.cause).not.toBe('retired');
    }
    // 40 full runs over the heavier post-Prompt-32 economy sit right at the
    // default 5s per-test cap; give the batch explicit breathing room.
  }, 15000);

  it('honors the horizon option (shorter cap, still no DOA)', () => {
    const batch = runBatchSim(seeds(10, 'short'), { maxDays: 14 });
    expect(batch.deadOnArrival).toEqual([]);
    for (const run of batch.runs) expect(run.days).toBeLessThanOrEqual(15);
  });
});

describe('multi-drug trade mix (design/13 §H — measured, not vibed)', () => {
  it('cocaine never owns the board, and every seed still reaches the horizon', () => {
    const batch = runBatchSim(seeds(40));

    // The bar: cocaine's share of the policy's bought volume sits below target,
    // so it is one drug among ten, not the only trade worth making (Ideas2
    // round-4 — "I want to trade all drugs because of price hikes").
    expect(batch.totalUnits).toBeGreaterThan(0);
    expect(batch.cocaineShare).toBeLessThan(COCAINE_SHARE_TARGET);

    // The mix is genuinely spread — more than one product carries real volume
    // (a degenerate 100%-of-one-drug board would fail the spirit of the bar).
    const contributing = Object.values(batch.tradeMix).filter((u) => u > 0);
    expect(contributing.length).toBeGreaterThanOrEqual(3);

    // Arms never enter the DRUG mix — they trade through their own screen.
    expect(batch.tradeMix.arms ?? 0).toBe(0);

    // Every seed still reaches the retirement horizon (none spiral out early):
    // the retune/measurement never came at the cost of survivability.
    expect(batch.deadOnArrival).toEqual([]);
    for (const run of batch.runs) expect(run.cause).toBe('retired');
  }, 15000);

  it('a per-run report carries its own trade mix (reproducible)', () => {
    const a = simulateRun('mix-repro');
    const b = simulateRun('mix-repro');
    expect(a.tradeMix).toEqual(b.tradeMix);
  });
});

describe('fairness in aggregate over real rolls (design/01 §0.3; GDD §8)', () => {
  it('displayed bust odds ≈ realized bust rate across many committed sells', () => {
    const rows: AnyTelemetryEvent[] = [];
    for (let i = 0; i < 400; i++) {
      const base = createInitialState(`fair-roll-${i}`);
      const home = base.stashes[0]!;
      const state: GameState = {
        ...base,
        stashes: [
          { ...home, inventory: { ...home.inventory, [PRODUCT]: 5 } },
          ...base.stashes.slice(1),
        ],
      };
      const result = resolveDeal(state, {
        type: 'sell',
        product: PRODUCT,
        qty: 1,
        stashId: home.id,
      });
      if (result.outcome === 'rejected') continue;
      rows.push({
        name: 'odds_audit',
        props: {
          surface: 'deal',
          displayed: result.displayedBustProb,
          hit: result.outcome === 'bust',
        },
        at: 0,
        seq: i,
      });
    }

    const report = fairnessReport(rows);
    expect(report.all.samples).toBeGreaterThanOrEqual(FAIRNESS_MIN_SAMPLES);
    expect(report.all.withinTolerance).toBe(true);
    expect(report.fair).toBe(true);
  });
});
