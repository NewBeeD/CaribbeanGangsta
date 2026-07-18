/**
 * Drug fronts / consignment (v23) — product on loan from your plug: shorter due
 * date, quicker death (user request). The design/10 §4 guarantees are the test
 * spine, verbatim from the debt suite: opt-in, offline-frozen, telegraphed one
 * move at a time, terms shown in full and committed exactly.
 */

import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  tick,
  settleOffline,
  netWorth,
  tunedConfig,
  borrow,
  getMarketPrice,
  // consignment — config
  CONSIGNMENT_DUE_DAYS,
  CONSIGNMENT_MARKUP,
  CONSIGNMENT_LETHAL_AFTER_HITS,
  INTEREST_DAYS_PER_WEEK,
  // consignment — engine
  consignmentOwed,
  consignmentCap,
  quoteConsignment,
  takeConsignment,
  repayConsignment,
  consignmentStep,
  consignmentClosedAccount,
  isConsignmentMarked,
  CONSIGNMENT_DEFAULT_CHOICE,
  CONSIGNMENT_COLLECTOR_CHOICE,
  type GameConfig,
  type GameState,
} from '@/engine';
import { migrateEnvelope } from '@/store';

/**
 * A run standing in Jamaica (the weed/exotic source) with the plug bought and
 * the street rep to draw a full fronted line. The home stash is MOVED to the
 * source country — a front lands where the plug is (`wrong-country` otherwise).
 */
function frontRunner(seed: string, streetRep = 100, config?: GameConfig): GameState {
  const base = config ? createInitialState(seed, config) : createInitialState(seed);
  const home = base.stashes[0]!;
  return {
    ...base,
    clock: { ...base.clock, hours: 24, day: 2 },
    heat: 0,
    reputation: { ...base.reputation, street: streetRep },
    stashes: [{ ...home, countryId: 'jamaica' }],
    plugs: ['jamaica'],
  };
}

/** Move a run to an explicit in-game day (hours kept consistent). */
function setDay(state: GameState, day: number): GameState {
  return { ...state, clock: { ...state.clock, day, hours: (day - 1) * 24 } };
}

/** Replace one market's stock pool (test rig for supply-bound cases). */
function withStock(
  state: GameState,
  countryId: string,
  product: 'weed',
  stock: number,
): GameState {
  const atCountry = state.markets[countryId]!;
  return {
    ...state,
    markets: {
      ...state.markets,
      [countryId]: { ...atCountry, [product]: { ...atCountry[product]!, stock } },
    },
  };
}

/** Take a small front the default caps always allow (5 weed at the source). */
function taken(seed: string): GameState {
  const s = frontRunner(seed);
  const r = takeConsignment(s, 'jamaica', 'weed', 5, s.stashes[0]!.id);
  expect(r.ok).toBe(true);
  return r.state;
}

// --- Opt-in (guarantee #1) ----------------------------------------------------

describe('a front is opt-in — nothing auto-enrolls the player (guarantee #1)', () => {
  it('a fresh run owes no plug anything', () => {
    const s = createInitialState('fresh-front');
    expect(s.consignment.active).toBe(false);
    expect(s.consignment.countryId).toBeNull();
    expect(consignmentOwed(s.consignment)).toBe(0);
  });
});

// --- Terms shown in full, committed exactly (guarantee #4) ---------------------

