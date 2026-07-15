import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createInitialState,
  tick,
  settleOffline,
  hire,
  buyFront,
  // endgame — config
  PRESTIGE_UNLOCKS,
  // endgame — engine
  empireComposite,
  bankPeaks,
  operatingCapital,
  evaluateSpiral,
  runStats,
  evaluatePrestige,
  endRun,
  retire,
  LEGACY_MODE_ENABLED,
  type GameState,
  type RunEndResult,
} from '@/engine';
import {
  emptyMeta,
  bankScore,
  LocalMetaProgressStore,
  type MetaProgress,
} from '@/store';

const WIPE_THRESHOLD = 100;

/** A wiped run: no operating capital (all clean + dirty cash gone). */
function wiped(seed: string, over: Partial<GameState> = {}): GameState {
  const base = createInitialState(seed);
  return { ...base, cleanCash: 0, stashes: [], heat: 0, ...over };
}

/** A flipped official acting as a wire — collapses protection in the spiral. */
function flippedOfficial() {
  return {
    id: 'official-detective',
    officialId: 'detective',
    name: 'DEA Insider',
    retainerPerWeek: 8_000,
    loyalty: 0,
    greed: 1.1,
    comfortHeat: 62,
    hiredAtHours: 0,
    lastPaidWeek: 1,
    memoryLog: [],
    isWire: true,
  };
}

/** An active loan on the books — an obligation that can't be covered when wiped. */
function withDebt(state: GameState): GameState {
  return {
    ...state,
    debt: {
      lenderId: 'papa-cass',
      principal: 2_000,
      rate: 0.2,
      accruedInterest: 0,
      dueDay: state.clock.day + 14,
      ladderRung: 0,
      active: true,
    },
  };
}

// --- Peak trackers bank from PEAK values (design/01 §7) ----------------------

describe('score banks from PEAK values — a late wipe still records the height', () => {
  it('bankPeaks is monotonic: peaks climb and never fall back', () => {
    let s = createInitialState('peak');
    s = { ...s, cleanCash: 500_000 };
    s = bankPeaks(s);
    expect(s.highScore.peakCleanCash).toBe(500_000);

    // Now lose everything — the peak must NOT drop.
    s = { ...s, cleanCash: 0, stashes: [] };
    s = bankPeaks(s);
    expect(s.highScore.peakCleanCash).toBe(500_000);
    expect(s.highScore.peakNetWorth).toBeGreaterThanOrEqual(500_000);
  });

  it('the peak-tracking tick step banks net worth as it grows', () => {
    let s = createInitialState('tickpeak');
    s = { ...s, cleanCash: 250_000 };
    const before = s.highScore.peakNetWorth;
    s = tick(s, 1);
    expect(s.highScore.peakNetWorth).toBeGreaterThan(before);
    expect(s.highScore.peakNetWorth).toBeGreaterThanOrEqual(250_000);
  });

  it('the empire composite weights districts/routes over raw counts', () => {
    let s = createInitialState('empire');
    s = { ...s, cleanCash: 500_000 };
    const before = empireComposite(s);
    s = buyFront(s, 'cash-front').state; // one more front
    expect(empireComposite(s)).toBeGreaterThan(before);
  });
});

// --- The death-spiral chain is readable & sequential (design/01 §4a) ---------

