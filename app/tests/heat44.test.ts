/**
 * Prompt 44 — Heat & Consequence Rework (design/13 Workstream B).
 *
 * The redistribution contract: heat and losses come from getting CAUGHT and
 * getting BIG, never from transacting. B1: clean buys/sells add zero heat.
 * B5: the six-source model replaces it, every source individually testable and
 * itemized (shown = applied). B2: busts seize only the table. B3: marked debt
 * means telegraphed collector pressure on a visible clock. B4: a self-run
 * interdiction is an arrest — post bond or serve the sentence (the run resumes
 * either way; design/13 open decision 2, settled).
 */

import { describe, expect, it } from 'vitest';
import {
  ARREST_CHOICE_KIND,
  DEBT_COLLECTOR_CHOICE,
  DEBT_LETHAL_FLAG,
  DEBT_MARKED_FLAG,
  TICK_STEPS,
  collectorsClosedAccount,
  applyChaos,
  arrestBond,
  borrow,
  buyFront,
  createInitialState,
  decayHeat,
  emptyInventory,
  endRun,
  enforcementStep,
  getChaosEvent,
  heatOf,
  heatSourcesStep,
  homeCountryId,
  hottestCountry,
  investigationActive,
  launchHeat,
  maybeOpenInvestigation,
  netWorth,
  passiveHeatPerHour,
  passiveHeatTerms,
  portUseKey,
  postBond,
  quoteShipment,
  raidChance,
  raidStep,
  recentUseOf,
  repay,
  resolveDeal,
  serveSentence,
  ship,
  spawnCrew,
  travelStep,
  type GameState,
  type ProductId,
  type ShipIntent,
  type Stash,
} from '@/engine';
import { migrateEnvelope } from '@/store';

/** Overwrite the home stash's cash/inventory, immutably. */
function seedHome(
  state: GameState,
  opts: { cash?: number; inventory?: Partial<Record<ProductId, number>> },
): GameState {
  const home = state.stashes[0] as Stash;
  const nextHome: Stash = {
    ...home,
    dirtyCash: opts.cash ?? home.dirtyCash,
    inventory: { ...home.inventory, ...(opts.inventory ?? {}) },
  };
  return { ...state, stashes: [nextHome, ...state.stashes.slice(1)] };
}

/** Append a foothold stash in `countryId` (a big safehouse — room to receive). */
function withStashIn(
  state: GameState,
  countryId: string,
  opts: { inventory?: Partial<Record<ProductId, number>>; cash?: number } = {},
): GameState {
  const stash: Stash = {
    id: `stash-${countryId}`,
    name: `${countryId} stash`,
    countryId,
    type: 'safehouse',
    dirtyCash: opts.cash ?? 0,
    inventory: { ...emptyInventory(), ...(opts.inventory ?? {}) },
  };
  return { ...state, stashes: [...state.stashes, stash] };
}

const home = (state: GameState): Stash => state.stashes[0] as Stash;

/** A funded run with cocaine at home and a Miami foothold to ship to. */
function fixture(seedKey = 'p44'): { state: GameState; intent: ShipIntent } {
  let state = createInitialState(seedKey);
  state = seedHome(state, { cash: 5_000_000, inventory: { cocaine: 40, weed: 40 } });
  state = withStashIn(state, 'miami');
  const intent: ShipIntent = {
    type: 'ship',
    product: 'cocaine',
    qty: 20,
    fromStashId: 'stash-home',
    toStashId: 'stash-miami',
    mode: 'go-fast',
  };
  return { state, intent };
}

// --- B1 · transacting cleanly is COLD ------------------------------------------

describe('B1 — no transaction heat: clean buys and sells add zero heat', () => {
  it('a drug buy leaves the meter exactly where it was', () => {
    const state = seedHome(createInitialState('b1-buy'), { cash: 500_000 });
    const r = resolveDeal(state, { type: 'buy', product: 'weed', qty: 5 });
    expect(r.outcome).toBe('success');
    expect(r.state.countryHeat).toEqual(state.countryHeat);
    expect(r.state.notoriety).toBe(state.notoriety);
  });

  it('a clean drug sale leaves the meter exactly where it was', () => {
    const state = seedHome(createInitialState('b1-sell'), {
      cash: 1000,
      inventory: { weed: 20 },
    });
    // Thread the RNG until the roll survives (the bust floor is 3%).
    let rngState = state.rngState;
    for (let i = 0; i < 200; i++) {
      const trial: GameState = { ...state, rngState };
      const r = resolveDeal(trial, { type: 'sell', product: 'weed', qty: 5 });
      rngState = r.state.rngState;
      if (r.outcome === 'success') {
        expect(r.state.countryHeat).toEqual(state.countryHeat);
        expect(r.state.notoriety).toBe(state.notoriety);
        return;
      }
    }
    throw new Error('no clean sale in 200 trials');
  });
});

