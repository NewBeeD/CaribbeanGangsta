import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  tick,
  addStash,
  getStashType,
  effectiveSeizurePct,
  // corruption — config
  getOfficial,
  PORT_BRIBE_BASE_FRACTION,
  PORT_PAID_SEIZURE,
  HAGGLE_DISCOUNT,
  HAGGLE_REFUSE_CHANCE,
  RETAINER_UNDERPAY_LOYALTY,
  POLITICIAN_REP_BONUS,
  // corruption — engine
  portGreed,
  rivalPressure,
  repDiscount,
  portDriftFactor,
  quoteBribe,
  haggle,
  payBribe,
  walk,
  hire,
  dismissOfficial,
  chargeRetainers,
  computeRaiseAsk,
  requestRaise,
  respondToRaise,
  corruptionStep,
  officialFlipTarget,
  officialWireHeatPerHour,
  judgeCanDismiss,
  settleOffline,
  type GameState,
} from '@/engine';
import { migrateEnvelope } from '@/store';

const HEAT_MAX = 100;

/** A funded run at zero heat (clean baseline for exact-formula assertions). */
function fundedCalm(seed: string, cleanCash = 1_000_000): GameState {
  return { ...createInitialState(seed), cleanCash, heat: 0 };
}

/** Advance exactly one in-game week (168h) — one weekly payroll boundary. */
function tickOneWeek(state: GameState): GameState {
  return tick(state, 168);
}

// --- Port bribes: fairness law (design/09 B.1) -------------------------------

describe('quoteBribe — the documented formula, shown == charged (design/09 B.1)', () => {
  it('computes the ask from base × value × (1+heat) × (1+rival) × greed × repDiscount × drift', () => {
    const state = fundedCalm('quote');
    const portId = state.world.startingCountry.id;
    const value = 100_000;

    const q = quoteBribe(state, portId, value);
    const expected = Math.round(
      PORT_BRIBE_BASE_FRACTION *
        value *
        (1 + state.heat / HEAT_MAX) *
        (1 + rivalPressure(state)) *
        portGreed(portId) *
        repDiscount(state) *
        portDriftFactor(state, portId),
    );

    expect(q.ask).toBe(expected);
    expect(q.resultingSeizurePct).toBe(PORT_PAID_SEIZURE);
    expect(q.baseSeizurePct).toBeCloseTo(0.3);
  });

  it('a hotter empire pays more (heat raises the ask)', () => {
    const calm = fundedCalm('heat-calm');
    const portId = calm.world.startingCountry.id;
    const hot = { ...calm, heat: 80 };
    expect(quoteBribe(hot, portId, 50_000).ask).toBeGreaterThan(
      quoteBribe(calm, portId, 50_000).ask,
    );
  });

  it('payBribe charges EXACTLY the shown ask, from clean cash', () => {
    const state = fundedCalm('pay');
    const portId = state.world.startingCountry.id;
    const q = quoteBribe(state, portId, 120_000);

    const r = payBribe(state, portId, 120_000);
    expect(r.ok).toBe(true);
    expect(r.paid).toBe(q.ask);
    expect(state.cleanCash - r.state.cleanCash).toBe(q.ask);
  });

  it('rejects a bribe it cannot afford, without mutating', () => {
    const broke = { ...fundedCalm('broke'), cleanCash: 10 };
    const portId = broke.world.startingCountry.id;
    const r = payBribe(broke, portId, 500_000);
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe('insufficient-funds');
    expect(r.state).toBe(broke);
  });
});