describe('evaluateSpiral exposes each rung; terminal only with no exit', () => {
  it('a healthy run is stable, with no rungs active', () => {
    const status = evaluateSpiral(createInitialState('stable'));
    expect(status.stage).toBe('stable');
    expect(status.terminal).toBe(false);
    expect(status.steps.every((step) => !step.active)).toBe(true);
  });

  it('wiped with unpayable obligations reaches cant-pay, but not yet collapsed/hunted', () => {
    const s = withDebt(wiped('cantpay'));
    expect(operatingCapital(s)).toBeLessThanOrEqual(WIPE_THRESHOLD);
    const status = evaluateSpiral(s);
    expect(status.stage).toBe('cant-pay');
    expect(status.steps.find((x) => x.stage === 'wiped')!.active).toBe(true);
    expect(status.steps.find((x) => x.stage === 'cant-pay')!.active).toBe(true);
    expect(status.steps.find((x) => x.stage === 'protection-collapsed')!.active).toBe(false);
    expect(status.terminal).toBe(false); // never terminal before hunted
  });

  it('a flipped official + a marked player reaches hunted; terminal iff no exit exists', () => {
    // Marked by a stiffed shark, protection flipped to a wire — but a front to liquidate.
    let s = withDebt(
      wiped('hunted', {
        flags: { 'debt-marked': true },
        corruption: {
          officials: [flippedOfficial()],
          payrollPerWeek: 8_000,
          paidPorts: [],
          lastPayrollWeek: 1,
        },
      }),
    );
    s = buyFront({ ...s, cleanCash: 5_000 }, 'cash-front').state; // an exit: liquidate
    s = { ...s, cleanCash: 0 }; // spend back down to wiped, keep the front

    const withExit = evaluateSpiral(s);
    expect(withExit.stage).toBe('hunted');
    expect(withExit.steps.find((x) => x.stage === 'hunted')!.active).toBe(true);
    expect(withExit.exits.find((e) => e.kind === 'liquidate')!.available).toBe(true);
    expect(withExit.terminal).toBe(false); // an exit remains → not terminal

    // Strip every exit → NOW it is terminal (hunted with no way out).
    const noExit = evaluateSpiral({ ...s, fronts: [], crew: [], heat: 0, stashes: [] });
    expect(noExit.exits.every((e) => !e.available)).toBe(true);
    expect(noExit.terminal).toBe(true);
    expect(noExit.stage).toBe('terminal');
  });
});

// --- The spiral NEVER advances offline (guardrail; GDD §6) -------------------

describe('the spiral never advances offline (design/01 §4a; GDD §6)', () => {
  it('settleOffline never ends the run, even from a terminal-shaped state', () => {
    const terminalish = withDebt(
      wiped('offline', {
        flags: { 'debt-marked': true },
        heat: 0,
        corruption: {
          officials: [flippedOfficial()],
          payrollPerWeek: 0,
          paidPorts: [],
          lastPayrollWeek: 1,
        },
      }),
    );
    // Confirm it reads terminal while online (wiped → can't pay → collapsed → hunted, no exit).
    expect(evaluateSpiral(terminalish).terminal).toBe(true);

    for (const hours of [1, 24, 1_000, 100_000]) {
      const { state: after } = settleOffline(terminalish, hours);
      expect(after.runStatus).toBe('active'); // absence never kills
      expect(after.clock.hours).toBe(terminalish.clock.hours); // world frozen
    }
  });
});

// --- Ending a run banks the score (design/01 §7; design/07 §6) ---------------

describe('endRun banks the peak score and sets the run status', () => {
  function bigRun(seed: string): GameState {
    const base = createInitialState(seed);
    return {
      ...base,
      clock: { ...base.clock, week: 9 },
      highScore: { peakNetWorth: 1_500_000, peakCleanCash: 900_000, peakEmpireSize: 40 },
      rivals: base.rivals.map((r, i) => (i === 0 ? { ...r, toppled: true } : r)),
    };
  }

  it('killed → dead, banks peak net worth, emits a run-end scene', () => {
    const r = endRun(bigRun('killed'), 'killed');
    expect(r.state.runStatus).toBe('dead');
    expect(r.score).toBe(1_500_000); // banks from PEAK, not current
    expect(r.recap.peakNetWorth).toBe(1_500_000);
    expect(r.sceneKey).toBe('runend.killed');
    expect(r.comeback).toBe(false);
  });

  it('unlocks the prestige a run earned (non-power), across net-worth/rivals/weeks', () => {
    const r = endRun(bigRun('prestige'), 'killed');
    expect(r.unlockedPrestige).toContain('title-hustler'); // ≥$100k peak
    expect(r.unlockedPrestige).toContain('title-kingpin'); // ≥$1M peak
    expect(r.unlockedPrestige).toContain('roster-old-friend'); // ≥1 rival toppled
    expect(r.unlockedPrestige).toContain('scenario-cartel-ties'); // ≥8 weeks
  });

  it('retire banks with NO penalty and resets the run status', () => {
    const s = bigRun('retire');
    const r = retire(s);
    expect(r.cause).toBe('retired');
    expect(r.state.runStatus).toBe('retired');
    expect(r.score).toBe(s.highScore.peakNetWorth); // full banked score, nothing docked
  });
});

// --- A judge converts prison into a comeback (design/09 B.2 hook) ------------

