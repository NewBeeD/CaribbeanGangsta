/**
 * Meta-progression store — the cross-run mastery that SURVIVES permadeath (design/01
 * §7; GDD §7). Kept deliberately SEPARATE from run state (its own IndexedDB), because
 * its whole job is to outlive the run: when a run dies, the run save can go, but the
 * personal best, the runs-played tally, and the prestige unlocks earned persist and
 * pull the next run.
 *
 * `bankScore` is the pure fold from a finished run's `RunEndResult` into the
 * accumulated `MetaProgress`. Two rules from the design it upholds:
 *   - **Score banks from PEAK values** — `personalBest`/`bestEmpireSize` only climb.
 *   - **Prestige is NON-POWER** — unlocks are a growing set of ids the engine already
 *     tagged as roster/scenario/cosmetic (`config/prestige.ts`); nothing here grants
 *     a stat multiplier.
 *
 * NOTE: store layer, not the engine — `Date.now()`/IndexedDB are allowed here.
 * Leaderboard sync (global/seasonal) is Prompt 23; this file owns only the local
 * personal-best + prestige that must survive death.
 */

import type { RunEndResult } from '@/engine/endgame';

/** Bump if the persisted `MetaProgress` shape changes (its own migration seam). */
export const META_VERSION = 1 as const;

/**
 * Everything that persists across runs and permadeath (design/01 §7). Purely
 * additive/monotonic: bests only rise and unlocks only accumulate, so meta never
 * punishes a bad run — it only ever records how far you've come.
 */
export interface MetaProgress {
  readonly version: number;
  /** Best banked run score ever = highest peak net worth (design/01 §7). */
  readonly personalBest: number;
  /** Best empire-size composite ever reached (design/01 §7). */
  readonly bestEmpireSize: number;
  /** How many runs have ended (deaths + prisons + retirements). */
  readonly runsPlayed: number;
  /** Lifetime rivals toppled across all runs (feeds roster prestige). */
  readonly rivalsToppledTotal: number;
  /** The accumulated set of earned prestige unlock ids (non-power — GDD §7). */
  readonly unlockedPrestige: readonly string[];
  /**
   * PARKED SEAM (design/01 §7 "Parked"): Legacy/heir inheritance is shelved because
   * compounding power would dilute the stakes. Permanently `false` in v1 — see
   * `engine/endgame.ts` `LEGACY_MODE_ENABLED`. Do not build inheritance against it.
   */
  readonly legacyModeUnlocked: false;
}

/** A clean meta profile — a brand-new player, or the fallback when none is stored. */
export function emptyMeta(): MetaProgress {
  return {
    version: META_VERSION,
    personalBest: 0,
    bestEmpireSize: 0,
    runsPlayed: 0,
    rivalsToppledTotal: 0,
    unlockedPrestige: [],
    legacyModeUnlocked: false,
  };
}

/** Union two id lists, order-stable, de-duplicated (accumulate prestige unlocks). */
function unionIds(a: readonly string[], b: readonly string[]): readonly string[] {
  const seen = new Set(a);
  const merged = [...a];
  for (const id of b) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

/**
 * Fold a finished run's result into the meta profile (design/01 §7). Bests climb,
 * the runs tally increments, rivals toppled accumulate, and newly-earned prestige
 * ids are merged in. A **comeback** (a judge burying a prison charge) did NOT end
 * the run, so it banks nothing — meta is returned untouched. Pure.
 */
export function bankScore(meta: MetaProgress, result: RunEndResult): MetaProgress {
  if (result.comeback) return meta; // the run continues — nothing to bank yet
  return {
    ...meta,
    personalBest: Math.max(meta.personalBest, result.score),
    bestEmpireSize: Math.max(meta.bestEmpireSize, result.recap.peakEmpireSize),
    runsPlayed: meta.runsPlayed + 1,
    rivalsToppledTotal: meta.rivalsToppledTotal + result.recap.rivalsToppled,
    unlockedPrestige: unionIds(meta.unlockedPrestige, result.unlockedPrestige),
  };
}

/** The interface every caller talks to, so a real cloud backend can drop in later. */
export interface MetaProgressStore {
  loadMeta(): Promise<MetaProgress>;
  saveMeta(meta: MetaProgress): Promise<void>;
}

// --- IndexedDB LocalMetaProgressStore ----------------------------------------

const DB_NAME = 'caribbean-gangsta-meta';
const DB_VERSION = 1;
const STORE_NAME = 'meta';
const RECORD_KEY = 'profile';

export interface LocalMetaProgressStoreOptions {
  /** Injectable IndexedDB factory (tests pass a fake). Defaults to global. */
  readonly factory?: IDBFactory;
}

/** Local-first, on-device meta store backed by its own IndexedDB (survives run saves). */
export class LocalMetaProgressStore implements MetaProgressStore {
  private readonly factory: IDBFactory;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(options: LocalMetaProgressStoreOptions = {}) {
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error('LocalMetaProgressStore: no IndexedDB available (pass options.factory)');
    }
    this.factory = factory;
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private tx<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return this.openDb().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, mode);
          const req = run(transaction.objectStore(STORE_NAME));
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }),
    );
  }

  async loadMeta(): Promise<MetaProgress> {
    const stored = await this.tx<MetaProgress | undefined>('readonly', (store) =>
      store.get(RECORD_KEY),
    );
    // Unknown/legacy version → start clean rather than hand back a malformed profile.
    if (!stored || stored.version !== META_VERSION) return emptyMeta();
    return stored;
  }

  async saveMeta(meta: MetaProgress): Promise<void> {
    await this.tx('readwrite', (store) => store.put(meta, RECORD_KEY));
  }
}

// --- CloudMetaProgressStore stub ---------------------------------------------

/**
 * Conforming placeholder for future cloud meta-sync. Reads return a clean profile
 * (nothing in the cloud yet); writes throw so a miswired caller fails loudly rather
 * than silently believing it synced.
 */
export class CloudMetaProgressStore implements MetaProgressStore {
  loadMeta(): Promise<MetaProgress> {
    return Promise.resolve(emptyMeta());
  }
  saveMeta(_meta: MetaProgress): Promise<void> {
    return Promise.reject(new Error('CloudMetaProgressStore.saveMeta(): not implemented'));
  }
}