describe('haggle — a readable gamble, odds shown == rolled (design/09 B.1)', () => {
  it('the shown refuse chance is exactly the rolled comparison (fairness law)', () => {
    const state = fundedCalm('haggle');
    const portId = state.world.startingCountry.id;
    const h = haggle(state, portId, 80_000);
    expect(h.refuseChance).toBe(HAGGLE_REFUSE_CHANCE);
    expect(h.refused).toBe(h.rolledValue < HAGGLE_REFUSE_CHANCE);
  });

  it('a successful haggle lowers the ask; a refusal keeps the original', () => {
    const portId = createInitialState('x').world.startingCountry.id;
    const value = 90_000;
    // Sweep seeds so we exercise both branches deterministically.
    let sawSuccess = false;
    let sawRefusal = false;
    for (let i = 0; i < 40 && !(sawSuccess && sawRefusal); i++) {
      const state = fundedCalm(`haggle-${i}`);
      const q = quoteBribe(state, portId, value);
      const h = haggle(state, portId, value);
      if (h.refused) {
        sawRefusal = true;
        expect(h.ask).toBe(q.ask);
      } else {
        sawSuccess = true;
        expect(h.ask).toBe(Math.round(q.ask * (1 - HAGGLE_DISCOUNT)));
      }
    }
    expect(sawSuccess && sawRefusal).toBe(true);
  });

  it('payBribe honors a haggled ask', () => {
    // Find a seed where the haggle succeeds.
    const portId = createInitialState('y').world.startingCountry.id;
    for (let i = 0; i < 40; i++) {
      const state = fundedCalm(`honor-${i}`);
      const h = haggle(state, portId, 70_000);
      if (h.refused) continue;
      const r = payBribe(h.state, portId, 70_000, { agreedAsk: h.ask });
      expect(r.ok).toBe(true);
      expect(r.paid).toBe(h.ask);
      return;
    }
    throw new Error('no successful haggle found in sweep');
  });

  it('walk is a no-op (ship at full risk / reroute)', () => {
    const state = fundedCalm('walk');
    expect(walk(state)).toBe(state);
  });
});

// --- Paid port → container seizure floor (design/09 A.3, feeds Prompt 06) -----

describe('paid port lowers container seizure to the floor (design/09 A.3)', () => {
  it('a paid port drops that port’s container stash to the configured floor', () => {
    let state = fundedCalm('port');
    const add = addStash(state, 'container');
    state = add.state;
    const containerId = add.stash!.id;
    const portId = state.world.startingCountry.id;

    // Unpaid: base container seizure.
    expect(effectiveSeizurePct(state, containerId)).toBeCloseTo(
      getStashType('container').seizurePct,
    );

    const paid = payBribe(state, portId, 200_000);
    expect(effectiveSeizurePct(paid.state, containerId)).toBeCloseTo(PORT_PAID_SEIZURE);
  });

  it('a customs chief keeps a STANDING paid port; dismissing them lapses it', () => {
    let state = fundedCalm('customs');
    const add = addStash(state, 'container');
    state = add.state;
    const containerId = add.stash!.id;
    const portId = state.world.startingCountry.id;

    const hired = hire(state, 'customs-chief', { portId });
    expect(effectiveSeizurePct(hired.state, containerId)).toBeCloseTo(PORT_PAID_SEIZURE);

    const gone = dismissOfficial(hired.state, hired.official!.id);
    expect(effectiveSeizurePct(gone, containerId)).toBeCloseTo(
      getStashType('container').seizurePct,
    );
  });
});

// --- Standing payroll: weekly retainers (design/09 B.2) ----------------------

describe('weekly retainers — charged on the weekly boundary from clean cash', () => {
  it('hiring charges the first week up front and tracks payroll', () => {
    const state = fundedCalm('hire', 500_000);
    const r = hire(state, 'beat-cop');
    expect(r.official?.retainerPerWeek).toBe(getOfficial('beat-cop').retainerPerWeek);
    expect(r.state.cleanCash).toBe(500_000 - getOfficial('beat-cop').retainerPerWeek);
    expect(r.state.corruption.payrollPerWeek).toBe(getOfficial('beat-cop').retainerPerWeek);
  });

  it('a hired politician lifts political reputation (design/09 B.2)', () => {
    const state = fundedCalm('pol', 500_000);
    const r = hire(state, 'politician');
    expect(r.state.reputation.political).toBe(state.reputation.political + POLITICIAN_REP_BONUS);
  });

  it('charges retainers when a week elapses, from clean cash', () => {
    const cop = getOfficial('beat-cop').retainerPerWeek;
    let state = fundedCalm('weekly', 500_000);
    state = hire(state, 'beat-cop').state; // -1 week up front
    const afterHire = state.cleanCash;

    state = tickOneWeek(state);
    expect(state.clock.week).toBe(2);
    expect(state.cleanCash).toBe(afterHire - cop);
  });

  it('missing a retainer raises flip risk and writes a memory entry', () => {
    const cop = getOfficial('beat-cop');
    // Enough for the hire, nothing left for the next week.
    let state = { ...fundedCalm('miss'), cleanCash: cop.retainerPerWeek };
    state = hire(state, 'beat-cop').state;
    expect(state.cleanCash).toBe(0);

    state = tickOneWeek(state);
    const tie = state.corruption.officials[0]!;
    expect(tie.loyalty).toBeLessThan(cop.startingLoyalty);
    expect(tie.memoryLog.some((m) => m.kind === 'missed')).toBe(true);
    expect(state.cleanCash).toBe(0); // never went negative (offline/online safety)
  });
});