// --- B5.1 · shipment volume & route risk ----------------------------------------

describe('B5.1 — shipment heat scales with cargo class × qty × corridor risk', () => {
  it('a bigger/hotter shipment heats more than a small/cool one', () => {
    const { state } = fixture('b5-ship');
    const big: ShipIntent = {
      type: 'ship',
      product: 'cocaine',
      qty: 40,
      fromStashId: 'stash-home',
      toStashId: 'stash-miami',
      mode: 'go-fast',
    };
    const small: ShipIntent = { ...big, product: 'weed', qty: 5, mode: 'ferry' };
    expect(launchHeat(state, big)).toBeGreaterThan(launchHeat(state, small));
  });

  it('the launch applies exactly the disclosed quote heat (shown = applied)', () => {
    const { state, intent } = fixture('b5-launch');
    const quote = quoteShipment(state, intent);
    expect(quote.launchHeat).toBeGreaterThan(0);
    const launched = ship(state, intent);
    expect(launched.ok).toBe(true);
    // The launch heat lands on the ORIGIN country (per-country heat, v30).
    const origin = home(state).countryId;
    expect(heatOf(launched.state, origin)).toBeCloseTo(
      heatOf(state, origin) + quote.launchHeat,
      6,
    );
  });
});

// --- B5.2 (retired) + B5.6 · storage is cold; empires draw eyes ------------------

describe('B5.2/B5.6 — passive terms: storage is cold, empires draw eyes', () => {
  it('a fat stash never hums — holding product adds zero passive heat', () => {
    const base = createInitialState('b5-conc');
    const fat = seedHome(base, { inventory: { cocaine: 10_000 } });
    expect(
      passiveHeatTerms(fat).some((t) => t.id.startsWith('concentration:')),
    ).toBe(false);
    // The meter reads the footprint, not the shelves: same terms as empty-handed.
    expect(passiveHeatPerHour(fat)).toBe(passiveHeatPerHour(base));
  });

  it('empire growth raises the passive term', () => {
    const small = createInitialState('b5-empire');
    const big: GameState = {
      ...small,
      crew: [spawnCrew('deon'), spawnCrew('marco'), spawnCrew('yolanda')],
      fronts: [
        { id: 'front-cash-front', type: 'cash-front', level: 1 },
        { id: 'front-crypto', type: 'crypto', level: 1 },
      ],
    };
    expect(passiveHeatPerHour(big)).toBeGreaterThan(passiveHeatPerHour(small));
  });

  it('the tick step applies exactly the itemized sum (shown = applied)', () => {
    const base = createInitialState('b5-sum');
    const state: GameState = {
      ...seedHome(base, { inventory: { cocaine: 500 } }),
      crew: [spawnCrew('deon'), spawnCrew('marco'), spawnCrew('yolanda')],
    };
    expect(passiveHeatPerHour(state)).toBeGreaterThan(0);
    const stepped = heatSourcesStep(state, 1);
    // The empire hum feeds NOTORIETY since v30 (footprint = your name).
    expect(stepped.notoriety).toBeCloseTo(state.notoriety + passiveHeatPerHour(state), 6);
    expect(stepped.countryHeat).toEqual(state.countryHeat);
  });
});

// --- B5.3 · repeated patterns -----------------------------------------------------

