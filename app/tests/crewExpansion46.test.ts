/**
 * Crew expansion + lieutenant span-of-control + crew wages (design/13 D; Prompt 46).
 * Covers the acceptance criteria: a ~14-body roster of fully-realized people, one
 * lieutenant running two ops for the full disclosed bonus on each (a third rejects
 * without mutating), a six-op layer costing exactly three lieutenants, and a
 * material — but never bankrupting — weekly payroll drawn from clean cash.
 */

import { describe, expect, it } from 'vitest';
import {
  CREW_ARCHETYPES,
  LIEUTENANT_FRONT_BONUS,
  assignProduction,
  unassignProduction,
  productionLieutenantBonus,
  crewPayrollPerWeek,
  chargeWages,
  createInitialState,
  recruit,
  spawnCrew,
  tick,
  type CrewMember,
  type GameState,
  type ProductionOp,
} from '@/engine';
import { recruitableArchetypes } from '@/ui/screens/crew.model';

/** A run whose production ops are exactly `ids` (a Level-1 grow each). */
function withOps(seed: string, ids: readonly string[]): GameState {
  const ops: ProductionOp[] = ids.map((id) => ({ id, type: 'backyard-grow', level: 1 }));
  return { ...createInitialState(seed), productionOps: ops };
}

const lieutenant = (id: string): CrewMember =>
  spawnCrew('marco', { id, role: 'lieutenant' });

describe('roster — ~14 fully-realized archetypes (no stat-block-only members)', () => {
  it('has roughly doubled to at least 14, each carrying the full relatedness template', () => {
    expect(CREW_ARCHETYPES.length).toBeGreaterThanOrEqual(14);
    for (const a of CREW_ARCHETYPES) {
      expect(a.bond.length).toBeGreaterThan(0);
      expect(a.traits.length).toBeGreaterThanOrEqual(1);
      expect(a.wagePerWeek).toBeGreaterThan(0);
      // A written voice for every relationship state — not a blank face (design/02 §4).
      expect(a.dialogue.greeting.length).toBeGreaterThan(0);
      expect(a.dialogue.loyal.length).toBeGreaterThan(0);
      expect(a.dialogue.wary.length).toBeGreaterThan(0);
      expect(a.dialogue.betrayal.length).toBeGreaterThan(0);
    }
  });

  it('keeps ids unique and leaves a deep promotable pool (starvation relief)', () => {
    const ids = CREW_ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const promotable = CREW_ARCHETYPES.filter((a) => a.role !== 'family');
    expect(promotable.length).toBeGreaterThanOrEqual(13);
  });

  it('offers every not-yet-recruited archetype as hireable on an existing save', () => {
    // A run already holding two of the ORIGINAL cast still sees the new candidates.
    const state: GameState = {
      ...createInitialState('hire'),
      crew: [spawnCrew('deon'), spawnCrew('marco')],
    };
    const offered = recruitableArchetypes(state).map((r) => r.archetypeId);
    expect(offered).not.toContain('deon'); // owned drops out
    expect(offered).toContain('winston'); // a new production lieutenant
    expect(offered).toContain('benji'); // a new boat courier
    expect(offered.length).toBe(CREW_ARCHETYPES.length - 2);
  });
});

