import { describe, expect, it } from 'vitest';
import {
  ARREST_CHOICE_KIND,
  FAVOR_CHOICE_KIND,
  MASSIVE_UNCOVERED_SURCHARGE,
  PORT_BRIBE_BASE_FRACTION,
  PORT_MAJOR_DURATION_FRACTION,
  PORT_PAID_DURATION_HOURS,
  RAISE_MIN_WEEKS_BETWEEN,
  callFavor,
  computeRaiseAsk,
  createInitialState,
  declineFavor,
  effectiveHeat,
  emptyInventory,
  favorOfficialFor,
  favorQuote,
  getOfficial,
  hasMassiveShipmentCoverage,
  hire,
  interdictionBreakdown,
  portDriftFactor,
  portGreed,
  quoteBribe,
  payBribe,
  quoteShipment,
  repDiscount,
  requestRaise,
  respondToRaise,
  rivalPressure,
  ship,
  spawnCrew,
  travelStep,
  type GameState,
  type ShipIntent,
  type Stash,
} from '@/engine';
import { withHomeHeat } from './heatTestUtils';

const HEAT_MAX = 100;

/** A funded run at zero heat (clean baseline for exact-formula assertions). */
function fundedCalm(seed: string, cleanCash = 10_000_000): GameState {
  return { ...withHomeHeat(createInitialState(seed), 0), cleanCash };
}

/** Overwrite the home stash's inventory, immutably. */
function seedHome(state: GameState, inventory: Partial<Stash['inventory']>): GameState {
  const home = state.stashes[0] as Stash;
  return {
    ...state,
    stashes: [{ ...home, inventory: { ...home.inventory, ...inventory } }, ...state.stashes.slice(1)],
  };
}

/** Append a foothold stash in `countryId`. */
function withStashIn(state: GameState, countryId: string): GameState {
  const stash: Stash = {
    id: `stash-${countryId}`,
    name: `${countryId} stash`,
    countryId,
    type: 'safehouse',
    dirtyCash: 0,
    inventory: emptyInventory(),
  };
  return { ...state, stashes: [...state.stashes, stash] };
}

// --- Raise sanity: cap, ceiling, cooldown (design/13 F; Prompt 48) ------------

describe('raise sanity — caps, ceiling & cooldown (design/13 F)', () => {
  it('never returns an ask above retainer × RAISE_MAX_MULTIPLE or the archetype ceiling', () => {
    // Extreme inputs — a billionaire-scale, maximally-hot empire (the round-4 case).
    let state = fundedCalm('raise-extreme', 1_000_000_000);
    state = hire(state, 'detective').state;
    state = { ...withHomeHeat(state, 100), reputation: { ...state.reputation, business: 100 } };
    const tie = state.corruption.officials[0]!;
    const cap = tie.retainerPerWeek * state.config.corruption.RAISE_MAX_MULTIPLE;
    const ceiling = getOfficial('detective').raiseCeiling;
    const ask = computeRaiseAsk(state, tie);
    expect(ask).toBeLessThanOrEqual(Math.round(Math.min(cap, ceiling)));
    // Sane, not absurd — nowhere near the billions the feedback saw.
    expect(ask).toBeLessThan(getOfficial('detective').raiseCeiling + 1);
  });

  it('the absolute per-archetype ceiling binds when the multiplicative cap would exceed it', () => {
    let state = fundedCalm('raise-ceiling', 1_000_000_000);
    state = hire(state, 'detective').state;
    state = { ...withHomeHeat(state, 100), reputation: { ...state.reputation, business: 100 } };
    // A retainer already above ceiling / RAISE_MAX_MULTIPLE — the ×1.5 cap would
    // clear the ceiling, so the absolute ceiling is what actually bounds the ask.
    const ceiling = getOfficial('detective').raiseCeiling;
    const tie = { ...state.corruption.officials[0]!, retainerPerWeek: ceiling };
    expect(tie.retainerPerWeek * state.config.corruption.RAISE_MAX_MULTIPLE).toBeGreaterThan(ceiling);
    expect(computeRaiseAsk(state, tie)).toBe(ceiling);
  });

  it('an official will not ask again inside RAISE_MIN_WEEKS_BETWEEN weeks', () => {
    let state = fundedCalm('raise-cooldown', 100_000_000);
    state = hire(state, 'detective').state;
    state = { ...withHomeHeat(state, 80), reputation: { ...state.reputation, business: 90 } };

    // First ask lands and sets the cooldown clock.
    const first = requestRaise(state, state.corruption.officials[0]!.id);
    expect(first.official?.pendingRaise).toBeDefined();
    expect(first.official?.lastRaiseWeek).toBe(state.clock.week);
    // Accept it (clears the pending ask, keeps lastRaiseWeek).
    state = respondToRaise(first.state, first.official!.id, true).state;
    expect(state.corruption.officials[0]!.pendingRaise).toBeUndefined();

    // Same week — the raw ask still clears the margin, but the cooldown suppresses it.
    const tooSoon = requestRaise(state, state.corruption.officials[0]!.id);
    expect(tooSoon.official?.pendingRaise).toBeUndefined();

    // Past the cooldown, an ask lands again.
    const later: GameState = {
      ...state,
      clock: { ...state.clock, week: state.clock.week + RAISE_MIN_WEEKS_BETWEEN },
    };
    const resumed = requestRaise(later, later.corruption.officials[0]!.id);
    expect(resumed.official?.pendingRaise).toBeDefined();
  });
});

