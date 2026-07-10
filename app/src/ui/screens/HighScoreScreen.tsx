/**
 * The standalone High Score screen (Prompt 23; design/01 §7; GDD §12): the
 * cross-run chase made concrete — personal best, local + seasonal boards, the
 * prestige unlocks earned (never power), and run history. Reached any time from
 * the header uplink; it is also where a live run can be voluntarily RETIRED
 * (design/01 §7 — banking the peaks and walking away costs nothing).
 *
 * Boards are aspirational mastery display, never pay-to-win (GDD §12, §8) — no
 * purchase surface exists here. All reads go through the store's `Leaderboard`
 * adapter (local-first; the remote is a drop-in stub nothing here depends on)
 * and `highScoreScreen.model` selectors; the screen authors no scoring math.
 */

import { useEffect, useState } from 'react';
import { useGameState, useGameStore, useMeta, type LeaderboardEntry } from '@/store';
import { Button, Card, DottedRow, SceneText, Stat } from '@/ui/components';
import {
  boardRows,
  historyRows,
  money,
  profileView,
} from './highScoreScreen.model';
import type { LeaderboardBoard } from '@/store';

const BOARD_SIZE = 10;
const HISTORY_SIZE = 8;

/** Voluntary retire — bank the run and walk away, two-step so it can't misfire. */
function RetireControl() {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant="secondary" fullWidth onClick={() => setArmed(true)} data-testid="retire">
        Retire — bank this run and walk away
      </Button>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <SceneText tone="default">
        Walk away on top? The peaks bank exactly as they stand — no penalty, ever.
      </SceneText>
      <Button
        variant="primary"
        fullWidth
        onClick={() => void useGameStore.getState().endCurrentRun('retired')}
        data-testid="retire-confirm"
      >
        Bank it. I'm out.
      </Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>
        Keep running
      </Button>
    </div>
  );
}

export function HighScoreScreen() {
  const state = useGameState();
  const meta = useMeta();
  const [board, setBoard] = useState<LeaderboardBoard>('all-time');
  const [top, setTop] = useState<readonly LeaderboardEntry[]>([]);
  const [recent, setRecent] = useState<readonly LeaderboardEntry[]>([]);

  // Load the cross-run surfaces; re-query when another run banks in.
  useEffect(() => {
    let cancelled = false;
    const store = useGameStore.getState();
    void store.refreshMeta();
    void store.leaderboard
      .top(BOARD_SIZE, board)
      .then((entries) => {
        if (!cancelled) setTop(entries);
      })
      .catch(() => {});
    void store.leaderboard
      .recent(HISTORY_SIZE)
      .then((entries) => {
        if (!cancelled) setRecent(entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [board, meta.runsPlayed]);

  const profile = profileView(meta);
  const rows = boardRows(top);
  const history = historyRows(recent);

  return (
    <div data-testid="highscore-screen">
      <header style={{ marginBottom: 16 }}>
        <p className="cg-kicker">The chase</p>
        <h1 className="cg-title">High score</h1>
      </header>

      <Card heading="Personal best">
        <Stat
          label="Biggest empire, at its peak"
          value={money(profile.personalBest)}
          tone="gold"
          big
        />
        <DottedRow label="Best empire size" value={String(profile.bestEmpireSize)} />
        <DottedRow label="Runs played" value={String(profile.runsPlayed)} />
        <DottedRow label="Rivals toppled, lifetime" value={String(profile.rivalsToppledTotal)} />
      </Card>

      <Card heading="Leaderboard — local">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Button
            variant={board === 'all-time' ? 'primary' : 'ghost'}
            onClick={() => setBoard('all-time')}
            data-testid="board-all-time"
          >
            All-time
          </Button>
          <Button
            variant={board === 'season' ? 'primary' : 'ghost'}
            onClick={() => setBoard('season')}
            data-testid="board-season"
          >
            This season
          </Button>
        </div>
        {rows.length === 0 ? (
          <SceneText tone="default">
            No runs on this board yet. The first fall writes the first line.
          </SceneText>
        ) : (
          <div style={{ display: 'grid', gap: 6 }} data-testid="board-rows">
            {rows.map((r) => (
              <DottedRow
                key={r.id}
                label={`#${r.rank} · ${r.when} · ${r.causeLabel}`}
                value={money(r.score)}
              />
            ))}
          </div>
        )}
        <p className="cg-label" style={{ marginTop: 10 }}>
          Mastery only — a rank here is earned, never bought.
        </p>
      </Card>

      {profile.prestige.length > 0 ? (
        <Card heading="Prestige earned — never power">
          <div style={{ display: 'grid', gap: 10 }} data-testid="prestige-earned">
            {profile.prestige.map((p) => (
              <div key={p.id}>
                <p style={{ margin: 0 }}>
                  <strong>{p.name}</strong>{' '}
                  <span className="cg-label">· {p.categoryLabel}</span>
                </p>
                <p className="cg-label" style={{ margin: 0 }}>
                  {p.description}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <Card heading="Run history">
          <div style={{ display: 'grid', gap: 6 }} data-testid="run-history">
            {history.map((r) => (
              <DottedRow
                key={r.id}
                label={`${r.when} · ${r.causeLabel} · week ${r.weeksSurvived}`}
                value={money(r.score)}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {state && state.runStatus === 'active' ? (
        <Card heading="Walk away on top">
          <RetireControl />
        </Card>
      ) : null}
    </div>
  );
}
