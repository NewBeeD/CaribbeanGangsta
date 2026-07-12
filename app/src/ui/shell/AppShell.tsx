import { useEffect, useState } from 'react';
import {
  AUTOSAVE_SLOT,
  useGameStore,
  useGameState,
  useOfflineReport,
} from '@/store';
import { BottomNav, Button, type BottomNavItem } from '@/ui/components';
import { SCREEN_NODES, screenForHash, type ScreenId } from './nav';
import { NewRunGate } from './NewRunGate';
import { ReturnHook } from './ReturnHook';
import { RunEndScreen } from '@/ui/screens/RunEndScreen';
import { StoryCardModal } from './StoryCardModal';
import { nextCardScene } from './storyCardPresenter.model';
import { SCREENS } from './screens';
import { navigate, useHash } from './useHash';
import { trackReturnToAllocate } from '@/telemetry';

/**
 * The React shell (Prompt 14, revised per Ideas.md — open access). It renders the
 * current run and dispatches player intents to the engine. Every screen is
 * reachable from minute one; money limits what the player can DO there, never
 * where he can go. It reads state and calls store actions ONLY — no game logic
 * lives here (README UI rule).
 *
 * Boot: attempt to resume the autosave (settling any offline time through the store,
 * which owns the only `Date.now()`); on success drop into the run — surfacing the
 * offline return hook first — otherwise show the new-run gate.
 */
export function AppShell() {
  const state = useGameState();
  const report = useOfflineReport();
  const hash = useHash();

  const [booted, setBooted] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  // On app open: settle offline once (via the store) and resume, or fall to the gate.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = useGameStore.getState();
      void store.refreshMeta();
      try {
        const saves = await store.listSaves();
        const found = saves.some((s) => s.slot === AUTOSAVE_SLOT);
        if (!cancelled) setHasSave(found);
        if (found) await store.hydrate(AUTOSAVE_SLOT);
      } catch {
        // No persistence backend available — the gate handles a fresh start.
      } finally {
        if (!cancelled) setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!booted) {
    return (
      <main className="cg-app cg-gate" aria-busy="true">
        <p className="cg-kicker">Opening the case file…</p>
      </main>
    );
  }

  // Entry gate — no active run.
  if (!state) {
    return (
      <NewRunGate
        hasSave={hasSave}
        onNewRun={() => {
          const store = useGameStore.getState();
          store.newGame();
          void store.persist(AUTOSAVE_SLOT);
          setHasSave(true);
        }}
        onContinue={() => void useGameStore.getState().hydrate(AUTOSAVE_SLOT)}
      />
    );
  }

  // Return hook — present the offline settlement as gains + decisions, once.
  if (report && report.hoursAway > 0) {
    return (
      <ReturnHook
        report={report}
        onContinue={() => useGameStore.getState().acknowledgeOffline()}
        onSee={() => {
          trackReturnToAllocate();
          useGameStore.getState().acknowledgeOffline();
          navigate('money');
        }}
      />
    );
  }

  const current: ScreenId = screenForHash(hash);

  // The run is over → present THE FALL (Prompt 23; design/07 §6) instead of the
  // shell. The one exception is the High Score screen, so [ Leaderboard ] works;
  // any other route falls back here until the player takes the dare.
  if (state.runStatus !== 'active' && current !== 'highscore') {
    return (
      <RunEndScreen
        onStartNextRun={() => useGameStore.getState().startNextRun()}
        onLeaderboard={() => navigate('highscore')}
      />
    );
  }

  const Screen = SCREENS[current];

  // A fired beat / chained card presents as an in-world scene, over everything else
  // (design/08 — interrupts show immediately). One at a time; resolving advances the
  // queue. Return-hook choices (no card) stay on the Money screen, not here.
  const scene = nextCardScene(state);

  const navItems: BottomNavItem[] = SCREEN_NODES.filter((n) => n.inNav).map(
    (n) => ({
      id: n.id,
      label: n.label,
    }),
  );

  // Empire Map + High Score live one level up (design/07 §2/§8).
  const topNodes = SCREEN_NODES.filter((n) => !n.inNav);

  return (
    <div className="cg-shell">
      <header className="cg-shell__top">
        <span className="cg-kicker">Caribbean Gangsta</span>
        <nav className="cg-shell__uplinks" aria-label="Overview">
          {topNodes.map((n) => {
            // A small count of what's in flight on the Transport uplink (Item 8).
            const badge = n.id === 'transport' ? state.shipments.length : 0;
            return (
              <button
                key={n.id}
                type="button"
                className="cg-btn cg-btn--ghost"
                aria-current={current === n.id ? 'page' : undefined}
                onClick={() => navigate(n.route)}
              >
                {n.label}
                {badge > 0 ? (
                  <span
                    className="cg-uplink__badge"
                    aria-label={`${badge} in flight`}
                    data-testid="transport-badge"
                    style={{ marginLeft: 6 }}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
          {/* Start over mid-run — destructive, confirmed (design/12 Item 2). */}
          <button
            type="button"
            className="cg-btn cg-btn--ghost"
            data-testid="abandon-run"
            onClick={() => setConfirmAbandon(true)}
          >
            Abandon run
          </button>
        </nav>
      </header>

      <main className="cg-app cg-shell__main">
        <Screen />
      </main>

      <BottomNav
        items={navItems}
        activeId={current}
        onSelect={(id) => navigate(id)}
      />

      {scene ? (
        <StoryCardModal
          card={scene.card}
          onResolve={(choiceIndex) =>
            useGameStore.getState().resolveCardChoice(scene.choiceId, choiceIndex)
          }
        />
      ) : null}

      {confirmAbandon ? (
        <AbandonRunModal
          onCancel={() => setConfirmAbandon(false)}
          onConfirm={() => {
            setConfirmAbandon(false);
            // Banks the score-so-far through `endCurrentRun` and drops onto the
            // Run-End screen (the shell re-renders once runStatus flips).
            void useGameStore.getState().abandonRun();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The abandon-run confirmation (design/12 Item 2) — one clear, destructive
 * warning listing what's lost before the run is banked and reset. Modeled on the
 * story-card interrupt so it reads like an in-world decision, not a browser alert.
 */
function AbandonRunModal({
  onCancel,
  onConfirm,
}: {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <div
      className="cg-modal__scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Abandon this run?"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        zIndex: 50,
        padding: 16,
      }}
    >
      <div className="cg-card" style={{ maxWidth: 420 }}>
        <h2 className="cg-kicker">Abandon this run?</h2>
        <p className="cg-label" style={{ margin: '10px 0' }}>
          This ends the run for good. Your empire, crew, stashes, product, and cash
          are gone — the score you reached so far banks to the leaderboard, then a
          brand-new city is dealt. There is no undo.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button variant="ghost" fullWidth onClick={onCancel}>
            Keep playing
          </Button>
          <Button variant="primary" fullWidth onClick={onConfirm} data-testid="abandon-confirm">
            Abandon run
          </Button>
        </div>
      </div>
    </div>
  );
}