describe('lieutenant span-of-control (design/13 D — 2 ops, full bonus each)', () => {
  it('runs two ops with the FULL disclosed bonus on each — no dilution', () => {
    let state = withOps('span', ['prod-a', 'prod-b']);
    state = { ...state, crew: [lieutenant('lt-1')] };

    state = assignProduction(state, 'lt-1', 'prod-a').state;
    const two = assignProduction(state, 'lt-1', 'prod-b');
    expect(two.rejected).toBeUndefined();
    state = two.state;

    expect(state.crew[0]!.productionOpIds).toEqual(['prod-a', 'prod-b']);
    expect(productionLieutenantBonus(state, 'prod-a')).toBe(LIEUTENANT_FRONT_BONUS);
    expect(productionLieutenantBonus(state, 'prod-b')).toBe(LIEUTENANT_FRONT_BONUS);
  });

  it('rejects a THIRD op with lieutenant-at-capacity and does not mutate', () => {
    let state = withOps('cap', ['prod-a', 'prod-b', 'prod-c']);
    state = { ...state, crew: [lieutenant('lt-1')] };
    state = assignProduction(state, 'lt-1', 'prod-a').state;
    state = assignProduction(state, 'lt-1', 'prod-b').state;

    const third = assignProduction(state, 'lt-1', 'prod-c');
    expect(third.rejected).toBe('lieutenant-at-capacity');
    expect(third.state).toBe(state); // no mutation on rejection
    expect(third.state.crew[0]!.productionOpIds).toEqual(['prod-a', 'prod-b']);
    expect(productionLieutenantBonus(state, 'prod-c')).toBe(0); // never got the op
  });

  it('assigning an op already held is an idempotent success (no duplicate)', () => {
    let state = withOps('idem', ['prod-a']);
    state = { ...state, crew: [lieutenant('lt-1')] };
    state = assignProduction(state, 'lt-1', 'prod-a').state;
    const again = assignProduction(state, 'lt-1', 'prod-a');
    expect(again.rejected).toBeUndefined();
    expect(again.state.crew[0]!.productionOpIds).toEqual(['prod-a']);
  });

  it('unassigning frees the slot and restores the op to base yield', () => {
    let state = withOps('free', ['prod-a', 'prod-b']);
    state = { ...state, crew: [lieutenant('lt-1')] };
    state = assignProduction(state, 'lt-1', 'prod-a').state;
    state = assignProduction(state, 'lt-1', 'prod-b').state;

    state = unassignProduction(state, 'lt-1', 'prod-a');
    expect(state.crew[0]!.productionOpIds).toEqual(['prod-b']);
    expect(productionLieutenantBonus(state, 'prod-a')).toBe(0);
    // The freed slot is reusable.
    const re = assignProduction(state, 'lt-1', 'prod-a');
    expect(re.rejected).toBeUndefined();
  });

  it('a fully-delegated six-op layer needs EXACTLY three lieutenants', () => {
    const opIds = ['prod-1', 'prod-2', 'prod-3', 'prod-4', 'prod-5', 'prod-6'];
    let state = withOps('six', opIds);
    state = { ...state, crew: [lieutenant('lt-1'), lieutenant('lt-2'), lieutenant('lt-3')] };

    // Two ops per lieutenant covers all six.
    const plan: readonly [string, string][] = [
      ['lt-1', 'prod-1'],
      ['lt-1', 'prod-2'],
      ['lt-2', 'prod-3'],
      ['lt-2', 'prod-4'],
      ['lt-3', 'prod-5'],
      ['lt-3', 'prod-6'],
    ];
    for (const [lt, op] of plan) {
      const r = assignProduction(state, lt, op);
      expect(r.rejected).toBeUndefined();
      state = r.state;
    }
    for (const op of opIds) {
      expect(productionLieutenantBonus(state, op)).toBe(LIEUTENANT_FRONT_BONUS);
    }

    // Only TWO lieutenants can't — the fifth op onto a full lieutenant rejects.
    let short: GameState = {
      ...withOps('six-short', opIds),
      crew: [lieutenant('a'), lieutenant('b')],
    };
    short = assignProduction(short, 'a', 'prod-1').state;
    short = assignProduction(short, 'a', 'prod-2').state;
    short = assignProduction(short, 'b', 'prod-3').state;
    short = assignProduction(short, 'b', 'prod-4').state;
    expect(assignProduction(short, 'a', 'prod-5').rejected).toBe('lieutenant-at-capacity');
    expect(assignProduction(short, 'b', 'prod-5').rejected).toBe('lieutenant-at-capacity');
  });
});