describe('B5.3 — repeated patterns: reused ports surcharge heat AND odds, then decay', () => {
  const ferryIntent = (qty: number): ShipIntent => ({
    type: 'ship',
    product: 'weed',
    qty,
    fromStashId: 'stash-home',
    toStashId: 'stash-miami',
    mode: 'ferry',
  });

  it('the third run from the same port costs more than the first — disclosed', () => {
    let { state } = fixture('b5-pattern');
    const intent = ferryIntent(5);
    const firstQuote = quoteShipment(state, intent);
    expect(firstQuote.patternOddsSurcharge).toBe(0);

    // Two launches from the same origin port… (clear the in-flight run between
    // them so the helm is free again — concurrency caps solo runs at one at a
    // time, but the pattern counter `recentUse` persists across the return).
    for (let i = 0; i < 2; i++) {
      const launched = ship(state, intent);
      expect(launched.ok).toBe(true);
      state = seedHome({ ...launched.state, shipments: [] }, { inventory: { weed: 40 } });
    }

    // …and the third quote carries the pattern surcharge in heat AND odds.
    const thirdQuote = quoteShipment(state, intent);
    expect(recentUseOf(state, portUseKey(home(state).countryId))).toBe(2);
    expect(thirdQuote.patternOddsSurcharge).toBeCloseTo(
      2 * state.config.heat.PATTERN_ODDS_PER_USE,
      6,
    );
    expect(thirdQuote.interdictionChance).toBeGreaterThan(firstQuote.interdictionChance);
    expect(thirdQuote.launchHeat).toBeGreaterThan(firstQuote.launchHeat);
  });

  it('the surcharge decays over active hours (the window closes)', () => {
    let { state } = fixture('b5-decay');
    const launched = ship(state, ferryIntent(5));
    expect(launched.ok).toBe(true);
    state = launched.state;
    const key = portUseKey(home(state).countryId);
    expect(recentUseOf(state, key)).toBe(1);

    // Half the window: the counter has shed but not closed.
    const halfway = heatSourcesStep(state, 24);
    expect(recentUseOf(halfway, key)).toBeGreaterThan(0);
    expect(recentUseOf(halfway, key)).toBeLessThan(1);

    // Past the window: the port runs cold again (the entry is dropped).
    const cold = heatSourcesStep(state, 72);
    expect(recentUseOf(cold, key)).toBe(0);
  });
});

// --- B5.4 · violence & flashy actions --------------------------------------------

describe('B5.4 — flashy one-time bumps: survived raid, rival clash, conspicuous purchase', () => {
  it('surviving a raid bumps heat once (they missed — and they are sore)', () => {
    // Cash stays under GUARD_CASH_THRESHOLD: the floor stash's 0.9 seizure gets
    // no unguarded penalty, so a miss (the survived raid) stays possible.
    const base = seedHome(createInitialState('b5-raid'), {
      cash: 0,
      inventory: { cocaine: 100 },
    });
    const homeC = homeCountryId(base);
    const state: GameState = { ...base, countryHeat: { [homeC]: 60 } };
    let rngState = state.rngState;
    for (let i = 0; i < 2_000; i++) {
      const trial: GameState = { ...state, rngState };
      const resolved = raidStep(trial, 500); // a wide window so the raid roll fires
      rngState = resolved.rngState;
      const scene = resolved.pendingChoices.at(-1);
      if (scene?.kind !== 'raid') continue; // no raid this trial
      if (scene.summary.includes('came up empty')) {
        expect(heatOf(resolved, homeC)).toBeCloseTo(
          heatOf(trial, homeC) + state.config.heat.RAID_SURVIVED_HEAT,
          6,
        );
        return;
      }
    }
    throw new Error('no survived raid observed in 2k trials');
  });

  it('a rival clash bumps heat once alongside the tension', () => {
    const state = createInitialState('b5-rival');
    const clashed = applyChaos(state, getChaosEvent('rival-move'));
    // The clash carries no country — it lands on the hottest (fallback rule).
    const target = hottestCountry(state);
    expect(heatOf(clashed, target)).toBeCloseTo(
      heatOf(state, target) + state.config.heat.RIVAL_CLASH_HEAT,
      6,
    );
  });

  it('a conspicuous purchase (real-estate class) bumps once; a quiet front does not', () => {
    const state: GameState = { ...createInitialState('b5-buyf'), cleanCash: 10_000_000 };
    const homeC = homeCountryId(state);
    const loud = buyFront(state, 'real-estate');
    expect(loud.front).toBeTruthy();
    // Fronts carry no country — the flashy purchase lands on HOME.
    expect(heatOf(loud.state, homeC)).toBeCloseTo(
      heatOf(state, homeC) + state.config.heat.CONSPICUOUS_PURCHASE_HEAT,
      6,
    );
    const quiet = buyFront(state, 'cash-front');
    expect(quiet.front).toBeTruthy();
    expect(quiet.state.countryHeat).toEqual(state.countryHeat);
  });
});

