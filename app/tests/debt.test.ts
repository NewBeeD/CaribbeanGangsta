import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  tick,
  settleOffline,
  addStash,
  restoreRng,
  debtOwed,
  netWorth,
  bankPeaks,
  endRun,
  // debt — config
  getLender,
  INTEREST_DAYS_PER_WEEK,
  LADDER_VIG_RATE_INCREASE,
  FIRST_LOAN_VIG_DAYS,
  LIFELINE_MIN_REPUTATION,
  // debt — engine
  borrowCap,
  quoteLoan,
  borrow,
  accrueInterest,
  repay,
  defaultLadder,
  debtStep,
  lifelineOffer,
  isDebtMarked,
  DEBT_DEFAULT_CHOICE,
  DEBT_MARKED_FLAG,
  type GameState,
} from '@/engine';
import { migrateEnvelope } from '@/store';

/** A run on ~day 2 with the street rep to draw a full line. */
function borrower(seed: string, streetRep = 100): GameState {
  const base = createInitialState(seed);
  return {
    ...base,
    clock: { ...base.clock, hours: 24, day: 2 },
    heat: 0,
    reputation: { ...base.reputation, street: streetRep },
  };
}

/** Move a run to an explicit in-game day (hours kept consistent). */
function setDay(state: GameState, day: number): GameState {
  return { ...state, clock: { ...state.clock, day, hours: (day - 1) * 24 } };
}

// --- Opt-in / consent (guarantee #1, design/10 §4) ---------------------------

describe('debt is opt-in — nothing auto-enrolls the player (guarantee #1)', () => {
  it('a fresh run carries no active loan', () => {
    const s = createInitialState('fresh');
    expect(s.debt.active).toBe(false);
    expect(s.debt.lenderId).toBeNull();
    expect(debtOwed(s.debt)).toBe(0);
  });

  it('every lender is open from day one — the borrow cap is the limiter (Ideas.md)', () => {
    const day1 = createInitialState('gate');
    // No flag or day gate: a fresh player can knock on any door… (amounts within
    // each cold-start cap — the street shark's is deliberately small now, Prompt 40).
    expect(borrow(day1, 'papa-cass', 150).ok).toBe(true);
    expect(borrow(day1, 'money-man', 500).ok).toBe(true);
    // …but the reputation-scaled cap keeps the big lines out of reach.
    expect(borrowCap(day1, 'financier')).toBeLessThan(getLender('financier').maxPrincipal);
  });
});

// --- Terms shown up front, in full (guarantee #4, design/10 §3) --------------

