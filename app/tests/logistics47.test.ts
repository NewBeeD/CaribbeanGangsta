/**
 * Prompt 47 — Logistics v2: bulk transports, owned vessels, concurrency
 * (design/13 E). The five-mode charter table, the owned-vessel money sink, the
 * people-are-the-capacity concurrency model, the itemized odds quote, and the
 * v16→v17 empty-fleet migration.
 */

import { describe, expect, it } from 'vitest';
import {
  ARREST_CHOICE_KIND,
  DEFAULT_GAME_CONFIG,
  SCHEMA_VERSION,
  TRANSPORTS,
  VESSELS,
  buyVessel,
  createInitialState,
  emptyInventory,
  getVessel,
  interdictionBreakdown,
  interdictionChance,
  helmingInFlight,
  ownedVesselForMode,
  peopleAvailable,
  peopleOut,
  peopleTotal,
  quoteShipment,
  ship,
  spawnCrew,
  travelStep,
  netWorth,
  vesselsValue,
  vesselCargoCap,
  vesselUpgradeCost,
  type GameState,
  type ProductId,
  type Shipment,
  type ShipIntent,
  type Stash,
  type TransportId,
} from '@/engine';
import { migrateEnvelope } from '@/store';

// --- Fixtures -----------------------------------------------------------------

function seedHome(
  state: GameState,
  opts: { cash?: number; clean?: number; inventory?: Partial<Record<ProductId, number>> },
): GameState {
  const home = state.stashes[0] as Stash;
  const nextHome: Stash = {
    ...home,
    dirtyCash: opts.cash ?? home.dirtyCash,
    inventory: { ...home.inventory, ...(opts.inventory ?? {}) },
  };
  return {
    ...state,
    cleanCash: opts.clean ?? state.cleanCash,
    stashes: [nextHome, ...state.stashes.slice(1)],
  };
}

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

/** A well-funded run with a big cocaine pile at home and a Miami foothold. */
function fixture(seedKey = 'logistics47'): GameState {
  let state = createInitialState(seedKey);
  state = seedHome(state, {
    cash: 5_000_000,
    clean: 100_000_000,
    inventory: { cocaine: 5_000 },
  });
  state = withStashIn(state, 'miami');
  return state;
}

function shipIntent(mode: TransportId, qty: number, extra: Partial<ShipIntent> = {}): ShipIntent {
  return {
    type: 'ship',
    product: 'cocaine',
    qty,
    fromStashId: 'stash-home',
    toStashId: 'stash-miami',
    mode,
    ...extra,
  };
}

// --- Five modes ---------------------------------------------------------------

describe('the five-mode charter table (design/13 E)', () => {
  it('adds container-ship and semi-sub as bulk charters, all quotable & resolvable', () => {
    const state = fixture();
    for (const mode of TRANSPORTS) {
      const qty = Math.min(20, mode.cargoCap);
      const quote = quoteShipment(state, shipIntent(mode.id, qty));
      expect(quote.ok).toBe(true);
      expect(quote.transportCost).toBeGreaterThan(0);
      // The launch charges exactly the quote (or rejects) — no hidden math.
      const result = ship(state, shipIntent(mode.id, qty));
      expect(result.ok).toBe(true);
    }
  });

  it('container-ship moves ~2,000 units in one leg at the cheapest per-unit cost', () => {
    const state = fixture();
    const container = shipIntent('container-ship', 2_000);
    const quote = quoteShipment(state, container);
    expect(quote.ok).toBe(true); // 2,000 fits the container hold
    expect(quote.cargoCap).toBe(2_000);

    // Per-unit cost at each mode's full hold — container ship is the cheapest.
    const perUnit = (mode: TransportId, qty: number): number =>
      quoteShipment(state, shipIntent(mode, qty)).transportCost / qty;
    const containerPer = perUnit('container-ship', 2_000);
    for (const mode of TRANSPORTS) {
      if (mode.id === 'container-ship') continue;
      expect(containerPer).toBeLessThan(perUnit(mode.id, mode.cargoCap));
    }
  });

  it('semi-sub shows the lowest displayed odds for identical cargo', () => {
    const state = fixture();
    const odds = (mode: TransportId): number =>
      interdictionChance(state, shipIntent(mode, 20));
    const semi = odds('semi-sub');
    for (const mode of TRANSPORTS) {
      if (mode.id === 'semi-sub') continue;
      expect(semi).toBeLessThan(odds(mode.id));
    }
  });
});

