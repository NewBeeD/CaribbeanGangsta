/**
 * The World Market screen — the Drug-Lord-2 price board (Prompt 31; design/11
 * §1–§2; Ideas2 §2/§3). Pick a product, read its price in EVERY country from
 * minute one: geography is the margin engine, and reading this board is the
 * transferable skill. Un-traded cells are inert ("no market" — the regional
 * culture, Ideas2 §5); a true source you haven't met shows its contract price
 * behind the 🔌 intro cost (a pure money gate, never a hidden menu).
 *
 * PURE composition: every number comes from `worldMarket.model` (which is
 * `getMarketPrice` / `plugQuote` verbatim); the one mutation — buying a plug —
 * dispatches through the store, disclosing cost AND meeting heat before the
 * button, and renders its outcome as a scene, never a toast (design/05 §4).
 */

import { useState } from 'react';
import type { PlugResult, ProductId } from '@/engine';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, SceneText, Stat, TrendArrow } from '@/ui/components';
import { navigate } from '@/ui/shell/useHash';
import {
  boardProducts,
  boardRows,
  countryDetail,
  plugSceneFor,
  productName,
} from './worldMarket.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export function WorldMarketScreen() {
  const state = useGameState();
  const [product, setProduct] = useState<ProductId>('cocaine');
  const [countryId, setCountryId] = useState<string | null>(null);
  const [plugResult, setPlugResult] = useState<PlugResult | null>(null);

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  // Plug outcome — a scene, never a toast (design/05 §4).
  if (plugResult) {
    const scene = plugSceneFor(plugResult.sceneKey);
    return (
      <Card heading="The introduction">
        <SceneText tone={scene.tone}>{scene.text}</SceneText>
        {plugResult.ok ? (
          <div style={{ marginTop: 12 }}>
            <Stat label="Paid" value={money(plugResult.cost)} tone="red" big />
          </div>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" fullWidth onClick={() => setPlugResult(null)}>
            Back to the board
          </Button>
        </div>
      </Card>
    );
  }

  const products = boardProducts(state);
  const rows = boardRows(state, product);
  const detail = countryId ? countryDetail(state, countryId) : null;

  const buyPlug = (id: string) => {
    const result = useGameStore.getState().buyPlugIntro(id);
    if (result) setPlugResult(result);
  };

  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span className="cg-kicker">World Market</span>
        <span className="cg-label">Every price, every island, always</span>
      </header>

      <Card heading="The board">
        {/* Product picker — the whole roster, this run's shelf names. */}
        <div
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
          role="tablist"
          aria-label="Product"
        >
          {products.map((p) => (
            <Button
              key={p.id}
              variant={p.id === product ? 'secondary' : 'ghost'}
              aria-pressed={p.id === product}
              onClick={() => setProduct(p.id)}
            >
              {p.name}
            </Button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <button
              key={r.countryId}
              type="button"
              className="cg-panel"
              data-testid={`board-${r.countryId}`}
              aria-current={countryId === r.countryId ? 'true' : undefined}
              onClick={() => setCountryId(r.countryId)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                outline: countryId === r.countryId ? '2px solid var(--cg-brass)' : 'none',
                opacity: r.traded ? 1 : 0.55,
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
                <span className="cg-stat__value">
                  {r.countryName}
                  {r.presence > 0 ? ' ·📍' : ''}
                </span>
                {r.traded ? <TrendArrow direction={r.trend} /> : null}
              </div>
              <div className="cg-label" style={{ marginTop: 4 }}>
                {r.traded ? (
                  r.plugGated ? (
                    <>
                      🔌 Contract buy {money(r.buy)} — intro {money(r.plugCost)} · Sell{' '}
                      {money(r.sell)}
                    </>
                  ) : (
                    <>
                      Buy {money(r.buy)}
                      {r.plugPriced ? ' (contract)' : ''} · Sell {money(r.sell)}
                    </>
                  )
                ) : (
                  <>No market for {productName(state, product)} here</>
                )}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {detail ? (
        <Card heading={detail.name}>
          <div className="cg-label" style={{ marginBottom: 8 }}>
            Street risk {Math.round(detail.risk * 100)}% ·{' '}
            {detail.presence.length > 0
              ? `${detail.presence.length} stash${detail.presence.length === 1 ? '' : 'es'} here`
              : 'no presence yet'}
          </div>
          <p className="cg-label" style={{ marginBottom: 10 }}>
            Trades: {detail.traded.map((t) => t.name).join(', ')}
          </p>
          {detail.hooks[0] ? (
            <SceneText tone="default">{detail.hooks[0]}</SceneText>
          ) : null}

          {detail.plug ? (
            <Panel heading="The plug" style={{ marginTop: 12 }}>
              {detail.plug.connected ? (
                <p className="cg-label" data-testid="plug-connected">
                  Connected. {detail.plug.products.map((p) => productName(state, p)).join(', ')}{' '}
                  moves at the contract price — the cheapest standing number in the game.
                </p>
              ) : (
                <>
                  {/* The full terms BEFORE the button — cost AND heat (fairness). */}
                  <p className="cg-label" style={{ marginBottom: 8 }}>
                    One-time intro: unlocks{' '}
                    {detail.plug.products.map((p) => productName(state, p)).join(', ')} at the
                    contract price. The meeting itself draws +{detail.plug.meetingHeat} heat —
                    the DEA watches who flies to the source.
                  </p>
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={state.cleanCash < detail.plug.cost}
                    onClick={() => buyPlug(detail.countryId)}
                    data-testid="buy-plug"
                  >
                    Take the meeting
                    <small>
                      {state.cleanCash >= detail.plug.cost
                        ? `${money(detail.plug.cost)} clean`
                        : `${money(detail.plug.cost)} clean · short`}
                    </small>
                  </Button>
                </>
              )}
            </Panel>
          ) : null}

          {detail.presence.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <p className="cg-label" style={{ marginBottom: 8 }}>
                Prices are visible everywhere; deals execute where you have a stash.
              </p>
              <Button variant="ghost" fullWidth onClick={() => navigate('empire')}>
                Plant a foothold on the Empire map →
              </Button>
            </div>
          ) : null}
        </Card>
      ) : (
        <Panel heading="Reading the board">
          <p className="cg-label">
            Tap a country for its culture, risk, and the plug. Cheap at the source, dear
            far from it — the water in between is the margin.
          </p>
        </Panel>
      )}
    </div>
  );
}
