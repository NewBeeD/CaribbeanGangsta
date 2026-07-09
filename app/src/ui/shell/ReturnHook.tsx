import type { OfflineReport } from '@/engine';
import { Button, Card, SceneText, Stat } from '@/ui/components';

export interface ReturnHookProps {
  readonly report: OfflineReport;
  /** Dismiss the return hook and drop into the run. */
  readonly onContinue: () => void;
  /** Jump to a queued decision (routes into the relevant screen). */
  readonly onSee?: (choiceId: string) => void;
}

/** "7h 20m" from fractional hours (display formatting only — no game logic). */
function formatAway(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** "$10,800" — plain money formatting for the reward line. */
function formatCash(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/**
 * The return hook (Prompt 14; design/04 §3, design/07 §4). On reopen the offline
 * settlement is presented as **gains + decisions to allocate** — cash earned, an
 * optional golden-hour bonus, and the queued choices waiting on you. Absence is
 * never punished: there is NO "you lost X while away" surface anywhere here (GDD §6).
 * Pure presentation — the store already ran `settleOffline`; this only renders it.
 */
export function ReturnHook({ report, onContinue, onSee }: ReturnHookProps) {
  const { hoursAway, cleanEarned, pendingChoices, goldenHour } = report;

  return (
    <main className="cg-app cg-return">
      <header style={{ marginBottom: 16 }}>
        <p className="cg-kicker">While you were gone · {formatAway(hoursAway)}</p>
        <h1 className="cg-title">Welcome back.</h1>
      </header>

      <Card heading="The take">
        <Stat label="Clean earned" value={`+ ${formatCash(cleanEarned)}`} tone="green" big />
        {goldenHour ? (
          <SceneText tone="win">{goldenHour.summary}</SceneText>
        ) : null}
      </Card>

      {pendingChoices.length > 0 ? (
        <Card heading="Waiting on you">
          <div style={{ display: 'grid', gap: 10 }}>
            {pendingChoices.map((choice) => (
              <Button
                key={choice.id}
                variant="secondary"
                onClick={onSee ? () => onSee(choice.id) : undefined}
              >
                {choice.summary}
                <small>See →</small>
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      <Button variant="primary" fullWidth onClick={onContinue}>
        Back to work
      </Button>
    </main>
  );
}