// --- B5.5 · the investigation window ----------------------------------------------

describe('B5.5 — a MAJOR bust opens a disclosed investigation window', () => {
  it('opens at the threshold, is disclosed, and expires on schedule', () => {
    const state = createInitialState('b5-invest');
    const cfg = state.config.heat;
    const homeC = homeCountryId(state);

    const minor = maybeOpenInvestigation(state, cfg.INVESTIGATION_SPIKE_THRESHOLD - 1, homeC);
    expect(minor).toBe(state); // small busts never open a file

    const opened = maybeOpenInvestigation(state, cfg.INVESTIGATION_SPIKE_THRESHOLD, homeC);
    expect(investigationActive(opened)).toBe(true);
    expect(opened.investigations[homeC]).toBe(state.clock.hours + cfg.INVESTIGATION_HOURS);
    expect(opened.pendingChoices.at(-1)?.kind).toBe('investigation');

    // The window burns ACTIVE hours and closes on schedule.
    const later: GameState = {
      ...opened,
      clock: { ...opened.clock, hours: opened.clock.hours + cfg.INVESTIGATION_HOURS },
    };
    expect(investigationActive(later)).toBe(false);
  });

  it('the window is PER-COUNTRY — a file in one place leaves another cold', () => {
    const state = createInitialState('b5-invest-local');
    const cfg = state.config.heat;
    const opened = maybeOpenInvestigation(state, cfg.INVESTIGATION_SPIKE_THRESHOLD, 'mx');
    expect(opened.investigations['mx']).toBeDefined();
    expect(opened.investigations[homeCountryId(state)]).toBeUndefined();
  });

  it('slows heat decay and raises raid chance while open — then both recover', () => {
    const seedBase = createInitialState('b5-invest2');
    const homeC = homeCountryId(seedBase);
    const base: GameState = { ...seedBase, countryHeat: { [homeC]: 50 } };
    const open: GameState = {
      ...base,
      investigations: { [homeC]: base.clock.hours + 72 },
    };

    // Slower decay: after the same hour, the investigated run stays hotter.
    expect(heatOf(decayHeat(open, 5), homeC)).toBeGreaterThan(heatOf(decayHeat(base, 5), homeC));

    // Raised raid odds, by exactly the disclosed multiplier (small-p regime).
    const calm = raidChance(base, 1);
    const watched = raidChance(open, 1);
    expect(watched / calm).toBeCloseTo(base.config.heat.INVESTIGATION_RAID_MULTIPLIER, 2);
  });
});

// --- B3 · marked enforcement --------------------------------------------------------

