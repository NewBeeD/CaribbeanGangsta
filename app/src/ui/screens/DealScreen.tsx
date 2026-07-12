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
import type { ConvertResult, DealResult } from '@/engine';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, HeatDots, Panel, RiskMeter, SceneText, Stat, TrendArrow } from '@/ui/components';
import { currentTier, tierDots } from '@/engine';
import type { DealIntent, GameState, ProductId } from '@/engine';
import { navigate } from '@/ui/shell/useHash';
import {
  clampQty,
  conversionBlockedProse,
  conversionRows,
  dealStashes,
  defaultMode,
  defaultProduct,
  marketName,
  maxQty,
  plugGateProse,
  productRows,
  sceneFor,
  sellBustProbability,
  stashById,
  streetStatus,
  type ConversionRow,
  type DealMode,
} from './dealScreen.model';
import { NewsTicker } from './NewsTicker';

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
  const [stashId, setStashId] = useState<string | null>(null);
  const [result, setResult] = useState<DealResult | null>(null);
  const [cooked, setCooked] = useState<{ row: ConversionRow; result: ConvertResult } | null>(
    null,
  );

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const stash = stashById(state, stashId);
  const markets = dealStashes(state);
  const rows = productRows(state, stash);
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

  // A finished conversion reads as its recipe's scene (design/05 §4).
  if (cooked) {
    return (
      <Card heading={cooked.row.name}>
        <SceneText tone="win">{cooked.row.prose}</SceneText>
        <p className="cg-label" style={{ marginTop: 12 }}>
          {cooked.result.consumed} {cooked.row.fromName.toLowerCase()} + {money(cooked.result.cost)}{' '}
          → {cooked.result.produced} {cooked.row.toName.toLowerCase()}
        </p>
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" fullWidth onClick={() => setCooked(null)}>
            Back to the corner
          </Button>
        </div>
      </Card>
    );
  }

  const plugBlocked = mode === 'buy' && row.plugGated;
  const max = plugBlocked ? 0 : maxQty(mode, state, selected, stash);
  const clamped = clampQty(qty, max);
  const canAct = max > 0;
  // Buys don't roll a bust; the risk panel appears only for a sell (design/07 §1).
  const bustProb = mode === 'sell' ? sellBustProbability(state, selected, Math.max(1, clamped), stash) : 0;

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
        {markets.length > 1 ? (
          // Market switcher (Prompt 31): a stash you own = a market you stand in.
          <select
            className="cg-select"
            aria-label="Market"
            data-testid="market-switcher"
            value={stash.id}
            onChange={(e) => {
              setStashId(e.target.value);
              setQty(1);
            }}
          >
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.marketName} · {m.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="cg-label">{marketName(stash)} · Local market</span>
        )}
        <HeatDots value={heat.filled} max={heat.total} tier={currentTier(state)} />
      </header>

      <NewsTicker />

      <Card heading="The board">
        <div style={{ marginBottom: 12 }}>
          <Stat label="Cash on hand" value={money(stash.dirtyCash)} tone="gold" big />
          {state.cleanCash > 0 ? (
            <p className="cg-label" style={{ marginTop: 4 }}>
              + {money(state.cleanCash)} clean — spends here too
            </p>
          ) : null}
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
                  {r.plugGated ? '🔌 ' : ''}
                  {money(r.price)} · ~{r.stock} on the street · You hold {r.held}
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

        {plugBlocked && (
          // A true source sells to connections — the gate reads as prose with
          // the price of fixing it, and a jump to the plug flow (Ideas2 §2).
          <Panel heading="No plug">
            <SceneText tone="default">{plugGateProse(row, marketName(stash))}</SceneText>
            <div style={{ marginTop: 10 }}>
              <Button variant="ghost" fullWidth onClick={() => navigate('market')} data-testid="jump-to-plug">
                Meet the plug on the World Market →
              </Button>
            </div>
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
              ? `${money(row.price)} / unit`
              : plugBlocked
                ? 'Needs the plug'
                : canAct
                  ? `${money(row.price)} / unit`
                  : row.stock <= 0
                    ? 'The street is dry'
                    : 'No room / no cash'}
          </small>
        </Button>
      </Card>

      {/* The kitchen — cook crack / press hash at this stash (Ideas2 §4). */}
      {conversionRows(state, stash).map((c) => (
        <ConversionPanel
          key={c.id}
          row={c}
          stashId={stash.id}
          onDone={(convRow, convResult) => setCooked({ row: convRow, result: convResult })}
        />
      ))}

      {/* The crew's corners — cooked crack dripping back as dirty cash (Item 5d). */}
      <StreetStatusLine state={state} />
    </div>
  );
}

