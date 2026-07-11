/**
 * Prompt 26 — the balance-config surface & injection.
 *
 * Acceptance under test:
 *  - the engine accepts an injected `GameConfig`: the SAME seed under two
 *    different tunings yields different outcomes, and under the same tuning is
 *    byte-identical (determinism preserved);
 *  - the tune-first knobs (design/01 §8) are all present and resolvable;
 *  - prestige starting scenarios are data-only and non-power (GDD §7);
 *  - the config is plain JSON-cloneable data (it lives on `GameState` and
 *    round-trips through saves), and old saves migrate onto the v1 default.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  TUNE_FIRST,
  knobValue,
  tunedConfig,
} from '@/engine/config';
import { STARTING_SCENARIOS } from '@/engine/config/scenarios';
import { findPrestige } from '@/engine/config/prestige';
import { COUNTRY_IDS } from '@/engine/config/countries';
import { createInitialState } from '@/engine/state';
import { computeBustProbability } from '@/engine/deals';
import { tick } from '@/engine/clock';
import { MIGRATIONS } from '@/store/persistence';
import { runBatchSim } from '@/telemetry/simulation';

describe('GameConfig — the single typed balance surface (Prompt 26)', () => {
  it('is plain, JSON-cloneable data (it lives on GameState and must save/load)', () => {
    const cloned = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG)) as unknown;
    expect(cloned).toEqual(DEFAULT_GAME_CONFIG);
  });

  it('tunedConfig overrides only what it names; every other value stays v1', () => {
    const alt = tunedConfig({ deals: { BUST_MAX: 0.9 } });
    expect(alt.deals.BUST_MAX).toBe(0.9);
    expect(alt.deals.BUST_MIN).toBe(DEFAULT_GAME_CONFIG.deals.BUST_MIN);
    // Untouched groups are shared by reference (config is read-only everywhere).
    expect(alt.heat).toBe(DEFAULT_GAME_CONFIG.heat);
    expect(alt.fronts).toBe(DEFAULT_GAME_CONFIG.fronts);
  });

  it('createInitialState stores the injected config on state (default = v1)', () => {
    expect(createInitialState('cfg-carry').config).toBe(DEFAULT_GAME_CONFIG);
    const alt = tunedConfig({ deals: { BUST_MAX: 0.42 } });
    expect(createInitialState('cfg-carry', alt).config.deals.BUST_MAX).toBe(0.42);
  });
});

describe('tune-first knobs (design/01 §8) — present and documented', () => {
  it('lists all eight §8 priorities', () => {
    expect(TUNE_FIRST.map((k) => k.priority)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('every knob path resolves to a real value in the v1 config', () => {
    for (const knob of TUNE_FIRST) {
      expect(knob.paths.length).toBeGreaterThan(0);
      expect(knob.designRef).toContain('design/');
      expect(knob.telemetrySignal.length).toBeGreaterThan(0);
      for (const path of knob.paths) {
        expect(knobValue(DEFAULT_GAME_CONFIG, path), path).toBeDefined();
      }
    }
  });
});

describe('injection — two tunings, identical seeds, different outcomes', () => {
  it('the same seed under the same tuning is deep-equal (determinism holds)', () => {
    expect(createInitialState('same-seed')).toEqual(createInitialState('same-seed'));
  });

  it('world generation reads the injected variety bounds (design/01 §8.7)', () => {
    // Pin volatility to a point value: every board must land exactly there,
    // while the v1 world (same seed!) draws from the 0.2–0.5 band.
    const pinned = tunedConfig({
      world: { VOLATILITY_RANGE: { min: 0.07, max: 0.07 } },
    });
    const alt = createInitialState('two-tunings', pinned);
    const v1 = createInitialState('two-tunings');
    for (const board of alt.world.priceBoards) expect(board.volatility).toBeCloseTo(0.07, 10);
    for (const board of v1.world.priceBoards) expect(board.volatility).toBeGreaterThanOrEqual(0.2);
  });

  it('reducers read the injected numbers (bust clamp, design/01 §8.3)', () => {
    const pinned = tunedConfig({ deals: { BUST_MIN: 0.5, BUST_MAX: 0.5 } });
    const alt = createInitialState('clamp-seed', pinned);
    const v1 = createInitialState('clamp-seed');
    const home = alt.stashes[0]!.countryId;
    expect(computeBustProbability(alt, 'weed', 1, home)).toBe(0.5);
    expect(computeBustProbability(v1, 'weed', 1, v1.stashes[0]!.countryId)).toBeLessThan(0.5);
  });

  it('ticking the same seed under two tunings diverges; same tuning does not', () => {
    const hotDecay = tunedConfig({ heat: { HEAT_DECAY_RATE_PER_HOUR: 0.5 } });
    const a = tick({ ...createInitialState('tick-seed'), heat: 50 }, 12);
    const b = tick({ ...createInitialState('tick-seed'), heat: 50 }, 12);
    const c = tick({ ...createInitialState('tick-seed', hotDecay), heat: 50 }, 12);
    expect(b.heat).toBe(a.heat);
    expect(c.heat).toBeLessThan(a.heat); // heat sheds 10× faster under the alt tuning
  });

  it('the batch sim runs alternate tunings with no code changes (Prompt 25 × 26)', () => {
    const seeds = [101, 202, 303];
    const options = { hoursPerStep: 6, maxDays: 21 };
    const v1 = runBatchSim(seeds, options);
    const v1again = runBatchSim(seeds, options);
    // Brutal economy: every sell rides a 60% bust chance.
    const brutal = tunedConfig({ deals: { BUST_MIN: 0.6, BUST_MAX: 0.6 } });
    const alt = runBatchSim(seeds, { ...options, config: brutal });

    expect(v1again).toEqual(v1); // identical seeds + tuning ⇒ identical report
    expect(alt.runs.map((r) => r.score)).not.toEqual(v1.runs.map((r) => r.score));
  });
});

describe('starting scenarios — data only, non-power (GDD §7)', () => {
  it('references only real countries and scenario-category prestige unlocks', () => {
    for (const s of STARTING_SCENARIOS) {
      if (s.startingCountryId !== null) {
        expect(COUNTRY_IDS).toContain(s.startingCountryId);
      }
      if (s.unlockedBy !== null) {
        const unlock = findPrestige(s.unlockedBy);
        expect(unlock, s.id).toBeDefined();
        expect(unlock!.category).toBe('scenario');
      }
    }
  });

  it('carries no numbers at all — a power multiplier is unrepresentable', () => {
    const scanForNumbers = (value: unknown, path: string): void => {
      expect(typeof value, path).not.toBe('number');
      if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) scanForNumbers(v, `${path}.${k}`);
      }
    };
    for (const s of STARTING_SCENARIOS) scanForNumbers(s, s.id);
  });

  it('always offers a default scenario with no unlock gate (open access)', () => {
    expect(STARTING_SCENARIOS.some((s) => s.unlockedBy === null)).toBe(true);
  });
});

describe('save migration — pre-v10 runs pick up the v1 config', () => {
  it('9 → 10 attaches DEFAULT_GAME_CONFIG and only that', () => {
    const modern = createInitialState('migrate-9');
    const { config: _dropped, ...v9state } = modern;
    const env = {
      slot: 'test',
      schemaVersion: 9,
      savedAt: 0,
      seed: v9state.seed,
      runStatus: v9state.runStatus,
      day: v9state.clock.day,
      state: { ...v9state, schemaVersion: 9 },
    };
    const migrated = MIGRATIONS[9]!(env as never);
    expect(migrated.schemaVersion).toBe(10);
    expect((migrated.state as typeof modern).config).toBe(DEFAULT_GAME_CONFIG);
  });
});
