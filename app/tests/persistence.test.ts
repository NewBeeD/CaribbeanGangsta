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