describe('terms are computed and exposed before the player confirms (guarantee #4)', () => {
  it('quoteLoan discloses the total-to-repay at the soft due date (no hidden balloon)', () => {
    const s = borrower('quote');
    const cfg = getLender('papa-cass');
    const q = quoteLoan(s, 'papa-cass', 800);

    expect(q.weeklyRate).toBe(cfg.weeklyRate);
    expect(q.dueDay).toBe(s.clock.day + cfg.softDueDays);
    const expected = Math.round(
      800 * Math.pow(1 + cfg.weeklyRate / INTEREST_DAYS_PER_WEEK, cfg.softDueDays),
    );
    expect(q.totalToRepayAtDue).toBe(expected);
  });

  it('borrow commits EXACTLY the quoted terms and adds principal to CLEAN cash', () => {
    const s = borrower('borrow');
    const q = quoteLoan(s, 'papa-cass', 800);
    const r = borrow(s, 'papa-cass', 800);

    expect(r.ok).toBe(true);
    expect(r.state.cleanCash).toBe(s.cleanCash + 800); // capital SOURCE
    expect(r.state.debt.lenderId).toBe('papa-cass');
    expect(r.state.debt.principal).toBe(800);
    expect(r.state.debt.rate).toBe(q.weeklyRate);
    expect(r.state.debt.dueDay).toBe(q.dueDay);
    expect(r.state.debt.active).toBe(true);
  });

  it('a borrowed loan is a WASH on net worth — the debt cancels the principal', () => {
    const s = borrower('leverage');
    const before = netWorth(s);
    const r = borrow(s, 'papa-cass', 800);

    // The principal lands in clean cash but the loan owed offsets it exactly, so
    // net worth doesn't budge on the borrow itself — a loan is not free score.
    expect(netWorth(r.state)).toBe(before);
    // Interest accruing over time only makes the position WORSE, never better.
    expect(netWorth(accrueInterest(r.state, 7))).toBeLessThan(before);
  });

  it('borrowing then ending the run does NOT inflate the banked high score', () => {
    const s = borrower('score');
    const withLoan = borrow(s, 'papa-cass', 800).state;

    // Peak-track after taking the loan, then end the run: the banked score is
    // still the pre-loan peak, not the loan-swollen cash pile.
    const peaked = bankPeaks(withLoan);
    const ended = endRun(peaked, 'retired');
    expect(ended.score).toBe(s.highScore.peakNetWorth);
  });

  it('rejects a bad amount, an over-cap ask, and a second loan', () => {
    const s = borrower('rej2');
    expect(borrow(s, 'papa-cass', 0).rejected).toBe('invalid-amount');
    expect(borrow(s, 'papa-cass', borrowCap(s, 'papa-cass') + 1).rejected).toBe('exceeds-cap');

    const withLoan = borrow(s, 'papa-cass', 800).state;
    expect(borrow(withLoan, 'papa-cass', 500).rejected).toBe('loan-active');
  });

  it('borrow cap rises with street reputation and with pledged collateral', () => {
    const poor = borrower('cap-poor', 0);
    const rich = borrower('cap-rich', 100);
    expect(borrowCap(rich, 'papa-cass')).toBeGreaterThan(borrowCap(poor, 'papa-cass'));

    const homeId = rich.stashes[0]!.id; // starting stash holds dirty cash → real value
    expect(borrowCap(rich, 'papa-cass', homeId)).toBeGreaterThan(borrowCap(rich, 'papa-cass'));
  });
});

// --- Interest curve: per active in-game day at rate/7 (design/10 §3) ---------

describe('interest compounds per ACTIVE in-game day at rate/7 (design/10 §3)', () => {
  it('follows the compound curve: $800 @20%/wk → ~$974 after a week, ~$1,445 after three', () => {
    const loan = borrow(borrower('curve'), 'papa-cass', 800).state;

    const afterOneWeek = accrueInterest(loan, 7);
    expect(debtOwed(afterOneWeek.debt)).toBeGreaterThan(965);
    expect(debtOwed(afterOneWeek.debt)).toBeLessThan(985); // ~$974

    const afterThreeWeeks = accrueInterest(loan, 21);
    expect(debtOwed(afterThreeWeeks.debt)).toBeGreaterThan(1_435);
    expect(debtOwed(afterThreeWeeks.debt)).toBeLessThan(1_460); // ~$1,445

    // Principal stays a clean floor; growth lands in accruedInterest.
    expect(afterOneWeek.debt.principal).toBe(800);
    expect(afterOneWeek.debt.accruedInterest).toBeGreaterThan(0);
  });

  it('active play accrues interest via the tick pipeline', () => {
    const loan = borrow(borrower('active'), 'papa-cass', 800).state;
    const owedBefore = debtOwed(loan.debt);
    const afterPlay = tick(loan, 24 * 3); // three in-game days played
    expect(debtOwed(afterPlay.debt)).toBeGreaterThan(owedBefore);
  });
});

// --- Guarantee #2 (CRITICAL): debt is frozen offline (design/10 §4.2) --------