/**
 * The street-team status: what the crew is holding on the corners and roughly
 * how much dirty cash it's dripping back per day (design/12 Item 5d). Shown only
 * while there's product out there — otherwise the kitchen just offers the cook.
 */
function StreetStatusLine({ state }: { readonly state: GameState }) {
  const street = streetStatus(state);
  if (!street.active) return null;
  return (
    <Card heading="On the corners">
      <p className="cg-label" data-testid="street-status">
        Your crew is holding {street.units} rock{street.units === 1 ? '' : 's'} —{' '}
        {street.perDay > 0 ? `~${money(street.perDay)}/day coming back` : 'moving it slow'}.
      </p>
    </Card>
  );
}

/**
 * One recipe's kitchen panel: a batch stepper clamped by the engine's
 * `maxBatches`, with consumed/produced/cost/heat disclosed BEFORE commit
 * (no dark patterns — the whole trade is on the label). Dispatches through
 * the store; the outcome renders as the recipe's scene, never a toast.
 */
function ConversionPanel({
  row,
  stashId,
  onDone,
}: {
  readonly row: ConversionRow;
  readonly stashId: string;
  readonly onDone: (row: ConversionRow, result: ConvertResult) => void;
}) {
  const [batches, setBatches] = useState(1);
  const clamped = Math.min(Math.max(1, batches), Math.max(1, row.max));
  const canCook = row.max > 0;

  const cook = () => {
    if (!canCook) return;
    const result = useGameStore.getState().convertProduct(row.id, clamped, stashId);
    if (result?.ok) onDone(row, result);
  };

  return (
    <Card heading={row.name}>
      <p className="cg-label" style={{ marginBottom: 10 }} data-testid={`convert-terms-${row.id}`}>
        Per batch: {row.fromQty} {row.fromName.toLowerCase()} + {money(row.costPerBatch)} →{' '}
        {row.toQty} {row.toName.toLowerCase()} · +{row.heatPerBatch} heat
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          margin: '6px 0 12px',
        }}
      >
        <Button
          variant="secondary"
          onClick={() => setBatches((b) => Math.max(1, Math.min(b, row.max) - 1))}
          disabled={!canCook}
          aria-label="Fewer batches"
        >
          −
        </Button>
        <span className="cg-stat__value" aria-live="polite">
          {canCook ? clamped : 0} batch{clamped === 1 && canCook ? '' : 'es'}
        </span>
        <Button
          variant="secondary"
          onClick={() => setBatches((b) => Math.min(row.max, Math.max(1, b) + 1))}
          disabled={!canCook}
          aria-label="More batches"
        >
          +
        </Button>
      </div>
      <Button
        variant="secondary"
        fullWidth
        onClick={cook}
        disabled={!canCook}
        data-testid={`convert-${row.id}`}
      >
        {row.name}
        <small>
          {canCook
            ? `${clamped * row.fromQty} ${row.fromName.toLowerCase()} + ${money(clamped * row.costPerBatch)}`
            : row.binding
              ? conversionBlockedProse(row.binding, row)
              : 'Can’t run a batch right now'}
        </small>
      </Button>
    </Card>
  );
}
