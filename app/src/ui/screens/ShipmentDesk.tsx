/**
 * The shipment desk — dispatch cargo across the water and track what's in
 * flight (Prompt 31; design/11 §3; Ideas2 §1/§3). Lives on the Transport page
 * (design/12 Item 8); territory (opened on the Empire map) is where a boat lands.
 *
 * Everything is disclosed BEFORE the launch button enables (no dark patterns):
 * the transport cost, the go-fast owner's cut, every courier's cut, the ETA,
 * the telegraphed skim, and the interdiction % on the RiskMeter — which is
 * `quoteShipment`'s number VERBATIM, snapshotted by the engine and rolled
 * unchanged on arrival (fairness law, design/01 §0.3). Solo runs put the bust
 * heat on you; couriers take a cut and extra escorts buy the odds down.
 * Arrivals and seizures render as scenes, never toasts (design/05 §4).
 */

import { useState } from 'react';
import type { ProductId, ShipIntent, TransportId } from '@/engine';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, QtyInput, RiskMeter, SceneText } from '@/ui/components';
import {
  courierOptions,
  deskQuote,
  destinationOptions,
  inFlightViews,
  originOptions,
  modeOptions,
  shipmentScenes,
} from './shipmentDesk.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export function ShipmentDesk() {
  const state = useGameState();
  const [fromId, setFromId] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductId | null>(null);
  const [qty, setQty] = useState(1);
  const [toId, setToId] = useState<string | null>(null);
  const [mode, setMode] = useState<TransportId>('go-fast');
  const [courierIds, setCourierIds] = useState<readonly string[]>([]);
  const [launched, setLaunched] = useState<string | null>(null);

  if (!state) return null;

  const origins = originOptions(state);
  const inFlight = inFlightViews(state);
  const scenes = shipmentScenes(state);
  const modes = modeOptions();

  // Resolve the working selection against live state (stale picks fall back).
  const origin = origins.find((o) => o.id === fromId) ?? origins[0] ?? null;
  const cargo = origin?.cargo.find((c) => c.id === product) ?? origin?.cargo[0] ?? null;
  const destinations = origin ? destinationOptions(state, origin.id) : [];
  const dest = destinations.find((d) => d.id === toId) ?? destinations[0] ?? null;
  const couriers = courierOptions(state);

  const intent: ShipIntent | null =
    origin && cargo && dest
      ? {
          type: 'ship',
          product: cargo.id,
          qty: Math.min(Math.max(1, qty), cargo.held),
          fromStashId: origin.id,
          toStashId: dest.id,
          mode,
          ...(courierIds.length > 0 ? { courierIds } : {}),
        }
      : null;
  const quote = intent ? deskQuote(state, intent) : null;

  const toggleCourier = (id: string) =>
    setCourierIds((ids) => (ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id]));

  const launch = () => {
    if (!intent) return;
    const result = useGameStore.getState().shipCargo(intent);
    if (result?.ok) {
      setLaunched(
        `On the water — lands in ~${Math.ceil(result.quote.etaHours)}h (game time).`,
      );
      setQty(1);
      setCourierIds([]);
    }
  };

  return (
    <>
      {/* Arrivals and losses read as scenes, never toasts (design/05 §4). */}
      {scenes.length > 0 ? (
        <Card heading="Word from the water">
          <div style={{ display: 'grid', gap: 8 }}>
            {scenes.map((s) => (
              <div key={s.id}>
                <SceneText tone={s.kind === 'shipment-seized' ? 'bust' : 'win'}>
                  {s.text}
                </SceneText>
                <Button
                  variant="ghost"
                  onClick={() => useGameStore.getState().dismissPendingChoice(s.id)}
                >
                  Noted
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {inFlight.length > 0 ? (
        <Card heading="In flight">
          <div style={{ display: 'grid', gap: 8 }}>
            {inFlight.map((s) => (
              <Panel key={s.id} heading={s.route}>
                <div className="cg-label" data-testid="shipment-inflight">
                  {s.qty} {s.productName.toLowerCase()} · {s.modeName} ·{' '}
                  {s.waiting
                    ? 'waiting offshore for room'
                    : s.etaHours <= 0
                      ? 'landing now'
                      : `~${s.etaHours}h out`}{' '}
                  · odds {Math.round(s.interdictionChance * 100)}%
                  {s.courierCount > 0 ? ` · ${s.courierCount} riding` : ' · you carried it'}
                </div>
              </Panel>
            ))}
          </div>
        </Card>
      ) : null}

      <Card heading="Ship product">
        {launched ? (
          <p className="cg-label" aria-live="polite" style={{ marginBottom: 10 }}>
            {launched}
          </p>
        ) : null}

        {!origin ? (
          <p className="cg-label">Nothing to ship — buy product first.</p>
        ) : destinations.length === 0 ? (
          <p className="cg-label">
            A shipment needs somewhere to land. Open a route above — a foothold in
            another country is a destination.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="cg-select"
                aria-label="Ship from"
                value={origin.id}
                onChange={(e) => {
                  setFromId(e.target.value);
                  setProduct(null);
                  setToId(null);
                  setQty(1);
                }}
              >
                {origins.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.countryName} · {o.name}
                  </option>
                ))}
              </select>
              <select
                className="cg-select"
                aria-label="Product"
                value={cargo?.id ?? ''}
                onChange={(e) => {
                  setProduct(e.target.value as ProductId);
                  setQty(1);
                }}
              >
                {origin.cargo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.held})
                  </option>
                ))}
              </select>
              <select
                className="cg-select"
                aria-label="Ship to"
                value={dest?.id ?? ''}
                onChange={(e) => setToId(e.target.value)}
              >
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    → {d.countryName} · {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* How much of the load rides — stepper + free field + MAX (Item 4). */}
            <QtyInput
              value={Math.min(Math.max(1, qty), cargo?.held ?? 1)}
              max={cargo?.held ?? 1}
              onChange={setQty}
              ariaLabel="Quantity to ship"
              boundLabel={cargo ? 'all this stash is holding' : undefined}
            />

            {/* The mode table — priced trade-offs, all open from minute one. */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Transport">
              {modes.map((m) => (
                <Button
                  key={m.id}
                  variant={mode === m.id ? 'secondary' : 'ghost'}
                  aria-pressed={mode === m.id}
                  onClick={() => setMode(m.id)}
                >
                  {m.name}
                  <small>
                    cap {m.cargoCap}
                    {m.ownerCutPct > 0 ? ` · owner ${Math.round(m.ownerCutPct * 100)}%` : ''}
                  </small>
                </Button>
              ))}
            </div>

            {/* Go yourself, or send someone (Ideas2 §1). Extra escorts buy odds down. */}
            {couriers.length > 0 ? (
              <div>
                <p className="cg-label" style={{ marginBottom: 6 }}>
                  Couriers — no one riding means YOU make the run (bust heat lands on you).
                  Each takes a cut; each extra escort lowers the odds.
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {couriers.map((c) => (
                    <Button
                      key={c.id}
                      variant={courierIds.includes(c.id) ? 'secondary' : 'ghost'}
                      aria-pressed={courierIds.includes(c.id)}
                      onClick={() => toggleCourier(c.id)}
                    >
                      {c.name}
                      {c.warned ? <small>skims — you’ve seen the signs</small> : null}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {quote ? (
              <Panel heading="The run, in full">
                {/* The exact number rolled on arrival — never a decorated copy. */}
                <RiskMeter
                  probability={quote.interdictionChance}
                  label="Interdiction odds"
                  note="If boarded: this cargo only — never your stashes"
                />
                <div className="cg-label" style={{ marginTop: 10 }} data-testid="ship-quote">
                  Transport {money(quote.transportCost)}
                  {quote.ownerCut > 0 ? <> · owner’s cut {money(quote.ownerCut)}</> : null}
                  {quote.courierCut > 0 ? <> · couriers {money(quote.courierCut)}</> : null}
                  {' · '}ETA ~{Math.ceil(quote.etaHours)}h
                  {quote.skimUnits > 0 ? (
                    <> · {quote.skimUnits} units will walk ({quote.courierWarnings.join(', ')})</>
                  ) : null}
                  {quote.launchHeat > 0 ? (
                    // Shipment heat (design/13 B5.1): the launch's own footprint,
                    // disclosed before commit — shown = applied.
                    <> · launch heat +{quote.launchHeat.toFixed(1)}</>
                  ) : null}
                </div>
                {quote.patternOddsSurcharge > 0 ? (
                  // Repeated patterns (design/13 B5.3): the surcharge is already
                  // INSIDE the odds above — this line says why they're up.
                  <p className="cg-label" data-testid="pattern-surcharge" style={{ marginTop: 6 }}>
                    They&apos;re watching this port — running it again inside the
                    window added +{Math.round(quote.patternOddsSurcharge * 100)}% to the odds.
                  </p>
                ) : null}
                {quote.soloRun ? (
                  // The B4 disclosure (design/13): helming the run has teeth.
                  <p className="cg-label" data-testid="solo-arrest-risk" style={{ marginTop: 6 }}>
                    You&apos;re driving — if this is stopped, you&apos;re in the cuffs:
                    post bond (~{money(quote.arrestBond)} clean) or serve{' '}
                    {Math.round(quote.arrestSentenceHours / 24)} days inside.
                  </p>
                ) : null}
                <div style={{ marginTop: 12 }}>
                  {/* The label only ever carries the price — a disabled-state hint
                      renders as its OWN helper line below, never concatenated into
                      the button (design/13 A2). */}
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={!quote.ok}
                    onClick={launch}
                    data-testid="launch-shipment"
                  >
                    Launch
                    <small>
                      {money(quote.totalCost)} all-in
                      {!quote.ok && quote.rejected === 'insufficient-funds' ? ' · short' : ''}
                    </small>
                  </Button>
                  {!quote.ok && quote.rejected !== 'insufficient-funds' ? (
                    <p className="cg-label" data-testid="launch-hint" style={{ marginTop: 6 }}>
                      Fix the manifest first.
                    </p>
                  ) : null}
                </div>
              </Panel>
            ) : null}
          </div>
        )}
      </Card>
    </>
  );
}