describe('Guarantee #2: absence never changes the owed balance or the ladder', () => {
  it('settleOffline leaves debt byte-identical for ANY hours away (property test)', () => {
    // A loan already past its soft due date and mid-accrual — everything at stake.
    let s = borrow(borrower('freeze'), 'papa-cass', 800).state;
    s = accrueInterest(s, 5); // some interest on the books
    s = { ...s, debt: { ...s.debt, dueDay: s.clock.day - 3, ladderRung: 2 } }; // overdue, mid-ladder
    const before = s;

    for (const hours of [1, 12, 24, 100, 1_000, 10_000, 100_000]) {
      const { state: after } = settleOffline(before, hours);
      expect(after.debt).toEqual(before.debt); // owed + ladder both frozen
      expect(debtOwed(after.debt)).toBe(debtOwed(before.debt));
      expect(after.runStatus).toBe('active'); // never marked/killed while away
    }
  });
});

// --- Repayment: free, partial-friendly, patience-resetting (guarantee #4) ----

describe('repayment is always free and resets the shark’s patience (guarantee #4)', () => {
  it('a partial payment reduces owed exactly and pushes the soft due date back out', () => {
    let s = borrow(borrower('partial'), 'papa-cass', 800).state;
    s = accrueInterest(s, 3);
    s = setDay(s, 10); // time has passed toward the due date
    const owedBefore = debtOwed(s.debt);
    const cleanBefore = s.cleanCash;

    const r = repay(s, 500);
    expect(r.ok).toBe(true);
    expect(r.paid).toBe(500);
    expect(r.clearedInFull).toBe(false);
    expect(debtOwed(r.state.debt)).toBeCloseTo(owedBefore - 500, 5); // no penalty
    expect(cleanBefore - r.state.cleanCash).toBe(500);
    // Patience reset: due date pushed back out to a fresh window.
    expect(r.state.debt.dueDay).toBe(s.clock.day + getLender('papa-cass').softDueDays);
  });

  it('early full repayment carries NO penalty (charges only what is owed) and clears the ledger', () => {
    let s = borrow(borrower('full'), 'papa-cass', 800).state;
    s = accrueInterest(s, 2);
    s = { ...s, cleanCash: s.cleanCash + 5_000 }; // margin sold into profit — funds the payoff
    const owed = debtOwed(s.debt);
    const streetBefore = s.reputation.street;

    // Overpay-proof: pass more than owed; only `owed` is charged.
    const r = repay(s, 999_999);
    expect(r.ok).toBe(true);
    expect(r.paid).toBeCloseTo(owed, 5);
    expect(r.clearedInFull).toBe(true);
    expect(r.state.debt.active).toBe(false);
    expect(r.state.debt.lenderId).toBeNull();
    expect(r.state.reputation.street).toBeGreaterThan(streetBefore); // a bigger line next time
  });

  it('paying the rounded balance clears the loan — no sub-dollar residue strands the card', () => {
    // Accrue fractional interest so the balance is not a whole dollar, then pay the
    // whole-dollar amount the UI offers (Math.round of what's owed). The engine must
    // clear the ledger rather than leave a sub-dollar remainder that keeps the loan
    // active while displaying as $0 (the "You owe…" card that won't go away).
    let s = borrow(borrower('residue'), 'papa-cass', 800).state;
    s = accrueInterest(s, 3);
    s = { ...s, cleanCash: s.cleanCash + 5_000 };
    const owed = debtOwed(s.debt);
    expect(Number.isInteger(owed)).toBe(false); // a genuinely fractional balance

    const r = repay(s, Math.round(owed)); // exactly what "Pay in full" charges
    expect(r.ok).toBe(true);
    expect(r.clearedInFull).toBe(true);
    expect(r.state.debt.active).toBe(false);
    expect(r.state.debt.lenderId).toBeNull();
    expect(debtOwed(r.state.debt)).toBe(0);
  });

  it('rejects repaying with no loan, a bad amount, or beyond clean cash', () => {
    const noLoan = borrower('noloan');
    expect(repay(noLoan, 100).rejected).toBe('no-loan');

    const broke = { ...borrow(borrower('broke'), 'papa-cass', 800).state, cleanCash: 0 };
    expect(repay(broke, 100).rejected).toBe('insufficient-funds');
    expect(repay(broke, 0).rejected).toBe('invalid-amount');
  });
});

// --- Default ladder: telegraphed, one rung at a time (guarantee #3) ----------

