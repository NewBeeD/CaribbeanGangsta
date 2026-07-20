import { describe, expect, it } from 'vitest';
import { withHomeHeat } from './heatTestUtils';
import {
  ARREST_CHOICE_KIND,
  COURIER_CUT_PCT,
  COURIER_SKIM_PCT,
  CONSIGNED_BUST_HEAT_FACTOR,
  INTERDICTION_MAX,
  INTERDICTION_MIN,
  TRANSPORTS,
  applyIntent,
  createInitialState,
  heatOf,
  emptyInventory,
  getMarketPrice,
  getProduct,
  getTransport,
  interdictionChance,
  moveProduct,
  quoteShipment,
  settleOffline,
  ship,
  spawnCrew,
  tick,
  travelStep,
  type GameState,
  type ProductId,
  type ShipIntent,
  type Stash,
} from '@/engine';

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
  opts: { inventory?: Partial<Record<ProductId, number>>; type?: Stash['type'] } = {},
): GameState {
  const stash: Stash = {
    id: `stash-${countryId}`,
    name: `${countryId} stash`,
    countryId,
    type: opts.type ?? 'safehouse',
    dirtyCash: 0,
    inventory: { ...emptyInventory(), ...(opts.inventory ?? {}) },
  };
  return { ...state, stashes: [...state.stashes, stash] };
}

