import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createInitialState,
  createRng,
  DEFAULT_GAME_CONFIG,
  effectiveCapacity,
  rngFor,
  spawnCrew,
  totalDirtyCash,
  totalUnits,
  SCHEMA_VERSION,
  type GameState,
  type Stash,
} from '@/engine';
import {
  LocalSaveStore,
  CloudSaveStore,
  migrateEnvelope,
  NotImplementedError,
} from '@/store';

/** A LocalSaveStore over a fresh, isolated in-memory IndexedDB. */
function freshStore(now = () => 1_700_000_000_000): LocalSaveStore {
  return new LocalSaveStore({ factory: new IDBFactory(), now });
}

describe('LocalSaveStore — round-trip (Prompt 03 acceptance)', () => {
  it('round-trips a run to a deep-equal state, RNG state included', async () => {
    const store = freshStore();
    const state = createInitialState('save-me');

    // The next deal roll BEFORE saving.
    const rollBeforeSave = rngFor(state).next();

    await store.save('slot-a', state);
    const loaded = await store.load('slot-a');

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(state);

    // The next deal roll AFTER load matches — randomness resumed exactly.
    const rollAfterLoad = rngFor(loaded as GameState).next();
    expect(rollAfterLoad).toBe(rollBeforeSave);
  });

  it('returns null for an unknown slot', async () => {
    const store = freshStore();
    expect(await store.load('nope')).toBeNull();
  });

  it('lists slot metadata newest-first and deletes slots', async () => {
    const store = new LocalSaveStore({
      factory: new IDBFactory(),
      now: (() => {
        let t = 1000;
        return () => (t += 1000);
      })(),
    });
    await store.save('older', createInitialState('a'));
    await store.save('newer', createInitialState('b'));

    const list = await store.list();
    expect(list.map((m) => m.slot)).toEqual(['newer', 'older']);
    expect(list[0]).toMatchObject({ schemaVersion: SCHEMA_VERSION, runStatus: 'active' });

    await store.delete('older');
    expect((await store.list()).map((m) => m.slot)).toEqual(['newer']);
  });

  it('overwrites a slot on re-save', async () => {
    const store = freshStore();
    await store.save('slot', createInitialState('first'));
    await store.save('slot', createInitialState('second'));
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect((await store.load('slot'))?.seed).toBe('second');
  });
});

