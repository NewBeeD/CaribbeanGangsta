import { Button } from '@/ui/components';

export interface NewRunGateProps {
  /** A resumable autosave exists — show "Continue" as the primary action. */
  readonly hasSave: boolean;
  /** Start a fresh run. */
  readonly onNewRun: () => void;
  /** Resume the autosave. */
  readonly onContinue: () => void;
}

/**
 * The "no active run" entry gate (Prompt 14). Pure presentation: the shell owns
 * boot/hydrate and passes down whether a save exists. When a run can be resumed,
 * Continue is the single emphasized action (one primary per state — design/04 §0.3);
 * otherwise New Run is. No loss framing anywhere — this is aspiration, not a menu.
 */
export function NewRunGate({ hasSave, onNewRun, onContinue }: NewRunGateProps) {
  return (
    <main className="cg-app cg-gate">
      <header style={{ marginBottom: 24 }}>
        <p className="cg-kicker">A Caribbean-noir come-up</p>
        <h1 className="cg-title">Caribbean Gangsta</h1>
      </header>

      <p className="cg-scene">
        Start with nothing but nerve and a name on the docks. How big you get is the
        only score that matters.
      </p>

      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        {hasSave ? (
          <>
            <Button variant="primary" fullWidth onClick={onContinue}>
              Continue
            </Button>
            <Button variant="ghost" onClick={onNewRun}>
              Start a new run
            </Button>
          </>
        ) : (
          <Button variant="primary" fullWidth onClick={onNewRun}>
            Start the come-up
          </Button>
        )}
      </div>
    </main>
  );
}