describe('terms are disclosed before confirm and committed verbatim (guarantee #4)', () => {
  it('quoteConsignment discloses principal at markup, the short due date, and the total at due', () => {
    const s = frontRunner('quote');
    const unit = getMarketPrice(s, 'weed', 'jamaica').price;
    const q = quoteConsignment(s, 'jamaica', 'weed', 5);

    expect(q.unitPrice).toBe(unit);
    expect(q.principal).toBe(Math.round(5 * unit * CONSIGNMENT_MARKUP));
    expect(q.dueDay).toBe(s.clock.day + CONSIGNMENT_DUE_DAYS);
    expect(q.dueDays).toBe(CONSIGNMENT_DUE_DAYS);
    const expected = Math.round(
      q.principal * Math.pow(1 + q.weeklyRate / INTEREST_DAYS_PER_WEEK, CONSIGNMENT_DUE_DAYS),
    );
    expect(q.totalToRepayAtDue).toBe(expected);
  });

  it('takeConsignment lands the product, opens EXACTLY the quoted ledger, and moves no cash', () => {
    const s = frontRunner('take');
    const home = s.stashes[0]!;
    const q = quoteConsignment(s, 'jamaica', 'weed', 5);
    const stockBefore = getMarketPrice(s, 'weed', 'jamaica').stock;

    const r = takeConsignment(s, 'jamaica', 'weed', 5, home.id);
    expect(r.ok).toBe(true);
    const next = r.state;

    // The package is in the stash; the street pool is drawn down (one supply).
    expect(next.stashes[0]!.inventory.weed).toBe((home.inventory.weed ?? 0) + 5);
    expect(getMarketPrice(next, 'weed', 'jamaica').stock).toBe(stockBefore - 5);
    // The ledger is the quote, verbatim.
    expect(next.consignment.active).toBe(true);
    expect(next.consignment.countryId).toBe('jamaica');
    expect(next.consignment.product).toBe('weed');
    expect(next.consignment.qty).toBe(5);
    expect(next.consignment.principal).toBe(q.principal);
    expect(next.consignment.dueDay).toBe(q.dueDay);
    // No cash moves, and a clean handover adds ZERO heat (design/13 B1).
    expect(next.cleanCash).toBe(s.cleanCash);
    expect(next.stashes[0]!.dirtyCash).toBe(home.dirtyCash);
    expect(next.heat).toBe(s.heat);
  });

  it('a taken front can never INFLATE net worth — the owed balance is a real liability', () => {
    const s = frontRunner('wash');
    const before = netWorth(s);
    const r = takeConsignment(s, 'jamaica', 'weed', 5, s.stashes[0]!.id);
    // Inventory carries no cash value in netWorth, so the fronted package books
    // as its liability until the flip realizes the margin: the score can only
    // recover by actually selling — fronted product is never free score.
    expect(netWorth(r.state)).toBe(before - r.quote.principal);
  });

  it('a front can run ALONGSIDE a cash loan — separate ledgers', () => {
    const s = frontRunner('both');
    const withLoan = borrow(s, 'papa-cass', 150).state;
    expect(withLoan.debt.active).toBe(true);

    const r = takeConsignment(withLoan, 'jamaica', 'weed', 5, withLoan.stashes[0]!.id);
    expect(r.ok).toBe(true);
    expect(r.state.debt.active).toBe(true);
    expect(r.state.consignment.active).toBe(true);
  });

  it('rejects: one at a time, no plug, wrong country, not a plug product, bad qty', () => {
    const s = frontRunner('rej');
    const home = s.stashes[0]!;

    const withFront = takeConsignment(s, 'jamaica', 'weed', 5, home.id).state;
    expect(takeConsignment(withFront, 'jamaica', 'weed', 2, home.id).rejected).toBe(
      'consignment-active',
    );

    const noPlug = { ...s, plugs: [] as readonly string[] } as GameState;
    expect(takeConsignment(noPlug, 'jamaica', 'weed', 5, home.id).rejected).toBe('no-plug');

    expect(takeConsignment(s, 'colombia', 'cocaine', 1, home.id).rejected).toBe('wrong-country');
    expect(takeConsignment(s, 'jamaica', 'cocaine', 1, home.id).rejected).toBe('not-fronted');
    expect(takeConsignment(s, 'jamaica', 'weed', 0, home.id).rejected).toBe('invalid-qty');
    expect(takeConsignment(s, 'jamaica', 'weed', 2.5, home.id).rejected).toBe('invalid-qty');
  });

  it('the street can only front what it holds (no-supply), and the value cap binds (exceeds-cap)', () => {
    const s = withStock(frontRunner('supply'), 'jamaica', 'weed', 3);
    expect(takeConsignment(s, 'jamaica', 'weed', 10, s.stashes[0]!.id).rejected).toBe('no-supply');

    // A tuned tiny cap: even one unit's marked-up value exceeds the line.
    const tiny = frontRunner('cap', 100, tunedConfig({ consignment: { CONSIGNMENT_MAX_VALUE: 100 } }));
    expect(consignmentCap(tiny)).toBe(100);
    expect(takeConsignment(tiny, 'jamaica', 'weed', 1, tiny.stashes[0]!.id).rejected).toBe(
      'exceeds-cap',
    );
  });

  it('the fronted-value cap grows with street reputation', () => {
    expect(consignmentCap(frontRunner('cap-rich', 100))).toBeGreaterThan(
      consignmentCap(frontRunner('cap-poor', 0)),
    );
  });
});