describe('default ladder advances one readable rung past due, each a beat (guarantee #3)', () => {
  it('walks vig → visit → stash seizure, one per step, capped at the street shark’s ceiling', () => {
    let s = borrow(borrower('ladder'), 'papa-cass', 800).state;
    // Add a second stash so a seizure has a clear "one asset" to take.
    s = { ...s, cleanCash: s.cleanCash + 100_000 };
    s = addStash(s, 'buried').state;
    s = { ...s, debt: { ...s.debt, dueDay: 2 } }; // due at day 2; we're at day 2

    const rungs: number[] = [];
    const stashCounts: number[] = [];
    let rate = s.debt.rate;
    let vigApplied = false;
    for (let day = 3; day <= 7; day++) {
      s = setDay(s, day);
      const rng = restoreRng(s.rngState);
      const heatBefore = s.heat;
      s = { ...defaultLadder(s, rng), rngState: rng.getState() };
      rungs.push(s.debt.ladderRung);
      stashCounts.push(s.stashes.length);
      if (s.debt.ladderRung === 1 && !vigApplied) {
        expect(s.debt.rate).toBeCloseTo(rate + LADDER_VIG_RATE_INCREASE, 5); // rung 1 = vig
        vigApplied = true;
      }
      if (s.debt.ladderRung === 2) expect(s.heat).toBe(heatBefore); // rung 2 visit is heat-free
      rate = s.debt.rate;
    }

    // One rung per step, in order, and Papa Cass stops at rung 3 (MVP §7 ceiling).
    expect(rungs).toEqual([1, 2, 3, 3, 3]);
    // The stash seizure took EXACTLY one location (2 → 1).
    expect(stashCounts[2]).toBe(stashCounts[1]! - 1);
    // Every advance queued a telegraphed intervention beat.
    expect(s.pendingChoices.filter((c) => c.kind === DEBT_DEFAULT_CHOICE).length).toBe(3);
    // Papa Cass never marks the player.
    expect(isDebtMarked(s)).toBe(false);
  });

  it('collateral seizure takes EXACTLY the pledged asset (anti-wipe)', () => {
    let s = borrower('collateral');
    const homeId = s.stashes[0]!.id; // has dirty cash → valid collateral
    s = { ...s, cleanCash: s.cleanCash + 100_000 };
    s = addStash(s, 'buried').state; // a second, un-pledged stash
    const otherId = s.stashes.find((st) => st.id !== homeId)!.id;

    s = borrow(s, 'papa-cass', 800, homeId).state;
    expect(s.debt.collateralRef).toBe(homeId);
    s = { ...s, debt: { ...s.debt, dueDay: 2 } };

    // Drive to rung 3.
    for (let day = 3; day <= 5; day++) {
      s = setDay(s, day);
      const rng = restoreRng(s.rngState);
      s = { ...defaultLadder(s, rng), rngState: rng.getState() };
    }
    expect(s.debt.ladderRung).toBe(3);
    // The pledged stash is gone; the other survives — exactly one asset taken.
    expect(s.stashes.some((st) => st.id === homeId)).toBe(false);
    expect(s.stashes.some((st) => st.id === otherId)).toBe(true);
  });

  it('a rung-3 seizure discloses WHAT was taken, with numbers (design/13 A6)', () => {
    let s = borrower('seizure-note');
    const home = s.stashes[0]!; // holds the starting dirty cash
    expect(home.dirtyCash).toBeGreaterThan(0);
    s = borrow(s, 'papa-cass', 800, home.id).state; // pledged → rung 3 takes it
    s = { ...s, debt: { ...s.debt, dueDay: 2 } };

    for (let day = 3; day <= 5; day++) {
      s = setDay(s, day);
      const rng = restoreRng(s.rngState);
      s = { ...defaultLadder(s, rng), rngState: rng.getState() };
    }
    expect(s.debt.ladderRung).toBe(3);

    const scene = s.pendingChoices.find((c) => c.id.startsWith('debt-default-3'))!;
    expect(scene).toBeTruthy();
    // The collector's take is never a silent drain — the scene names the stash
    // and the dirty dollars that went with it.
    expect(scene.summary).toContain(home.name);
    expect(scene.summary).toContain(`$${Math.round(home.dirtyCash).toLocaleString('en-US')}`);
  });

  it('a partial payment before the ladder starts halts escalation (patience)', () => {
    let s = borrow(borrower('halt'), 'papa-cass', 800).state;
    s = { ...s, debt: { ...s.debt, dueDay: 2 } };
    s = setDay(s, 5); // 3 days overdue

    // Pay a little — patience resets, due date jumps forward, target drops to 0.
    s = repay(s, 300).state;
    const rng = restoreRng(s.rngState);
    s = { ...defaultLadder(s, rng), rngState: rng.getState() };
    expect(s.debt.ladderRung).toBe(0); // no escalation after a good-faith payment
  });

  it('debtStep advances at most one rung per call (never a silent multi-rung jump)', () => {
    let s = borrow(borrower('one-per'), 'papa-cass', 800).state;
    s = { ...s, debt: { ...s.debt, dueDay: 2 } };
    s = setDay(s, 10); // 8 days overdue — would be rung 5 if it jumped
    s = debtStep(s, 24);
    expect(s.debt.ladderRung).toBe(1); // one rung only
  });
});

