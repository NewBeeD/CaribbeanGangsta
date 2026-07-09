import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  FIRST_RUNNER_FLAG,
  HEAT_LESSON_FLAG,
  type GameState,
} from '@/engine';
import {
  DISCLOSURE_NODES,
  resolveDisclosure,
  screenForHash,
  isScreenAccessible,
  DEFAULT_SCREEN,
} from '@/ui/shell/Disclosure';

/** Set a flag on a fresh run without mutating the original. */
function withFlag(state: GameState, flag: string): GameState {
  return { ...state, flags: { ...state.flags, [flag]: true } };
}

describe('Progressive disclosure (Prompt 14; design/04 §0, design/07 §2)', () => {
  it('minute one exposes only Deals — the rest are visible-but-locked, none hidden', () => {
    const s = createInitialState('disclosure');
    const map = resolveDisclosure(s);

    expect(map.deals).toBe('unlocked');
    expect(map.crew).toBe('locked');
    expect(map.money).toBe('locked');
    expect(map.heat).toBe('locked');
    // Progressive disclosure = greyed aspiration, never missing.
    expect(Object.values(map)).not.toContain('hidden');
  });

  it('the High Score cross-run chase is always reachable', () => {
    const s = createInitialState('disclosure');
    expect(resolveDisclosure(s).highscore).toBe('unlocked');
  });

  it('Crew unlocks exactly when the first-runner flag flips', () => {
    const s = createInitialState('disclosure');
    expect(isScreenAccessible(s, 'crew')).toBe(false);
    expect(isScreenAccessible(withFlag(s, FIRST_RUNNER_FLAG), 'crew')).toBe(true);
  });

  it('Heat unlocks exactly when the lie-low lesson flag flips', () => {
    const s = createInitialState('disclosure');
    expect(isScreenAccessible(s, 'heat')).toBe(false);
    expect(isScreenAccessible(withFlag(s, HEAT_LESSON_FLAG), 'heat')).toBe(true);
  });

  it('Money and Empire unlock organically once a front exists', () => {
    const s = createInitialState('disclosure');
    expect(isScreenAccessible(s, 'money')).toBe(false);
    expect(isScreenAccessible(s, 'empire')).toBe(false);

    const withFront: GameState = {
      ...s,
      fronts: [{ id: 'f1', type: 'car-wash', level: 1 }],
    };
    expect(isScreenAccessible(withFront, 'money')).toBe(true);
    expect(isScreenAccessible(withFront, 'empire')).toBe(true);
  });

  it('routes to a locked screen fall back to the default (deals)', () => {
    const s = createInitialState('disclosure');
    expect(screenForHash(s, '#/crew')).toBe(DEFAULT_SCREEN);
    expect(screenForHash(s, '#/deals')).toBe('deals');
    expect(screenForHash(s, '')).toBe(DEFAULT_SCREEN);

    const unlockedCrew = withFlag(s, FIRST_RUNNER_FLAG);
    expect(screenForHash(unlockedCrew, '#/crew')).toBe('crew');
  });

  it('the four persistent nav tabs are Deals · Crew · Money · Heat', () => {
    const nav = DISCLOSURE_NODES.filter((n) => n.inNav).map((n) => n.label);
    expect(nav).toEqual(['Deals', 'Crew', 'Money', 'Heat']);
  });
});
