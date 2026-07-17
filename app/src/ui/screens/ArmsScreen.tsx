/**
 * The Arms page (Prompt 35; design/12 Item 1) — the game's most dangerous market,
 * OFF the drug board. Behind a one-time BROKER intro (a pure money gate) the
 * player trades weapon TIERS (pistols → military) that carry the heaviest heat in
 * the game; prices sit near-flat until a CONFLICT EVENT spikes demand — the money
 * window. A paid Customs Chief's EUC paper cuts the seizure odds (the corruption
 * tie-in). PURE composition: it reads numbers from `armsScreen.model` selectors
 * and dispatches ONE store action; it authors no economic/heat/odds math, and the
 * bust % shown is `armsBustProbability` verbatim. Outcomes render as scenes.
 */

import { useState } from 'react';
import type { ArmsBrokerResult, ArmsDealResult, WeaponTierId } from '@/engine';
import { WEAPON_TIERS, currentTier, tierDots } from '@/engine';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, HeatDots, Panel, RiskMeter, SceneText, Stat, TrendArrow } from '@/ui/components';
import { NewsTicker } from './NewsTicker';
import {
  armsBookCountries,
  armsCountrySheet,
  armsMarketChoices,
  armsPriceBook,
  armsSceneFor,
  armsSellBust,
  armsTierBoard,
  armsTierRows,
  brokerIntroProse,
  brokerQuote,
  clampArmsQty,
  defaultArmsCountry,
  hasCustomsPaper,
  maxArmsQty,
  type ArmsMode,
  type ArmsPriceCell,
} from './armsScreen.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const signedMoney = (n: number): string =>
  `${n < 0 ? '−' : '+'} $${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

type BookView = 'tier' | 'country' | 'book';

/** The page's two top-level sections: the read-only market (the price book) and
 * the trade (catalogue + buy/sell). Kept in UI state — no engine bearing. */
type ArmsTab = 'market' | 'trade';

/**
 * One price-book line, shared by the By-tier and By-country views (README UI
 * rule: both reads render through one component so their cells can never
 * diverge). `title` is the country name (tier view) or the tier name (country
 * view). Every number is `getArmsPrice` verbatim via `armsScreen.model`.
 */
function ArmsPriceRow({ cell, title, testid }: {
  readonly cell: ArmsPriceCell;
  readonly title: string;
  readonly testid: string;
}) {
  return (
    <div className="cg-panel" data-testid={testid} style={{ width: '100%' }}>
      <div
        style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}
      >
        <span className="cg-stat__value">
          {title}
          {cell.presence > 0 ? ' ·📍' : ''}
          {cell.conflict ? ' 🔥' : ''}
        </span>
        <TrendArrow direction={cell.trend} />
      </div>
      <div className="cg-label" style={{ marginTop: 4 }}>
        {money(cell.price)} · ~{cell.stock} available · {cell.demandNote} · +{cell.heatPerUnit}{' '}
        heat/unit ({cell.heatClass})
      </div>
    </div>
  );
}

export function ArmsScreen() {
  const state = useGameState();
  const [countryId, setCountryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<WeaponTierId>('pistols');
  const [mode, setMode] = useState<ArmsMode>('buy');
  const [qty, setQty] = useState(1);
  const [result, setResult] = useState<ArmsDealResult | null>(null);
  const [brokerScene, setBrokerScene] = useState<ArmsBrokerResult | null>(null);
  const [bookView, setBookView] = useState<BookView>('tier');
  const [bookTier, setBookTier] = useState<WeaponTierId>('pistols');
  const [bookCountry, setBookCountry] = useState<string>(armsBookCountries()[0]?.id ?? '');
  // Open on the trade once the broker's paid; otherwise the market's all there is.
  const [tab, setTab] = useState<ArmsTab>(state?.armsBroker ? 'trade' : 'market');

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const market = countryId ?? defaultArmsCountry(state);
  const markets = armsMarketChoices(state);
  const rows = armsTierRows(state, market);
  const row = rows.find((r) => r.id === selected) ?? rows[0]!;
  const quote = brokerQuote(state);
  const heat = tierDots(state);

  // The broker just opened — a scene, then back to the (now unlocked) trade.
  if (brokerScene?.ok) {
    const scene = armsSceneFor(brokerScene.sceneKey);
    return (
      <Card heading="The meeting">
        <SceneText tone={scene.tone} who={scene.who}>
          {scene.text}
        </SceneText>
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" fullWidth onClick={() => setBrokerScene(null)}>
            Open the ledger
          </Button>
        </div>
      </Card>
    );
  }

  // A resolved arms deal reads as a scene — success OR bust (design/05 §4).
  if (result) {
    const scene = armsSceneFor(result.sceneKey);
    return (
      <Card heading="The exchange">
        <SceneText tone={scene.tone} who={scene.who}>
          {scene.text}
        </SceneText>
        {result.cashDelta !== 0 && (
          <div style={{ marginTop: 12 }}>
            <Stat
              label={result.outcome === 'bust' ? 'Seized' : result.cashDelta > 0 ? 'Cash in' : 'Cash out'}
              value={signedMoney(result.cashDelta)}
              tone={result.cashDelta > 0 ? 'green' : 'red'}
              big
            />
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              setResult(null);
              setQty(1);
            }}
          >
            Back to the broker
          </Button>
        </div>
      </Card>
    );
  }

  const unlocked = state.armsBroker;
  const max = unlocked ? maxArmsQty(mode, state, selected, market) : 0;
  const clamped = clampArmsQty(qty, max);
  const canAct = unlocked && max > 0;
  const bustProb =
    unlocked && mode === 'sell' ? armsSellBust(state, selected, Math.max(1, clamped), market) : 0;

  const step = (delta: number) => setQty((q) => clampArmsQty(clampArmsQty(q, max) + delta, max));

  const pick = (id: WeaponTierId) => {
    setSelected(id);
    setMode((state.armory[id] ?? 0) > 0 ? 'sell' : 'buy');
    setQty(1);
  };

  const openBroker = () => {
    const r = useGameStore.getState().unlockArmsBroker();
    if (r?.ok) {
      setBrokerScene(r);
      setTab('trade');
    }
  };

  const commit = () => {
    const q = clampArmsQty(qty, max);
    if (q <= 0) return;
    const r = useGameStore.getState().commitArmsDeal({
      type: mode === 'buy' ? 'buyArms' : 'sellArms',
      tier: selected,
      qty: q,
      countryId: market,
    });
    if (r && r.outcome !== 'rejected') {
      setResult(r);
      setQty(1);
    }
  };

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
          <select
            className="cg-select"
            aria-label="Arms market"
            data-testid="arms-market-switcher"
            value={market}
            onChange={(e) => {
              setCountryId(e.target.value);
              setQty(1);
            }}
          >
            {markets.map((m) => (
              <option key={m.countryId} value={m.countryId}>
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="cg-label">{markets[0]?.name ?? ''} · Arms</span>
        )}
        <HeatDots value={heat.filled} max={heat.total} tier={currentTier(state)} />
      </header>

      <NewsTicker />

      {/* The broker gate — a pure money intro, priced in prose (design/12 Item 1).
          Stays above the tabs while locked: the market's open access, but nothing
          trades until the introduction is bought. */}
      {!unlocked && (
        <Card heading="The broker">
          <SceneText tone="default">{brokerIntroProse(state)}</SceneText>
          <p className="cg-label" style={{ marginTop: 8 }}>
            The meeting alone runs the DEA’s attention hot: +{quote.meetingHeat} heat.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button
              variant="primary"
              fullWidth
              onClick={openBroker}
              disabled={state.cleanCash < quote.cost}
              data-testid="arms-broker-unlock"
            >
              Take the meeting
              <small>
                {state.cleanCash < quote.cost
                  ? `Need ${money(quote.cost)} clean`
                  : `${money(quote.cost)} clean`}
              </small>
            </Button>
          </div>
        </Card>
      )}

      {/* The two sections: the read-only Market (price book) and the Buy/Sell
          trade. Both stay reachable pre-broker — the market's open access. */}
      <div
        style={{ display: 'flex', gap: 6, marginBottom: 16 }}
        role="tablist"
        aria-label="Arms section"
      >
        {([
          { id: 'market', label: 'Market' },
          { id: 'trade', label: 'Buy / Sell' },
        ] as const).map((t) => (
          <Button
            key={t.id}
            variant={t.id === tab ? 'secondary' : 'ghost'}
            aria-pressed={t.id === tab}
            data-testid={`arms-tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'market' && (
      /* The price book (Prompt 50; design/13 §H) — every tier's price in every
         arms-trading country, three ways to read it, visible from minute one
         (open access, before the broker). Informational; trading executes on
         the Buy/Sell tab, where you stand. */
      <Card heading="The price book">
        <p className="cg-label" style={{ marginBottom: 10 }}>
          Every weapon tier, every market — prices are the arms line’s, verbatim.
          The money is in a conflict spike 🔥.
        </p>
        <div
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
          role="tablist"
          aria-label="Price book view"
        >
          {([
            { id: 'tier', label: 'By tier' },
            { id: 'country', label: 'By country' },
            { id: 'book', label: 'Full book' },
          ] as const).map((v) => (
            <Button
              key={v.id}
              variant={v.id === bookView ? 'secondary' : 'ghost'}
              aria-pressed={v.id === bookView}
              data-testid={`arms-book-view-${v.id}`}
              onClick={() => setBookView(v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>

        {bookView === 'tier' ? (
          <>
            <div
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
              role="tablist"
              aria-label="Weapon tier"
            >
              {WEAPON_TIERS.map((t) => (
                <Button
                  key={t.id}
                  variant={t.id === bookTier ? 'secondary' : 'ghost'}
                  aria-pressed={t.id === bookTier}
                  onClick={() => setBookTier(t.id)}
                >
                  {t.name}
                </Button>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {armsTierBoard(state, bookTier).map((cell) => (
                <ArmsPriceRow
                  key={cell.countryId}
                  cell={cell}
                  title={cell.countryName}
                  testid={`arms-book-tier-${cell.countryId}`}
                />
              ))}
            </div>
          </>
        ) : null}

        {bookView === 'country' ? (
          <>
            <div
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
              role="tablist"
              aria-label="Arms market"
            >
              {armsBookCountries().map((c) => (
                <Button
                  key={c.id}
                  variant={c.id === bookCountry ? 'secondary' : 'ghost'}
                  aria-pressed={c.id === bookCountry}
                  data-testid={`arms-book-country-${c.id}`}
                  onClick={() => setBookCountry(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {armsCountrySheet(state, bookCountry).map((cell) => (
                <ArmsPriceRow
                  key={cell.tierId}
                  cell={cell}
                  title={cell.tierName}
                  testid={`arms-book-sheet-${cell.tierId}`}
                />
              ))}
            </div>
          </>
        ) : null}

        {bookView === 'book' ? (
          (() => {
            const book = armsPriceBook(state);
            return (
          <div style={{ overflowX: 'auto' }}>
            <table className="cg-pricebook">
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Tier
                  </th>
                  {book.countries.map((c) => (
                    <th key={c.id} scope="col" style={{ textAlign: 'right' }}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.rows.map((row, i) => (
                  <tr key={book.tiers[i]!.id}>
                    <th scope="row" style={{ textAlign: 'left' }}>
                      {book.tiers[i]!.name}
                    </th>
                    {row.map((cell) => (
                      <td
                        key={cell.countryId}
                        data-testid={`arms-book-${cell.tierId}-${cell.countryId}`}
                        style={{
                          textAlign: 'right',
                          color: cell.conflict ? 'var(--cg-brass)' : undefined,
                          fontWeight: cell.conflict ? 700 : undefined,
                        }}
                      >
                        {money(cell.price)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            );
          })()
        ) : null}
      </Card>
      )}

      {tab === 'trade' && (
      <>
      {unlocked && (
        <Panel heading="The broker">
          <p className="cg-label" data-testid="arms-broker-status">
            You’re on the list. The whole catalogue is open — and so is the risk.
          </p>
        </Panel>
      )}

      <Card heading="The catalogue">
        <div style={{ marginBottom: 12 }}>
          <Stat label="Cash on hand" value={money(state.stashes[0]?.dirtyCash ?? 0)} tone="gold" big />
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
                  <span className="cg-stat__value">
                    {r.name}
                    {r.conflict ? ' 🔥' : ''}
                  </span>
                  <TrendArrow direction={r.trend} />
                </div>
                <div className="cg-label" style={{ marginTop: 4 }}>
                  {money(r.price)} · ~{r.stock} available · You hold {r.held} · +{r.heatPerUnit} heat/unit
                </div>
                {r.conflict ? (
                  <div className="cg-label" style={{ marginTop: 2, color: 'var(--cg-danger, #c0392b)' }}>
                    Conflict spike — demand is up, and so is the heat on a sale.
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>

      {unlocked && (
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
                label="Seizure chance"
                note="If busted: lose the hardware + cash"
              />
              {hasCustomsPaper(state) ? (
                <p className="cg-label" style={{ marginTop: 8 }} data-testid="arms-euc-note">
                  Your Customs Chief’s paperwork (EUCs) is holding — the seizure odds are cut.
                </p>
              ) : null}
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

          <Button variant="primary" fullWidth onClick={commit} disabled={!canAct} data-testid="arms-commit">
            {mode === 'sell' ? 'Make the sale' : 'Buy'}
            <small>
              {canAct
                ? `${money(row.price)} / unit`
                : mode === 'sell'
                  ? 'Nothing to move'
                  : row.stock <= 0
                    ? 'The line is dry'
                    : 'No cash'}
            </small>
          </Button>
        </Card>
      )}
      </>
      )}
    </div>
  );
}