// --- Early-loan rebalance (Ideas2 item 4; Prompt 40) -------------------------

describe('early loans stay small-timer until reputation grows (Prompt 40)', () => {
  it('a day-1, rep-0, no-collateral player draws only a small-timer stake (~$150–250)', () => {
    const day1 = createInitialState('cold-start'); // street rep 0, no collateral
    const cap = borrowCap(day1, 'papa-cass');
    expect(cap).toBeGreaterThanOrEqual(150);
    expect(cap).toBeLessThanOrEqual(250);
    // NOT the old too-generous $1,500+ opening line.
    expect(cap).toBeLessThan(1_000);
  });

  it('the cap climbs the existing rep curve toward the shark’s max — no flag unlock', () => {
    const base = createInitialState('ramp');
    const capAt = (street: number) =>
      borrowCap({ ...base, reputation: { ...base.reputation, street } }, 'papa-cass');

    expect(capAt(50)).toBeGreaterThan(capAt(0)); // paying up grows the line…
    expect(capAt(100)).toBeGreaterThan(capAt(50));
    // …up to the shark's visible ceiling (his max), reached by rep, not a flag.
    expect(capAt(100)).toBe(getLender('papa-cass').maxPrincipal);
    // A little rep already reaches the mid-hundreds band the feedback wants.
    expect(capAt(50)).toBeGreaterThanOrEqual(500);
  });
});

describe('the run’s first loan bites sooner than a later one (Prompt 40)', () => {
  it('the opening loan’s vig warning fires before its soft due date; a later loan waits', () => {
    // FIRST loan: bumps the run counter to 1.
    let first = borrow(borrower('first-loan'), 'papa-cass', 500).state;
    expect(first.loansTaken).toBe(1);
    const dueDay = first.debt.dueDay; // borrowDay(2) + softDueDays(10) = 12
    // Advance ~a played week — still BEFORE the soft due date.
    first = setDay(first, first.clock.day + FIRST_LOAN_VIG_DAYS);
    expect(first.clock.day).toBeLessThan(dueDay); // not overdue yet
    const rateBefore = first.debt.rate;
    first = debtStep(first, 24);
    expect(first.debt.ladderRung).toBe(1); // early vig fired
    expect(first.debt.rate).toBeCloseTo(rateBefore + LADDER_VIG_RATE_INCREASE, 5);

    // A LATER loan (loansTaken ≥ 2) under identical timing does NOT warn early.
    let later = { ...borrower('later-loan'), loansTaken: 1 }; // one loan already behind them
    later = borrow(later, 'papa-cass', 500).state;
    expect(later.loansTaken).toBe(2);
    later = setDay(later, later.clock.day + FIRST_LOAN_VIG_DAYS);
    later = debtStep(later, 24);
    expect(later.debt.ladderRung).toBe(0); // silent until the soft due date
  });

  it('the accelerated vig is ACTIVE-only — offline never advances it (guarantee #2)', () => {
    let s = borrow(borrower('first-freeze'), 'papa-cass', 500).state;
    s = setDay(s, s.clock.day + FIRST_LOAN_VIG_DAYS + 3); // well past the early-vig point
    const before = s.debt;
    const { state: after } = settleOffline(s, 100_000);
    expect(after.debt).toEqual(before); // frozen — no rung, no rate bump while away
    expect(after.debt.ladderRung).toBe(0);
  });
});