// --- Owned vessels ------------------------------------------------------------

describe('owned vessels — the late-game money sink (design/13 E)', () => {
  it('buying debits clean cash, keeps net worth (asset), and rejects a second buy', () => {
    const state = fixture();
    const before = netWorth(state);
    const cfg = getVessel('owned-go-fast');

    const bought = buyVessel(state, 'owned-go-fast');
    expect(bought.rejected).toBeUndefined();
    expect(bought.state.cleanCash).toBe(state.cleanCash - cfg.buyIn);
    expect(bought.state.vessels).toHaveLength(1);
    // Value moved into the asset — net worth is unchanged, not dented.
    expect(vesselsValue(bought.state)).toBe(cfg.buyIn);
    expect(netWorth(bought.state)).toBe(before);

    // Second buy of the same id rejects without mutating.
    const again = buyVessel(bought.state, 'owned-go-fast');
    expect(again.rejected).toBe('already-owned');
    expect(again.state).toBe(bought.state);
  });

  it('an owned vessel removes the owner cut and discounts its legs', () => {
    const base = fixture();
    const charterQuote = quoteShipment(base, shipIntent('go-fast', 100));
    expect(charterQuote.ownerCut).toBeGreaterThan(0);
    expect(charterQuote.usingOwnedVessel).toBe(false);

    const owned = buyVessel(base, 'owned-go-fast').state;
    const ownedQuote = quoteShipment(owned, shipIntent('go-fast', 100));
    expect(ownedQuote.usingOwnedVessel).toBe(true);
    expect(ownedQuote.ownerCut).toBe(0);
    // The leg is discounted by the config fraction.
    const discount = getVessel('owned-go-fast').legDiscount;
    expect(ownedQuote.transportCost).toBe(Math.round(charterQuote.transportCost * (1 - discount)));
    expect(ownedVesselForMode(owned, 'go-fast')).not.toBeNull();
  });

  it('upgrades raise the cargo cap on the ×1.15 family curve', () => {
    const owned = buyVessel(fixture(), 'owned-container-ship').state;
    const vessel = owned.vessels[0]!;
    const base = getVessel('owned-container-ship').baseCargoCap;
    expect(vesselCargoCap(vessel, DEFAULT_GAME_CONFIG.vessels)).toBe(base);
    const l2 = { ...vessel, level: 2 };
    expect(vesselCargoCap(l2, DEFAULT_GAME_CONFIG.vessels)).toBe(Math.round(base * 1.15));
    expect(vesselUpgradeCost('owned-container-ship', 1, DEFAULT_GAME_CONFIG.vessels)).toBe(
      Math.round(getVessel('owned-container-ship').buyIn * 1.15),
    );
  });
});

// --- Concurrency: people are the capacity -------------------------------------

/** 5 crew + you, plenty of cargo, a Miami foothold. */
function crewedFixture(): GameState {
  const state = fixture('concurrency47');
  const crew = ['deon', 'marco', 'yolanda', 'tpopz', 'reyes'].map((id) => spawnCrew(id));
  return { ...state, crew };
}

