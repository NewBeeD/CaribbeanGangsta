/**
 * Leaderboards — the cross-run mastery display (Prompt 23; design/01 §7; GDD §12).
 * LOCAL-FIRST (prompts/README.md): `LocalLeaderboard` is the real, on-device
 * implementation; `RemoteLeaderboard` is a conforming STUB so live global/seasonal
 * boards can drop in later without touching a single caller. Nothing in the UI may
 * depend on the remote being live.
 *
 * Design red line (GDD §12, §8): boards are ASPIRATIONAL — a mastery display for
 * the "beat it next run" chase. There is no purchasable rank anywhere in this
 * module and never will be; entries come only from finished runs' banked scores.
 *
 * Store layer, not the engine — wall-clock time (`endedAt`, seasons) lives here.
 */

import type { RunEndCause, RunEndResult } from '@/engine/endgame';

/** Bump if the persisted board shape changes (its own migration seam). */
export const LEADERBOARD_VERSION = 1 as const;

/** Which board to read: everything ever, or just the current season's runs. */
export type LeaderboardBoard = 'all-time' | 'season';

/** One finished run's banked line on the board. */
export interface LeaderboardEntry {
  readonly id: string;
  /** The banked run score = peak net worth (design/01 §7). */
  readonly score: number;
  readonly peakEmpireSize: number;
  readonly rivalsToppled: number;
  readonly weeksSurvived: number;
  readonly cause: RunEndCause;
  readonly seed: string;
  /** Wall-clock ms when the run ended (store-side; the engine never sees this). */
  readonly endedAt: number;
  /** Season key the run banked into (`seasonKey(endedAt)`). */
  readonly season: string;
}

/**
 * The interface EVERY caller talks to (prompts/README.md — local-first, stub
 * online). A live backend later implements exactly this and drops in.
 */
export interface Leaderboard {
  /** Record a finished run's banked line. */
  submit(entry: LeaderboardEntry): Promise<void>;
  /** The top `n` entries of `board`, best score first. */
  top(n: number, board: LeaderboardBoard): Promise<LeaderboardEntry[]>;
  /** The single best entry ever banked, or `null` before any run has ended. */
  personalBest(): Promise<LeaderboardEntry | null>;
  /** The `n` most recently ended runs, newest first (the run-history read). */
  recent(n: number): Promise<LeaderboardEntry[]>;
}

/** A season = a calendar month (`YYYY-MM`) — the "this season" board window. */
export function seasonKey(atMs: number): string {
  const d = new Date(atMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Map a finished run's `RunEndResult` onto a board entry (the ONE constructor). */
export function entryFromRunEnd(result: RunEndResult, endedAt: number): LeaderboardEntry {
  return {
    id: `run-${endedAt}-${result.recap.seed}`,
    score: result.score,
    peakEmpireSize: result.recap.peakEmpireSize,
    rivalsToppled: result.recap.rivalsToppled,
    weeksSurvived: result.recap.week,
    cause: result.cause,
    seed: result.recap.seed,
    endedAt,
    season: seasonKey(endedAt),
  };
}

/** Best score first; ties go to the EARLIER run (first to the height keeps the rank). */
function byScore(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || a.endedAt - b.endedAt;
}

// --- LocalLeaderboard (on-device, the real one) --------------------------------

/** The minimal storage shape `LocalLeaderboard` needs (localStorage conforms). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A Map-backed `KeyValueStorage` — the no-`localStorage` fallback and test double. */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const STORAGE_KEY = 'caribbean-gangsta-leaderboard';

/** Keep this many finished runs (newest kept) — plenty for boards + run history. */
export const LEADERBOARD_MAX_ENTRIES = 200;

interface BoardEnvelope {
  readonly version: number;
  readonly entries: readonly LeaderboardEntry[];
}

export interface LocalLeaderboardOptions {
  /** Injectable storage (tests pass `MemoryStorage`). Defaults to `localStorage`. */
  readonly storage?: KeyValueStorage;
}

/**
 * The real, on-device leaderboard (localStorage-backed). It survives run saves and
 * permadeath — its whole job is to make the cross-run chase concrete (design/01 §7).
 */
export class LocalLeaderboard implements Leaderboard {
  private readonly storage: KeyValueStorage;

  constructor(options: LocalLeaderboardOptions = {}) {
    const storage =
      options.storage ??
      (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (!storage) {
      throw new Error('LocalLeaderboard: no localStorage available (pass options.storage)');
    }
    this.storage = storage;
  }

  private read(): readonly LeaderboardEntry[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as BoardEnvelope;
      // Unknown/legacy version → start clean rather than serve a malformed board.
      if (parsed.version !== LEADERBOARD_VERSION || !Array.isArray(parsed.entries)) return [];
      return parsed.entries;
    } catch {
      return [];
    }
  }

  private write(entries: readonly LeaderboardEntry[]): void {
    const envelope: BoardEnvelope = { version: LEADERBOARD_VERSION, entries };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  }

  submit(entry: LeaderboardEntry): Promise<void> {
    const entries = [...this.read(), entry]
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, LEADERBOARD_MAX_ENTRIES);
    this.write(entries);
    return Promise.resolve();
  }

  top(n: number, board: LeaderboardBoard): Promise<LeaderboardEntry[]> {
    const season = seasonKey(Date.now());
    const pool = this.read().filter((e) => board === 'all-time' || e.season === season);
    return Promise.resolve([...pool].sort(byScore).slice(0, Math.max(0, n)));
  }

  personalBest(): Promise<LeaderboardEntry | null> {
    const entries = [...this.read()].sort(byScore);
    return Promise.resolve(entries[0] ?? null);
  }

  recent(n: number): Promise<LeaderboardEntry[]> {
    const entries = [...this.read()].sort((a, b) => b.endedAt - a.endedAt);
    return Promise.resolve(entries.slice(0, Math.max(0, n)));
  }
}

// --- RemoteLeaderboard stub -----------------------------------------------------

/**
 * Conforming placeholder for the future live/global board (prompts/README.md —
 * "stub online"). Reads resolve EMPTY (nothing live yet) so no caller breaks;
 * `submit` rejects loudly so a miswired caller can't silently believe it posted.
 * Swap this class for the real client and nothing else changes.
 */
export class RemoteLeaderboard implements Leaderboard {
  submit(_entry: LeaderboardEntry): Promise<void> {
    return Promise.reject(new Error('RemoteLeaderboard.submit(): not implemented'));
  }
  top(_n: number, _board: LeaderboardBoard): Promise<LeaderboardEntry[]> {
    return Promise.resolve([]);
  }
  personalBest(): Promise<LeaderboardEntry | null> {
    return Promise.resolve(null);
  }
  recent(_n: number): Promise<LeaderboardEntry[]> {
    return Promise.resolve([]);
  }
}
