/**
 * THE FALL — RUN OVER (Prompt 23; design/07 §6; design/01 §7). The run-end recap
 * that ends every run on the "beat it next run" cliffhanger: the banked peaks (a
 * late wipe still shows the height reached, never zero), the personal-best chase,
 * the local leaderboard position, and the NON-POWER prestige the run earned.
 *
 * Framed as a fall + a dare, never a bare "game over" (design/01 §7, design/05
 * §4): every number here is something the player KEEPS. Pure composition — all
 * values come from the store's `RunEndSummary` through `runEndScreen.model`
 * selectors; the screen authors no scoring math (README UI rule).
 */

import { useMeta, useRunEnd } from '@/store';
import { Button, Card, DottedRow, SceneText, StampBadge, Stat } from '@/ui/components';
import { money, runEndView } from './runEndScreen.model';

export interface RunEndScreenProps {
  /** Take the dare — a brand-new run in a brand-new world (fresh seed). */
  readonly onStartNextRun: () => void;
  /** Open the standalone leaderboard / high-score screen. */
  readonly onLeaderboard: () => void;
}

export function RunEndScreen({ onStartNextRun, onLeaderboard }: RunEndScreenProps) {
  const summary = useRunEnd();
  const meta = useMeta();

  // The store builds the summary the moment a run ends (and rebuilds it on
  // hydrate); this guard only covers the brief async window in between.
  if (!summary) {
    return (
      <main className="cg-app cg-gate" aria-busy="true">
        <p className="cg-kicker">Tallying the run…</p>
      </main>
    );
  }

  const view = runEndView(summary, meta);

  return (
    <main className="cg-app" data-testid="run-end-screen">
      <header style={{ marginBottom: 16 }}>
        <p className="cg-kicker">The fall</p>
        <h1 className="cg-title">Run over</h1>
        <StampBadge variant="danger" label={view.causeStamp} />
      </header>

      <SceneText tone="default">{view.fallProse}</SceneText>

      <Card heading="What you're worth up there">
        <Stat label="Peak net worth · banked" value={money(view.peakNetWorth)} tone="green" big />
        <DottedRow
          label="Empire size"
          value={`${view.peakEmpireSize} (best: ${view.bestEmpireSize})`}
        />
        <DottedRow label="Rivals toppled" value={String(view.rivalsToppled)} />
        <DottedRow
          label="Farthest act"
          value={`${view.farthestAct} · week ${view.weeksSurvived}`}
        />
      </Card>

      <Card heading="The chase">
        <Stat
          label="New personal best?"
          value={view.best.text}
          tone={view.best.newBest ? 'green' : 'red'}
        />
        {view.rankLine ? <DottedRow label="Leaderboard" value={view.rankLine} /> : null}
      </Card>

      {view.prestige.length > 0 ? (
        <Card heading="Prestige unlocked — never power">
          <div style={{ display: 'grid', gap: 10 }} data-testid="prestige-unlocks">
            {view.prestige.map((p) => (
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

      <SceneText tone="win">{view.dare}</SceneText>

      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <Button variant="primary" fullWidth onClick={onStartNextRun} data-testid="start-next-run">
          Start next run
        </Button>
        <Button variant="ghost" onClick={onLeaderboard} data-testid="open-leaderboard">
          Leaderboard
        </Button>
      </div>
    </main>
  );
}
