import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createInitialState,
  recruit,
  spawnCrew,
  loyaltyDelta,
  loyaltyDeltaValue,
  describeLoyalty,
  recordMemory,
  readsMemory,
  hasMemoryOf,
  betrayalTarget,
  advanceBetrayalArcs,
  applyWireHeat,
  wireHeatPerHour,
  train,
  promote,
  assign,
  frontLieutenantBonus,
  cleanCashRate,
  settleOffline,
  tick,
  effectiveSeizurePct,
  LIEUTENANT_FRONT_BONUS,
  WIRE_HEAT_PER_HOUR,
  TRAIN_SKILL_GAIN,
  TRAIN_COST,
  CREW_SKILL_MAX,
  type CrewMember,
  type Front,
  type GameState,
  type Stash,
} from '@/engine';
import { LocalSaveStore, migrateEnvelope } from '@/store';

/** A run with `archetypeId` recruited (returns the run and that crew member). */
function withCrew(seed: string, archetypeId: string): { state: GameState; npc: CrewMember } {
  const { state, crew } = recruit(createInitialState(seed), archetypeId);
  return { state, npc: crew };
}

const bar = (id = 'front-bar-1', level = 1): Front => ({ id, type: 'bar', level });

describe('spawnCrew / recruit — the MVP roster (design/02 §7)', () => {
  it('builds a fully-realized person from an archetype, not a stat line', () => {
    const marco = spawnCrew('marco');
    expect(marco.name).toBe('Marco');
    expect(marco.role).toBe('lieutenant');
    expect(marco.traits.length).toBeGreaterThanOrEqual(2);
    expect(marco.agenda).toBe('wants-own-territory');
    expect(marco.memoryLog).toEqual([]);
    expect(marco.assignment).toEqual({ kind: 'idle' });
  });

  it('marks exactly the family relationship as family (design/02 §2, §7)', () => {
    expect(spawnCrew('nadia').isFamily).toBe(true);
    expect(spawnCrew('marco').isFamily).toBeUndefined();
  });

  it('recruit appends and keeps ids unique across repeats', () => {
    const { state } = withCrew('recruit', 'deon');
    const twice = recruit(state, 'deon');
    expect(twice.state.crew).toHaveLength(2);
    expect(twice.state.crew.map((c) => c.id)).toEqual(['crew-deon', 'crew-deon-2']);
  });
});

describe('loyalty — the multi-factor model (design/02 §4, not one lever)', () => {
  it('the SAME event moves two crew differently by trait fit', () => {
    const marco = spawnCrew('marco'); // ambitious + proud → resents being passed over
    const deon = spawnCrew('deon'); //   loyal-to-a-fault → forgives it
    const forMarco = loyaltyDeltaValue(marco, { kind: 'passedOver' });
    const forDeon = loyaltyDeltaValue(deon, { kind: 'passedOver' });
    expect(forMarco).toBeLessThan(0);
    expect(forDeon).toBeLessThan(0);
    expect(Math.abs(forMarco)).toBeGreaterThan(Math.abs(forDeon)); // trait fit is a real lever
  });

  it('pay is scaled by dollars AND trait (two factors, neither decisive alone)', () => {
    const topz = spawnCrew('tpopz'); // greedy → pay lands harder
    const small = loyaltyDeltaValue(topz, { kind: 'paid', amount: 5_000 });
    const big = loyaltyDeltaValue(topz, { kind: 'paid', amount: 25_000 });
    expect(big).toBeGreaterThan(small); // pay magnitude matters
    // Greedy multiplies pay above a non-greedy crew's for the same dollars.
    const iris = spawnCrew('iris');
    expect(loyaltyDeltaValue(topz, { kind: 'paid', amount: 5_000 })).toBeGreaterThan(
      loyaltyDeltaValue(iris, { kind: 'paid', amount: 5_000 }),
    );
  });

  it('treatment and shared success move loyalty in opposite directions', () => {
    const npc = spawnCrew('reyes');
    expect(loyaltyDeltaValue(npc, { kind: 'sharedSuccess' })).toBeGreaterThan(0);
    expect(loyaltyDeltaValue(npc, { kind: 'shortchanged' })).toBeLessThan(0);
    expect(loyaltyDeltaValue(npc, { kind: 'protected' })).toBeGreaterThan(0);
  });

  it('every shift writes a memory entry from the NPC’s side (design/02 §3)', () => {
    const { state, npc } = withCrew('mem', 'deon');
    expect(npc.memoryLog).toHaveLength(0);
    const { state: after, crew } = loyaltyDelta(state, npc.id, { kind: 'tookTheFall' });
    expect(crew!.memoryLog).toHaveLength(1);
    const entry = crew!.memoryLog[0]!;
    expect(entry.kind).toBe('tookTheFall');
    expect(entry.note).toContain('Deon');
    expect(entry.delta).toBeLessThan(0);
    // The change is reflected in the run state, not just the returned crew.
    expect(after.crew[0]!.loyalty).toBeLessThan(npc.loyalty);
  });

  it('clamps loyalty to [0, 100] however hard you push', () => {
    const { state, npc } = withCrew('clamp', 'tpopz');
    let s = state;
    for (let i = 0; i < 40; i++) s = loyaltyDelta(s, npc.id, { kind: 'shortchanged', amount: 25_000 }).state;
    expect(s.crew[0]!.loyalty).toBe(0);
    for (let i = 0; i < 60; i++) s = loyaltyDelta(s, npc.id, { kind: 'paid', amount: 25_000 }).state;
    expect(s.crew[0]!.loyalty).toBe(100);
  });
});

