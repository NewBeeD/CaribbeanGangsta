import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  applyIntent,
  dismissAllPendingChoices,
  isConsequentialChoice,
  netWorth,
  totalDirtyCash,
  rngFor,
  SCHEMA_VERSION,
  type GameState,
  type PendingChoice,
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

describe('dismissAllPendingChoices — Clear all is only ever the safe default (design/13 A5)', () => {
  const at = (i: number): number => i;
  const hook = (id: string, extra: Partial<PendingChoice> = {}): PendingChoice => ({
    id,
    kind: 'buyer',
    summary: `hook ${id}`,
    createdAtHours: at(0),
    ...extra,
  });

  it('drops every safely-dismissible choice, exactly like a one-by-one dismiss', () => {
    const base = createInitialState('clear-all');
    const s: GameState = {
      ...base,
      pendingChoices: [hook('a'), hook('b'), hook('c')],
    };
    const cleared = dismissAllPendingChoices(s);
    expect(cleared.pendingChoices).toHaveLength(0);
    // Nothing else moved — dismissal is the no-action default.
    expect({ ...cleared, pendingChoices: [] }).toEqual({ ...s, pendingChoices: [] });
  });

  it('keeps consequential (card-bearing) choices untouched, and flags them as such', () => {
    const base = createInitialState('clear-keep');
    const beat = hook('beat-1', { kind: 'beat', beatId: 'beat.first-front' });
    const card = hook('card-1', { kind: 'card', cardId: 'ONB-02' });
    const s: GameState = { ...base, pendingChoices: [hook('a'), beat, hook('b'), card] };

    expect(isConsequentialChoice(beat)).toBe(true);
    expect(isConsequentialChoice(card)).toBe(true);
    expect(isConsequentialChoice(hook('a'))).toBe(false);

    const cleared = dismissAllPendingChoices(s);
    expect(cleared.pendingChoices).toEqual([beat, card]);
  });

  it('is a pure no-op when there is nothing to clear', () => {
    const base = createInitialState('clear-noop');
    expect(dismissAllPendingChoices(base)).toBe(base);
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