// --- Interest: per ACTIVE day at rate/7, same curve as the sharks --------------

describe('interest compounds per active in-game day (design/10 §3)', () => {
  it('consignmentStep grows the balance on the compound curve; principal stays a clean floor', () => {
    const s = taken('curve');
    const owed = consignmentOwed(s.consignment);

    const afterDay = consignmentStep(s, 24);
    const expected = owed * Math.pow(1 + s.consignment.rate / INTEREST_DAYS_PER_WEEK, 1);
    expect(consignmentOwed(afterDay.consignment)).toBeCloseTo(expected, 5);
    expect(afterDay.consignment.principal).toBe(s.consignment.principal);
    expect(afterDay.consignment.accruedInterest).toBeGreaterThan(0);
  });

  it('active play accrues via the tick pipeline', () => {
    const s = taken('active');
    const owedBefore = consignmentOwed(s.consignment);
    const afterPlay = tick(s, 24);
    expect(consignmentOwed(afterPlay.consignment)).toBeGreaterThan(owedBefore);
  });
});

// --- Guarantee #2 (CRITICAL): the front is frozen offline ----------------------

describe('Guarantee #2: absence never grows the front, escalates it, or kills', () => {
  it('settleOffline leaves the ledger byte-identical for ANY hours away (property test)', () => {
    // Overdue, mid-ladder, collectors mid-clock — everything at stake.
    let s = taken('freeze');
    s = setDay(s, s.consignment.dueDay + 1);
    s = consignmentStep(s, 24); // rung 1 on the books
    const before = s;

    for (const hours of [1, 12, 24, 100, 1_000, 10_000, 100_000]) {
      const { state: after } = settleOffline(before, hours);
      expect(after.consignment).toEqual(before.consignment);
      expect(consignmentOwed(after.consignment)).toBe(consignmentOwed(before.consignment));
      expect(consignmentClosedAccount(after)).toBe(false);
      expect(after.runStatus).toBe('active');
    }
  });
});

// --- Repay: free, dirty money welcome, patience-resetting (guarantee #4) -------