// --- Lifeline out of the spiral (design/10 §1; Prompt 11 hook) ---------------

describe('lifelineOffer surfaces when wiped IF reputation warrants (design/10 §1)', () => {
  /** A wiped run: no capital, no active loan. */
  function wiped(seed: string, streetRep: number): GameState {
    const s = borrower(seed, streetRep);
    const stashes = s.stashes.map((st) => ({ ...st, dirtyCash: 0 }));
    return { ...s, cleanCash: 0, stashes };
  }

  it('offers credit to a wiped player whose history keeps the door open', () => {
    const offer = lifelineOffer(wiped('life-yes', LIFELINE_MIN_REPUTATION + 20));
    expect(offer).not.toBeNull();
    expect(offer!.amount).toBeGreaterThan(0);
  });

  it('returns null when rep is too low (the spiral may be terminal — Prompt 11)', () => {
    expect(lifelineOffer(wiped('life-no', 0))).toBeNull();
  });

  it('returns null when the player is not actually wiped, or already has a loan', () => {
    const solvent = borrower('solvent', 50); // holds starting dirty cash
    expect(lifelineOffer(solvent)).toBeNull();

    const withLoan = borrow(borrower('life-loan', 50), 'papa-cass', 400).state;
    expect(lifelineOffer({ ...withLoan, cleanCash: 0 })).toBeNull();
  });
});

// --- Rung 5 marking (design/10 §5; Prompt 11 hook) ---------------------------

describe('the final rung marks the player as a telegraphed run-ending hook', () => {
  it('a lethal-ceiling lender reaches rung 5 and sets the marked flag', () => {
    let s = borrower('marked');
    // Take the cartel financier's line (open roster; rep covers the ask).
    s = { ...s, reputation: { ...s.reputation, street: 100 } };
    s = borrow(s, 'financier', 10_000).state;
    s = { ...s, debt: { ...s.debt, dueDay: 2 } };

    for (let day = 3; day <= 9; day++) {
      s = setDay(s, day);
      const rng = restoreRng(s.rngState);
      s = { ...defaultLadder(s, rng), rngState: rng.getState() };
    }
    expect(s.debt.ladderRung).toBe(5);
    expect(isDebtMarked(s)).toBe(true);
    expect(s.flags[DEBT_MARKED_FLAG]).toBe(true);
    // The engine only MARKS — it never ends the run itself (Prompt 11 owns that).
    expect(s.runStatus).toBe('active');
  });
});

// --- Migration (schema v6 → v7) ----------------------------------------------

describe('migration 6 → 7 — expand the debt ledger (Prompt 10)', () => {
  it('replaces the interestRatePerHour stub with a clean no-loan ledger', () => {
    const state = createInitialState('mig7');
    const legacy = {
      ...state,
      debt: { principal: 0, interestRatePerHour: 0.05, active: false },
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      slot: 's',
      schemaVersion: 6,
      savedAt: 0,
      seed: state.seed,
      runStatus: state.runStatus,
      day: state.clock.day,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    expect(migrated!.debt.lenderId).toBeNull();
    expect(migrated!.debt.active).toBe(false);
    expect(migrated!.debt.accruedInterest).toBe(0);
    expect(migrated!.debt.dueDay).toBe(state.clock.day);
    expect('interestRatePerHour' in migrated!.debt).toBe(false);
  });
});