describe('a payrolled judge converts a prison end into a survivable comeback', () => {
  it('prison + loyal judge → run stays active, nothing banked', () => {
    const funded = { ...createInitialState('judge'), cleanCash: 1_000_000 };
    const withJudge = hire(funded, 'judge').state;

    const r = endRun(withJudge, 'prison');
    expect(r.comeback).toBe(true);
    expect(r.state.runStatus).toBe('active'); // the run continues
    expect(r.score).toBe(0);
    expect(r.sceneKey).toBe('runend.comeback');
  });

  it('prison with NO judge ends the run', () => {
    const r = endRun(createInitialState('nojudge'), 'prison');
    expect(r.comeback).toBe(false);
    expect(r.state.runStatus).toBe('prison');
  });
});

// --- Prestige is non-power & persists across runs (design/01 §7; GDD §7) ------

describe('prestige is non-power and the meta persists past permadeath', () => {
  it('every prestige unlock is roster/scenario/cosmetic — never a power multiplier', () => {
    for (const p of PRESTIGE_UNLOCKS) {
      expect(['roster', 'scenario', 'cosmetic']).toContain(p.category);
    }
  });

  it('evaluatePrestige is a pure threshold check against a run’s stats', () => {
    const stats = runStats({
      ...createInitialState('stats'),
      clock: { hours: 0, day: 1, week: 5 },
      highScore: { peakNetWorth: 100_000, peakCleanCash: 0, peakEmpireSize: 10 },
    } as GameState);
    const ids = evaluatePrestige(stats);
    expect(ids).toContain('title-hustler'); // exactly $100k
    expect(ids).toContain('scenario-clean-slate'); // ≥4 weeks
    expect(ids).not.toContain('title-kingpin'); // < $1M
  });

  it('bankScore climbs personal best, accumulates unlocks, and counts finished runs', () => {
    let meta = emptyMeta();
    const runA = endRun(
      {
        ...createInitialState('a'),
        highScore: { peakNetWorth: 120_000, peakCleanCash: 0, peakEmpireSize: 12 },
        rivals: createInitialState('a').rivals.map((r, i) => (i === 0 ? { ...r, toppled: true } : r)),
      },
      'killed',
    );
    meta = bankScore(meta, runA);
    expect(meta.personalBest).toBe(120_000);
    expect(meta.runsPlayed).toBe(1);
    expect(meta.unlockedPrestige).toContain('title-hustler');
    expect(meta.unlockedPrestige).toContain('roster-old-friend');

    // A smaller second run: personal best holds, unlocks accumulate, tally rises.
    const runB = endRun(
      { ...createInitialState('b'), highScore: { peakNetWorth: 50_000, peakCleanCash: 0, peakEmpireSize: 3 } },
      'retired',
    );
    meta = bankScore(meta, runB);
    expect(meta.personalBest).toBe(120_000); // never regresses
    expect(meta.runsPlayed).toBe(2);
  });

  it('a comeback banks nothing (the run has not ended)', () => {
    const meta = emptyMeta();
    const comeback: RunEndResult = {
      state: createInitialState('c'),
      cause: 'prison',
      score: 999_999,
      recap: {
        cause: 'prison',
        seed: 'c',
        day: 1,
        week: 1,
        peakNetWorth: 999_999,
        peakCleanCash: 0,
        peakEmpireSize: 0,
        rivalsToppled: 0,
      },
      sceneKey: 'runend.comeback',
      unlockedPrestige: [],
      comeback: true,
    };
    expect(bankScore(meta, comeback)).toEqual(meta); // untouched
  });

  it('LocalMetaProgressStore round-trips meta and survives across store instances', async () => {
    const factory = new IDBFactory(); // one shared in-memory DB
    const store = new LocalMetaProgressStore({ factory });
    expect(await store.loadMeta()).toEqual(emptyMeta()); // clean profile by default

    const banked: MetaProgress = { ...emptyMeta(), personalBest: 777_000, runsPlayed: 3 };
    await store.saveMeta(banked);

    // A brand-new store over the same DB (a "next launch") still sees the meta.
    const reopened = new LocalMetaProgressStore({ factory });
    expect(await reopened.loadMeta()).toEqual(banked);
  });
});

// --- Legacy/heir is PARKED (design/01 §7) ------------------------------------

describe('Legacy/heir inheritance is parked, not built', () => {
  it('the legacy seam is a permanently-off flag', () => {
    expect(LEGACY_MODE_ENABLED).toBe(false);
    expect(emptyMeta().legacyModeUnlocked).toBe(false);
  });
});