describe('describeLoyalty — prose only, never the number (design/02 §1)', () => {
  it('returns prose that never leaks a digit or a bar', () => {
    for (const loyalty of [0, 12, 30, 45, 58, 75, 90, 100]) {
      const npc = spawnCrew('marco', { loyalty });
      const desc = describeLoyalty(npc);
      expect(desc.length).toBeGreaterThan(0);
      expect(desc).not.toMatch(/\d/); // no 73, no 100, no "/100"
    }
  });

  it('the prose shifts with standing (devoted vs cooled)', () => {
    const devoted = describeLoyalty(spawnCrew('marco', { loyalty: 95 }));
    const cooled = describeLoyalty(spawnCrew('marco', { loyalty: 35 }));
    expect(devoted).not.toBe(cooled);
  });
});

describe('memory — the world remembers, and reads it back (design/02 §3)', () => {
  it('recordMemory / readsMemory / hasMemoryOf round-trip', () => {
    let npc = spawnCrew('deon');
    npc = recordMemory(npc, { atHours: 5, kind: 'tookTheFall', note: 'Kingston.', delta: -20 });
    expect(readsMemory(npc)).toHaveLength(1);
    expect(readsMemory(npc, 'tookTheFall')).toHaveLength(1);
    expect(readsMemory(npc, 'paid')).toHaveLength(0);
    expect(hasMemoryOf(npc, 'tookTheFall')).toBe(true);
  });

  it('memory survives save/load and later checks still read it (consistency law)', async () => {
    const store = new LocalSaveStore({ factory: new IDBFactory(), now: () => 1 });
    const { state, npc } = withCrew('persist', 'deon');
    const wronged = loyaltyDelta(state, npc.id, { kind: 'tookTheFall' }).state;

    await store.save('slot', wronged);
    const loaded = (await store.load('slot')) as GameState;

    expect(loaded).toEqual(wronged); // full round-trip, memory included
    // A "later check" on the reloaded run still sees the remembered wrong.
    expect(hasMemoryOf(loaded.crew[0]!, 'tookTheFall')).toBe(true);
  });

  it('migrates a legacy `{id,name,loyalty}` crew stub to the full model (4→5)', () => {
    const legacyState = {
      ...createInitialState('mig'),
      schemaVersion: 4,
      crew: [{ id: 'old-hand', name: 'Old Hand', loyalty: 55 }],
    } as unknown as GameState;
    const env = {
      slot: 's',
      schemaVersion: 4,
      savedAt: 0,
      seed: 'mig',
      runStatus: 'active' as const,
      day: 1,
      state: legacyState,
    };
    const migrated = migrateEnvelope(env)!;
    const hand = migrated.crew[0]!;
    expect(hand.loyalty).toBe(55); // preserved
    expect(hand.memoryLog).toEqual([]); // filled
    expect(hand.assignment).toEqual({ kind: 'idle' });
    expect(hand.skills.deal).toBe(0);
  });
});