// --- Ports everywhere, priced by weight (design/13 F; Prompt 48) --------------

describe('ports everywhere, priced by weight (design/13 F)', () => {
  it('a minor port keeps the cheap, long deal; a major port charges the multiple for a fraction of the hold', () => {
    const state = fundedCalm('ports');
    const value = 200_000;
    const minor = quoteBribe(state, 'jamaica', value);
    const major = quoteBribe(state, 'miami', value);

    expect(minor.isMajorPort).toBe(false);
    expect(major.isMajorPort).toBe(true);

    // Minor holds the full standing duration; major only a config'd fraction.
    expect(minor.paidDurationHours).toBe(PORT_PAID_DURATION_HOURS);
    expect(major.paidDurationHours).toBeCloseTo(
      PORT_PAID_DURATION_HOURS * PORT_MAJOR_DURATION_FRACTION,
    );

    // The major ask is the per-port formula × the multiple, rounded (shown == charged).
    const cfg = state.config.corruption;
    const baseFormula =
      PORT_BRIBE_BASE_FRACTION *
      value *
      (1 + effectiveHeat(state, 'miami') / HEAT_MAX) *
      (1 + rivalPressure(state)) *
      portGreed('miami') *
      repDiscount(state) *
      portDriftFactor(state, 'miami');
    expect(major.ask).toBe(Math.round(baseFormula * cfg.PORT_MAJOR_ASK_MULTIPLE));
  });

  it('payBribe at a major port holds for the shorter duration (shown == charged)', () => {
    const state = fundedCalm('major-pay');
    const q = quoteBribe(state, 'miami', 150_000);
    const r = payBribe(state, 'miami', 150_000);
    expect(r.ok).toBe(true);
    expect(r.paid).toBe(q.ask);
    const paidPort = r.state.corruption.paidPorts.find((p) => p.portId === 'miami')!;
    expect(paidPort.paidUntilHours).toBe(state.clock.hours + q.paidDurationHours);
  });
});

// --- Call in a favor (design/13 F; Prompt 48) --------------------------------

