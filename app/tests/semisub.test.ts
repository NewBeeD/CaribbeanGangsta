/**
 * Semi-sub charter sourcing (v24 — the user-signed open-access exception).
 * A CHARTERED semi-sub launches only from its yards (`SEMI_SUB_CHARTER_ORIGINS`
 * — Colombia/Mexico: buy from the plug there and the sub is on the dock); an
 * OWNED semi-sub (`owned-semi-sub`, the $20M sink) launches from anywhere.
 * Leg-ORIGIN gated: provenance of the cargo is never tracked. Every other mode
 * stays open from everywhere (the open-access guardrail holds outside this one
 * signed rule).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  SCHEMA_VERSION,
  SEMI_SUB_CHARTER_ORIGINS,
  TRANSPORTS,
  buyVessel,
  createInitialState,
  emptyInventory,
  modeAvailableFrom,
  quoteShipment,
  ship,
  type GameState,
  type ProductId,
  type ShipIntent,
  type Stash,
  type TransportId,
} from '@/engine';
import { migrateEnvelope } from '@/store';
import { modeOptions } from '@/ui/screens/shipmentDesk.model';

// --- Fixtures -----------------------------------------------------------------

function withStashIn(
  state: GameState,
  countryId: string,
  inventory: Partial<Record<ProductId, number>> = {},
): GameState {
  const stash: Stash = {
    id: `stash-${countryId}`,
    name: `${countryId} stash`,
    countryId,
    type: 'safehouse',
    dirtyCash: 0,
    inventory: { ...emptyInventory(), ...inventory },
  };
  return { ...state, stashes: [...state.stashes, stash] };
}

/** A funded run with cocaine at home, in Colombia, and in Mexico; Miami to land in. */
function fixture(seedKey = 'semisub'): GameState {
  let state = createInitialState(seedKey);
  const home = state.stashes[0] as Stash;
  state = {
    ...state,
    cleanCash: 100_000_000,
    stashes: [
      { ...home, dirtyCash: 5_000_000, inventory: { ...home.inventory, cocaine: 2_000 } },
      ...state.stashes.slice(1),
    ],
  };
  state = withStashIn(state, 'miami');
  state = withStashIn(state, 'colombia', { cocaine: 2_000 });
  state = withStashIn(state, 'mexico', { cocaine: 2_000 });
  return state;
}

function intentFrom(fromStashId: string, mode: TransportId = 'semi-sub'): ShipIntent {
  return {
    type: 'ship',
    product: 'cocaine',
    qty: 20,
    fromStashId,
    toStashId: 'stash-miami',
    mode,
  };
}

// --- The sourcing rule --------------------------------------------------------

describe('semi-sub charter sourcing (v24 — leg-origin gated to the yards)', () => {
  it('names Colombia and Mexico as the yards, as config (not literals)', () => {
    expect(SEMI_SUB_CHARTER_ORIGINS).toEqual(['colombia', 'mexico']);
    expect(DEFAULT_GAME_CONFIG.transport.SEMI_SUB_CHARTER_ORIGINS).toEqual(
      SEMI_SUB_CHARTER_ORIGINS,
    );
  });

  it('charters a semi-sub out of Colombia and Mexico (buy from the plug, sub on the dock)', () => {
    const state = fixture();
    for (const from of ['stash-colombia', 'stash-mexico']) {
      const quote = quoteShipment(state, intentFrom(from));
      expect(quote.ok).toBe(true);
      const result = ship(state, intentFrom(from));
      expect(result.ok).toBe(true);
    }
  });

  it('rejects a semi-sub charter from anywhere else, with the readable reason', () => {
    const state = fixture();
    const home = state.stashes[0] as Stash;
    expect(SEMI_SUB_CHARTER_ORIGINS).not.toContain(home.countryId);

    const quote = quoteShipment(state, intentFrom('stash-home'));
    expect(quote.ok).toBe(false);
    expect(quote.rejected).toBe('semi-sub-origin');
    // Rejections never mutate state.
    const result = ship(state, intentFrom('stash-home'));
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe('semi-sub-origin');
    expect(result.state).toBe(state);
  });

  it('owning the semi-sub lifts the gate — the sub is based wherever you are', () => {
    const owned = buyVessel(fixture(), 'owned-semi-sub').state;
    expect(modeAvailableFrom(owned, 'semi-sub', 'england')).toBe(true);

    const quote = quoteShipment(owned, intentFrom('stash-home'));
    expect(quote.ok).toBe(true);
    expect(quote.usingOwnedVessel).toBe(true);
    expect(ship(owned, intentFrom('stash-home')).ok).toBe(true);
    // The yards still work too, of course.
    expect(quoteShipment(owned, intentFrom('stash-colombia')).ok).toBe(true);
  });

  it('gates ONLY the semi-sub — every other mode stays open from everywhere', () => {
    const state = fixture();
    for (const t of TRANSPORTS) {
      if (t.id === 'semi-sub') continue;
      expect(modeAvailableFrom(state, t.id, 'stash-home')).toBe(true);
      const quote = quoteShipment(state, {
        ...intentFrom('stash-home', t.id),
        qty: Math.min(20, t.cargoCap),
      });
      expect(quote.ok).toBe(true);
    }
  });
});

// --- The mode picker discloses the rule ----------------------------------------

describe('the mode picker greys the semi-sub with its reason (never a silent lock)', () => {
  it('marks the semi-sub unavailable away from the yards, with the WHY', () => {
    const state = fixture();
    const homeRow = modeOptions(state, 'stash-home').find((m) => m.id === 'semi-sub')!;
    expect(homeRow.available).toBe(false);
    expect(homeRow.unavailableHint).toMatch(/Colombia or Mexico/);
    // Every other mode is untouched.
    for (const m of modeOptions(state, 'stash-home')) {
      if (m.id === 'semi-sub') continue;
      expect(m.available).toBe(true);
      expect(m.unavailableHint).toBeUndefined();
    }
  });

  it('offers the semi-sub in the yards, and everywhere once owned', () => {
    const state = fixture();
    expect(modeOptions(state, 'stash-colombia').find((m) => m.id === 'semi-sub')!.available).toBe(
      true,
    );
    expect(modeOptions(state, 'stash-mexico').find((m) => m.id === 'semi-sub')!.available).toBe(
      true,
    );
    const owned = buyVessel(state, 'owned-semi-sub').state;
    const row = modeOptions(owned, 'stash-home').find((m) => m.id === 'semi-sub')!;
    expect(row.available).toBe(true);
    expect(row.owned).toBe(true);
  });
});

// --- Migration ------------------------------------------------------------------

describe('v23 → v24 migration backfills the sourcing knob', () => {
  it('lands SEMI_SUB_CHARTER_ORIGINS from the default; saved tuning survives', () => {
    const current = createInitialState('mig-semisub');
    // A real v23 save: the transport group without the new knob.
    const legacyTransport = { ...current.config.transport } as Record<string, unknown>;
    delete legacyTransport.SEMI_SUB_CHARTER_ORIGINS;
    const legacy = {
      ...current,
      config: { ...current.config, transport: legacyTransport },
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      slot: 's',
      schemaVersion: 23,
      savedAt: 0,
      seed: current.seed,
      runStatus: current.runStatus,
      day: current.clock.day,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    const s = migrated as GameState;
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.config.transport.SEMI_SUB_CHARTER_ORIGINS).toEqual(SEMI_SUB_CHARTER_ORIGINS);
    // Nothing the player holds moved.
    expect(s.cleanCash).toBe(current.cleanCash);
    expect(s.stashes).toEqual(current.stashes);
  });
});