describe('betrayal — a telegraphed story beat, not a dice roll (design/02 §4)', () => {
  /** Drive `npcId` down with repeated grievances (builds a grievance + low loyalty). */
  function embitter(state: GameState, npcId: string, times: number): GameState {
    let s = state;
    for (let i = 0; i < times; i++) s = loyaltyDelta(s, npcId, { kind: 'passedOver' }).state;
    return s;
  }

  it('a buyable agenda with a grievance walks warning → point-of-no-return → flip', () => {
    const { state, npc } = withCrew('flip', 'marco'); // wants-own-territory (buyable)
    let s = embitter(state, npc.id, 3); // loyalty floored, grievance recorded
    expect(betrayalTarget(s.crew[0]!)).toBe('flipped');

    // No arc yet — it must be telegraphed one stage at a time.
    expect(s.crew[0]!.activeArc).toBeUndefined();

    s = advanceBetrayalArcs(s);
    expect(s.crew[0]!.activeArc?.stage).toBe('warning');
    s = advanceBetrayalArcs(s);
    expect(s.crew[0]!.activeArc?.stage).toBe('point-of-no-return');
    s = advanceBetrayalArcs(s);
    expect(s.crew[0]!.activeArc?.stage).toBe('flipped');
    expect(s.crew[0]!.isWire).toBe(true);

    // Each upward crossing left a readable telegraph (design/07 §5).
    const telegraphs = s.pendingChoices.filter((c) => c.kind === 'crew-betrayal');
    expect(telegraphs).toHaveLength(3);
    expect(telegraphs[0]!.summary).toContain('Marco');
  });

  it('is deterministic given state — same input, byte-identical result (no RNG)', () => {
    const { state, npc } = withCrew('det', 'marco');
    const s = embitter(state, npc.id, 3);
    expect(advanceBetrayalArcs(s)).toEqual(advanceBetrayalArcs(s));
  });

  it('never skips a stage — a single evaluation advances at most one', () => {
    const { state, npc } = withCrew('noskip', 'marco');
    const s = advanceBetrayalArcs(embitter(state, npc.id, 3));
    expect(s.crew[0]!.activeArc?.stage).toBe('warning'); // not straight to flipped
    expect(s.crew[0]!.isWire).toBeUndefined();
  });

  it('the intervention window is real — treatment walks the arc back down', () => {
    const { state, npc } = withCrew('save', 'marco');
    let s = advanceBetrayalArcs(embitter(state, npc.id, 1)); // → warning
    expect(s.crew[0]!.activeArc?.stage).toBe('warning');

    // Promote/pay them up out of the danger band...
    s = loyaltyDelta(s, npc.id, { kind: 'promoted' }).state;
    s = loyaltyDelta(s, npc.id, { kind: 'paid', amount: 25_000 }).state;
    expect(betrayalTarget(s.crew[0]!)).toBe('none');

    s = advanceBetrayalArcs(s); // arc de-escalates, no telegraph
    expect(s.crew[0]!.activeArc).toBeUndefined();
    expect(s.crew[0]!.isWire).toBeUndefined();
  });

  it('a crew member with no buyable agenda never flips, even at zero loyalty', () => {
    const { state, npc } = withCrew('loyal', 'deon'); // agenda: just-survive
    let s = state;
    for (let i = 0; i < 40; i++) s = loyaltyDelta(s, npc.id, { kind: 'shortchanged', amount: 25_000 }).state;
    expect(s.crew[0]!.loyalty).toBe(0);
    expect(betrayalTarget(s.crew[0]!)).toBe('none');
    s = advanceBetrayalArcs(advanceBetrayalArcs(advanceBetrayalArcs(s)));
    expect(s.crew[0]!.isWire).toBeUndefined();
  });
});

describe('wires → heat (design/02 §4; Prompt 05/09)', () => {
  it('a flipped crew member feeds passive heat while online', () => {
    const flipped = spawnCrew('marco', { loyalty: 0, isWire: true });
    const state: GameState = { ...createInitialState('wire'), crew: [flipped], heat: 10 };
    expect(wireHeatPerHour(state)).toBe(WIRE_HEAT_PER_HOUR);
    const after = applyWireHeat(state, 10);
    expect(after.heat).toBeCloseTo(10 + WIRE_HEAT_PER_HOUR * 10, 6);
  });

  it('a wire never raises heat while the player is away (offline is safe, GDD §6)', () => {
    const flipped = spawnCrew('marco', { loyalty: 0, isWire: true });
    const state: GameState = { ...createInitialState('wire-off'), crew: [flipped], heat: 30 };
    const { state: after } = settleOffline(state, 48);
    expect(after.heat).toBe(30);
  });
});