describe('B3 — marked must mean something: telegraphed collector pressure on a clock', () => {
  /** A marked, solvent borrower with cash to squeeze and a crew to lean on. */
  function marked(seedKey: string): GameState {
    let s = createInitialState(seedKey);
    s = { ...s, reputation: { ...s.reputation, street: 100 } };
    const borrowed = borrow(s, 'papa-cass', 500);
    expect(borrowed.ok).toBe(true);
    s = seedHome(borrowed.state, { cash: 100_000 });
    return {
      ...s,
      crew: [spawnCrew('deon')],
      flags: { ...s.flags, [DEBT_MARKED_FLAG]: true },
    };
  }

  it('warns first (the visible clock), then lands the cash hit with its numbers', () => {
    const s0 = marked('b3-clock');
    const period = s0.config.lenders.MARKED_ENFORCEMENT_PERIOD_HOURS;

    // Step 1: the warning card goes out — nothing is taken yet.
    const warned = enforcementStep(s0, 1);
    expect(warned.enforcement).toEqual({ stage: 0, nextAtHours: s0.clock.hours + period });
    const warning = warned.pendingChoices.at(-1);
    expect(warning?.kind).toBe(DEBT_COLLECTOR_CHOICE);
    expect(warning?.summary).toContain("You're marked");
    expect(home(warned).dirtyCash).toBe(100_000);

    // Before the clock: nothing moves.
    expect(enforcementStep(warned, 1)).toBe(warned);

    // On the clock: the warned hit lands — a cut of the fattest stash's cash —
    // with its dollars in the feed line, and the NEXT warning goes out.
    const due: GameState = {
      ...warned,
      clock: { ...warned.clock, hours: warned.enforcement!.nextAtHours },
    };
    const hit = enforcementStep(due, 1);
    const cut = Math.round(100_000 * s0.config.lenders.MARKED_CASH_CUT);
    expect(home(hit).dirtyCash).toBe(100_000 - cut);
    expect(hit.enforcement?.stage).toBe(1);
    const lines = hit.pendingChoices.filter((c) => c.kind === DEBT_COLLECTOR_CHOICE);
    expect(lines.some((l) => l.summary.includes(`$${cut.toLocaleString('en-US')}`))).toBe(true);
    expect(lines.at(-1)?.summary).toContain('jump one of your loads'); // the next warning
  });

  it('escalates: shipment jumped, then a crew member leaned on (memory written)', () => {
    let s = marked('b3-esc');
    s = withStashIn(s, 'miami');
    const launched = ship(seedHome(s, { inventory: { cocaine: 40 } }), {
      type: 'ship',
      product: 'cocaine',
      qty: 10,
      fromStashId: 'stash-home',
      toStashId: 'stash-miami',
      mode: 'ferry',
    });
    expect(launched.ok).toBe(true);
    // Fast-forward to stage 1 (the shipment hit) with the clock due.
    let state: GameState = {
      ...launched.state,
      enforcement: { stage: 1, nextAtHours: launched.state.clock.hours },
    };
    state = enforcementStep(state, 1);
    expect(state.shipments).toHaveLength(0); // the load was jumped
    expect(state.enforcement?.stage).toBe(2);

    // Stage 2: lean on the crew — routed through loyaltyDelta (memory written).
    const before = state.crew[0]!.loyalty;
    state = enforcementStep(
      { ...state, enforcement: { stage: 2, nextAtHours: state.clock.hours } },
      1,
    );
    expect(state.crew[0]!.loyalty).toBeLessThan(before);
    expect(state.crew[0]!.memoryLog.at(-1)?.kind).toBe('leanedOn');
  });

  it('repaying to zero clears the mark and the pressure instantly', () => {
    let s = marked('b3-repay');
    s = enforcementStep(s, 1); // pressure record exists
    expect(s.enforcement).toBeDefined();
    const owed = s.debt.principal + s.debt.accruedInterest;
    const paid = repay({ ...s, cleanCash: owed }, owed);
    expect(paid.clearedInFull).toBe(true);
    expect(paid.state.flags[DEBT_MARKED_FLAG]).toBe(false);
    expect(paid.state.enforcement).toBeUndefined();
    // And the step never re-arms without the mark.
    expect(enforcementStep(paid.state, 1).enforcement).toBeUndefined();
  });

  it('turns lethal after enough unanswered hits — the final warning, then the kill', () => {
    const s0 = marked('b3-lethal');
    const lethalAfter = s0.config.lenders.MARKED_LETHAL_AFTER_HITS;

    // Sit at the last hit before lethal, clock due: the hit lands and the NEXT
    // warning is the FINAL one (the account gets closed next time).
    const atThreshold: GameState = {
      ...s0,
      enforcement: { stage: lethalAfter - 1, nextAtHours: s0.clock.hours },
    };
    const warnedFinal = enforcementStep(atThreshold, 1);
    expect(warnedFinal.enforcement?.stage).toBe(lethalAfter);
    expect(collectorsClosedAccount(warnedFinal)).toBe(false);
    const finalWarning = warnedFinal.pendingChoices
      .filter((c) => c.kind === DEBT_COLLECTOR_CHOICE)
      .at(-1);
    expect(finalWarning?.summary).toContain('close the account');

    // Clock due at the lethal stage: the account is closed — the flag the store
    // turns into a `killed` run-end goes up, with a final scene, and NO further hit.
    const due: GameState = {
      ...warnedFinal,
      clock: { ...warnedFinal.clock, hours: warnedFinal.enforcement!.nextAtHours },
    };
    const closed = enforcementStep(due, 1);
    expect(collectorsClosedAccount(closed)).toBe(true);
    expect(closed.flags[DEBT_LETHAL_FLAG]).toBe(true);
    const kill = closed.pendingChoices.find((c) => c.id.startsWith('debt-collectors-kill'));
    expect(kill?.kind).toBe(DEBT_COLLECTOR_CHOICE);

    // Idempotent once closed — the step does nothing further while the store ends the run.
    expect(enforcementStep(closed, 1)).toBe(closed);
  });

  it('repaying to zero before the lethal move escapes the kill entirely', () => {
    const s0 = marked('b3-escape');
    const lethalAfter = s0.config.lenders.MARKED_LETHAL_AFTER_HITS;
    const oneShyOfLethal: GameState = {
      ...s0,
      enforcement: { stage: lethalAfter, nextAtHours: s0.clock.hours + 1 },
    };
    // Pay it off before the clock strikes — the mark clears, so the lethal move
    // can never land (the enforcement record is gone).
    const owed = oneShyOfLethal.debt.principal + oneShyOfLethal.debt.accruedInterest;
    const paid = repay({ ...oneShyOfLethal, cleanCash: owed }, owed);
    expect(paid.state.flags[DEBT_MARKED_FLAG]).toBe(false);
    expect(collectorsClosedAccount(paid.state)).toBe(false);
    expect(enforcementStep(paid.state, 1).enforcement).toBeUndefined();
  });

  it('never runs offline — no collector moves while the player is away', () => {
    const step = TICK_STEPS.find((s) => s.id === 'marked-enforcement');
    expect(step?.modes).not.toContain('offline');
    // The passive heat step is frozen offline too. (Both DO run while
    // incarcerated — the B4 sentence's costs-and-threats rule.)
    expect(TICK_STEPS.find((s) => s.id === 'heat-sources')?.modes).not.toContain('offline');
    expect(step?.modes).toContain('incarcerated');
  });
});