// --- Raise-asks (design/09 B.2 v1.1) -----------------------------------------

describe('raise-asks scale with business level & heat (design/09 B.2 v1.1)', () => {
  it('computeRaiseAsk follows current × (1+Δbusiness) × (1+heat) × greed × (1+rival)', () => {
    let state = fundedCalm('raise', 200_000);
    state = hire(state, 'detective').state;
    state = { ...state, heat: 50, reputation: { ...state.reputation, business: 80 } };
    const tie = state.corruption.officials[0]!;

    const expected = Math.round(
      tie.retainerPerWeek *
        (1 + 80 / 100) *
        (1 + 50 / HEAT_MAX) *
        tie.greed *
        (1 + rivalPressure(state)),
    );
    expect(computeRaiseAsk(state, tie)).toBe(expected);
  });

  it('requestRaise sets a pending ask once it clears the margin; refusing == underpayment', () => {
    let state = fundedCalm('ask', 200_000);
    state = hire(state, 'detective').state;
    state = { ...state, heat: 60, reputation: { ...state.reputation, business: 70 } };
    const tie = state.corruption.officials[0]!;

    const asked = requestRaise(state, tie.id);
    const expected = computeRaiseAsk(state, tie);
    expect(asked.official?.pendingRaise?.newRetainer).toBe(expected);
    expect(expected).toBeGreaterThan(tie.retainerPerWeek);

    // Refuse: the ask clears, loyalty drops, a grievance is remembered.
    const refused = respondToRaise(asked.state, tie.id, false);
    expect(refused.official?.pendingRaise).toBeUndefined();
    expect(refused.official!.loyalty).toBe(tie.loyalty + RETAINER_UNDERPAY_LOYALTY);
    expect(refused.official!.memoryLog.some((m) => m.kind === 'underpaid')).toBe(true);
  });

  it('accepting a raise lifts the retainer', () => {
    let state = fundedCalm('accept', 200_000);
    state = hire(state, 'detective').state;
    state = { ...state, heat: 60, reputation: { ...state.reputation, business: 70 } };
    const tie = state.corruption.officials[0]!;
    const asked = requestRaise(state, tie.id);
    const newRetainer = asked.official!.pendingRaise!.newRetainer;

    const accepted = respondToRaise(asked.state, tie.id, true);
    expect(accepted.official!.retainerPerWeek).toBe(newRetainer);
    expect(accepted.official!.pendingRaise).toBeUndefined();
    expect(accepted.state.corruption.payrollPerWeek).toBe(newRetainer);
  });

  it('a content official in a calm, small empire does not bother asking', () => {
    let state = fundedCalm('quiet', 200_000);
    state = hire(state, 'beat-cop').state; // greed 0.9, calm, no business rep
    const tie = state.corruption.officials[0]!;
    expect(requestRaise(state, tie.id).official?.pendingRaise).toBeUndefined();
  });
});

// --- Telegraphed flip (design/09 B.2; reuses the crew betrayal arc) ----------

