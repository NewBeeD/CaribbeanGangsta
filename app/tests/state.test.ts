import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  applyIntent,
  netWorth,
  totalDirtyCash,
  rngFor,
  SCHEMA_VERSION,
  type GameState,
} from '@/engine';

describe('createInitialState', () => {
  it('is deterministic — same seed → deep-equal state', () => {
    expect(createInitialState('run-1')).toEqual(createInitialState('run-1'));
  });

  it('different seeds → different states', () => {
    expect(createInitialState('run-1')).not.toEqual(createInitialState('run-2'));
  });

  it('opens a live, playable run', () => {
    const state = createInitialState(42);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.runStatus).toBe('active');
    expect(state.clock).toEqual({ hours: 0, day: 1, week: 1 });
    // Starting dirty cash is located in the home stash (design/01 §1).
    expect(state.stashes).toHaveLength(1);
    expect(totalDirtyCash(state)).toBe(state.world.startingCountry.startingCash);
    expect(state.cleanCash).toBe(0);
    expect(state.heat).toBe(state.world.startingCountry.heatBaseline);
    // One rival-relationship entry per world rival.
    expect(state.rivals.map((r) => r.id)).toEqual(state.world.rivals.map((r) => r.id));
    expect(state.highScore.peakNetWorth).toBe(netWorth(state));
  });
});

describe('applyIntent', () => {
  it('is a pure no-op for the noop intent (does not mutate)', () => {
    const state = createInitialState('pure');
    const before = structuredClone(state);
    const next = applyIntent(state, { type: 'noop' });
    expect(next).toBe(state);
    expect(state).toEqual(before);
  });
});

describe('rng continuity', () => {
  it('the run RNG resumes from state.rngState (a fresh restore matches)', () => {
    const state = createInitialState('rolls');
    // Two independent restores of the same snapshot roll identically.
    const rollA = rngFor(state).next();
    const rollB = rngFor(state).next();
    expect(rollA).toBe(rollB);
  });

  it('rngState survives a manual clone (round-trip proxy)', () => {
    const state = createInitialState('clone');
    const clone: GameState = structuredClone(state);
    expect(rngFor(clone).next()).toBe(rngFor(state).next());
  });
});
