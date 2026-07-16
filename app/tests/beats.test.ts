import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  tick,
  settleOffline,
  emptyCrewSkills,
  DEAL_WIN_FLAG,
  // beats — engine
  BEAT_TRIGGERS,
  checkBeats,
  isPlateau,
  beatStep,
  ON_THE_MAP_CLEAN_CASH,
  CROWN_PEAK_NET_WORTH,
  MAJOR_BEATS_PER_TICK,
  type GameState,
  type CrewMember,
  type FiredBeat,
} from '@/engine';

const TRIGGER = new Map(BEAT_TRIGGERS.map((t) => [t.beatId, t]));

/** True if a fired beat is act-defining (major) — for plateau assertions. */
function firedMajors(fired: readonly FiredBeat[]): FiredBeat[] {
  return fired.filter((f) => TRIGGER.get(f.beatId)?.major === true);
}

/** A crew member mid-betrayal — the negative "crew betrayal" trigger. */
function crewWithArc(): CrewMember {
  return {
    id: 'crew-1',
    archetypeId: 'enforcer',
    name: 'Deon',
    role: 'soldier',
    traits: [],
    skills: emptyCrewSkills(),
    loyalty: 18,
    bond: 'You came up together.',
    agenda: 'wants-own-territory',
    memoryLog: [],
    assignment: { kind: 'idle' },
    productionOpIds: [],
    activeArc: {
      stage: 'warning',
      startedAtHours: 0,
      advancedAtHours: 0,
      sign: 'He is asking questions he never used to ask.',
    },
  };
}

describe('beats — fire off state, once when flagged (design/05 §0, §2)', () => {
  it('fires the first-sale beat once a win is banked, exactly once', () => {
    const won: GameState = {
      ...createInitialState('first-sale'),
      flags: { [DEAL_WIN_FLAG]: true },
    };
    const fired = checkBeats(won).map((f) => f.beatId);
    expect(fired).toContain('beat.first-sale');

    const after = beatStep(won);
    expect(after.beatsFired).toContain('beat.first-sale');
    const beatScenes = after.pendingChoices.filter((c) => c.kind === 'beat');
    expect(beatScenes.length).toBeGreaterThan(0);

    // Fire-once: running the step again queues no duplicate.
    const again = beatStep(after);
    expect(again.beatsFired).toEqual(after.beatsFired);
    expect(again.pendingChoices.length).toBe(after.pendingChoices.length);
  });

  it('fires the on-the-map beat when clean cash crosses the milestone', () => {
    const base = createInitialState('map');
    expect(checkBeats(base).map((f) => f.beatId)).not.toContain('beat.on-the-map');

    const rich = { ...base, cleanCash: ON_THE_MAP_CLEAN_CASH };
    expect(checkBeats(rich).map((f) => f.beatId)).toContain('beat.on-the-map');
  });

  it('fires the crown beat off PEAK net worth (the height reached, not current)', () => {
    const base = createInitialState('crown');
    const peaked: GameState = {
      ...base,
      highScore: { ...base.highScore, peakNetWorth: CROWN_PEAK_NET_WORTH },
    };
    expect(checkBeats(peaked).map((f) => f.beatId)).toContain('beat.crown-weighs-heavy');
  });
});

describe('beats — act-defining beats are deterministic (GDD §5.4)', () => {
  it('every major (act-defining) trigger uses a deterministic trigger type', () => {
    for (const t of BEAT_TRIGGERS) {
      if (t.major) expect(t.triggerType).toBe('deterministic');
    }
  });

  it('the death-spiral and run-end beats are deterministic', () => {
    expect(TRIGGER.get('beat.death-spiral')?.triggerType).toBe('deterministic');
    expect(TRIGGER.get('beat.run-ends')?.triggerType).toBe('deterministic');
  });
});

describe('beats — loss sequenced after banked wins (design/05 §4)', () => {
  it('a betrayal (negative) beat does NOT fire before a win is banked', () => {
    const noWin: GameState = {
      ...createInitialState('betray'),
      crew: [crewWithArc()],
    };
    expect(noWin.flags[DEAL_WIN_FLAG]).toBeUndefined();
    expect(checkBeats(noWin).map((f) => f.beatId)).not.toContain('beat.crew-betrayal');
  });

  it('the same betrayal beat fires once a win has been banked', () => {
    const withWin: GameState = {
      ...createInitialState('betray2'),
      crew: [crewWithArc()],
      flags: { [DEAL_WIN_FLAG]: true },
    };
    expect(checkBeats(withWin).map((f) => f.beatId)).toContain('beat.crew-betrayal');
  });
});

describe('beats — plateaus space out escalation (design/05 §3)', () => {
  /** A state simultaneously past several act-defining thresholds. */
  function multiMajor(seed: string): GameState {
    const base = createInitialState(seed);
    return {
      ...base,
      stashes: [...base.stashes, { ...base.stashes[0]!, id: 'stash-2' }],
      fronts: [{ id: 'front-cash-front', type: 'cash-front', level: 1 }],
      cleanCash: 20_000_000,
      heat: 80, // CIA tier
      highScore: { ...base.highScore, peakNetWorth: 20_000_000 },
      flags: { [DEAL_WIN_FLAG]: true },
    };
  }

  it('fires at most MAJOR_BEATS_PER_TICK act-defining beats per check', () => {
    const fired = checkBeats(multiMajor('plateau'));
    expect(firedMajors(fired).length).toBeLessThanOrEqual(MAJOR_BEATS_PER_TICK);
  });

  it('the deferred majors still fire on subsequent ticks (spaced, not lost)', () => {
    let s = multiMajor('plateau2');
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      s = beatStep(s);
      s = { ...s, clock: { ...s.clock, hours: s.clock.hours + 24 } };
      for (const id of s.beatsFired) seen.add(id);
    }
    // All the act-defining thresholds this state crosses eventually resolve.
    expect(seen.has('beat.on-the-map')).toBe(true);
    expect(seen.has('beat.first-front')).toBe(true);
    expect(seen.has('beat.heat-taskforce-named')).toBe(true);
  });

  it('isPlateau is true at a fresh start and false when a major beat is pending', () => {
    expect(isPlateau(createInitialState('rest'))).toBe(true);
    expect(isPlateau(multiMajor('busy'))).toBe(false);
  });
});

describe('beats — offline never fires a beat (GDD §6)', () => {
  it('settleOffline queues no beat scenes even when a milestone is met', () => {
    const onMap: GameState = {
      ...createInitialState('offline-beat'),
      cleanCash: ON_THE_MAP_CLEAN_CASH,
    };
    const { state: settled } = settleOffline(onMap, 2_000);
    expect(settled.beatsFired).not.toContain('beat.on-the-map');
    expect(settled.pendingChoices.some((c) => c.kind === 'beat')).toBe(false);
  });
});

describe('beats — wired into the active tick pipeline', () => {
  it('crossing a milestone during an online tick fires its beat', () => {
    const rich: GameState = {
      ...createInitialState('tick-beat'),
      cleanCash: ON_THE_MAP_CLEAN_CASH,
    };
    const after = tick(rich, 24);
    expect(after.beatsFired).toContain('beat.on-the-map');
  });
});
