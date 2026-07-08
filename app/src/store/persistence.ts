/**
 * The save/load layer: local-first, cloud stubbed.
 *
 * `SaveStore` is the interface every caller (the game store) talks to, so a real
 * cloud backend can drop in later without touching them. `LocalSaveStore` is the
 * IndexedDB implementation (the source of truth on-device); `CloudSaveStore` is a
 * conforming stub for now.
 *
 * Saves are versioned envelopes: `{ schemaVersion, savedAt, state, … }`. On load
 * the envelope passes through `migrateEnvelope`, which upgrades older schemas via
 * the `MIGRATIONS` table or rejects (returns `null`) cleanly when it can't. The
 * whole `GameState` — including the serialized `rngState` — round-trips, so a
 * reloaded run produces the exact same next roll (Prompt 03 acceptance).
 *
 * NOTE: this is the store layer, not the engine — `Date.now()` is allowed here
 * (the engine stays wall-clock-free; the store stamps time and injects it).
 */

import { SCHEMA_VERSION, type GameState, type RunStatus, type Stash } from '@/engine/state';
import { createInitialMarkets, type Markets } from '@/engine/deals';
import { tierForHeat, type LeTier } from '@/engine/heat';
import { STARTING_STASH_TYPE } from '@/engine/config/stashes';

/** Lightweight listing of a saved slot (no full state payload). */
export interface SlotMeta {
  readonly slot: string;
  readonly schemaVersion: number;
  /** Epoch-ms when the slot was saved. */
  readonly savedAt: number;
  readonly seed: string;
  readonly runStatus: RunStatus;
  readonly day: number;
}

export interface SaveStore {
  save(slot: string, state: GameState): Promise<void>;
  load(slot: string): Promise<GameState | null>;
  list(): Promise<SlotMeta[]>;
  delete(slot: string): Promise<void>;
}

/** Thrown by the cloud stub until real sync is implemented. */
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`CloudSaveStore.${method}(): not implemented`);
    this.name = 'NotImplementedError';
  }
}

/** The on-disk record: slot metadata + the full state payload. */
interface SaveEnvelope extends SlotMeta {
  readonly state: GameState;
}

/**
 * Schema migrations. A migration for version N upgrades an envelope FROM N to
 * N+1. Add one whenever `SCHEMA_VERSION` bumps; a missing step makes the load
 * reject cleanly rather than hand back a malformed state.
 */
export type Migration = (env: SaveEnvelope) => SaveEnvelope;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 1 → 2: seed live markets on saves written before the deal loop (Prompt 04).
  1: (env) => {
    const legacy = env.state as GameState & { markets?: Markets };
    return {
      ...env,
      schemaVersion: 2,
      state: { ...legacy, markets: legacy.markets ?? createInitialMarkets() },
    };
  },
  // 2 → 3: default the heat engine's fields on pre-Prompt-05 saves. Lie-low is
  // off; the acknowledged tier is derived from stored heat so a migrated run
  // never self-telegraphs an escalation it was already sitting inside.
  2: (env) => {
    const legacy = env.state as GameState & {
      lyingLow?: boolean;
      leTierAck?: LeTier;
    };
    return {
      ...env,
      schemaVersion: 3,
      state: {
        ...legacy,
        lyingLow: legacy.lyingLow ?? false,
        leTierAck: legacy.leTierAck ?? tierForHeat(legacy.heat),
      },
    };
  },
  // 3 → 4: give every pre-Prompt-06 stash a storage `type`. Legacy runs only ever
  // had the starting home stash, so default it to the floor archetype; a stash
  // that somehow already carries a type keeps it (idempotent). `guardCrewId` is
  // optional and simply stays absent (unguarded).
  3: (env) => {
    const legacy = env.state as GameState;
    return {
      ...env,
      schemaVersion: 4,
      state: {
        ...legacy,
        stashes: legacy.stashes.map((s) => {
          const stash = s as Stash & { type?: Stash['type'] };
          return stash.type ? stash : { ...stash, type: STARTING_STASH_TYPE };
        }),
      },
    };
  },
};

/**
 * Bring a stored envelope up to the current schema, or return `null` if it
 * can't be (unknown future version, or a missing migration step).
 */
export function migrateEnvelope(env: SaveEnvelope): GameState | null {
  if (env.schemaVersion > SCHEMA_VERSION) return null; // can't downgrade a newer save
  let current = env;
  while (current.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schemaVersion];
    if (!step) return null; // gap in the migration chain — reject cleanly
    const next = step(current);
    if (next.schemaVersion <= current.schemaVersion) {
      throw new Error(`migration ${current.schemaVersion} did not advance schemaVersion`);
    }
    current = next;
  }
  return current.state;
}

// --- IndexedDB LocalSaveStore ------------------------------------------------

const DB_NAME = 'caribbean-gangsta';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

export interface LocalSaveStoreOptions {
  /** Injectable IndexedDB factory (tests pass a fake). Defaults to global. */
  readonly factory?: IDBFactory;
  /** Injectable clock for `savedAt`. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Local-first, on-device save store backed by IndexedDB. */
export class LocalSaveStore implements SaveStore {
  private readonly factory: IDBFactory;
  private readonly now: () => number;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(options: LocalSaveStoreOptions = {}) {
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error('LocalSaveStore: no IndexedDB available (pass options.factory)');
    }
    this.factory = factory;
    this.now = options.now ?? Date.now;
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private async tx<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const req = run(transaction.objectStore(STORE_NAME));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async save(slot: string, state: GameState): Promise<void> {
    const envelope: SaveEnvelope = {
      slot,
      schemaVersion: state.schemaVersion,
      savedAt: this.now(),
      seed: state.seed,
      runStatus: state.runStatus,
      day: state.clock.day,
      state,
    };
    await this.tx('readwrite', (store) => store.put(envelope));
  }

  async load(slot: string): Promise<GameState | null> {
    const env = await this.tx<SaveEnvelope | undefined>('readonly', (store) =>
      store.get(slot),
    );
    if (!env) return null;
    return migrateEnvelope(env);
  }

  async list(): Promise<SlotMeta[]> {
    const envs = await this.tx<SaveEnvelope[]>('readonly', (store) => store.getAll());
    return envs
      .map(({ slot, schemaVersion, savedAt, seed, runStatus, day }) => ({
        slot,
        schemaVersion,
        savedAt,
        seed,
        runStatus,
        day,
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async delete(slot: string): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(slot));
  }
}

// --- CloudSaveStore stub ------------------------------------------------------

/**
 * Conforming placeholder for future cloud sync. Reads no-op (nothing in the
 * cloud yet); writes throw so a miswired caller fails loudly rather than
 * silently believing it synced.
 */
export class CloudSaveStore implements SaveStore {
  save(_slot: string, _state: GameState): Promise<void> {
    return Promise.reject(new NotImplementedError('save'));
  }
  load(_slot: string): Promise<GameState | null> {
    return Promise.resolve(null);
  }
  list(): Promise<SlotMeta[]> {
    return Promise.resolve([]);
  }
  delete(_slot: string): Promise<void> {
    return Promise.reject(new NotImplementedError('delete'));
  }
}