describe('repayment is free, draws DIRTY cash first, and resets the plug’s patience', () => {
  it('draws dirty cash from the stash first, clean covering the shortfall', () => {
    let s = taken('dirty-first');
    const home = s.stashes[0]!;
    s = {
      ...s,
      stashes: [{ ...home, dirtyCash: 1_000 }],
      cleanCash: 5_000,
    };

    const r = repayConsignment(s, 1_200);
    expect(r.ok).toBe(true);
    expect(r.paid).toBe(1_200);
    expect(r.fromDirty).toBe(1_000);
    expect(r.fromClean).toBe(200);
    expect(r.state.stashes[0]!.dirtyCash).toBe(0);
    expect(r.state.cleanCash).toBe(4_800);
  });

  it('a partial payment reduces owed exactly, pushes the due date out, and clears the mark', () => {
    let s = taken('partial');
    s = consignmentStep(s, 24); // some interest on the books
    // Walk it to marked: overdue two days, two ladder calls.
    s = setDay(s, s.consignment.dueDay + 1);
    s = consignmentStep(s, 1);
    s = setDay(s, s.consignment.dueDay + 2);
    s = consignmentStep(s, 1);
    expect(isConsignmentMarked(s)).toBe(true);
    s = { ...s, cleanCash: 50_000 };
    const owedBefore = consignmentOwed(s.consignment);

    const r = repayConsignment(s, 500);
    expect(r.ok).toBe(true);
    expect(r.clearedInFull).toBe(false);
    expect(consignmentOwed(r.state.consignment)).toBeCloseTo(owedBefore - 500, 5);
    // Patience reset: fresh window, good standing, mark and collector clock gone.
    expect(r.state.consignment.dueDay).toBe(s.clock.day + CONSIGNMENT_DUE_DAYS);
    expect(r.state.consignment.ladderRung).toBe(0);
    expect(isConsignmentMarked(r.state)).toBe(false);
    expect(r.state.consignment.enforcement).toBeUndefined();
  });

  it('full payoff is overpay-proof, clears the ledger, and lifts street rep', () => {
    let s = taken('full');
    s = consignmentStep(s, 24);
    s = { ...s, cleanCash: 100_000 };
    const owed = consignmentOwed(s.consignment);
    const streetBefore = s.reputation.street;

    const r = repayConsignment(s, 999_999);
    expect(r.ok).toBe(true);
    expect(r.paid).toBeCloseTo(owed, 5);
    expect(r.clearedInFull).toBe(true);
    expect(r.state.consignment.active).toBe(false);
    expect(r.state.consignment.countryId).toBeNull();
    expect(r.state.reputation.street).toBeGreaterThan(streetBefore);
  });

  it('paying the rounded balance clears the front — no sub-dollar residue strands the card', () => {
    let s = taken('residue');
    s = consignmentStep(s, 24); // fractional interest on the books
    s = { ...s, cleanCash: 100_000 };
    const owed = consignmentOwed(s.consignment);
    expect(Number.isInteger(owed)).toBe(false);

    const r = repayConsignment(s, Math.round(owed));
    expect(r.ok).toBe(true);
    expect(r.clearedInFull).toBe(true);
    expect(r.state.consignment.active).toBe(false);
    expect(consignmentOwed(r.state.consignment)).toBe(0);
  });

  it('rejects with no front, a bad amount, or beyond dirty + clean', () => {
    const none = frontRunner('nofront');
    expect(repayConsignment(none, 100).rejected).toBe('no-consignment');

    let broke = taken('broke-front');
    broke = { ...broke, cleanCash: 0, stashes: [{ ...broke.stashes[0]!, dirtyCash: 0 }] };
    expect(repayConsignment(broke, 100).rejected).toBe('insufficient-funds');
    expect(repayConsignment(broke, 0).rejected).toBe('invalid-qty');
  });
});

// --- The compressed ladder and the quicker death (guarantee #3) ----------------

