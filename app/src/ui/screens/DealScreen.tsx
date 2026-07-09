/**
 * The Deal screen — Loop 1, the core moment (Prompt 15; design/07 §1).
 *
 * Buy low / sell high / dodge heat, rendered so market reading is a legible skill
 * and risk is fair and estimable. The screen is PURE composition: it reads numbers
 * from `dealScreen.model` selectors and dispatches a single intent through the
 * store — it authors no economic math. The bust % it shows is `computeBustProbability`
 * verbatim (via `sellBustProbability`), and the outcome — win OR bust — always
 * renders as a scene, never a toast (design/05 §4).
 */

import { useState } from 'react';
import type { DealResult } from '@/engine';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, HeatDots, Panel, RiskMeter, SceneText, Stat, TrendArrow } from '@/ui/components';
import { currentTier, tierDots } from '@/engine';
import type { DealIntent, ProductId } from '@/engine';
import {
  DEAL_LOCATION,
  clampQty,
  defaultMode,
  defaultProduct,
  homeStash,
  maxQty,
  productRows,
  sceneFor,
  sellBustProbability,
  type DealMode,
} from './dealScreen.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const signedMoney = (n: number): string =>
  `${n < 0 ? '−' : '+'} $${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/**
 * The post-deal outcome — success OR bust — rendered as a SCENE (never a toast;
 * design/05 §4, design/07 §1). Exported so the scene contract is component-testable
 * in isolation. `onContinue` returns the player to the deal board.
 */
export function DealOutcome({
  result,
  onContinue,
}: {
  readonly result: DealResult;
  readonly onContinue: () => void;
}) {
  const scene = sceneFor(result.sceneKey);
  return (
    <Card heading="The deal">
      <SceneText tone={scene.tone} who={scene.who}>
        {scene.text}
      </SceneText>
      {result.cashDelta !== 0 && (
        <div style={{ marginTop: 12 }}>
          <Stat
            label={
              result.outcome === 'bust' ? 'Seized' : result.cashDelta > 0 ? 'Cash in' : 'Cash out'
            }
            value={signedMoney(result.cashDelta)}
            tone={result.cashDelta > 0 ? 'green' : 'red'}
            big
          />
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <Button variant="primary" fullWidth onClick={onContinue}>
          Back to the corner
        </Button>
      </div>
    </Card>
  );
}

export function DealScreen() {
  const state = useGameState();
  const [selected, setSelected] = useState<ProductId>(() => defaultProduct(state));
  const [mode, setMode] = useState<DealMode>(() => defaultMode(state, defaultProduct(state)));
  const [qty, setQty] = useState(1);
  const [result, setResult] = useState<DealResult | null>(null);

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const stash = homeStash(state);
  const location = DEAL_LOCATION;
  const rows = productRows(state, location, stash);
  const row = rows.find((r) => r.id === selected) ?? rows[0]!;

  // Outcome view — the deal just resolved. Success and bust both read as a scene.
  // `state` here is already the post-deal state, so returning re-picks the mode
  // that now fits the holdings (e.g. flip back to buy after selling out).
  if (result) {
    return (
      <DealOutcome
        result={result}
        onContinue={() => {
          setMode(defaultMode(state, selected));
          setQty(1);
          setResult(null);
        }}
      />
    );
  }

  const max = maxQty(mode, state, selected, location, stash);
  const clamped = clampQty(qty, max);
  const canAct = max > 0;
  // Buys don't roll a bust; the risk panel appears only for a sell (design/07 §1).
  const bustProb = mode === 'sell' ? sellBustProbability(state, selected, Math.max(1, clamped), location) : 0;

  const step = (delta: number) => setQty((q) => clampQty(clampQty(q, max) + delta, max));

  const pick = (id: ProductId) => {
    setSelected(id);
    setMode(defaultMode(state, id));
    setQty(1);
  };

  const commit = () => {
    const q = clampQty(qty, max);
    if (q <= 0) return;
    const intent: DealIntent = {
      type: mode,
      product: selected,
      qty: q,
      location,
      stashId: stash.id,
    };
    const r = useGameStore.getState().commitDeal(intent);
    if (r) {
      setResult(r);
      setQty(1);
    }
  };

  const heat = tierDots(state);
  const primaryLabel = mode === 'sell' ? 'Make the sell' : 'Buy';

  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Button variant="ghost" onClick={() => window.history.back()} aria-label="Back">
          ‹ Back
        </Button>
        <span className="cg-label">{state.world.startingCountry.name} · Source</span>
        <HeatDots value={heat.filled} max={heat.total} tier={currentTier(state)} />
      </header>

      <Card heading="The board">
        <div style={{ marginBottom: 12 }}>
          <Stat label="Cash on hand" value={money(stash.dirtyCash)} tone="gold" big />
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const isSel = r.id === selected;
            return (
              <button
                key={r.id}
                type="button"
                className="cg-panel"
                aria-current={isSel ? 'true' : undefined}
                aria-pressed={isSel}
                onClick={() => pick(r.id)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  outline: isSel ? '2px solid var(--cg-brass)' : 'none',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <span className="cg-stat__value">{r.name}</span>
                  <TrendArrow direction={r.trend} />
                </div>
                <div className="cg-label" style={{ marginTop: 4 }}>
                  Buy {money(r.buy)} · Sell {money(r.sell)} ({r.marginPct >= 0 ? '+' : ''}
                  {r.marginPct}%) · You hold {r.held}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card heading={mode === 'sell' ? 'Sell' : 'Buy'}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <Button
            variant={mode === 'buy' ? 'secondary' : 'ghost'}
            onClick={() => {
              setMode('buy');
              setQty(1);
            }}
            aria-pressed={mode === 'buy'}
          >
            Buy
          </Button>
          <Button
            variant={mode === 'sell' ? 'secondary' : 'ghost'}
            onClick={() => {
              setMode('sell');
              setQty(1);
            }}
            aria-pressed={mode === 'sell'}
            disabled={row.held <= 0}
          >
            Sell
          </Button>
        </div>

        {mode === 'sell' && (
          <Panel heading="Risk this run">
            <RiskMeter
              probability={bustProb}
              label="Bust chance"
              note="If busted: lose product + cash"
            />
          </Panel>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            margin: '18px 0',
          }}
        >
          <Button variant="secondary" onClick={() => step(-1)} disabled={!canAct} aria-label="Fewer units">
            −
          </Button>
          <span className="cg-stat__value" aria-live="polite">
            {clamped} units
          </span>
          <Button variant="secondary" onClick={() => step(1)} disabled={!canAct} aria-label="More units">
            +
          </Button>
        </div>

        <Button variant="primary" fullWidth onClick={commit} disabled={!canAct}>
          {primaryLabel}
          <small>
            {mode === 'sell'
              ? `${money(row.sell)} / unit`
              : canAct
                ? `${money(row.buy)} / unit`
                : 'No room / no cash'}
          </small>
        </Button>
      </Card>
    </div>
  );
}