describe('official flips are telegraphed with an intervention window (design/09 B.2)', () => {
  it('heat over comfort nudges to warning; cooling heat walks it back (never silent)', () => {
    let state = fundedCalm('interv', 200_000);
    state = hire(state, 'politician').state; // comfortHeat 45

    // Heat crosses their comfort threshold → a telegraphed warning (no charge yet).
    state = { ...state, heat: 80 };
    state = corruptionStep(state, 1);
    expect(officialFlipTarget(state, state.corruption.officials[0]!)).toBe('warning');
    expect(state.corruption.officials[0]!.activeArc?.stage).toBe('warning');
    expect(state.pendingChoices.some((c) => c.kind === 'official-flip')).toBe(true);

    // Intervention: cool the heat → the arc walks back down to none.
    state = { ...state, heat: 5 };
    state = corruptionStep(state, 1);
    expect(state.corruption.officials[0]!.activeArc).toBeUndefined();
  });

  it('sustained underpayment steps warning → point-of-no-return → flipped, one stage per tick', () => {
    const cop = getOfficial('beat-cop');
    // Fund only the hire; every subsequent week is a miss.
    let state = { ...fundedCalm('flip'), cleanCash: cop.retainerPerWeek };
    state = hire(state, 'beat-cop').state;

    const stages: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++) {
      state = tickOneWeek(state);
      stages.push(state.corruption.officials[0]?.activeArc?.stage);
    }

    // The arc only ever advances one readable stage at a time, in order.
    expect(stages).toContain('warning');
    const warnAt = stages.indexOf('warning');
    const ponrAt = stages.indexOf('point-of-no-return');
    const flipAt = stages.indexOf('flipped');
    expect(warnAt).toBeGreaterThanOrEqual(0);
    expect(ponrAt).toBeGreaterThan(warnAt);
    expect(flipAt).toBeGreaterThan(ponrAt);

    const tie = state.corruption.officials[0]!;
    expect(tie.isWire).toBe(true);
    expect(officialWireHeatPerHour(state)).toBeGreaterThan(0);
    // A flipped official feeds the heat/LE wire — heat is well above the calm baseline.
    expect(state.heat).toBeGreaterThan(createInitialState('flip').heat);
  });
});

// --- Judge benefit (design/09 B.2; Prompt 11 hook) ---------------------------

describe('judge softens the prison end-state (design/09 B.2)', () => {
  it('a loyal hired judge can dismiss charges; none on payroll cannot', () => {
    const state = fundedCalm('judge', 200_000);
    expect(judgeCanDismiss(state)).toBe(false);
    const hired = hire(state, 'judge');
    expect(judgeCanDismiss(hired.state)).toBe(true);
  });
});

// --- Offline safety (design/09 B.3; GDD §6) ----------------------------------

describe('retainers never charge offline (offline-safe, GDD §6)', () => {
  it('settleOffline leaves clean cash, heat, and officials untouched by payroll', () => {
    let state = fundedCalm('offline', 200_000);
    state = hire(state, 'judge').state; // a $20k/wk retainer on the books
    const before = state;

    const { state: after } = settleOffline(before, 1_000); // a long absence

    expect(after.cleanCash).toBeGreaterThanOrEqual(before.cleanCash); // never charged
    expect(after.heat).toBeLessThanOrEqual(before.heat); // no wire/heat offline
    const b = before.corruption.officials[0]!;
    const a = after.corruption.officials[0]!;
    expect(a.loyalty).toBe(b.loyalty);
    expect(a.memoryLog).toEqual(b.memoryLog);
    expect(after.clock.hours).toBe(before.clock.hours); // clock frozen while away
  });

  it('chargeRetainers is idempotent within a week (no double-charge)', () => {
    let state = fundedCalm('idem', 200_000);
    state = hire(state, 'beat-cop').state;
    const first = chargeRetainers(state);
    expect(first.weeks).toBe(0); // same week as hire — nothing due
    expect(first.charged).toBe(0);
  });
});

// --- Migration (schema v5 → v6) ----------------------------------------------

describe('migration 5 → 6 — expand corruption (Prompt 09)', () => {
  it('adds paidPorts + payroll bookkeeping and hydrates legacy officials', () => {
    const state = createInitialState('mig6');
    const legacy = {
      ...state,
      corruption: { officials: [{ id: 'beat-cop', loyalty: 50 }], payrollPerWeek: 0 },
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      slot: 's',
      schemaVersion: 5,
      savedAt: 0,
      seed: state.seed,
      runStatus: state.runStatus,
      day: state.clock.day,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    expect(migrated!.corruption.paidPorts).toEqual([]);
    expect(migrated!.corruption.lastPayrollWeek).toBe(state.clock.week);
    const tie = migrated!.corruption.officials[0]!;
    expect(tie.officialId).toBe('beat-cop');
    expect(tie.loyalty).toBe(50);
    expect(tie.retainerPerWeek).toBe(getOfficial('beat-cop').retainerPerWeek);
    expect(migrated!.corruption.payrollPerWeek).toBe(getOfficial('beat-cop').retainerPerWeek);
  });
});
