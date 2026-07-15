/**
 * The World Market screen — the Drug-Lord-2 price board (Prompt 31; design/11
 * §1–§2; Ideas2 §2/§3/§6). Three ways to read the SAME prices, from minute one:
 *  • By product — pick a drug, read its price in EVERY country (geography is the
 *    margin engine, and reading this board is the transferable skill);
 *  • By country — stand in one country, read the WHOLE drug menu at once
 *    (Ideas2 §6, "drug prices by country, just like Drug Lord 2");
 *  • Price book — the drugs × countries matrix, everything at a glance.
 * Un-traded cells are inert ("no market" — the regional culture, Ideas2 §5); a
 * true source you haven't met shows its contract price behind the 🔌 intro cost
 * (a pure money gate, never a hidden menu).
 *
 * PURE composition: every number comes from `worldMarket.model` (which is
 * `getMarketPrice` / `plugQuote` verbatim); the one mutation — buying a plug —
 * dispatches through the store, disclosing cost AND meeting heat before the
 * button, and renders its outcome as a scene, never a toast (design/05 §4).
 */

import { useState } from 'react';
import { COUNTRIES, type PlugResult, type PriceTrend, type ProductId } from '@/engine';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, SceneText, Stat, TrendArrow } from '@/ui/components';
import { navigate } from '@/ui/shell/useHash';
import {
  boardProducts,
  boardRows,
  countryDetail,
  countryPriceSheet,
  plugSceneFor,
  priceBook,
  productName,
} from './worldMarket.model';
import { NewsTicker } from './NewsTicker';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

type BoardView = 'product' | 'country' | 'book';

/**
 * One price line, shared by the By-product and By-country views (README UI rule:
 * both reads render through one component, so their cells can never diverge).
 * `title` is the country name (product view) or the drug name (country view);
 * `noMarketName` is always the drug — "No market for {drug} here".
 */
function PriceRow(props: {
  readonly title: string;
  readonly presence: number;
  readonly traded: boolean;
  readonly trend: PriceTrend;
  readonly price: number;
  readonly stock: number;
  readonly plugGated: boolean;
  readonly plugPriced: boolean;
  readonly plugCost: number;
  readonly noMarketName: string;
  readonly testid: string;
  readonly current?: boolean;
  readonly onClick?: () => void;
}) {
  const { onClick } = props;
  return (
    <button
      type="button"
      className="cg-panel"
      data-testid={props.testid}
      aria-current={props.current ? 'true' : undefined}
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        width: '100%',
        outline: props.current ? '2px solid var(--cg-brass)' : 'none',
        opacity: props.traded ? 1 : 0.55,
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
          {props.title}
          {props.presence > 0 ? ' ·📍' : ''}
        </span>
        {props.traded ? <TrendArrow direction={props.trend} /> : null}
      </div>
      <div className="cg-label" style={{ marginTop: 4 }}>
        {props.traded ? (
          props.plugGated ? (
            <>
              🔌 Contract {money(props.price)} — intro {money(props.plugCost)} · ~
              {props.stock} on the street
            </>
          ) : (
            <>
              {money(props.price)}
              {props.plugPriced ? ' (contract)' : ''} · ~{props.stock} on the street
            </>
          )
        ) : (
          <>No market for {props.noMarketName} here</>
        )}
      </div>
    </button>
  );
}

