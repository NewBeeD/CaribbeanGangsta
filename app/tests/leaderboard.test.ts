import { describe, expect, it } from 'vitest';
import { createInitialState, endRun } from '@/engine';
import {
  entryFromRunEnd,
  seasonKey,
  LEADERBOARD_MAX_ENTRIES,
  LocalLeaderboard,
  MemoryStorage,
  RemoteLeaderboard,
  type LeaderboardEntry,
} from '@/store';

/** A board entry with sane defaults (a finished run's banked line). */
function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  const endedAt = overrides.endedAt ?? Date.now();
  return {
    id: `run-${endedAt}-${overrides.seed ?? 'seed'}-${Math.random()}`,
    score: 100_000,
    peakEmpireSize: 10,
    rivalsToppled: 0,
    weeksSurvived: 3,
    cause: 'killed',
    seed: 'seed',
    endedAt,
    season: seasonKey(endedAt),
    ...overrides,
  };
}

describe('LocalLeaderboard — the real, on-device board (Prompt 23)', () => {
  it('top() ranks by score, best first; ties keep the earlier run ahead', async () => {
    const board = new LocalLeaderboard({ storage: new MemoryStorage() });
    await board.submit(entry({ id: 'mid', score: 200 }));
    await board.submit(entry({ id: 'best', score: 900 }));
    await board.submit(entry({ id: 'tie-late', score: 200, endedAt: Date.now() + 1000 }));

    const top = await board.top(10, 'all-time');
    expect(top.map((e) => e.id)).toEqual(['best', 'mid', 'tie-late']);
  });

  it('personalBest persists across instances over the same storage (survives permadeath)', async () => {
    const storage = new MemoryStorage();
    await new LocalLeaderboard({ storage }).submit(entry({ id: 'a', score: 550_000 }));

    // A brand-new adapter instance (a new app open) still sees the banked best.
    const best = await new LocalLeaderboard({ storage }).personalBest();
    expect(best?.id).toBe('a');
    expect(best?.score).toBe(550_000);
  });

  it('personalBest is null before any run has ended', async () => {
    const board = new LocalLeaderboard({ storage: new MemoryStorage() });
    expect(await board.personalBest()).toBeNull();
  });

  it('the season board only counts runs from the current season', async () => {
    const board = new LocalLeaderboard({ storage: new MemoryStorage() });
    const lastYear = Date.now() - 365 * 24 * 3_600_000;
    await board.submit(entry({ id: 'old', score: 9_999_999, endedAt: lastYear }));
    await board.submit(entry({ id: 'now', score: 100 }));

    const season = await board.top(10, 'season');
    expect(season.map((e) => e.id)).toEqual(['now']);
    // …while all-time still sees the ancient monster run.
    const allTime = await board.top(10, 'all-time');
    expect(allTime[0]?.id).toBe('old');
  });

  it('recent() reads run history newest first', async () => {
    const board = new LocalLeaderboard({ storage: new MemoryStorage() });
    const t = Date.now();
    await board.submit(entry({ id: 'first', endedAt: t - 2000 }));
    await board.submit(entry({ id: 'second', endedAt: t - 1000 }));
    await board.submit(entry({ id: 'third', endedAt: t }));

    const recent = await board.recent(2);
    expect(recent.map((e) => e.id)).toEqual(['third', 'second']);
  });

  it('caps stored entries (newest kept) so the board never grows unbounded', async () => {
    const board = new LocalLeaderboard({ storage: new MemoryStorage() });
    const t = Date.now();
    for (let i = 0; i < LEADERBOARD_MAX_ENTRIES + 5; i++) {
      await board.submit(entry({ id: `run-${i}`, endedAt: t + i }));
    }
    const all = await board.recent(LEADERBOARD_MAX_ENTRIES + 5);
    expect(all).toHaveLength(LEADERBOARD_MAX_ENTRIES);
    // The newest survived the cap; the oldest fell off.
    expect(all[0]?.id).toBe(`run-${LEADERBOARD_MAX_ENTRIES + 4}`);
  });

  it('survives a corrupted/legacy payload by starting clean', async () => {
    const storage = new MemoryStorage();
    storage.setItem('caribbean-gangsta-leaderboard', '{not json');
    const board = new LocalLeaderboard({ storage });
    expect(await board.top(5, 'all-time')).toEqual([]);
    await board.submit(entry({ id: 'fresh' }));
    expect((await board.top(5, 'all-time'))[0]?.id).toBe('fresh');
  });
});

describe('entryFromRunEnd — the one constructor from a finished run', () => {
  it('maps the banked recap onto a board entry (score = peak net worth)', () => {
    const state = createInitialState('entry-seed');
    const result = endRun(state, 'retired');
    const endedAt = Date.UTC(2026, 6, 10);
    const e = entryFromRunEnd(result, endedAt);

    expect(e.score).toBe(result.recap.peakNetWorth);
    expect(e.seed).toBe('entry-seed');
    expect(e.cause).toBe('retired');
    expect(e.weeksSurvived).toBe(result.recap.week);
    expect(e.season).toBe('2026-07');
  });
});

describe('RemoteLeaderboard — the drop-in stub (README: local-first, stub online)', () => {
  it('conforms to the interface: reads resolve empty, submit fails loudly', async () => {
    const remote = new RemoteLeaderboard();
    // Reads never break a caller — nothing in the UI depends on it being live.
    expect(await remote.top(10, 'all-time')).toEqual([]);
    expect(await remote.recent(5)).toEqual([]);
    expect(await remote.personalBest()).toBeNull();
    // Writes reject loudly so a miswired caller can't silently believe it posted.
    await expect(remote.submit(entry())).rejects.toThrow(/not implemented/);
  });
});