describe('call in a favor — the mid-crisis intervention (design/13 F)', () => {
  it('offers no favor when no relevant official is on the payroll', () => {
    expect(favorOfficialFor(fundedCalm('favor-none'))).toBeNull();
  });

  it('a hired, loyal, unflipped official qualifies; a flipped or disloyal one does not', () => {
    const hired = hire(fundedCalm('favor-ok'), 'detective').state;
    expect(favorOfficialFor(hired)?.officialId).toBe('detective');

    const flipped: GameState = {
      ...hired,
      corruption: {
        ...hired.corruption,
        officials: hired.corruption.officials.map((o) => ({ ...o, isWire: true })),
      },
    };
    expect(favorOfficialFor(flipped)).toBeNull();

    const disloyal: GameState = {
      ...hired,
      corruption: {
        ...hired.corruption,
        officials: hired.corruption.officials.map((o) => ({ ...o, loyalty: 5 })),
      },
    };
    expect(favorOfficialFor(disloyal)).toBeNull();
  });

  /** Launch a consigned run to Miami and thread the RNG until it's interdicted. */
  function interdictTo(seed: string, withOfficial: boolean): {
    launched: GameState;
    resolved: GameState;
  } {
    let state = fundedCalm(seed, 5_000_000);
    state = seedHome(state, { cocaine: 40 });
    state = withStashIn(state, 'miami');
    state = { ...state, crew: [spawnCrew('deon')] };
    if (withOfficial) state = hire(state, 'detective').state;
    const intent: ShipIntent = {
      type: 'ship',
      product: 'cocaine',
      qty: 20,
      fromStashId: 'stash-home',
      toStashId: 'stash-miami',
      mode: 'go-fast',
      courierIds: ['crew-deon'],
    };
    const launch = ship(state, intent);
    expect(launch.ok).toBe(true);
    const shipment = launch.shipment!;
    const dueClock = { ...launch.state.clock, hours: shipment.arrivesAtHours };
    let rngState = launch.state.rngState;
    for (let i = 0; i < 20_000; i++) {
      const trial: GameState = { ...launch.state, clock: dueClock, rngState };
      const resolved = travelStep(trial, 1);
      const last = resolved.pendingChoices.at(-1)?.kind;
      if (
        last === FAVOR_CHOICE_KIND ||
        last === 'shipment-seized' ||
        last === ARREST_CHOICE_KIND
      ) {
        return { launched: trial, resolved };
      }
      rngState = resolved.rngState;
    }
    throw new Error('no interdiction observed in 20k trials');
  }

  it('an interdicted load with a qualifying official presents the favor choice, holding the load', () => {
    const { resolved } = interdictTo('favor-hold', true);
    const choice = resolved.pendingChoices.find((c) => c.kind === FAVOR_CHOICE_KIND);
    expect(choice).toBeDefined();
    // The load is HELD (still in flight, marked favorPending) — never re-rolled.
    const held = resolved.shipments.find((s) => `favor-${s.id}` === choice!.id);
    expect(held?.favorPending).toBe(true);
    // A further tick does NOT resolve a held load (fairness law — no second roll).
    const ticked = travelStep({ ...resolved, clock: { ...resolved.clock, hours: resolved.clock.hours + 100 } }, 1);
    expect(ticked.shipments.find((s) => s.id === held!.id)?.favorPending).toBe(true);
  });

  it('calling the favor pays the disclosed fee, spends loyalty, and delivers the exact load', () => {
    const { resolved } = interdictTo('favor-call', true);
    const choice = resolved.pendingChoices.find((c) => c.kind === FAVOR_CHOICE_KIND)!;
    const held = resolved.shipments.find((s) => `favor-${s.id}` === choice.id)!;
    const official = favorOfficialFor(resolved)!;
    const quote = favorQuote(resolved, held, official);
    const loyaltyBefore = official.loyalty;

    const r = callFavor(resolved, choice.id);
    expect(r.ok).toBe(true);
    expect(r.paid).toBe(quote.fee);
    expect(r.state.cleanCash).toBe(resolved.cleanCash - quote.fee);
    // The load survived — delivered to Miami, off the water, choice cleared.
    expect(r.state.pendingChoices.some((c) => c.kind === FAVOR_CHOICE_KIND)).toBe(false);
    expect(r.state.shipments.some((s) => s.id === held.id)).toBe(false);
    const dest = r.state.stashes.find((s) => s.id === 'stash-miami')!;
    expect(dest.inventory.cocaine).toBe(held.qty - held.skimUnits);
    // The official spent loyalty (a grievance that feeds the flip arc).
    const after = r.state.corruption.officials.find((o) => o.id === official.id)!;
    expect(after.loyalty).toBeLessThan(loyaltyBefore);
    expect(after.memoryLog.some((m) => m.kind === 'favor-called')).toBe(true);
  });

  it('declining the favor seizes exactly as a plain interdiction would', () => {
    const { resolved } = interdictTo('favor-decline', true);
    const choice = resolved.pendingChoices.find((c) => c.kind === FAVOR_CHOICE_KIND)!;
    const held = resolved.shipments.find((s) => `favor-${s.id}` === choice.id)!;

    const r = declineFavor(resolved, choice.id);
    expect(r.ok).toBe(true);
    // Load gone, favor choice cleared, a seizure scene queued (consigned = plain scene).
    expect(r.state.shipments.some((s) => s.id === held.id)).toBe(false);
    expect(r.state.pendingChoices.some((c) => c.kind === FAVOR_CHOICE_KIND)).toBe(false);
    expect(r.state.pendingChoices.some((c) => c.kind === 'shipment-seized')).toBe(true);
    // The origin keeps the rest — a loss is never a wipe.
    const home = r.state.stashes[0]!;
    expect(home.inventory.cocaine).toBe(20);
  });

  it('with NO qualifying official, an interdiction seizes outright — no favor choice', () => {
    const { resolved } = interdictTo('favor-absent', false);
    expect(resolved.pendingChoices.some((c) => c.kind === FAVOR_CHOICE_KIND)).toBe(false);
    expect(resolved.shipments.some((s) => s.favorPending)).toBe(false);
  });
});