/** A funded run with cocaine at home and a Miami foothold to ship to. */
function fixture(seedKey = 'travel'): { state: GameState; intent: ShipIntent } {
  let state = createInitialState(seedKey);
  state = seedHome(state, { cash: 5_000_000, inventory: { cocaine: 40 } });
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

const home = (state: GameState): Stash => state.stashes[0] as Stash;
const pool = (state: GameState): number => home(state).dirtyCash + state.cleanCash;

describe('transport config — the mode table (design/11 §3)', () => {
  it('ships five modes, all priced, all open from minute one (cash is the gate)', () => {
    // Prompt 47 (design/13 E) adds the two bulk charter modes to the original trio.
    expect(TRANSPORTS.map((t) => t.id).sort()).toEqual([
      'container-ship',
      'ferry',
      'go-fast',
      'plane',
      'semi-sub',
    ]);
    for (const t of TRANSPORTS) {
      expect(t.costPerDistance).toBeGreaterThan(0);
      expect(t.cargoCap).toBeGreaterThan(0);
      expect(t.hoursPerDistance).toBeGreaterThan(0);
      expect(t.baseRisk).toBeGreaterThan(0);
      expect(t.baseRisk).toBeLessThan(1);
    }
  });

  it('encodes the trade-off: ferry cheap/slow/low-risk, plane dear/fast, go-fast big + owner cut', () => {
    const ferry = getTransport('ferry');
    const plane = getTransport('plane');
    const goFast = getTransport('go-fast');
    expect(ferry.costPerDistance).toBeLessThan(goFast.costPerDistance);
    expect(goFast.costPerDistance).toBeLessThan(plane.costPerDistance);
    expect(plane.hoursPerDistance).toBeLessThan(goFast.hoursPerDistance);
    expect(ferry.baseRisk).toBeLessThan(plane.baseRisk);
    expect(plane.baseRisk).toBeLessThan(goFast.baseRisk);
    expect(goFast.cargoCap).toBeGreaterThan(plane.cargoCap);
    // Only the go-fast's owner takes a taste of the load (Ideas2 §1).
    expect(goFast.ownerCutPct).toBeGreaterThan(0);
    expect(ferry.ownerCutPct).toBeUndefined();
    expect(plane.ownerCutPct).toBeUndefined();
  });
});

describe('quoteShipment — every number disclosed, charged exactly as quoted', () => {
  it('launch charges exactly the quoted total (transport + owner cut), from the stash pool', () => {
    const { state, intent } = fixture();
    const quote = quoteShipment(state, intent);
    expect(quote.ok).toBe(true);
    expect(quote.transportCost).toBeGreaterThan(0);
    // Go-fast: the owner's cut is the configured % of the cargo's destination value.
    const cargoValue = getMarketPrice(state, 'cocaine', 'miami').price * intent.qty;
    expect(quote.cargoValue).toBe(cargoValue);
    expect(quote.ownerCut).toBe(Math.round(cargoValue * getTransport('go-fast').ownerCutPct!));
    expect(quote.courierCut).toBe(0); // solo run — no couriers, no cuts
    expect(quote.totalCost).toBe(quote.transportCost + quote.ownerCut);

    const result = ship(state, intent);
    expect(result.ok).toBe(true);
    expect(result.quote).toEqual(quote);
    expect(pool(state) - pool(result.state)).toBe(quote.totalCost);
    expect(home(result.state).inventory.cocaine).toBe(20); // cargo left the stash
    expect(result.state.shipments).toHaveLength(1);
    // The odds snapshotted on the shipment ARE the quoted odds (fairness law).
    expect(result.shipment?.interdictionChance).toBe(quote.interdictionChance);
    expect(quote.interdictionChance).toBe(interdictionChance(state, intent));
  });

  it('clean (borrowed) cash covers a launch the stash cash alone cannot (design/10)', () => {
    const { state, intent } = fixture();
    const quote = quoteShipment(state, intent);
    const broke = { ...seedHome(state, { cash: 100 }), cleanCash: quote.totalCost };
    const result = ship(broke, intent);
    expect(result.ok).toBe(true);
    expect(home(result.state).dirtyCash).toBe(0); // dirty drains first
    expect(result.state.cleanCash).toBe(100); // clean paid only the shortfall
  });

  it('each added escort strictly lowers the displayed odds; totals stay clamped', () => {
    let { state } = fixture();
    state = {
      ...state,
      crew: [spawnCrew('deon'), spawnCrew('marco'), spawnCrew('yolanda')],
    };
    const withCouriers = (ids: string[]): ShipIntent => ({
      type: 'ship',
      product: 'cocaine',
      qty: 20,
      fromStashId: 'stash-home',
      toStashId: 'stash-miami',
      mode: 'go-fast',
      courierIds: ids,
    });

    const solo = quoteShipment(state, withCouriers([]));
    const one = quoteShipment(state, withCouriers(['crew-deon']));
    const two = quoteShipment(state, withCouriers(['crew-deon', 'crew-marco']));
    const three = quoteShipment(
      state,
      withCouriers(['crew-deon', 'crew-marco', 'crew-yolanda']),
    );

    // The first courier is the runner; each ADDITIONAL one is an escort.
    expect(one.interdictionChance).toBe(solo.interdictionChance);
    expect(two.interdictionChance).toBeLessThan(one.interdictionChance);
    expect(three.interdictionChance).toBeLessThan(two.interdictionChance);
    for (const q of [solo, one, two, three]) {
      expect(q.interdictionChance).toBeGreaterThan(0);
      expect(q.interdictionChance).toBeLessThanOrEqual(INTERDICTION_MAX);
    }

    // Every courier adds the same disclosed cut of the cargo's value.
    const perCourier = Math.round(one.cargoValue * COURIER_CUT_PCT);
    expect(one.courierCut).toBe(perCourier);
    expect(two.courierCut).toBe(perCourier * 2);
    expect(three.courierCut).toBe(perCourier * 3);
    expect(three.totalCost).toBe(three.transportCost + three.ownerCut + three.courierCut);
  });

  it('a courier mid-betrayal-arc telegraphs a disclosed skim — never a hidden roll', () => {
    let { state, intent } = fixture();
    const shaky = spawnCrew('deon', {
      loyalty: 30,
      activeArc: {
        stage: 'warning',
        startedAtHours: 0,
        advancedAtHours: 0,
        sign: 'Deon has been distant.',
      },
    });
    state = { ...state, crew: [shaky] };
    intent = { ...intent, courierIds: [shaky.id] };

    const quote = quoteShipment(state, intent);
    expect(quote.courierWarnings).toEqual([shaky.name]);
    expect(quote.skimUnits).toBe(Math.floor(intent.qty * COURIER_SKIM_PCT));
    expect(quote.skimUnits).toBeGreaterThan(0);
  });
});

describe('ship — rejections never mutate state', () => {
  it('rejects invalid qty, unknown stash, same-country, over-cap, no funds, busy courier', () => {
    const { state, intent } = fixture();

    const zero = ship(state, { ...intent, qty: 0 });
    expect(zero.rejected).toBe('invalid-qty');
    expect(zero.state).toBe(state);

    const ghost = ship(state, { ...intent, fromStashId: 'stash-nowhere' });
    expect(ghost.rejected).toBe('no-stash');
    expect(ghost.state).toBe(state);

    // Two stashes in the SAME country move via storage.moveProduct, not a boat.
    const local = withStashIn(state, home(state).countryId, {});
    const sameCountry = ship(local, {
      ...intent,
      toStashId: `stash-${home(state).countryId}`,
    });
    expect(sameCountry.rejected).toBe('same-country');
    expect(sameCountry.state).toBe(local);

    const heavy = seedHome(state, { inventory: { cocaine: 500 } });
    const overCap = ship(heavy, { ...intent, qty: 401 }); // go-fast caps at 400
    expect(overCap.rejected).toBe('over-cargo-cap');
    expect(overCap.state).toBe(heavy);

    const broke = { ...seedHome(state, { cash: 0 }), cleanCash: 0 };
    const unfunded = ship(broke, intent);
    expect(unfunded.rejected).toBe('insufficient-funds');
    expect(unfunded.state).toBe(broke);

    const busy = {
      ...state,
      crew: [spawnCrew('deon', { assignment: { kind: 'guard', targetId: 'stash-home' } })],
    };
    const notIdle = ship(busy, { ...intent, courierIds: ['crew-deon'] });
    expect(notIdle.rejected).toBe('courier-not-idle');
    expect(notIdle.state).toBe(busy);

    const nobody = ship(state, { ...intent, courierIds: ['crew-ghost'] });
    expect(nobody.rejected).toBe('no-courier');
    expect(nobody.state).toBe(state);
  });

  it('rejects insufficient inventory without mutating', () => {
    const { state, intent } = fixture();
    const light = seedHome(state, { inventory: { cocaine: 5 } });
    const result = ship(light, intent);
    expect(result.rejected).toBe('insufficient-inventory');
    expect(result.state).toBe(light);
  });
});

describe('moveProduct — same-country stays instant/free; cross-country is a shipment', () => {
  it('moves instantly within a country and rejects across countries', () => {
    let { state } = fixture();
    state = withStashIn(state, home(state).countryId, {});
    const localId = `stash-${home(state).countryId}`;

    const local = moveProduct(state, 'stash-home', localId, 'cocaine', 10);
    expect(local.ok).toBe(true); // instant, free, no shipment involved

    const abroad = moveProduct(state, 'stash-home', 'stash-miami', 'cocaine', 10);
    expect(abroad.ok).toBe(false);
    expect(abroad.rejected).toBe('cross-country');
    expect(abroad.state).toBe(state);
  });
});

describe('travelStep — the fairness law on the water (GDD §8)', () => {
  it('observed seizure frequency ≈ the displayed odds over 50k runs', { timeout: 60_000 }, () => {
    const { state, intent } = fixture('travel-mc');
    const launched = ship(state, intent);
    expect(launched.ok).toBe(true);
    const shipment = launched.shipment!;
    const p = shipment.interdictionChance;
    expect(p).toBeGreaterThan(INTERDICTION_MIN);

    const dueClock = { ...launched.state.clock, hours: shipment.arrivesAtHours };
    const N = 50_000;
    let seizures = 0;
    let rngState = launched.state.rngState;
    for (let i = 0; i < N; i++) {
      // Hold the shipment constant, thread the RNG forward (the deal-loop pattern).
      const trial: GameState = { ...launched.state, clock: dueClock, rngState };
      const resolved = travelStep(trial, 1);
      const scene = resolved.pendingChoices.at(-1);
      // The fixture ships SOLO, so an interdiction presents as the arrest
      // interrupt (design/13 B4) rather than a plain seizure scene.
      if (scene?.kind === ARREST_CHOICE_KIND) seizures++;
      else expect(scene?.kind).toBe('shipment-arrived');
      expect(resolved.shipments).toHaveLength(0); // resolved either way
      rngState = resolved.rngState;
    }
    expect(seizures / N).toBeCloseTo(p, 2); // within ~0.005
  });

  it('an arrival delivers the cargo, frees the couriers, and queues a scene', () => {
    let { state, intent } = fixture('travel-arrive');
    state = { ...state, crew: [spawnCrew('deon'), spawnCrew('marco')] };
    intent = { ...intent, courierIds: ['crew-deon', 'crew-marco'] };
    const launched = ship(state, intent);
    expect(launched.ok).toBe(true);
    // Couriers are riding while the load is in flight.
    for (const c of launched.state.crew) {
      expect(c.assignment).toEqual({ kind: 'courier', targetId: launched.shipment!.id });
    }

    // Walk ticks forward until this shipment resolves (arrival or seizure).
    let next = launched.state;
    for (let i = 0; i < 10 && next.shipments.length > 0; i++) next = tick(next, 6);
    expect(next.shipments).toHaveLength(0);

    const scene = next.pendingChoices.find((c) =>
      ['shipment-arrived', 'shipment-seized'].includes(c.kind),
    );
    expect(scene).toBeDefined();
    for (const c of next.crew) expect(c.assignment.kind).toBe('idle');

    if (scene?.kind === 'shipment-arrived') {
      const dest = next.stashes.find((s) => s.id === 'stash-miami')!;
      expect(dest.inventory.cocaine).toBe(20);
    } else {
      // Seized: only THIS cargo is gone — the origin stash keeps the rest.
      expect(home(next).inventory.cocaine).toBe(20);
    }
  });

  it('a seizure takes only that cargo, and a consigned bust heats you far less than a solo one', () => {
    const seizureHeatDelta = (courierIds: readonly string[]): number => {
      let { state, intent } = fixture('travel-seize');
      state = { ...withHomeHeat(state, 10), crew: [spawnCrew('deon')] };
      intent = { ...intent, qty: 5, courierIds };
      const launched = ship(state, intent);
      expect(launched.ok).toBe(true);
      const shipment = launched.shipment!;
      const dueClock = { ...launched.state.clock, hours: shipment.arrivesAtHours };

      // Thread the RNG until the roll lands under the displayed odds.
      let rngState = launched.state.rngState;
      for (let i = 0; i < 5_000; i++) {
        const trial: GameState = { ...launched.state, clock: dueClock, rngState };
        const resolved = travelStep(trial, 1);
        const last = resolved.pendingChoices.at(-1)?.kind;
        // Solo interdictions present as the arrest interrupt (design/13 B4);
        // consigned ones keep the plain seizure scene.
        if (last === 'shipment-seized' || last === ARREST_CHOICE_KIND) {
          // Other stashes untouched — a loss is never a wipe (design/11 §3).
          expect(home(resolved).inventory.cocaine).toBe(35);
          expect(home(resolved).dirtyCash).toBe(home(launched.state).dirtyCash);
          expect(resolved.shipments).toHaveLength(0);
          // The spike lands on the DESTINATION country (per-country heat, v30).
          return heatOf(resolved, 'miami') - heatOf(trial, 'miami');
        }
        rngState = resolved.rngState;
      }
      throw new Error('no seizure observed in 5k trials');
    };

    const cfg = getProduct('cocaine');
    const soloSpike = seizureHeatDelta([]);
    const consignedSpike = seizureHeatDelta(['crew-deon']);
    expect(soloSpike).toBeCloseTo(cfg.heatPerUnit * 5 * cfg.bustHeatMultiplier, 5);
    expect(consignedSpike).toBeCloseTo(soloSpike * CONSIGNED_BUST_HEAT_FACTOR, 5);
  });

  it('defers delivery when the destination is full — cargo waits, never lost', () => {
    const { intent } = fixture('travel-full');
    let { state } = fixture('travel-full');
    // A floor stash in Miami holds 50; pack it to 45 so 20 more can't land.
    state = {
      ...state,
      stashes: state.stashes.map((s) =>
        s.id === 'stash-miami'
          ? { ...s, type: 'floor' as const, inventory: { ...s.inventory, weed: 45 } }
          : s,
      ),
    };
    const launched = ship(state, intent);
    expect(launched.ok).toBe(true);
    const shipment = launched.shipment!;

    // Find a NON-seized resolution attempt: with the port full it must defer.
    const dueClock = { ...launched.state.clock, hours: shipment.arrivesAtHours };
    let rngState = launched.state.rngState;
    for (let i = 0; i < 100; i++) {
      const trial: GameState = { ...launched.state, clock: dueClock, rngState };
      const resolved = travelStep(trial, 1);
      const last = resolved.pendingChoices.at(-1)?.kind;
      if (last === 'shipment-seized' || last === ARREST_CHOICE_KIND) {
        rngState = resolved.rngState;
        continue;
      }
      // Not seized and nowhere to land: still in flight, marked cleared,
      // nothing lost — and the survived roll is never re-rolled.
      expect(resolved.shipments).toHaveLength(1);
      expect(resolved.shipments[0]?.cleared).toBe(true);
      expect(resolved.stashes.find((s) => s.id === 'stash-miami')!.inventory.cocaine).toBe(0);

      // Free up the port; the next tick delivers WITHOUT consuming the RNG.
      const roomy: GameState = {
        ...resolved,
        stashes: resolved.stashes.map((s) =>
          s.id === 'stash-miami' ? { ...s, inventory: { ...s.inventory, weed: 0 } } : s,
        ),
      };
      const delivered = travelStep(roomy, 1);
      expect(delivered.rngState).toEqual(roomy.rngState); // no re-roll (fairness)
      expect(delivered.shipments).toHaveLength(0);
      expect(
        delivered.stashes.find((s) => s.id === 'stash-miami')!.inventory.cocaine,
      ).toBe(20);
      return;
    }
    throw new Error('no non-seized resolution observed in 100 trials');
  });
});

describe('offline — in-flight cargo is frozen, never resolved away (GDD §6)', () => {
  it('settleOffline settles nothing on a save with a shipment in flight', () => {
    const { state, intent } = fixture('travel-offline');
    const launched = ship(state, intent);
    const away = settleOffline(launched.state, 1_000);

    expect(away.state.shipments).toEqual(launched.state.shipments);
    expect(away.state.countryHeat).toEqual(launched.state.countryHeat);
    expect(away.state.notoriety).toBe(launched.state.notoriety);
    const dest = away.state.stashes.find((s) => s.id === 'stash-miami')!;
    expect(dest.inventory.cocaine).toBe(0); // never arrived while away
    expect(
      away.state.pendingChoices.some((c) =>
        ['shipment-arrived', 'shipment-seized'].includes(c.kind),
      ),
    ).toBe(false); // and never seized either
  });
});

describe('determinism — same seed + same intents → identical state', () => {
  it('replays a ship + tick sequence to a deep-equal state', () => {
    const run = (): GameState => {
      const { state, intent } = fixture('travel-det');
      let next = applyIntent(state, intent);
      next = tick(next, 4);
      next = tick(next, 4);
      next = tick(next, 8);
      return next;
    };
    expect(run()).toEqual(run());
  });
});