describe('concurrency — people are the capacity (design/13 E worked example)', () => {
  it('5 crew + you: a 2-run, a 3-run, a solo helm — then a 4th launch rejects', () => {
    let state = crewedFixture();
    const ids = state.crew.map((c) => c.id);
    expect(peopleTotal(state)).toBe(6);
    expect(peopleOut(state)).toBe(0);

    // Send 2 to England (Miami stands in) → 4 left.
    const runA = ship(state, shipIntent('go-fast', 50, { courierIds: [ids[0]!, ids[1]!] }));
    expect(runA.ok).toBe(true);
    state = runA.state;
    expect(peopleOut(state)).toBe(2);
    expect(peopleAvailable(state)).toBe(4);

    // Send 3 on another run → 1 left (you).
    const runB = ship(state, shipIntent('go-fast', 50, { courierIds: [ids[2]!, ids[3]!, ids[4]!] }));
    expect(runB.ok).toBe(true);
    state = runB.state;
    expect(peopleOut(state)).toBe(5);
    expect(peopleAvailable(state)).toBe(1);

    // Helm a run yourself (solo) → 0 available.
    const runC = ship(state, shipIntent('go-fast', 50));
    expect(runC.ok).toBe(true);
    state = runC.state;
    expect(helmingInFlight(state)).toBe(true);
    expect(peopleOut(state)).toBe(6);
    expect(peopleAvailable(state)).toBe(0);

    // A fourth launch rejects with readable copy — no crew idle, you're at a helm.
    const solo4 = ship(state, shipIntent('go-fast', 50));
    expect(solo4.ok).toBe(false);
    expect(solo4.rejected).toBe('helm-busy');
    expect(solo4.state).toBe(state);
    const consigned4 = ship(state, shipIntent('go-fast', 50, { courierIds: [ids[0]!] }));
    expect(consigned4.ok).toBe(false);
    expect(consigned4.rejected).toBe('courier-not-idle');
  });

  it('a returning run frees exactly its people', () => {
    let state = crewedFixture();
    const ids = state.crew.map((c) => c.id);
    // Run A is a fast plane (arrives first); run B a slower go-fast.
    state = ship(state, shipIntent('plane', 50, { courierIds: [ids[0]!, ids[1]!] })).state;
    state = ship(state, shipIntent('go-fast', 50, { courierIds: [ids[2]!, ids[3]!] })).state;
    expect(peopleOut(state)).toBe(4);

    const runA = state.shipments[0]!;
    const runB = state.shipments[1]!;
    expect(runA.arrivesAtHours).toBeLessThan(runB.arrivesAtHours);

    // Advance the clock to just past run A only, then resolve.
    state = { ...state, clock: { ...state.clock, hours: runA.arrivesAtHours } };
    state = travelStep(state, 1);

    // Run A is gone (delivered or seized) and its two people are idle again;
    // run B and its two are still out — exactly A's people were freed.
    expect(state.shipments.some((s) => s.id === runA.id)).toBe(false);
    expect(state.shipments.some((s) => s.id === runB.id)).toBe(true);
    expect(peopleOut(state)).toBe(2);
    for (const id of [ids[0]!, ids[1]!]) {
      expect(state.crew.find((c) => c.id === id)!.assignment.kind).toBe('idle');
    }
  });

  it('a person on an in-flight run cannot be assigned to another run', () => {
    let state = crewedFixture();
    const ids = state.crew.map((c) => c.id);
    state = ship(state, shipIntent('go-fast', 50, { courierIds: [ids[0]!] })).state;
    expect(state.crew.find((c) => c.id === ids[0])!.assignment.kind).toBe('courier');
    // Reusing that courier on a second run rejects.
    const reuse = ship(state, shipIntent('go-fast', 50, { courierIds: [ids[0]!] }));
    expect(reuse.ok).toBe(false);
    expect(reuse.rejected).toBe('courier-not-idle');
  });

  it('escorts each lower the shown odds and each take a cut', () => {
    const state = crewedFixture();
    const ids = state.crew.map((c) => c.id);
    const one = quoteShipment(state, shipIntent('go-fast', 50, { courierIds: [ids[0]!] }));
    const two = quoteShipment(state, shipIntent('go-fast', 50, { courierIds: [ids[0]!, ids[1]!] }));
    const three = quoteShipment(
      state,
      shipIntent('go-fast', 50, { courierIds: [ids[0]!, ids[1]!, ids[2]!] }),
    );
    // Each ADDITIONAL escort strictly lowers the displayed odds.
    expect(two.interdictionChance).toBeLessThan(one.interdictionChance);
    expect(three.interdictionChance).toBeLessThan(two.interdictionChance);
    // Each courier takes an equal cut — the total scales linearly.
    expect(two.courierCut).toBe(one.courierCut * 2);
    expect(three.courierCut).toBe(one.courierCut * 3);
  });
});

// --- Helming routes into the Prompt 44 arrest ---------------------------------