describe('the short fuse: warned → marked → two hits → the account closed (one move per step)', () => {
  it('walks the whole arc telegraphed, one move at a time, ~5 days from due to death', () => {
    let s = taken('death');
    const dueDay = s.consignment.dueDay;
    expect(dueDay).toBe(2 + CONSIGNMENT_DUE_DAYS); // the short window, from day 2

    // Overdue +1: the warning rung — a scene, nothing taken.
    s = setDay(s, dueDay + 1);
    s = consignmentStep(s, 1);
    expect(s.consignment.ladderRung).toBe(1);
    expect(s.pendingChoices.some((c) => c.kind === CONSIGNMENT_DEFAULT_CHOICE)).toBe(true);
    expect(isConsignmentMarked(s)).toBe(false);

    // Overdue +2: MARKED — the flag is up; the next call starts the visible clock.
    s = setDay(s, dueDay + 2);
    s = consignmentStep(s, 1);
    expect(s.consignment.ladderRung).toBe(2);
    expect(isConsignmentMarked(s)).toBe(true);
    s = consignmentStep(s, 1); // the collector warning goes out first
    expect(s.consignment.enforcement).toBeDefined();
    expect(s.consignment.enforcement!.stage).toBe(0);
    expect(s.pendingChoices.some((c) => c.kind === CONSIGNMENT_COLLECTOR_CHOICE)).toBe(true);

    // Hit 1 (warned): a cut of the fattest stash's dirty cash.
    const dirtyBefore = s.stashes[0]!.dirtyCash;
    s = setDay(s, dueDay + 3);
    s = consignmentStep(s, 1);
    expect(s.consignment.enforcement!.stage).toBe(1);
    expect(s.stashes[0]!.dirtyCash).toBeLessThan(dirtyBefore);

    // Hit 2 (warned): the product itself goes back — and the balance stays owed.
    const weedBefore = s.stashes[0]!.inventory.weed ?? 0;
    const owedBefore = consignmentOwed(s.consignment);
    s = setDay(s, dueDay + 4);
    s = consignmentStep(s, 1);
    expect(s.consignment.enforcement!.stage).toBe(CONSIGNMENT_LETHAL_AFTER_HITS);
    expect(s.stashes[0]!.inventory.weed ?? 0).toBeLessThan(weedBefore);
    expect(consignmentOwed(s.consignment)).toBeGreaterThanOrEqual(owedBefore);
    expect(consignmentClosedAccount(s)).toBe(false); // the final warning is out — not dead yet

    // The lethal move: every warning ignored — the account is closed for good.
    s = setDay(s, dueDay + 5);
    s = consignmentStep(s, 1);
    expect(consignmentClosedAccount(s)).toBe(true);
  });

  it('repaying to zero at the brink clears the mark and stops the collectors cold', () => {
    // Walk to the final warning, then pay in full — the escape hatch always works.
    let s = taken('escape');
    const dueDay = s.consignment.dueDay;
    for (const [day, calls] of [
      [dueDay + 1, 1],
      [dueDay + 2, 2],
      [dueDay + 3, 1],
      [dueDay + 4, 1],
    ] as const) {
      s = setDay(s, day);
      for (let i = 0; i < calls; i++) s = consignmentStep(s, 1);
    }
    expect(s.consignment.enforcement!.stage).toBe(CONSIGNMENT_LETHAL_AFTER_HITS);

    s = { ...s, cleanCash: 1_000_000 };
    const r = repayConsignment(s, consignmentOwed(s.consignment) + 1);
    expect(r.clearedInFull).toBe(true);
    expect(isConsignmentMarked(r.state)).toBe(false);

    // The next step is a clean no-op — no hit, no kill, ledger empty.
    const after = consignmentStep(setDay(r.state, dueDay + 6), 24);
    expect(consignmentClosedAccount(after)).toBe(false);
    expect(after.consignment.active).toBe(false);
  });
});

// --- Migration 22 → 23 ---------------------------------------------------------

describe('migration 22 → 23 — seed the consignment ledger (v23)', () => {
  it('seeds an empty front and the config group; player holdings untouched', () => {
    const state = createInitialState('mig23');
    // A v22 save has neither the ledger nor its config group.
    const { consignment: _ledger, ...stateRest } = state;
    const { consignment: _tuning, ...configRest } = state.config;
    const legacy = { ...stateRest, config: configRest } as unknown as GameState;

    const migrated = migrateEnvelope({
      slot: 's',
      schemaVersion: 22,
      savedAt: 0,
      seed: state.seed,
      runStatus: state.runStatus,
      day: state.clock.day,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    expect(migrated!.consignment.active).toBe(false);
    expect(migrated!.consignment.countryId).toBeNull();
    expect(consignmentOwed(migrated!.consignment)).toBe(0);
    expect(migrated!.config.consignment.CONSIGNMENT_DUE_DAYS).toBe(CONSIGNMENT_DUE_DAYS);
    // Nothing the player earned changes.
    expect(migrated!.cleanCash).toBe(state.cleanCash);
    expect(migrated!.stashes).toEqual(state.stashes);
    expect(migrated!.rngState).toEqual(state.rngState);
  });
});
