/**
 * The Corruption screen — the *who to buy* decision with its shown numbers (Prompt
 * 20; design/09 System B, GDD §4.9). Port bribes are a NEGOTIATION: the asking
 * price and resulting seizure % are shown before you commit, haggle shows its odds,
 * and walking away is always on the table. Standing payroll lists hireable officials
 * with weekly cost + benefit; a raise-ask is handled as accept/refuse, and a
 * telegraphed flip surfaces as prose with intervention actions (cut loose / cool
 * heat).
 *
 * Ethics (design/09 B.3): payroll is optional deterministic power — never a gamble,
 * never pay-to-win; the menace is in-fiction. PURE composition — every number comes
 * from `corruptionScreen.model`; actions dispatch through the store.
 */

import { useState } from 'react';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, SceneText } from '@/ui/components';
import { navigate } from '@/ui/shell/useHash';
import {
  HAGGLE_DISCOUNT_PCT,
  HAGGLE_REFUSE_PCT,
  defaultPortCountryId,
  flipWarnings,
  hireOptions,
  payrollPerWeek,
  payrollRows,
  portRows,
  type HireOption,
  type PayrollRow,
  type PortRow,
} from './corruptionScreen.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** One port's negotiation: shown ask + seizure %, haggle (odds), pay, walk/reroute. */
function PortCard({ row }: { readonly row: PortRow }) {
  const store = useGameStore.getState();
  // Local negotiation state: a haggled ask (once haggled), refusal, or a walk.
  const [agreedAsk, setAgreedAsk] = useState<number | null>(null);
  const [refused, setRefused] = useState(false);
  const [walked, setWalked] = useState(false);

  const askToPay = agreedAsk ?? row.ask;

  const doHaggle = () => {
    const result = store.hagglePortBribe(row.portId, row.shipmentValue);
    if (!result) return;
    setWalked(false);
    if (result.refused) {
      setRefused(true);
      setAgreedAsk(null);
    } else {
      setRefused(false);
      setAgreedAsk(result.ask);
    }
  };

  const doPay = () => {
    store.payPortBribe(row.portId, row.shipmentValue, agreedAsk ?? undefined);
    setAgreedAsk(null);
    setRefused(false);
  };

  // While the port is protected, the offer row is a STATUS line — no quote, no
  // "X% → X%" (design/13 A3).
  if (row.paid) {
    return (
      <Panel heading={row.name}>
        <p className="cg-label cg-tone-green" data-testid="port-paid">
          Protected · shipments here run at {row.paidSeizurePctLabel} seizure{' '}
          {row.standing
            ? '(standing — your customs chief)'
            : row.paidUntilLabel
              ? `until ${row.paidUntilLabel}`
              : 'until it lapses'}
          .
        </p>
      </Panel>
    );
  }

  // A quote renders only against REAL staged value (design/13 A3) — never a
  // hypothetical shipment. Empty containers get guidance, not a $0 ask.
  if (!row.hasStaged) {
    return (
      <Panel heading={row.name}>
        <p className="cg-label" data-testid="port-nothing-staged">
          Nothing staged through this port — stash product or cash in{' '}
          {row.containerNames.join(', ') || 'a container here'} and the official will
          price protection against it.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      heading={
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{row.name}</span>
          <span className="cg-label" data-testid="port-seizure">
            {row.unpaidSeizurePctLabel} → {row.paidSeizurePctLabel}
          </span>
        </span>
      }
    >
      <p className="cg-label" style={{ marginBottom: 10 }}>
        Staged here ~{money(row.shipmentValue)} · pay to drop seizure from{' '}
        {row.unpaidSeizurePctLabel} to {row.paidSeizurePctLabel}. Holds{' '}
        {row.paidDurationLabel}
        {row.isMajorPort ? ' — a major gateway, so it costs more and lapses sooner.' : '.'}
      </p>

      {refused ? (
        <SceneText tone="bust" who="The official:">
          Not this run — you pushed too hard and they walked from the table.
        </SceneText>
      ) : null}
      {walked ? (
        <p className="cg-label" data-testid="port-walked">
          Walked — shipping at full risk ({row.unpaidSeizurePctLabel}). Reroute through
          another port from Storage.
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
        <Button
          variant="primary"
          fullWidth
          disabled={refused}
          onClick={doPay}
          data-testid="pay-bribe"
        >
          Pay
          <small>
            {money(askToPay)} · seizure → {row.paidSeizurePctLabel}
            {agreedAsk !== null ? ' (haggled)' : ''}
          </small>
        </Button>
        <Button
          variant="secondary"
          fullWidth
          disabled={refused || agreedAsk !== null}
          onClick={doHaggle}
          data-testid="haggle-bribe"
        >
          Haggle
          <small>
            −{HAGGLE_DISCOUNT_PCT}% if it lands · {HAGGLE_REFUSE_PCT}% they refuse
          </small>
        </Button>
        <Button
          variant="ghost"
          fullWidth
          onClick={() => {
            setWalked(true);
            setAgreedAsk(null);
          }}
          data-testid="walk-bribe"
        >
          Walk / reroute
        </Button>
      </div>
    </Panel>
  );
}

/** One official on the payroll: status prose + raise/flip interventions. */
function PayrollCard({ row }: { readonly row: PayrollRow }) {
  const store = useGameStore.getState();

  return (
    <Panel
      heading={
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{row.name}</span>
          <span className="cg-label">{money(row.retainerPerWeek)}/wk</span>
        </span>
      }
      style={row.arcSign ? { outline: '2px solid var(--cg-brass)' } : undefined}
    >
      <p className="cg-label" style={{ marginBottom: 8 }}>
        {row.benefitSummary}
      </p>

      {/* Standing, and any flip telegraph, as prose — never a loyalty bar. */}
      {row.isWire || row.arcSign ? (
        <SceneText tone="bust" who={`${row.name}:`}>
          {row.statusLine}
        </SceneText>
      ) : (
        <p className={row.nervous ? 'cg-label cg-tone-red' : 'cg-label'}>{row.statusLine}</p>
      )}

      {/* Raise-ask — accept (meet the number) or refuse (an underpayment). */}
      {row.pendingRaise ? (
        <div style={{ marginTop: 10 }}>
          <SceneText tone="default" who={`${row.name}:`}>
            {row.pendingRaise.reason} They want {money(row.pendingRaise.newRetainer)}/wk.
          </SceneText>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button
              variant="primary"
              onClick={() => store.respondToRaise(row.id, true)}
              data-testid="raise-accept"
            >
              Meet it
              <small>{money(row.pendingRaise.newRetainer)}/wk</small>
            </Button>
            <Button
              variant="secondary"
              onClick={() => store.respondToRaise(row.id, false)}
              data-testid="raise-refuse"
            >
              Refuse
              <small>they’ll remember it</small>
            </Button>
          </div>
        </div>
      ) : null}

      {/* Intervention actions for a telegraphed flip (design/09 B.2). */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {row.nervous ? (
          <Button variant="secondary" onClick={() => navigate('heat')} data-testid="cool-heat">
            Cool the heat →
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => store.fireOfficial(row.id)}
          data-testid="fire-official"
        >
          Cut loose
        </Button>
      </div>
    </Panel>
  );
}

export function CorruptionScreen() {
  const state = useGameState();

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const ports = portRows(state);
  const roster = payrollRows(state);
  const hireable = hireOptions(state);
  const warnings = flipWarnings(state);
  const weekly = payrollPerWeek(state);
  const portCountry = defaultPortCountryId(state);

  const hire = (officialId: HireOption['officialId'], needsPort: boolean) =>
    useGameStore
      .getState()
      .hireOfficial(officialId, needsPort ? portCountry : undefined);

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
        <span className="cg-kicker">Corruption</span>
        <span className="cg-label" aria-live="polite">
          {weekly > 0 ? `Payroll ${money(weekly)}/wk` : 'No one on the payroll yet'}
        </span>
      </header>

      {/* Telegraphed flips — surfaced as scenes, never a surprise (design/09 B.2). */}
      {warnings.length > 0 ? (
        <Card heading="Word on the street">
          <div style={{ display: 'grid', gap: 8 }}>
            {warnings.map((w) => (
              <SceneText key={w.id} tone="bust">
                {w.text}
              </SceneText>
            ))}
          </div>
        </Card>
      ) : null}

      <Card heading="Port bribes">
        {ports.length === 0 ? (
          <div>
            <p className="cg-label" style={{ marginBottom: 10 }}>
              No port to bribe yet — a bribe drops a container/offshore stash’s seizure
              to the floor. Build one first.
            </p>
            <Button variant="ghost" fullWidth onClick={() => navigate('storage')}>
              Build a container → Storage
            </Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {ports.map((row) => (
              <PortCard key={row.portId} row={row} />
            ))}
          </div>
        )}
      </Card>

      {roster.length > 0 ? (
        <Card heading="On the payroll">
          <div style={{ display: 'grid', gap: 8 }}>
            {roster.map((row) => (
              <PayrollCard key={row.id} row={row} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card heading="Put someone on">
        {hireable.length === 0 ? (
          <p className="cg-label">Everyone worth buying is already on your payroll.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {hireable.map((o) => (
              <Panel
                key={o.officialId}
                heading={
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{o.name}</span>
                    <span className="cg-label">{money(o.retainerPerWeek)}/wk</span>
                  </span>
                }
              >
                <p className="cg-label" style={{ marginBottom: 8 }}>
                  {o.benefitSummary}
                </p>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={!o.affordable}
                  onClick={() => hire(o.officialId, o.needsPort)}
                  data-testid="hire-official"
                >
                  Put on payroll
                  <small>
                    {o.affordable
                      ? `${money(o.retainerPerWeek)} first week`
                      : `${money(o.retainerPerWeek)} · short`}
                  </small>
                </Button>
              </Panel>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