// --- B4 · self-run arrest -------------------------------------------------------------

describe('B4 — a self-run interdiction is an arrest: post bond or serve the sentence', () => {
  /** Thread the RNG until a SOLO interdiction lands; returns the arrested state. */
  function arrested(seedKey: string): GameState {
    const { intent } = fixture(seedKey);
    let { state } = fixture(seedKey);
    state = { ...state, cleanCash: 2_000_000 };
    const launched = ship(state, intent); // no couriers — you're driving
    expect(launched.ok).toBe(true);
    const dueClock = { ...launched.state.clock, hours: launched.shipment!.arrivesAtHours };
    let rngState = launched.state.rngState;
    for (let i = 0; i < 5_000; i++) {
      const trial: GameState = { ...launched.state, clock: dueClock, rngState };
      const resolved = travelStep(trial, 1);
      if (resolved.pendingChoices.at(-1)?.kind === ARREST_CHOICE_KIND) return resolved;
      rngState = resolved.rngState;
    }
    throw new Error('no solo interdiction in 5k trials');
  }

  it('the launch quote discloses the risk before commit', () => {
    const { state, intent } = fixture('b4-quote');
    const solo = quoteShipment(state, intent);
    expect(solo.soloRun).toBe(true);
    expect(solo.arrestBond).toBe(arrestBond(state));
    expect(solo.arrestSentenceHours).toBe(state.config.transport.ARREST_SENTENCE_HOURS);

    const consigned = quoteShipment(
      { ...state, crew: [spawnCrew('deon')] },
      { ...intent, courierIds: ['crew-deon'] },
    );
    expect(consigned.soloRun).toBe(false);
  });

  it('always presents bond-or-sentence; the bond price is shown and charged exactly', () => {
    const state = arrested('b4-bond');
    const choice = state.pendingChoices.at(-1)!;
    expect(choice.kind).toBe(ARREST_CHOICE_KIND);

    const bond = arrestBond(state);
    expect(bond).toBeGreaterThanOrEqual(state.config.transport.ARREST_BOND_MIN);
    expect(bond).toBeGreaterThanOrEqual(
      Math.round(netWorth(state) * state.config.transport.ARREST_BOND_FRACTION),
    );

    const posted = postBond(state, choice.id);
    expect(posted.ok).toBe(true);
    expect(posted.paid).toBe(bond);
    expect(posted.state.cleanCash).toBe(state.cleanCash - bond);
    // The bond's heat is context-free — it lands on the hottest country.
    const target = hottestCountry(state);
    expect(heatOf(posted.state, target)).toBeCloseTo(
      Math.min(100, heatOf(state, target) + state.config.transport.ARREST_BOND_HEAT),
      6,
    );
    expect(posted.state.pendingChoices.some((c) => c.kind === ARREST_CHOICE_KIND)).toBe(false);
    expect(posted.state.runStatus).toBe('active'); // the run continues
  });

  it('rejects the bond without mutating when clean cash cannot cover it', () => {
    const state = arrested('b4-broke');
    const broke: GameState = { ...state, cleanCash: 0 };
    const r = postBond(broke, broke.pendingChoices.at(-1)!.id);
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe('insufficient-funds');
    expect(r.state).toBe(broke);
  });

  it('serving the sentence fast-forwards the disclosed hours and the run RESUMES', () => {
    const state = arrested('b4-fall');
    const choice = state.pendingChoices.at(-1)!;
    const served = serveSentence(state, choice.id);
    expect(served.ok).toBe(true);
    expect(served.servedHours).toBe(state.config.transport.ARREST_SENTENCE_HOURS);
    expect(served.state.clock.hours).toBeCloseTo(
      state.clock.hours + served.servedHours,
      6,
    );
    expect(served.state.runStatus).toBe('active'); // no run-end — you did the time
    expect(served.state.pendingChoices.some((c) => c.kind === ARREST_CHOICE_KIND)).toBe(false);
    // A release note lands in the feed, stamped at the release hour.
    const release = served.state.pendingChoices.find((c) => c.kind === 'sentence-served');
    expect(release).toBeDefined();
    expect(release!.createdAtHours).toBe(served.state.clock.hours);
  });

  it('serving rejects without mutating when the choice is not a pending arrest', () => {
    const { state } = fixture('b4-no-arrest');
    const r = serveSentence(state, 'not-an-arrest');
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe('no-arrest');
    expect(r.servedHours).toBe(0);
    expect(r.state).toBe(state);
  });

  it('inside, costs and threats run while income freezes (the tick-mode contract)', () => {
    const modesOf = (id: string) => TICK_STEPS.find((s) => s.id === id)!.modes;
    // Costs & threats keep the pressure on while the boss is inside.
    for (const id of [
      'debt-interest',
      'marked-enforcement',
      'corruption',
      'raid-roll',
      'crew',
      'heat-sources',
      'heat-decay',
      'travel',
    ]) {
      expect(modesOf(id), id).toContain('incarcerated');
    }
    // Income earns nothing inside — nobody moves product while you're away.
    for (const id of ['laundering-accrual', 'production-yield', 'wash-queue', 'street-sales']) {
      expect(modesOf(id), id).not.toContain('incarcerated');
    }
    // And the frozen-offline guarantee is untouched: nothing punishing runs offline.
    for (const step of TICK_STEPS) {
      expect(step.modes, step.id).not.toContain('offline');
    }
  });

  it("the legacy 'arrested' cause from pre-sentence saves still maps onto a prison end", () => {
    const state = arrested('b4-legacy');
    const ended = endRun(state, 'arrested');
    expect(ended.cause).toBe('arrested');
    expect(ended.sceneKey).toBe('runend.arrested');
    expect(ended.state.runStatus).toBe('prison');
    expect(ended.score).toBe(ended.state.highScore.peakNetWorth);
  });

  it('a consigned interdiction never fires the arrest (the courier takes the fall)', () => {
    const { intent } = fixture('b4-consigned');
    let { state } = fixture('b4-consigned');
    state = { ...state, crew: [spawnCrew('deon')] };
    const launched = ship(state, { ...intent, courierIds: ['crew-deon'] });
    expect(launched.ok).toBe(true);
    const dueClock = { ...launched.state.clock, hours: launched.shipment!.arrivesAtHours };
    let rngState = launched.state.rngState;
    for (let i = 0; i < 5_000; i++) {
      const trial: GameState = { ...launched.state, clock: dueClock, rngState };
      const resolved = travelStep(trial, 1);
      const last = resolved.pendingChoices.at(-1)?.kind;
      expect(last).not.toBe(ARREST_CHOICE_KIND);
      if (last === 'shipment-seized') return;
      rngState = resolved.rngState;
    }
    throw new Error('no consigned interdiction in 5k trials');
  });
});

