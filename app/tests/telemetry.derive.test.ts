import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  emptyInventory,
  settleOffline,
  borrow,
  LENDERS,
  PRODUCT_IDS,
  TRANSPORTS,
  FIRST_SALE_FLAG,
  effectiveSeizurePct,
  type GameState,
  type OfficialTie,
  type PendingChoice,
  type Shipment,
} from '@/engine';
import {
  auditOfflineFreeze,
  deriveTickEvents,
  fairnessReport,
  FAIRNESS_MIN_SAMPLES,
  type AnyTelemetryEvent,
  type DerivedEvent,
} from '@/telemetry';

const PRODUCT = PRODUCT_IDS[0]!;

function withChoice(state: GameState, choice: PendingChoice): GameState {
  return { ...state, pendingChoices: [...state.pendingChoices, choice] };
}

function named(events: DerivedEvent[], name: string): DerivedEvent[] {
  return events.filter((e) => e.name === name);
}

/** Wrap derived rows as stamped events so the aggregators can consume them. */
function stamped(rows: readonly DerivedEvent[]): AnyTelemetryEvent[] {
  return rows.map((r, i) => ({ ...r, at: 0, seq: i }) as AnyTelemetryEvent);
}

describe('deriveTickEvents — a tick, recovered as telemetry (Prompt 25)', () => {
  it('identical states derive nothing', () => {
    const state = createInitialState('derive-none');
    expect(deriveTickEvents(state, state)).toEqual([]);
  });

  it('a seizing raid emits raid_resolved with the loss + a raid fairness row', () => {
    const base = createInitialState('derive-raid');
    const home = base.stashes[0]!;
    const prev: GameState = {
      ...base,
      cleanCash: 100_000, // stays above the wipe threshold — not a wipe raid
      stashes: [
        { ...home, dirtyCash: 5_000, inventory: { ...home.inventory, [PRODUCT]: 10 } },
      ],
    };
    const next = withChoice(
      {
        ...prev,
        stashes: [{ ...prev.stashes[0]!, dirtyCash: 0, inventory: emptyInventory() }],
      },
      { id: `raid-${home.id}-12`, kind: 'raid', summary: 'raided', createdAtHours: 12 },
    );

    const events = deriveTickEvents(prev, next);
    const [raid] = named(events, 'raid_resolved');
    expect(raid?.props).toMatchObject({
      stashId: home.id,
      seized: true,
      unitsLost: 10,
      cashLost: 5_000,
      lossPct: 1, // the only stash — a full concentration loss
      wiped: false,
    });

    const [audit] = named(events, 'odds_audit');
    expect(audit?.props).toMatchObject({
      surface: 'raid',
      displayed: effectiveSeizurePct(prev, home.id),
      hit: true,
    });
  });

  it('a raid that came up empty derives seized: false', () => {
    const base = createInitialState('derive-raid-miss');
    const home = base.stashes[0]!;
    const next = withChoice(base, {
      id: `raid-${home.id}-3`,
      kind: 'raid',
      summary: 'they came up empty',
      createdAtHours: 3,
    });
    const events = deriveTickEvents(base, next);
    expect(named(events, 'raid_resolved')[0]?.props).toMatchObject({ seized: false });
    expect(named(events, 'odds_audit')[0]?.props).toMatchObject({ surface: 'raid', hit: false });
  });

  it('an interdicted shipment emits shipment_resolved + its fairness row', () => {
    const base = createInitialState('derive-ship');
    const home = base.stashes[0]!;
    const shipment: Shipment = {
      id: 'shipment-3-0',
      product: PRODUCT,
      qty: 5,
      fromStashId: home.id,
      toStashId: home.id,
      mode: TRANSPORTS[0]!.id,
      courierIds: [],
      departedAtHours: 3,
      arrivesAtHours: 9,
      interdictionChance: 0.22,
      skimUnits: 0,
    };
    const prev: GameState = { ...base, shipments: [shipment] };
    const next = withChoice(
      { ...prev, shipments: [] },
      {
        id: `shipment-seized-${shipment.id}`,
        kind: 'shipment-seized',
        summary: 'boarded',
        createdAtHours: 9,
      },
    );
    const events = deriveTickEvents(prev, next);
    expect(named(events, 'shipment_resolved')[0]?.props).toMatchObject({
      seized: true,
      displayedOdds: 0.22,
    });
    expect(named(events, 'odds_audit')[0]?.props).toMatchObject({
      surface: 'shipment',
      displayed: 0.22,
      hit: true,
    });
  });

  it('a survived-but-waiting load records its roll once — and not again on delivery', () => {
    const base = createInitialState('derive-ship-cleared');
    const home = base.stashes[0]!;
    const shipment: Shipment = {
      id: 'shipment-7-0',
      product: PRODUCT,
      qty: 5,
      fromStashId: home.id,
      toStashId: home.id,
      mode: TRANSPORTS[0]!.id,
      courierIds: [],
      departedAtHours: 7,
      arrivesAtHours: 13,
      interdictionChance: 0.4,
      skimUnits: 0,
    };
    const prev: GameState = { ...base, shipments: [shipment] };
    // Tick 1: destination full — the roll was survived, the load waits `cleared`.
    const waiting: GameState = { ...prev, shipments: [{ ...shipment, cleared: true }] };
    const first = deriveTickEvents(prev, waiting);
    expect(named(first, 'shipment_resolved')[0]?.props).toMatchObject({ seized: false });
    expect(named(first, 'odds_audit')).toHaveLength(1);

    // Tick 2: the cleared load finally delivers — NOT a second fairness row.
    const delivered = withChoice(
      { ...waiting, shipments: [] },
      {
        id: `shipment-arrived-${shipment.id}`,
        kind: 'shipment-arrived',
        summary: 'made it',
        createdAtHours: 20,
      },
    );
    const second = deriveTickEvents(waiting, delivered);
    expect(named(second, 'shipment_resolved')).toHaveLength(0);
    expect(named(second, 'odds_audit')).toHaveLength(0);
  });

  it('new beats + queued story cards derive beat_fired / story_flag / session_end_reached', () => {
    const base = createInitialState('derive-story');
    const prev: GameState = { ...base, flags: { [FIRST_SALE_FLAG]: true } };
    const next = withChoice(
      { ...prev, beatsFired: ['beat.first-sale'] },
      {
        id: 'pc-onb-end',
        kind: 'story',
        summary: 'night on the water',
        createdAtHours: 5,
        cardId: 'ONB-END',
      },
    );
    const events = deriveTickEvents(prev, next);
    expect(named(events, 'beat_fired')[0]?.props).toMatchObject({ beatId: 'beat.first-sale' });
    expect(named(events, 'story_flag')[0]?.props).toMatchObject({
      flag: 'session_end_hook_shown',
      cardId: 'ONB-END',
    });
    expect(named(events, 'session_end_reached')[0]?.props).toMatchObject({ cardId: 'ONB-END' });
  });

  it('weekly payroll settle + a flipped official derive their rows', () => {
    const base = createInitialState('derive-corr');
    const tie: OfficialTie = {
      id: 'tie-1',
      officialId: 'customs-chief',
      name: 'The Chief',
      retainerPerWeek: 700,
      loyalty: 20,
      greed: 1,
      comfortHeat: 50,
      hiredAtHours: 0,
      lastPaidWeek: 1,
      memoryLog: [],
    };
    const prev: GameState = {
      ...base,
      corruption: { officials: [tie], payrollPerWeek: 700, paidPorts: [], lastPayrollWeek: 1 },
    };
    const next: GameState = {
      ...prev,
      corruption: {
        ...prev.corruption,
        officials: [{ ...tie, isWire: true }],
        lastPayrollWeek: 2,
      },
    };
    const events = deriveTickEvents(prev, next);
    expect(named(events, 'payroll_charged')[0]?.props).toMatchObject({ payrollPerWeek: 700 });
    expect(named(events, 'official_flipped')[0]?.props).toMatchObject({ officialId: 'tie-1' });
  });

  it('a default-ladder advance and a spiral-stage crossing derive their rows', () => {
    const base = createInitialState('derive-debt');
    const prev: GameState = {
      ...base,
      cleanCash: 100_000,
      debt: {
        lenderId: LENDERS[0]!.id,
        principal: 10_000,
        rate: 0.1,
        accruedInterest: 0,
        dueDay: 1,
        ladderRung: 0,
        active: true,
      },
    };
    const next: GameState = {
      ...prev,
      // The wipe: all capital gone — the spiral's first rung (design/01 §4a).
      cleanCash: 0,
      stashes: prev.stashes.map((s) => ({ ...s, dirtyCash: 0 })),
      debt: { ...prev.debt, ladderRung: 1 },
    };
    const events = deriveTickEvents(prev, next);
    expect(named(events, 'debt_ladder_advanced')[0]?.props).toMatchObject({ rung: 1 });
    const [spiral] = named(events, 'spiral_stage');
    expect(spiral?.props).toMatchObject({ prevStage: 'stable' });
    expect(spiral?.props).not.toMatchObject({ stage: 'stable' });
  });
});