export function WorldMarketScreen() {
  const state = useGameState();
  const [view, setView] = useState<BoardView>('product');
  const [product, setProduct] = useState<ProductId>('cocaine');
  const [countryId, setCountryId] = useState<string | null>(null);
  const [sheetCountryId, setSheetCountryId] = useState<string>(COUNTRIES[0]?.id ?? '');
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
  const detail = view === 'product' && countryId ? countryDetail(state, countryId) : null;
  const sheet = countryPriceSheet(state, sheetCountryId);
  const sheetCountryName = COUNTRIES.find((c) => c.id === sheetCountryId)?.name ?? sheetCountryId;
  const book = view === 'book' ? priceBook(state) : null;

  const buyPlug = (id: string) => {
    const result = useGameStore.getState().buyPlugIntro(id);
    if (result) setPlugResult(result);
  };

  const VIEWS: readonly { id: BoardView; label: string }[] = [
    { id: 'product', label: 'By product' },
    { id: 'country', label: 'By country' },
    { id: 'book', label: 'Price book' },
  ];

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

      <NewsTicker />

      {/* The same prices, three ways to read them (Ideas2 §6). */}
      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
        role="tablist"
        aria-label="Board view"
      >
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            variant={v.id === view ? 'secondary' : 'ghost'}
            aria-pressed={v.id === view}
            data-testid={`view-${v.id}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </Button>
        ))}
      </div>

      {view === 'product' ? (
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
              <PriceRow
                key={r.countryId}
                testid={`board-${r.countryId}`}
                title={r.countryName}
                presence={r.presence}
                traded={r.traded}
                trend={r.trend}
                price={r.price}
                stock={r.stock}
                plugGated={r.plugGated}
                plugPriced={r.plugPriced}
                plugCost={r.plugCost}
                noMarketName={productName(state, product)}
                current={countryId === r.countryId}
                onClick={() => setCountryId(r.countryId)}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {view === 'country' ? (
        <Card heading="The menu">
          {/* Country picker — the whole roster; read any country's full sheet
              from minute one, no stash required (open access). */}
          <div
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
            role="tablist"
            aria-label="Country"
          >
            {COUNTRIES.map((c) => (
              <Button
                key={c.id}
                variant={c.id === sheetCountryId ? 'secondary' : 'ghost'}
                aria-pressed={c.id === sheetCountryId}
                data-testid={`sheet-country-${c.id}`}
                onClick={() => setSheetCountryId(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>

          <p className="cg-label" style={{ marginBottom: 10 }}>
            Every drug's price in {sheetCountryName} right now.
          </p>

          <div style={{ display: 'grid', gap: 8 }}>
            {sheet.map((r) => (
              <PriceRow
                key={r.productId}
                testid={`sheet-${r.productId}`}
                title={r.productName}
                presence={r.presence}
                traded={r.traded}
                trend={r.trend}
                price={r.price}
                stock={r.stock}
                plugGated={r.plugGated}
                plugPriced={r.plugPriced}
                plugCost={r.plugCost}
                noMarketName={r.productName}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {view === 'book' && book ? (
        <Card heading="Price book">
          <p className="cg-label" style={{ marginBottom: 10 }}>
            Every drug × every island at a glance. The widest buy-here-sell-there
            spread is lit.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="cg-pricebook">
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Drug
                  </th>
                  {book.countries.map((c) => (
                    <th key={c.id} scope="col" style={{ textAlign: 'right' }}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.products.map((p, i) => (
                  <tr key={p.id}>
                    <th scope="row" style={{ textAlign: 'left' }}>
                      {p.name}
                    </th>
                    {(book.rows[i] ?? []).map((cell) => {
                      const hot =
                        book.spread?.product === p.id &&
                        (cell.countryId === book.spread.buyCountry ||
                          cell.countryId === book.spread.sellCountry);
                      return (
                        <td
                          key={cell.countryId}
                          data-testid={`book-${p.id}-${cell.countryId}`}
                          style={{
                            textAlign: 'right',
                            opacity: cell.traded ? 1 : 0.4,
                            color: hot ? 'var(--cg-brass)' : undefined,
                            fontWeight: hot ? 700 : undefined,
                          }}
                        >
                          {cell.traded ? money(cell.price) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

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
      ) : view === 'product' ? (
        <Panel heading="Reading the board">
          <p className="cg-label">
            Tap a country for its culture, risk, and the plug. Cheap at the source, dear
            far from it — the water in between is the margin.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