// --- Migration · v14 → v15 -------------------------------------------------------------

describe('v14 → v15 migration — drops the transaction-heat knobs, seizes nothing', () => {
  it('drops BUY_HEAT_FACTOR/arms knobs, backfills the new groups, seeds recentUse', () => {
    const current = seedHome(createInitialState('migrate-44'), {
      cash: 7_777,
      inventory: { cocaine: 12 },
    });
    // Reconstruct a plausible v14 save: the old knobs present, the new absent.
    const strip = <T extends object>(group: T, keys: readonly string[]): T => {
      const copy = { ...(group as Record<string, unknown>) };
      for (const k of keys) delete copy[k];
      return copy as T;
    };
    const legacyState = {
      ...current,
      schemaVersion: 14,
      config: {
        ...current.config,
        deals: { ...current.config.deals, BUY_HEAT_FACTOR: 0.5 },
        arms: {
          ...current.config.arms,
          ARMS_BUY_HEAT_FACTOR: 0.5,
          ARMS_CONFLICT_HEAT_MULT: 0.5,
        },
        heat: strip(current.config.heat, [
          'SHIPMENT_LAUNCH_HEAT_FACTOR',
          'PATTERN_ODDS_PER_USE',
          'INVESTIGATION_HOURS',
          'EMPIRE_HEAT_PER_SIZE_HOUR',
        ]),
        lenders: strip(current.config.lenders, [
          'MARKED_ENFORCEMENT_PERIOD_HOURS',
          'MARKED_CASH_CUT',
        ]),
        transport: strip(current.config.transport, [
          'ARREST_BOND_FRACTION',
          'ARREST_BOND_MIN',
          'ARREST_BOND_HEAT',
          'ARREST_SENTENCE_HOURS',
        ]),
      },
    } as unknown as GameState & { recentUse?: unknown };
    delete (legacyState as { recentUse?: unknown }).recentUse;

    const migrated = migrateEnvelope({
      slot: 'test',
      schemaVersion: 14,
      savedAt: 0,
      seed: legacyState.seed,
      runStatus: legacyState.runStatus,
      day: legacyState.clock.day,
      state: legacyState,
    });
    expect(migrated).not.toBeNull();
    const s = migrated!;

    // Dropped knobs are gone; the new groups are whole.
    expect('BUY_HEAT_FACTOR' in s.config.deals).toBe(false);
    expect('ARMS_BUY_HEAT_FACTOR' in s.config.arms).toBe(false);
    expect('ARMS_CONFLICT_HEAT_MULT' in s.config.arms).toBe(false);
    expect(s.config.heat.SHIPMENT_LAUNCH_HEAT_FACTOR).toBeGreaterThan(0);
    expect(s.config.heat.INVESTIGATION_HOURS).toBeGreaterThan(0);
    expect(s.config.lenders.MARKED_CASH_CUT).toBeGreaterThan(0);
    expect(s.config.transport.ARREST_BOND_MIN).toBeGreaterThan(0);
    expect(s.config.transport.ARREST_SENTENCE_HOURS).toBeGreaterThan(0);
    expect(s.config.crew.LOYALTY_EVENT_BASE.leanedOn).toBeLessThan(0);
    expect(s.recentUse).toEqual({});

    // Never a seizure: holdings and cash are untouched.
    expect(home(s).dirtyCash).toBe(7_777);
    expect(home(s).inventory.cocaine).toBe(12);
    expect(s.rngState).toEqual(current.rngState);
  });
});