describe('crew wages — a material, never-bankrupting weekly obligation', () => {
  it('the payroll line equals the sum of the roster wages (shown = charged)', () => {
    const state: GameState = {
      ...createInitialState('pay'),
      crew: [spawnCrew('deon'), spawnCrew('marco'), spawnCrew('winston')],
    };
    const expected =
      CREW_ARCHETYPES.find((a) => a.id === 'deon')!.wagePerWeek +
      CREW_ARCHETYPES.find((a) => a.id === 'marco')!.wagePerWeek +
      CREW_ARCHETYPES.find((a) => a.id === 'winston')!.wagePerWeek;
    expect(crewPayrollPerWeek(state)).toBe(expected);
  });

  it('charges the payroll from clean cash on the weekly boundary, once per week', () => {
    const base: GameState = {
      ...createInitialState('charge'),
      cleanCash: 1_000_000,
      crew: [spawnCrew('deon'), spawnCrew('marco')],
      lastCrewPayrollWeek: 1,
      clock: { hours: 24 * 7, day: 8, week: 2 },
    };
    const payroll = crewPayrollPerWeek(base);
    const r = chargeWages(base);
    expect(r.weeks).toBe(1);
    expect(r.charged).toBe(payroll);
    expect(r.state.cleanCash).toBe(1_000_000 - payroll);
    expect(r.state.lastCrewPayrollWeek).toBe(2);
    // Re-running the same week charges nothing (never double-charges).
    const again = chargeWages(r.state);
    expect(again.charged).toBe(0);
    expect(again.state.cleanCash).toBe(r.state.cleanCash);
  });

  it('pays only what is affordable and NEVER goes negative (not a run-ender)', () => {
    const base: GameState = {
      ...createInitialState('broke'),
      cleanCash: 1_000, // far less than the wage bill
      crew: [spawnCrew('marco')], // $9,000/wk
      lastCrewPayrollWeek: 1,
      clock: { hours: 24 * 7, day: 8, week: 2 },
    };
    const payroll = crewPayrollPerWeek(base);
    const r = chargeWages(base);
    expect(r.charged).toBe(1_000);
    expect(r.state.cleanCash).toBe(0); // clamped at zero, never below
    // The unpaid remainder is NOT forgiven — it accrues as arrears (v20).
    expect(r.backWages).toBe(payroll - 1_000);
    expect(r.state.crewBackWages).toBe(payroll - 1_000);
  });

  it('accrues an unpaid shortfall as back-wages, then settles it first when cash returns', () => {
    const base: GameState = {
      ...createInitialState('arrears'),
      cleanCash: 0, // dead broke — the whole week goes unpaid
      crew: [spawnCrew('marco')], // $9,000/wk
      lastCrewPayrollWeek: 1,
      clock: { hours: 24 * 7, day: 8, week: 2 },
    };
    const wk = crewPayrollPerWeek(base);
    const short = chargeWages(base);
    expect(short.charged).toBe(0);
    expect(short.state.crewBackWages).toBe(wk); // the whole week is now owed

    // A second unpaid week stacks the arrears (still no cash).
    const wk3 = chargeWages({
      ...short.state,
      clock: { hours: 24 * 14, day: 15, week: 3 },
    });
    expect(wk3.state.crewBackWages).toBe(wk * 2);

    // Cash arrives: the bill owed is arrears + this week's wages, paid down first.
    const flush = chargeWages({
      ...wk3.state,
      cleanCash: 1_000_000,
      clock: { hours: 24 * 21, day: 22, week: 4 },
    });
    expect(flush.state.crewBackWages).toBe(0); // square again
    expect(flush.charged).toBe(wk * 3); // two carried weeks + the current one
    expect(flush.state.cleanCash).toBe(1_000_000 - wk * 3);
  });

  it('settles standing arrears even after the whole crew is let go', () => {
    // You owe back-wages, then fire everyone. The debt is still yours to clear.
    const owed = 25_000;
    const base: GameState = {
      ...createInitialState('fired'),
      cleanCash: 40_000,
      crew: [],
      crewBackWages: owed,
      lastCrewPayrollWeek: 1,
      clock: { hours: 24 * 7, day: 8, week: 2 },
    };
    const r = chargeWages(base);
    expect(r.charged).toBe(owed);
    expect(r.state.crewBackWages).toBe(0);
    expect(r.state.cleanCash).toBe(40_000 - owed);
  });

  it('a FULL-roster payroll is material yet never bankrupts a run to the horizon', () => {
    // Hire every archetype, then run the retirement horizon (12 in-game weeks) with
    // NO income. Wages must draw (material) and floor at zero (never a run-ender) —
    // clean cash stays non-negative and the run reaches the horizon every step.
    for (const seed of ['h-0', 'h-1', 'h-2']) {
      let state: GameState = { ...createInitialState(seed), cleanCash: 250_000 };
      for (const a of CREW_ARCHETYPES) state = recruit(state, a.id).state;
      expect(crewPayrollPerWeek(state)).toBeGreaterThan(0); // material

      const start = state.cleanCash;
      // 12 weeks in one-week steps; assert the floor holds at every boundary.
      for (let week = 0; week < 12; week++) {
        state = tick(state, 24 * 7);
        expect(state.cleanCash).toBeGreaterThanOrEqual(0);
        expect(state.runStatus).toBe('active'); // wages alone never end the run
      }
      expect(state.clock.week).toBeGreaterThanOrEqual(12);
      expect(state.cleanCash).toBeLessThan(start); // the payroll really drew
    }
  });

  it('draws wages through the live tick when a week boundary is crossed', () => {
    const base: GameState = {
      ...createInitialState('tick'),
      cleanCash: 500_000,
      crew: [spawnCrew('deon'), spawnCrew('marco'), spawnCrew('winston')],
    };
    const payroll = crewPayrollPerWeek(base);
    // Advance a little past one in-game week with no income source running.
    const after = tick(base, 24 * 7 + 1);
    expect(after.clock.week).toBeGreaterThanOrEqual(2);
    expect(after.cleanCash).toBe(500_000 - payroll);
  });
});
