import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GameState } from '@/engine';
import { useGameState } from '@/store';
import { localSink, telemetry, type AnyTelemetryEvent } from '@/telemetry';
import { telemetryOverlayModel } from './telemetryOverlay.model';

/**
 * Dev-only live telemetry overlay (Prompt 25; design/06): the funnel, the
 * ethical-audit readouts (fairness law, offline freeze), and the raw event log,
 * visible while playing. A floating toggle; collapsed by default so it never
 * competes with the game. Hidden entirely outside dev builds unless explicitly
 * armed via `localStorage['cg-telemetry'] = '1'`.
 */

/** Whether the overlay is available at all (dev, or explicitly armed). */
export function telemetryOverlayEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem('cg-telemetry') === '1';
  } catch {
    return false;
  }
}

export interface TelemetryPanelProps {
  readonly events: readonly AnyTelemetryEvent[];
  readonly state: GameState | null;
  readonly now: number;
  readonly onClose: () => void;
  readonly onClear: () => void;
}

const mmss = (sec: number): string => {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The open instrument panel — pure render of the overlay model (testable). */
export function TelemetryPanel({ events, state, now, onClose, onClear }: TelemetryPanelProps) {
  const m = telemetryOverlayModel(events, state, now);
  const fair = m.fairness.all;

  return (
    <aside className="cg-telemetry" aria-label="Telemetry overlay">
      <header className="cg-telemetry__head">
        <strong>telemetry</strong>
        <span>
          <button type="button" onClick={onClear}>
            clear
          </button>
          <button type="button" onClick={onClose} aria-label="Close telemetry overlay">
            ✕
          </button>
        </span>
      </header>

      <dl className="cg-telemetry__funnel">
        <div>
          <dt>session</dt>
          <dd>{mmss(m.sessionSeconds)}</dd>
        </div>
        <div>
          <dt>deals / busts</dt>
          <dd>
            {m.deals} / {m.busts}
          </dd>
        </div>
        <div>
          <dt>first sale</dt>
          <dd>{m.timeToFirstSaleSec === null ? '—' : mmss(m.timeToFirstSaleSec)}</dd>
        </div>
        <div>
          <dt>first front</dt>
          <dd>{m.firstFrontSec === null ? '—' : mmss(m.firstFrontSec)}</dd>
        </div>
        <div>
          <dt>idle rate</dt>
          <dd>${Math.round(m.idleRatePerHour).toLocaleString('en-US')}/h</dd>
        </div>
        <div>
          <dt>offline earned</dt>
          <dd>${Math.round(m.offlineEarned).toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>heat</dt>
          <dd>{Math.round(m.heat)}</dd>
        </div>
        <div>
          <dt>spiral</dt>
          <dd>{m.spiralStage}</dd>
        </div>
        <div>
          <dt>open loop</dt>
          <dd>{m.sessionEndReached ? 'reached' : '—'}</dd>
        </div>
        <div>
          <dt>fairness</dt>
          <dd data-testid="tel-fairness">
            {fair.samples === 0
              ? 'no rolls yet'
              : `${Math.round(fair.expected * 100)}% shown / ${Math.round(fair.observed * 100)}% real (${fair.samples})`}
          </dd>
        </div>
        <div>
          <dt>freeze audit</dt>
          <dd data-testid="tel-freeze">
            {m.freezeViolations === 0 ? 'clean' : `${m.freezeViolations} VIOLATION(S)`}
          </dd>
        </div>
      </dl>

      <ol className="cg-telemetry__log" aria-label="Event log">
        {m.log.map((row) => (
          <li key={row.seq}>
            <code>{row.name}</code> {row.detail}
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function TelemetryOverlay() {
  const state = useGameState();
  const [open, setOpen] = useState(false);
  const events = useSyncExternalStore(
    (cb) => localSink.subscribe(cb),
    () => localSink.events(),
    () => localSink.events(),
  );
  // Tick the session clock once a second while the panel is open.
  const [now, setNow] = useState(() => telemetry.now());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(telemetry.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!telemetryOverlayEnabled()) return null;

  if (!open) {
    return (
      <button
        type="button"
        className="cg-telemetry__toggle"
        onClick={() => setOpen(true)}
        aria-label="Open telemetry overlay"
      >
        ◉ tel
      </button>
    );
  }

  return (
    <TelemetryPanel
      events={events}
      state={state}
      now={now}
      onClose={() => setOpen(false)}
      onClear={() => localSink.clear()}
    />
  );
}