describe('fairnessReport — displayed ≈ realized, in aggregate (design/01 §0.3)', () => {
  function auditRow(displayed: number, hit: boolean): DerivedEvent {
    return { name: 'odds_audit', props: { surface: 'deal', displayed, hit } };
  }

  it('a matching book is fair', () => {
    const rows = Array.from({ length: 100 }, (_, i) => auditRow(0.3, i % 10 < 3));
    const report = fairnessReport(stamped(rows), 0.05);
    expect(report.all.samples).toBe(100);
    expect(report.all.expected).toBeCloseTo(0.3);
    expect(report.all.observed).toBeCloseTo(0.3);
    expect(report.fair).toBe(true);
  });

  it('a rigged book is flagged', () => {
    // Shown 10%, hit 50% — the hidden-modifier smell the law forbids.
    const rows = Array.from({ length: 100 }, (_, i) => auditRow(0.1, i % 2 === 0));
    const report = fairnessReport(stamped(rows), 0.05);
    expect(report.all.gap).toBeCloseTo(0.4);
    expect(report.fair).toBe(false);
  });

  it('too few samples are reported but never judged unfair', () => {
    const rows = Array.from({ length: FAIRNESS_MIN_SAMPLES - 1 }, () => auditRow(0.1, true));
    const report = fairnessReport(stamped(rows), 0.05);
    expect(report.all.withinTolerance).toBe(true);
  });
});

describe('auditOfflineFreeze — absence never punishes (design/10 §6; GDD §6)', () => {
  it('a real settleOffline passes the audit, debt and all', () => {
    const base = createInitialState('freeze-audit');
    // Within the day-1 cold-start cap (Prompt 40) so the loan actually opens.
    const withLoan = borrow(base, LENDERS[0]!.id, 150).state;
    const { state: settled } = settleOffline(withLoan, 30);
    const audit = auditOfflineFreeze(withLoan, settled);
    expect(audit.violation).toBe(false);
    expect(audit.owedDelta).toBe(0);
    expect(audit.heatDelta).toBeLessThanOrEqual(0);
    expect(audit.cleanCashDelta).toBeGreaterThanOrEqual(0);
  });

  it('flags any movement against the player', () => {
    const base = createInitialState('freeze-violation');
    const punished: GameState = { ...base, heat: base.heat + 10 };
    expect(auditOfflineFreeze(base, punished).violation).toBe(true);

    const robbed: GameState = {
      ...base,
      stashes: base.stashes.map((s) => ({ ...s, dirtyCash: s.dirtyCash - 1 })),
    };
    expect(auditOfflineFreeze(base, robbed).violation).toBe(true);
  });
});