// --- The heat-pressure band (design/13 B5 — realistic escalation) ----------------------

describe('heat pressure: a sprawling operation runs measurably hotter than a mid-size one', () => {
  it('the passive per-hour term separates the two bands', () => {
    const base = createInitialState('band');

    // Mid-size: one modest stash, a couple of hands — inside the ambient allowance.
    const mid: GameState = {
      ...seedHome(base, { inventory: { weed: 75 } }),
      crew: [spawnCrew('deon')],
    };

    // Sprawling: footholds, a wide roster, fronts everywhere. (The product on the
    // shelves is cold — the FOOTPRINT is what draws eyes.)
    let sprawl = seedHome(base, { inventory: { cocaine: 350 } });
    sprawl = withStashIn(sprawl, 'miami', { inventory: { cocaine: 200 } });
    sprawl = {
      ...sprawl,
      crew: [spawnCrew('deon'), spawnCrew('marco'), spawnCrew('yolanda'), spawnCrew('tpopz')],
      fronts: [
        { id: 'front-cash-front', type: 'cash-front', level: 3 },
        { id: 'front-crypto', type: 'crypto', level: 2 },
        { id: 'front-real-estate', type: 'real-estate', level: 2 },
      ],
    };

    expect(passiveHeatPerHour(sprawl)).toBeGreaterThan(passiveHeatPerHour(mid) * 3);
  });
});