describe('migrateEnvelope — schema version + migration hook', () => {
  const state = createInitialState('mig');
  const envelope = {
    slot: 's',
    schemaVersion: SCHEMA_VERSION,
    savedAt: 0,
    seed: state.seed,
    runStatus: state.runStatus,
    day: state.clock.day,
    state,
  };

  it('passes a current-schema save through unchanged', () => {
    expect(migrateEnvelope(envelope)).toEqual(state);
  });

  it('rejects an older schema with no migration path (cleanly returns null)', () => {
    expect(migrateEnvelope({ ...envelope, schemaVersion: 0 })).toBeNull();
  });

  it('rejects a newer (future) schema it cannot downgrade', () => {
    expect(migrateEnvelope({ ...envelope, schemaVersion: SCHEMA_VERSION + 1 })).toBeNull();
  });

  it('migrates a v7 save to regional markets (v8: plugs, roster, world — design/11)', () => {
    // A pre-v8 save: no plugs, only the original four products anywhere, markets
    // keyed by the old abstract route legs, world without strain/demand data.
    const v7Inventory = { weed: 3, synthetics: 0, cocaine: 2, arms: 0 };
    const v7World = {
      ...state.world,
      priceBoards: state.world.priceBoards.filter((b) =>
        ['weed', 'synthetics', 'cocaine', 'arms'].includes(b.product),
      ),
      supplierGeography: state.world.supplierGeography
        .filter((s) => ['san-cristo', 'puerto-verde'].includes(s.countryId))
        .map(({ demandFactor: _drop, ...rest }) => rest),
    } as Record<string, unknown>;
    delete v7World.exoticStrain;
    const legacy = {
      ...state,
      world: v7World,
      markets: { source: {}, 'mid-route': {}, wholesale: {} },
      inventory: v7Inventory,
      stashes: [{ ...state.stashes[0]!, inventory: v7Inventory }],
    } as Record<string, unknown>;
    delete legacy.plugs;

    const migrated = migrateEnvelope({
      ...envelope,
      schemaVersion: 7,
      state: legacy as unknown as GameState,
    });
    expect(migrated).not.toBeNull();
    // Plugs start empty; the new products exist everywhere at 0; holdings survive.
    expect(migrated?.plugs).toEqual([]);
    expect(migrated?.stashes[0]?.inventory.crack).toBe(0);
    expect(migrated?.stashes[0]?.inventory.weed).toBe(3);
    expect(migrated?.inventory.cocaine).toBe(2);
    // Markets re-keyed by country, fresh at base, stock pool seeded (v11).
    expect(migrated?.markets['san-cristo']?.weed).toMatchObject({
      factor: 1,
      prevFactor: 1,
    });
    expect(migrated?.markets['san-cristo']?.weed.stock).toBeGreaterThan(0);
    expect(migrated?.markets.source).toBeUndefined();
    // The world grew boards for the new roster + strain + full supplier coverage.
    expect(migrated?.world.priceBoards.map((b) => b.product)).toContain('crack');
    expect(migrated?.world.exoticStrain).toBeTruthy();
    expect(migrated?.world.supplierGeography.map((s) => s.countryId)).toContain(
      'miami',
    );
    // Deterministic: migrating the same save twice yields the same state.
    expect(
      migrateEnvelope({
        ...envelope,
        schemaVersion: 7,
        state: legacy as unknown as GameState,
      }),
    ).toEqual(migrated);
  });

  it('migrates a v8 save to the travel engine (v9: shipments start empty)', () => {
    const legacy = { ...state } as Record<string, unknown>;
    delete legacy.shipments; // pre-Prompt-30 saves had no travel engine
    const migrated = migrateEnvelope({
      ...envelope,
      schemaVersion: 8,
      state: legacy as unknown as GameState,
    });
    expect(migrated).not.toBeNull();
    expect(migrated?.shipments).toEqual([]); // nothing in flight, nothing owed
    // Everything else survives verbatim.
    expect(migrated?.stashes).toEqual(state.stashes);
    expect(migrated?.rngState).toEqual(state.rngState);
  });

  it('migrates a v11 save to the fixed 6-front roster (v12: remap + fold-by-max)', () => {
    // A pre-Prompt-37 save on the old 4-type roster, holding a DUPLICATE bar
    // (the exploit the single-buy rule kills) and a nightclub + crypto.
    const legacy = {
      ...state,
      cleanCash: 42_000, // untouched by the migration
      fronts: [
        { id: 'front-bar-1', type: 'bar', level: 2 },
        { id: 'front-bar-2', type: 'bar', level: 4 }, // duplicate → folds to max
        { id: 'front-nightclub-1', type: 'nightclub', level: 1 },
        { id: 'front-crypto-1', type: 'crypto', level: 3 },
      ],
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      ...envelope,
      schemaVersion: 11,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    // Remapped to the new technique ids, one per type, folded to the highest level.
    expect(migrated?.fronts).toEqual([
      { id: 'front-cash-front', type: 'cash-front', level: 4 }, // fold-by-max, no seizure
      { id: 'front-shell-company', type: 'shell-company', level: 1 },
      { id: 'front-crypto', type: 'crypto', level: 3 },
    ]);
    // Nothing the player earned changed: cash and the RNG stream are untouched.
    expect(migrated?.cleanCash).toBe(42_000);
    expect(migrated?.rngState).toEqual(state.rngState);
  });

  it('migrates a v12 save to the production layer (v13: empty ops + config group)', () => {
    // A pre-Prompt-39 save: no production ops and a config without the group.
    const { productionOps: _dropOps, config, ...rest } = state;
    const { production: _dropCfg, ...configWithoutProduction } = config as typeof config & {
      production?: unknown;
    };
    const legacy = {
      ...rest,
      cleanCash: 15_000, // untouched by the migration
      config: configWithoutProduction,
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      ...envelope,
      schemaVersion: 12,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    // A run that never produced comes back with an empty roster and the default group.
    expect(migrated?.productionOps).toEqual([]);
    expect(migrated?.config.production).toEqual(DEFAULT_GAME_CONFIG.production);
    // Nothing the player earned changed: cash and the RNG stream are untouched.
    expect(migrated?.cleanCash).toBe(15_000);
    expect(migrated?.rngState).toEqual(state.rngState);
  });

  it('migrates a v13 save to integer inventory (v14: fractional holdings round UP)', () => {
    // A pre-v14 save whose production deposited fractional units (design/13 A1).
    const legacy = {
      ...state,
      inventory: { ...state.inventory, weed: 1.2 },
      stashes: [
        {
          ...state.stashes[0]!,
          inventory: {
            ...state.stashes[0]!.inventory,
            weed: 216.57861666666642, // the playtest save
            cocaine: 3,
          },
        },
      ],
    } as unknown as GameState;

    const migrated = migrateEnvelope({
      ...envelope,
      schemaVersion: 13,
      state: legacy,
    });

    expect(migrated).not.toBeNull();
    // Rounds UP in the player's favor — never seizes what was earned.
    expect(migrated?.stashes[0]?.inventory.weed).toBe(217);
    expect(migrated?.stashes[0]?.inventory.cocaine).toBe(3); // whole units untouched
    expect(migrated?.inventory.weed).toBe(2);
    // Cash and the RNG stream are untouched.
    expect(migrated?.cleanCash).toBe(state.cleanCash);
    expect(migrated?.rngState).toEqual(state.rngState);
  });

  it('migrates a v15 save: production assignment → productionOpIds (Prompt 46)', () => {
    // A pre-v16 lieutenant delegated to a grow via the single `assignment` slot,
    // with neither `productionOpIds` nor `lastCrewPayrollWeek` on the save.
    const ltFull = spawnCrew('marco', {
      id: 'crew-marco',
      role: 'lieutenant',
      assignment: { kind: 'production', targetId: 'prod-backyard-grow' },
    });
    const { productionOpIds: _drop, ...ltV15 } = ltFull;
    const legacy = {
      ...state,
      crew: [ltV15],
      productionOps: [{ id: 'prod-backyard-grow', type: 'backyard-grow', level: 1 }],
    } as Record<string, unknown>;
    delete legacy.lastCrewPayrollWeek;

    const migrated = migrateEnvelope({
      ...envelope,
      schemaVersion: 15,
      state: legacy as unknown as GameState,
    });

    expect(migrated).not.toBeNull();
    const m = migrated!.crew[0]!;
    // The legacy lieutenant KEEPS their one op and gains a free second slot.
    expect(m.productionOpIds).toEqual(['prod-backyard-grow']);
    expect(m.assignment).toEqual({ kind: 'idle' });
    expect(migrated!.config.crew.LIEUTENANT_MAX_PRODUCTION_OPS).toBe(2);
    // Payroll bookkeeping seeded from the clock — never back-charges past weeks.
    expect(migrated!.lastCrewPayrollWeek).toBe(state.clock.week);
    // Nothing owned changes: no cash or RNG movement.
    expect(migrated!.cleanCash).toBe(state.cleanCash);
    expect(migrated!.rngState).toEqual(state.rngState);
  });

  it('migrates a v2 save up to the heat engine (Prompt 05 fields defaulted)', () => {
    // A pre-Prompt-05 save: heat sitting in DEA range, no heat-engine fields.
    const legacy = { ...state, heat: 45 } as Record<string, unknown>;
    delete legacy.lyingLow;
    delete legacy.leTierAck;
    const migrated = migrateEnvelope({
      ...envelope,
      schemaVersion: 2,
      state: legacy as unknown as GameState,
    });
    expect(migrated).not.toBeNull();
    expect(migrated?.lyingLowCountries).toEqual([]);
    // Acknowledged tier derived from stored heat → never self-telegraphs on load.
    expect(migrated?.leTierAck).toBe('dea');
  });

  it('backfills markets for countries added to the roster, preserving known ones (Item 9)', () => {
    // A v11 save written before the roster grew: drop the new countries' markets
    // and mutate a known country's live stock to prove it survives the merge.
    const legacyMarkets = { ...state.markets } as Record<string, unknown>;
    delete legacyMarkets['london'];
    delete legacyMarkets['new-york'];
    delete legacyMarkets['jamaica'];
    const knownStock = 7; // an arbitrary depleted pool the save already tracked
    const sanCristo = {
      ...state.markets['san-cristo']!,
      cocaine: { ...state.markets['san-cristo']!.cocaine, stock: knownStock },
    };
    legacyMarkets['san-cristo'] = sanCristo;

    const legacy = { ...state, markets: legacyMarkets } as Record<string, unknown>;
    const migrated = migrateEnvelope({
      ...envelope,
      state: legacy as unknown as GameState,
    });

    expect(migrated).not.toBeNull();
    // The new countries gained fresh market entries (no throw at pricing time)…
    expect(migrated?.markets['london']?.cocaine.stock).toBeGreaterThan(0);
    expect(migrated?.markets['new-york']?.cocaine).toBeDefined();
    expect(migrated?.markets['jamaica']?.weed).toBeDefined();
    // …while a country the save already knew keeps its live stock untouched.
    expect(migrated?.markets['san-cristo']?.cocaine.stock).toBe(knownStock);
  });

  it('backfills the territory config group on a save written before Prompt 41 (no schema bump)', () => {
    // A v12 save from before meaningful territory: the `territory` config group is
    // absent, and stashes carry no `openedAtHours` (established/controlled).
    const legacyConfig = { ...state.config } as Record<string, unknown>;
    delete legacyConfig.territory;
    const legacy = { ...state, config: legacyConfig } as Record<string, unknown>;
    const migrated = migrateEnvelope({
      ...envelope,
      state: legacy as unknown as GameState,
    });

    expect(migrated).not.toBeNull();
    // The group is patched in from the default so the engine never reads undefined…
    expect(migrated?.config.territory.CONSOLIDATION_HOURS).toBeGreaterThan(0);
    expect(migrated?.config.territory.TERRITORY_REACH_GROWTH).toBeGreaterThan(1);
    // …and legacy stashes stay established (absent openedAtHours = fully controlled).
    expect(migrated?.stashes.every((s) => s.openedAtHours === undefined)).toBe(true);
  });

  it('migrates a v18 save to the stash upgrade model (v19: FOLD one stash per spot)', () => {
    // A pre-Prompt-49 save that STACKED stashes on spots (the model being reversed):
    // two floors + a buried at home, two containers in Miami. Production, a guard
    // assignment, and debt collateral point at stashes that will fold away.
    const home = state.world.startingCountry.id;
    const inv = (over: Partial<Stash['inventory']>): Stash['inventory'] => ({
      ...state.stashes[0]!.inventory,
      ...over,
    });
    const legacyStashes = [
      { id: 'stash-home', name: 'Home', countryId: home, type: 'floor', dirtyCash: 1_000, inventory: inv({ weed: 10 }) },
      { id: 'stash-floor-2', name: 'Backroom', countryId: home, type: 'floor', dirtyCash: 500, inventory: inv({ weed: 20 }) },
      { id: 'stash-buried-1', name: 'Cache', countryId: home, type: 'buried', dirtyCash: 0, inventory: inv({ weed: 30 }) },
      { id: 'stash-cont-1', name: 'Box A', countryId: 'miami', type: 'container', dirtyCash: 200, inventory: inv({ cocaine: 5 }), openedAtHours: 100 },
      { id: 'stash-cont-2', name: 'Box B', countryId: 'miami', type: 'container', dirtyCash: 300, inventory: inv({ cocaine: 7 }), openedAtHours: 50 },
    ] as unknown as Stash[];
    const legacy = {
      ...state,
      stashes: legacyStashes,
      productionOps: [{ id: 'prod-x', type: 'backyard-grow', level: 1, stashId: 'stash-floor-2' }],
      crew: [spawnCrew('deon', { id: 'g', assignment: { kind: 'guard', targetId: 'stash-cont-2' } })],
      debt: { ...state.debt, collateralRef: 'stash-floor-2' },
    } as unknown as GameState;

    const unitsBefore = totalUnits(legacy);
    const dirtyBefore = totalDirtyCash(legacy);
    const capBefore = legacy.stashes.reduce((s, st) => s + effectiveCapacity(legacy, st), 0);

    const migrated = migrateEnvelope({ ...envelope, schemaVersion: 18, state: legacy });
    expect(migrated).not.toBeNull();
    const m = migrated!;

    // One stash per (country, type) spot: 5 stacked → 3 (home floor, home buried, Miami container).
    expect(m.stashes).toHaveLength(3);
    expect(new Set(m.stashes.map((s) => `${s.countryId}::${s.type}`)).size).toBe(3);
    const homeFloor = m.stashes.find((s) => s.id === 'stash-home')!;
    const miamiBox = m.stashes.find((s) => s.type === 'container')!;

    // Inventories + dirty cash merged unit-for-unit and dollar-for-dollar (no seizure).
    expect(homeFloor.inventory.weed).toBe(30);
    expect(homeFloor.dirtyCash).toBe(1_500);
    expect(miamiBox.inventory.cocaine).toBe(12);
    expect(miamiBox.dirtyCash).toBe(500);
    // Most-consolidated openedAtHours wins (the oldest 50, least exposed).
    expect(miamiBox.openedAtHours).toBe(50);
    // The survivor's level rose so its capacity holds at least the folded pair.
    expect(homeFloor.level).toBeGreaterThan(1);

    // Nothing shrinks — units, dirty cash, and total capacity all ≥ before.
    expect(totalUnits(m)).toBe(unitsBefore);
    expect(totalDirtyCash(m)).toBe(dirtyBefore);
    expect(m.stashes.reduce((s, st) => s + effectiveCapacity(m, st), 0)).toBeGreaterThanOrEqual(capBefore);

    // References re-pointed to the survivor id (never left dangling).
    expect(m.productionOps[0]?.stashId).toBe('stash-home');
    expect(m.crew[0]?.assignment.targetId).toBe('stash-cont-1');
    expect(m.debt.collateralRef).toBe('stash-home');
    // Cash and the RNG stream are untouched.
    expect(m.cleanCash).toBe(state.cleanCash);
    expect(m.rngState).toEqual(state.rngState);
  });

  it('the fold never loses a unit, a dollar, or capacity (property — generated saves)', () => {
    const types = ['floor', 'buried', 'safehouse', 'container'] as const;
    const countries = [state.world.startingCountry.id, 'miami', 'jamaica'];
    const rng = createRng('fold-property');
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng.next() * arr.length)]!;

    for (let trial = 0; trial < 40; trial++) {
      const n = 2 + Math.floor(rng.next() * 8); // 2–9 stacked stashes
      const stashes: Stash[] = [];
      for (let i = 0; i < n; i++) {
        stashes.push({
          id: `s-${trial}-${i}`,
          name: `s${i}`,
          countryId: pick(countries),
          type: pick(types),
          dirtyCash: Math.floor(rng.next() * 5_000),
          inventory: { ...state.stashes[0]!.inventory, weed: Math.floor(rng.next() * 50) },
        } as unknown as Stash);
      }
      const legacy = { ...state, stashes } as unknown as GameState;
      const unitsBefore = totalUnits(legacy);
      const dirtyBefore = totalDirtyCash(legacy);
      const capBefore = legacy.stashes.reduce((s, st) => s + effectiveCapacity(legacy, st), 0);

      const m = migrateEnvelope({ ...envelope, schemaVersion: 18, state: legacy })!;
      // One stash per spot, and nothing shrank.
      expect(new Set(m.stashes.map((s) => `${s.countryId}::${s.type}`)).size).toBe(m.stashes.length);
      expect(totalUnits(m)).toBe(unitsBefore);
      expect(totalDirtyCash(m)).toBe(dirtyBefore);
      expect(m.stashes.reduce((s, st) => s + effectiveCapacity(m, st), 0)).toBeGreaterThanOrEqual(
        capBefore,
      );
    }
  });

  it('migrates a v26 save by pruning duplicate heat-escalation telegraphs (v27)', () => {
    // A real pre-v27 pile: every re-crossing queued another "opened a file" hook.
    const hook = (id: string, hours: number) => ({
      id,
      kind: 'heat-escalation',
      summary: 'A DEA task force just opened a file on you.',
      createdAtHours: hours,
    });
    const other = {
      id: 'return-hook-1',
      kind: 'return-hook',
      summary: 'Your lieutenant needs a decision.',
      createdAtHours: 12,
    };
    const legacy = {
      ...state,
      beatsFired: ['heat.tier.dea', 'heat.tier.cia'],
      pendingChoices: [
        hook('heat-escalation-dea-10', 10),
        other,
        hook('heat-escalation-cia-20', 20),
        hook('heat-escalation-dea-30', 30),
        hook('heat-escalation-dea-40', 40),
      ],
    } as unknown as GameState;

    const migrated = migrateEnvelope({ ...envelope, schemaVersion: 26, state: legacy });
    expect(migrated).not.toBeNull();
    const m = migrated!;

    // Only the NEWEST escalation telegraph survives; every other kind is untouched.
    const escalations = m.pendingChoices.filter((c) => c.kind === 'heat-escalation');
    expect(escalations).toHaveLength(1);
    expect(escalations[0]!.id).toBe('heat-escalation-dea-40');
    expect(m.pendingChoices.find((c) => c.id === 'return-hook-1')).toBeDefined();
    expect(m.pendingChoices).toHaveLength(2);
    // A pure notification prune: cash, holdings, beats, and the RNG stream survive.
    expect(m.cleanCash).toBe(state.cleanCash);
    expect(m.stashes).toEqual(state.stashes);
    expect(m.beatsFired).toEqual(['heat.tier.dea', 'heat.tier.cia']);
    expect(m.rngState).toEqual(state.rngState);
  });

  it('migrates a v27 save by backfilling the expanded drug roster (v28)', () => {
    // A pre-v28 save knows nothing of shrooms/LSD/ketamine: strip them from every
    // per-product structure the way an old build would have written it.
    const NEW_IDS = ['shrooms', 'lsd', 'ketamine'] as const;
    const strip = (rec: Record<string, unknown>) => {
      const out = { ...rec };
      for (const id of NEW_IDS) delete out[id];
      return out;
    };
    const legacy = {
      ...state,
      config: {
        ...state.config,
        products: {
          PRODUCTS: state.config.products.PRODUCTS.filter(
            (p) => !(NEW_IDS as readonly string[]).includes(p.id),
          ),
        },
      },
      world: {
        ...state.world,
        priceBoards: state.world.priceBoards.filter(
          (b) => !(NEW_IDS as readonly string[]).includes(b.product),
        ),
      },
      markets: Object.fromEntries(
        Object.entries(state.markets).map(([c, book]) => [c, strip(book)]),
      ),
      inventory: { ...strip(state.inventory), weed: 7 },
      stashes: state.stashes.map((s) => ({ ...s, inventory: strip(s.inventory) })),
    } as unknown as GameState;

    const migrated = migrateEnvelope({ ...envelope, schemaVersion: 27, state: legacy });
    expect(migrated).not.toBeNull();
    const m = migrated!;

    for (const id of NEW_IDS) {
      // Every inventory gains the new keys at 0 — nothing is granted.
      expect(m.inventory[id]).toBe(0);
      for (const s of m.stashes) expect(s.inventory[id]).toBe(0);
      // The config table and the world board gain the new rows, in band…
      const cfg = m.config.products.PRODUCTS.find((p) => p.id === id)!;
      const board = m.world.priceBoards.find((b) => b.product === id)!;
      expect(board.price).toBeGreaterThanOrEqual(cfg.price.min);
      expect(board.price).toBeLessThanOrEqual(cfg.price.max);
      // …and every market carries a freshly seeded book for them.
      for (const c of Object.keys(m.markets)) {
        expect(m.markets[c]![id]!.stock).toBeGreaterThanOrEqual(0);
        expect(m.markets[c]![id]!.factor).toBe(1);
      }
    }
    // Holdings, the books/boards the save already carried, and the RNG stream
    // survive untouched.
    expect(m.inventory.weed).toBe(7);
    expect(m.markets['san-cristo']!.weed).toEqual(state.markets['san-cristo']!.weed);
    expect(m.world.priceBoards.find((b) => b.product === 'weed')).toEqual(
      state.world.priceBoards.find((b) => b.product === 'weed'),
    );
    expect(m.cleanCash).toBe(state.cleanCash);
    expect(m.rngState).toEqual(state.rngState);
    // Deterministic: migrating the same save twice yields the same state.
    expect(migrateEnvelope({ ...envelope, schemaVersion: 27, state: legacy })).toEqual(m);
  });

  it('migrates a v28 save by capping queued raid scenes to the newest 3 (v29)', () => {
    // A real pre-v29 pile: a hot run queued a raid scene for every seizure.
    const raid = (id: string, hours: number) => ({
      id,
      kind: 'raid',
      summary: 'They raided Home Stash and took what was there — 100 units seized.',
      createdAtHours: hours,
    });
    const other = {
      id: 'return-hook-1',
      kind: 'return-hook',
      summary: 'Your lieutenant needs a decision.',
      createdAtHours: 12,
    };
    const legacy = {
      ...state,
      pendingChoices: [
        raid('raid-s1-10', 10),
        other,
        raid('raid-s1-20', 20),
        raid('raid-s2-30', 30),
        raid('raid-s1-40', 40),
        raid('raid-s1-50', 50),
      ],
    } as unknown as GameState;

    const migrated = migrateEnvelope({ ...envelope, schemaVersion: 28, state: legacy });
    expect(migrated).not.toBeNull();
    const m = migrated!;

    // Only the newest three raid scenes survive; every other kind is untouched.
    const raids = m.pendingChoices.filter((c) => c.kind === 'raid');
    expect(raids.map((c) => c.id)).toEqual(['raid-s2-30', 'raid-s1-40', 'raid-s1-50']);
    expect(m.pendingChoices.find((c) => c.id === 'return-hook-1')).toBeDefined();
    expect(m.pendingChoices).toHaveLength(4);
    // A pure notification prune: cash, holdings, and the RNG stream survive.
    expect(m.cleanCash).toBe(state.cleanCash);
    expect(m.stashes).toEqual(state.stashes);
    expect(m.rngState).toEqual(state.rngState);
  });
});

describe('CloudSaveStore — conforming stub', () => {
  it('reads no-op, writes throw NotImplemented', async () => {
    const cloud = new CloudSaveStore();
    expect(await cloud.load('x')).toBeNull();
    expect(await cloud.list()).toEqual([]);
    await expect(cloud.save('x', createInitialState('c'))).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    await expect(cloud.delete('x')).rejects.toBeInstanceOf(NotImplementedError);
  });
});
