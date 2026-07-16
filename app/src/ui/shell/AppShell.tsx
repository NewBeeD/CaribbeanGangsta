import { useEffect, useState } from 'react';
import {
  AUTOSAVE_SLOT,
  useGameStore,
  useGameState,
  useOfflineReport,
} from '@/store';
import {
  ARREST_CHOICE_KIND,
  FAVOR_CHOICE_KIND,
  arrestBond,
  favorOfficialFor,
  favorQuote,
  type GameState,
  type Shipment,
} from '@/engine';
import { BottomNav, Button, type BottomNavItem } from '@/ui/components';
import { SCREEN_NODES, screenForHash, type ScreenId } from './nav';
import { NewRunGate } from './NewRunGate';
import { ReturnHook } from './ReturnHook';
import { RunEndScreen } from '@/ui/screens/RunEndScreen';
import { StoryCardModal } from './StoryCardModal';
import { nextCardScene } from './storyCardPresenter.model';
import { SCREENS } from './screens';
import { navigate, useHash } from './useHash';
import { formatClock } from './clockReadout.model';
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

  // The live in-game clock (Ideas2 §6): once a run is active, real time keeps the
  // world moving — shipments arrive, heat cools, interest accrues — whether or not
  // the player acts. It runs only while the tab is visible; hiding the tab pauses
  // it (the away gap settles through the offline path on the next resume), so time
  // reflects active play, never a monster catch-up. `runStatus` in the deps
  // re-syncs when a run ends.
  const runStatus = state?.runStatus;
  useEffect(() => {
    if (!booted) return;
    const sync = () => {
      const store = useGameStore.getState();
      const active = store.state?.runStatus === 'active';
      if (active && document.visibilityState === 'visible') store.startClock();
      else store.stopClock();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      useGameStore.getState().stopClock();
    };
  }, [booted, runStatus]);

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

  // A self-run arrest presents as a consequential interrupt in the death-spiral
  // style (design/13 B4): post the disclosed bond, or serve the disclosed
  // sentence — either way the run continues.
  const arrest = state.pendingChoices.find((c) => c.kind === ARREST_CHOICE_KIND) ?? null;

  // A "call in a favor" interrupt (design/13 F; Prompt 48): an interdicted load a
  // payrolled official can pull back — call it in (pay the disclosed fee + loyalty)
  // or let it go (today's seizure). Consequential, so it presents as a modal.
  const favor = state.pendingChoices.find((c) => c.kind === FAVOR_CHOICE_KIND) ?? null;
  const favorShipment = favor
    ? (state.shipments.find((s) => s.favorPending && `favor-${s.id}` === favor.id) ?? null)
    : null;

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
        <div className="cg-shell__brand">
          <span className="cg-kicker">Caribbean Gangsta</span>
          <span
            className="cg-label"
            data-testid="clock-readout"
            aria-label="In-game date"
            style={{ opacity: 0.75 }}
          >
            {formatClock(state.clock).text}
          </span>
        </div>
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

      {!scene && arrest ? (
        <ArrestModal
          state={state}
          summary={arrest.summary}
          onBond={() => void useGameStore.getState().resolveArrest(arrest.id, 'bond')}
          onServe={() =>
            void useGameStore.getState().resolveArrest(arrest.id, 'serve')
          }
        />
      ) : null}

      {!scene && !arrest && favor && favorShipment ? (
        <FavorModal
          state={state}
          shipment={favorShipment}
          summary={favor.summary}
          onCall={() => useGameStore.getState().resolveFavor(favor.id, 'call')}
          onLetGo={() => useGameStore.getState().resolveFavor(favor.id, 'let-go')}
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
 * The self-run arrest interrupt (design/13 B4; Prompt 44) — the telegraphed,
 * consensual bond-or-sentence choice. Both prices are SHOWN before choosing
 * (the launch quote already disclosed the risk: "You're driving — if this is
 * stopped, you're in the cuffs"). Unaffordable bond = you're doing the time;
 * that's the teeth the player signed up for by helming the run. Serving
 * fast-forwards the disclosed sentence (costs and threats run, income freezes)
 * and the run resumes. Never fires consigned.
 */
function ArrestModal({
  state,
  summary,
  onBond,
  onServe,
}: {
  readonly state: GameState;
  readonly summary: string;
  readonly onBond: () => void;
  readonly onServe: () => void;
}) {
  const bond = arrestBond(state);
  const canAfford = state.cleanCash >= bond;
  const sentenceDays = Math.round(state.config.transport.ARREST_SENTENCE_HOURS / 24);
  return (
    <div
      className="cg-modal__scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Arrested"
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
      <div className="cg-card" style={{ maxWidth: 420 }} data-testid="arrest-modal">
        <h2 className="cg-kicker">Arrested</h2>
        <p className="cg-label" style={{ margin: '10px 0' }}>
          {summary}
        </p>
        <p className="cg-label" style={{ margin: '10px 0' }}>
          Bond is ${Math.round(bond).toLocaleString('en-US')}, clean cash only
          {canAfford ? '.' : " — and you can't cover it. You're doing the time."}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button
            variant="primary"
            fullWidth
            onClick={onBond}
            disabled={!canAfford}
            data-testid="arrest-bond"
          >
            Post bond
            <small>${Math.round(bond).toLocaleString('en-US')} clean · heat spikes</small>
          </Button>
          <Button variant="ghost" fullWidth onClick={onServe} data-testid="arrest-serve">
            Serve the sentence
            <small>{sentenceDays} days inside — costs run, income freezes</small>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The "call in a favor" interrupt (design/13 F; Prompt 48) — an interdicted load a
 * payrolled official can pull back off the dock. Deterministic against the roll
 * that already came up bad: the fee (a fraction of the cargo's sell value) and the
 * loyalty cost are SHOWN before choosing. Call it in and the exact load is
 * delivered; let it go and the seizure lands exactly as it would have. Unaffordable
 * fee = you can only let it go — the load's gone either way, but the choice was real.
 */
function FavorModal({
  state,
  shipment,
  summary,
  onCall,
  onLetGo,
}: {
  readonly state: GameState;
  readonly shipment: Shipment;
  readonly summary: string;
  readonly onCall: () => void;
  readonly onLetGo: () => void;
}) {
  const official = favorOfficialFor(state);
  const quote = official ? favorQuote(state, shipment, official) : null;
  const fee = quote?.fee ?? 0;
  const canAfford = official !== null && state.cleanCash >= fee;
  return (
    <div
      className="cg-modal__scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Call in a favor"
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
      <div className="cg-card" style={{ maxWidth: 420 }} data-testid="favor-modal">
        <h2 className="cg-kicker">Call in a favor</h2>
        <p className="cg-label" style={{ margin: '10px 0' }}>
          {summary}
        </p>
        <p className="cg-label" style={{ margin: '10px 0' }}>
          {official ? official.name : 'Your contact'} wants $
          {fee.toLocaleString('en-US')}, clean cash only
          {canAfford ? ' — and they owe you enough to make it stick.' : " — and you can't cover it."}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button
            variant="primary"
            fullWidth
            onClick={onCall}
            disabled={!canAfford}
            data-testid="favor-call"
          >
            Call it in
            <small>${fee.toLocaleString('en-US')} clean · costs their loyalty</small>
          </Button>
          <Button variant="ghost" fullWidth onClick={onLetGo} data-testid="favor-let-go">
            Let it go
            <small>The load is seized — take the loss</small>
          </Button>
        </div>
      </div>
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