// --- Massive-shipment coverage — soft surcharge (design/13 F; Prompt 48) ------

describe('massive-shipment coverage — a disclosed surcharge, never a gate (design/13 F)', () => {
  function massiveIntent(state: GameState): { state: GameState; intent: ShipIntent } {
    let s = seedHome(state, { cocaine: 600 });
    s = withStashIn(s, 'miami');
    const intent: ShipIntent = {
      type: 'ship',
      product: 'cocaine',
      qty: 600,
      fromStashId: 'stash-home',
      toStashId: 'stash-miami',
      mode: 'container-ship',
    };
    return { state: s, intent };
  }

  it('an uncovered massive run into a major country adds the surcharge line — inside the rolled odds', () => {
    const { state, intent } = massiveIntent(fundedCalm('massive-uncovered'));
    expect(hasMassiveShipmentCoverage(state)).toBe(false);
    const breakdown = interdictionBreakdown(state, intent);
    const term = breakdown.terms.find((t) => t.label.includes('payroll coverage'));
    expect(term).toBeDefined();
    expect(term!.contribution).toBeCloseTo(MASSIVE_UNCOVERED_SURCHARGE);
    // The surcharge is folded into the rolled number (shown == rolled).
    expect(breakdown.total).toBe(quoteShipment(state, intent).interdictionChance);
    // Launching uncovered is always POSSIBLE (open access — never a lock).
    expect(quoteShipment(state, intent).ok).toBe(true);
  });

  it('payroll coverage removes the surcharge; the covered run rolls lower', () => {
    const base = massiveIntent(fundedCalm('massive-covered'));
    const covered = hire(base.state, 'detective').state;
    expect(hasMassiveShipmentCoverage(covered)).toBe(true);
    const term = interdictionBreakdown(covered, base.intent).terms.find((t) =>
      t.label.includes('payroll coverage'),
    );
    expect(term).toBeUndefined();
    expect(interdictionBreakdown(covered, base.intent).total).toBeLessThanOrEqual(
      interdictionBreakdown(base.state, base.intent).total,
    );
  });

  it('a small run into a major country carries no surcharge', () => {
    let state = seedHome(fundedCalm('small-major'), { weed: 40 });
    state = withStashIn(state, 'miami');
    const intent: ShipIntent = {
      type: 'ship',
      product: 'weed',
      qty: 20,
      fromStashId: 'stash-home',
      toStashId: 'stash-miami',
      mode: 'go-fast',
    };
    expect(
      interdictionBreakdown(state, intent).terms.some((t) => t.label.includes('payroll coverage')),
    ).toBe(false);
  });
});