describe('development — recruit, train, promote, assign (design/02 §5)', () => {
  it('train raises a skill by a fixed, deterministic step (no gamble)', () => {
    const { state, npc } = withCrew('train', 'deon');
    const flush: GameState = { ...state, cleanCash: TRAIN_COST };
    const before = npc.skills.deal;
    const res = train(flush, npc.id, 'deal');
    expect(res.rejected).toBeUndefined();
    expect(res.crew!.skills.deal).toBe(Math.min(CREW_SKILL_MAX, before + TRAIN_SKILL_GAIN));
    expect(res.state.cleanCash).toBe(0);
  });

  it('train rejects a shortfall without mutating', () => {
    const { state, npc } = withCrew('train-broke', 'deon');
    const broke: GameState = { ...state, cleanCash: TRAIN_COST - 1 };
    const res = train(broke, npc.id, 'deal');
    expect(res.rejected).toBe('insufficient-funds');
    expect(res.state).toBe(broke);
  });

  it('promotion delegates a front and boosts its laundering output (idle delegation)', () => {
    const { state, npc } = withCrew('promo', 'marco');
    const withFront: GameState = { ...state, fronts: [bar()] };
    const rateBefore = cleanCashRate(withFront);

    const res = promote(withFront, npc.id, { kind: 'front', targetId: 'front-bar-1' });
    expect(res.rejected).toBeUndefined();
    expect(res.crew!.role).toBe('lieutenant');
    expect(res.crew!.assignment).toEqual({ kind: 'front', targetId: 'front-bar-1' });

    // The interaction with laundering: a delegated front earns the lieutenant bonus.
    expect(frontLieutenantBonus(res.state, 'front-bar-1')).toBe(LIEUTENANT_FRONT_BONUS);
    expect(cleanCashRate(res.state)).toBeCloseTo(rateBefore * (1 + LIEUTENANT_FRONT_BONUS), 6);
  });

  it('promotion is a multi-party beat — others who wanted the seat feel passed over', () => {
    let s = createInitialState('jealous');
    s = recruit(s, 'reyes').state; // climb-the-ranks → wanted it
    s = recruit(s, 'marco').state; // the one promoted
    s = { ...s, fronts: [bar()] };
    const reyesBefore = s.crew.find((c) => c.archetypeId === 'reyes')!.loyalty;

    const marcoId = s.crew.find((c) => c.archetypeId === 'marco')!.id;
    s = promote(s, marcoId, { kind: 'front', targetId: 'front-bar-1' }).state;

    const reyesAfter = s.crew.find((c) => c.archetypeId === 'reyes')!.loyalty;
    expect(reyesAfter).toBeLessThan(reyesBefore); // the danger combo, emergent
  });

  it('promote rejects an unknown front without mutating', () => {
    const { state, npc } = withCrew('promo-bad', 'marco');
    const res = promote(state, npc.id, { kind: 'front', targetId: 'nope' });
    expect(res.rejected).toBe('invalid-target');
    expect(res.state).toBe(state);
  });

  it('assign as guard wires loyalty into storage’s seizure % (design/09 A.3a)', () => {
    let s = createInitialState('guard');
    // A safehouse vault (requiresGuard) so the guard actually matters.
    const vault: Stash = {
      ...(s.stashes[0] as Stash),
      id: 'vault',
      type: 'safehouse',
    };
    s = { ...s, stashes: [...s.stashes, vault] };
    s = recruit(s, 'reyes').state; // low loyalty → a risky guard
    const guardId = s.crew[0]!.id;

    s = assign(s, guardId, { kind: 'guard', targetId: 'vault' });
    expect((s.stashes.find((x) => x.id === 'vault') as Stash).guardCrewId).toBe(guardId);

    // Winning that guard's loyalty lowers the vault's effective seizure %.
    const riskyPct = effectiveSeizurePct(s, 'vault');
    const won = loyaltyDelta(s, guardId, { kind: 'paid', amount: 25_000 }).state;
    expect(effectiveSeizurePct(won, 'vault')).toBeLessThan(riskyPct);
  });
});

describe('offline safety — crew arcs never advance while away (GDD §6)', () => {
  it('a tick advances arcs online, but offline settlement leaves them frozen', () => {
    const { state, npc } = withCrew('freeze', 'marco');
    // Embitter + one online tick begins the telegraphed arc.
    let s = loyaltyDelta(state, npc.id, { kind: 'passedOver' }).state;
    s = loyaltyDelta(s, npc.id, { kind: 'passedOver' }).state;
    const online = tick(s, 1);
    expect(online.crew[0]!.activeArc?.stage).toBe('warning');

    // Offline: the same elapsed time must NOT advance the arc.
    const { state: offline } = settleOffline(s, 48);
    expect(offline.crew[0]!.activeArc).toBeUndefined();
  });
});
