import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createInitialState, rngFor, SCHEMA_VERSION, type GameState } from '@/engine';
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
    // Markets re-keyed by country, fresh at base.
    expect(migrated?.markets['san-cristo']?.weed).toEqual({ factor: 1, prevFactor: 1 });
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
    expect(migrated?.lyingLow).toBe(false);
    // Acknowledged tier derived from stored heat → never self-telegraphs on load.
    expect(migrated?.leTierAck).toBe('dea');
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