describe('helming discloses and routes into the self-run arrest (design/13 B4/E)', () => {
  function dueShipment(over: Partial<Shipment>): Shipment {
    return {
      id: 'ship-x',
      product: 'cocaine',
      qty: 50,
      fromStashId: 'stash-home',
      toStashId: 'stash-miami',
      mode: 'go-fast',
      courierIds: [],
      departedAtHours: 0,
      arrivesAtHours: 0,
      interdictionChance: 1, // guaranteed seize (any roll < 1)
      skimUnits: 0,
      ...over,
    };
  }

  it('a solo run is disclosed and, when seized, fires the arrest interrupt', () => {
    const base = fixture();
    expect(quoteShipment(base, shipIntent('go-fast', 50)).soloRun).toBe(true);

    let state: GameState = { ...base, clock: { ...base.clock, hours: 1 }, shipments: [dueShipment({})] };
    state = travelStep(state, 1);
    expect(state.shipments).toHaveLength(0);
    expect(state.pendingChoices.some((c) => c.kind === ARREST_CHOICE_KIND)).toBe(true);
  });

  it('a consigned run never fires the arrest — the courier takes the fall', () => {
    const crew = spawnCrew('deon');
    const base = { ...fixture(), crew: [crew] };
    let state: GameState = {
      ...base,
      clock: { ...base.clock, hours: 1 },
      shipments: [dueShipment({ courierIds: [crew.id] })],
    };
    state = travelStep(state, 1);
    expect(state.pendingChoices.some((c) => c.kind === ARREST_CHOICE_KIND)).toBe(false);
    expect(state.pendingChoices.some((c) => c.kind === 'shipment-seized')).toBe(true);
  });
});

// --- The itemized odds quote --------------------------------------------------

describe('the odds quote is itemized and reconstructs the rolled number exactly', () => {
  it('the listed terms sum through clamp × escorts to the displayed odds', () => {
    const state = crewedFixture();
    const ids = state.crew.map((c) => c.id);
    const intent = shipIntent('go-fast', 60, { courierIds: [ids[0]!, ids[1]!, ids[2]!] });
    const b = interdictionBreakdown(state, intent);

    expect(b.terms.length).toBeGreaterThan(0);
    const summed = b.terms.reduce((n, t) => n + t.contribution, 0);
    expect(summed).toBeCloseTo(b.raw, 10);
    const clamped = Math.min(
      Math.max(b.raw, DEFAULT_GAME_CONFIG.transport.INTERDICTION_MIN),
      DEFAULT_GAME_CONFIG.transport.INTERDICTION_MAX,
    );
    expect(b.clamped).toBeCloseTo(clamped, 10);
    expect(b.escorts).toBe(2); // 3 couriers → 2 escorts
    // The breakdown total IS the displayed/rolled odds — byte-identical.
    expect(b.total).toBe(interdictionChance(state, intent));
    expect(quoteShipment(state, intent).oddsBreakdown.total).toBe(b.total);
  });
});

// --- Migration: empty fleet on old saves --------------------------------------

describe('v16 → v17 migration seeds an empty fleet (design/13 E)', () => {
  it('migrates a pre-vessel save to an empty fleet with the new modes/config', () => {
    const current = createInitialState('mig-47');
    // Simulate a real v16 save: no vessels, no config.vessels, the old 3-mode
    // charter table and the pre-retune courier cut.
    const legacyTransport = {
      ...current.config.transport,
      TRANSPORTS: current.config.transport.TRANSPORTS.filter((t) =>
        ['go-fast', 'ferry', 'plane'].includes(t.id),
      ),
      COURIER_CUT_PCT: 0.05,
    };
    const legacyConfig = { ...current.config, transport: legacyTransport } as Record<string, unknown>;
    delete legacyConfig.vessels;
    const legacy = { ...current, config: legacyConfig } as Record<string, unknown>;
    delete legacy.vessels;

    const migrated = migrateEnvelope({
      slot: 's',
      schemaVersion: 16,
      savedAt: 0,
      seed: current.seed,
      runStatus: current.runStatus,
      day: current.clock.day,
      state: legacy as unknown as GameState,
    });

    expect(migrated).not.toBeNull();
    const s = migrated as GameState;
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.vessels).toEqual([]);
    // The new charter modes and the retuned cut ride in via the config backfill.
    expect(s.config.vessels.VESSELS).toEqual(VESSELS);
    expect(s.config.transport.TRANSPORTS.map((t) => t.id).sort()).toEqual([
      'container-ship',
      'ferry',
      'go-fast',
      'plane',
      'semi-sub',
    ]);
    expect(s.config.transport.COURIER_CUT_PCT).toBe(
      DEFAULT_GAME_CONFIG.transport.COURIER_CUT_PCT,
    );
  });
});
