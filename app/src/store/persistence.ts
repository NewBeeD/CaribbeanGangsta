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

import {
  SCHEMA_VERSION,
  emptyDebt,
  emptyInventory,
  type Corruption,
  type CrewMember,
  type Debt,
  type GameState,
  type Inventory,
  type OfficialTie,
  type RunStatus,
  type Stash,
} from '@/engine/state';
import { createRng } from '@/engine/rng';
import { createInitialMarkets, type Markets } from '@/engine/deals';
import {
  hydrateLegacyWorld,
  hydrateWorldV11,
  type LegacyWorld,
  type WorldWithLegacyBoards,
} from '@/engine/world';
import { tierForHeat, type LeTier } from '@/engine/heat';
import { STARTING_STASH_TYPE } from '@/engine/config/stashes';
import { hydrateLegacyCrew } from '@/engine/crew';
import { hydrateLegacyOfficial } from '@/engine/corruption';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '@/engine/config';

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
  // (Seeded deterministically from the save's own seed; the 10→11 step below
  // re-seeds every pre-v11 save's markets again anyway.)
  1: (env) => {
    const legacy = env.state as GameState & { markets?: Markets };
    return {
      ...env,
      schemaVersion: 2,
      state: {
        ...legacy,
        markets:
          legacy.markets ?? createInitialMarkets(createRng(`${legacy.seed}::migrate-markets`)),
      },
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
  // 4 → 5: expand each crew member from the old `{ id, name, loyalty }` stub to
  // the full relatedness model (traits/skills/agenda/memory/assignment — Prompt
  // 08). Pre-Prompt-08 runs never seeded crew, so this is usually an empty map;
  // any stub that exists is hydrated with neutral defaults preserving its loyalty.
  4: (env) => {
    const legacy = env.state as GameState & {
      crew?: readonly { id: string; name: string; loyalty: number }[];
    };
    return {
      ...env,
      schemaVersion: 5,
      state: {
        ...legacy,
        crew: (legacy.crew ?? []).map((c) => hydrateLegacyCrew(c) as CrewMember),
      },
    };
  },
  // 5 → 6: expand `corruption` to the full payroll model (Prompt 09). Pre-Prompt-09
  // runs never bought officials, so `officials` is usually empty; any legacy
  // `{ id, loyalty }` tie is hydrated to a full `OfficialTie`. `paidPorts` starts
  // empty and `lastPayrollWeek` is seeded from the stored clock so a migrated run
  // never back-charges retainers for weeks it was never on the payroll.
  5: (env) => {
    const legacy = env.state as GameState & {
      corruption?: {
        officials?: readonly { id: string; loyalty: number }[];
        payrollPerWeek?: number;
        paidPorts?: Corruption['paidPorts'];
        lastPayrollWeek?: number;
      };
    };
    const officials: readonly OfficialTie[] = (legacy.corruption?.officials ?? []).map(
      (o) => hydrateLegacyOfficial(o),
    );
    const corruption: Corruption = {
      officials,
      payrollPerWeek: officials.reduce((sum, o) => sum + o.retainerPerWeek, 0),
      paidPorts: legacy.corruption?.paidPorts ?? [],
      lastPayrollWeek: legacy.corruption?.lastPayrollWeek ?? legacy.clock.week,
    };
    return { ...env, schemaVersion: 6, state: { ...legacy, corruption } };
  },
  // 6 → 7: expand `debt` to the loan-shark ledger (Prompt 10). Pre-Prompt-10 runs
  // could never borrow (no `borrow` function existed), so any legacy debt is inert
  // — reset to a clean no-loan ledger with the soft due date seeded from the stored
  // clock so a migrated run is never mid-default. The old `interestRatePerHour`
  // stub field is dropped.
  6: (env) => {
    const legacy = env.state as GameState;
    const debt: Debt = { ...emptyDebt(), dueDay: legacy.clock.day };
    return { ...env, schemaVersion: 7, state: { ...legacy, debt } };
  },
  // 7 → 8: regional markets (design/11; Ideas2). The world grows the products/
  // suppliers/strain it never resolved (deterministically from the save's own
  // seed — `hydrateLegacyWorld`); every inventory gains the new product keys at
  // 0; `plugs` starts empty (no run could have bought one); and `markets` is
  // re-seeded fresh at base because the old shape was keyed by abstract route
  // legs, not countries — only transient drift factors are reset, never
  // holdings, cash, or the RNG stream.
  7: (env) => {
    const legacy = env.state as GameState & { plugs?: readonly string[] };
    const fill = (inv: Partial<Inventory> | undefined): Inventory => ({
      ...emptyInventory(),
      ...(inv ?? {}),
    });
    return {
      ...env,
      schemaVersion: 8,
      state: {
        ...legacy,
        world: hydrateLegacyWorld(legacy.world as unknown as LegacyWorld),
        markets: createInitialMarkets(createRng(`${legacy.seed}::migrate-markets`)),
        plugs: legacy.plugs ?? [],
        inventory: fill(legacy.inventory),
        stashes: legacy.stashes.map((s) => ({ ...s, inventory: fill(s.inventory) })),
      },
    };
  },
  // 8 → 9: the travel engine (Prompt 30). Pre-Prompt-30 runs could never launch
  // a shipment, so `shipments` simply starts empty — nothing in flight, nothing
  // owed, nothing to resolve.
  8: (env) => {
    const legacy = env.state as GameState & { shipments?: GameState['shipments'] };
    return {
      ...env,
      schemaVersion: 9,
      state: { ...legacy, shipments: legacy.shipments ?? [] },
    };
  },
  // 9 → 10: the injected balance config (Prompt 26). Every pre-v10 run was played
  // under the v1 numbers, so it simply carries the default `GameConfig` forward —
  // no in-run value changes.
  9: (env) => {
    const legacy = env.state as GameState & { config?: GameConfig };
    return {
      ...env,
      schemaVersion: 10,
      state: { ...legacy, config: legacy.config ?? DEFAULT_GAME_CONFIG },
    };
  },
  // 10 → 11: the ONE-PRICE economy + finite stock (design/12 Items 3/10; Prompt
  // 32). World price boards are re-resolved to the single-price shape and every
  // market re-seeded with a stock pool — both deterministically from the save's
  // own seed (migrating twice yields the same state). Boards/market factors are
  // transient WORLD data; holdings, cash, plugs, and the RNG stream are never
  // touched. The saved config's `products` table swaps to the v11 single-band
  // shape and gains the new `markets` group (any other saved tuning survives).
  10: (env) => {
    const legacy = env.state as GameState & {
      world: WorldWithLegacyBoards;
      config: GameConfig;
    };
    const config: GameConfig = {
      ...legacy.config,
      products: DEFAULT_GAME_CONFIG.products,
      markets: DEFAULT_GAME_CONFIG.markets,
    };
    return {
      ...env,
      schemaVersion: 11,
      state: {
        ...legacy,
        world: hydrateWorldV11(legacy.world),
        markets: createInitialMarkets(
          createRng(`${legacy.seed}::migrate-v11-stock`),
          config.markets,
        ),
        config,
      },
    };
  },
};

/**
 * Fill fields ADDED to v11 IN PLACE after Prompt 32 (design/12 workstreams B–D
 * extend the v11 shape without bumping the schema — state.ts SCHEMA_VERSION note).
 * A save written at v11 by an earlier build lacks them, so a same-version load
 * skips the migration chain entirely; default the transient world data to empty
 * here so nothing lands on `undefined`. Never touches player holdings.
 *  - Prompt 33: `marketEvents`, `rumors` (world price events & the rumor ticker).
 */
function normalizeState(state: GameState): GameState {
  const s = state as GameState & {
    marketEvents?: GameState['marketEvents'];
    rumors?: GameState['rumors'];
  };
  if (s.marketEvents && s.rumors) return state; // already current-shaped
  return { ...state, marketEvents: s.marketEvents ?? [], rumors: s.rumors ?? [] };
}

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
  // Backfill any fields added to the CURRENT schema in place (no version bump).
  return normalizeState(current.state);
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
