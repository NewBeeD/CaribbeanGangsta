/**
 * The Heat / Threats screen — the tension system made legible (Prompt 19; design/07
 * §5, design/04 §1, GDD §4.5), reworked for the PER-COUNTRY heat map (heat
 * redesign "B"; v30). It makes tension **estimable**: the hottest country's tier
 * as the headline, global notoriety, a row per country the empire touches — each
 * with its OWN meter and lie-low lever — and the core promise, **telegraphed**
 * warnings that a crossing looms or a task force has opened a file, always BEFORE
 * the tier actually escalates. Payroll raid tip-offs surface with lead time.
 * Cooling it is in-fiction: lie low country by country (slower income when home
 * goes quiet), and keep a beat cop on the payroll (the standing "cools heat
 * faster" benefit; the pointer routes to Corruption).
 *
 * The design contract (design/07 §5, GDD §5.4): no surprise LE — every escalation
 * is warned before it lands. Heat is a meter, not a currency (design/01 §1): the
 * levers reduce it via in-fiction actions, never a "buy heat" store. PURE
 * composition — every number comes from `heatScreen.model` selectors and actions
 * dispatch through the store; the screen authors no heat/decay/probability math.
 */

import { useGameState, useGameStore } from '@/store';
import { Button, Card, HeatDots, Panel, SceneText } from '@/ui/components';
import { navigate } from '@/ui/shell/useHash';
import {
  beatCopRelief,
  countryHeatRows,
  heatSourceRows,
  heatStatus,
  heatWarnings,
  lieLowIncomePenaltyPct,
  raidTipoff,
  totalPassiveHeatPerHour,
} from './heatScreen.model';

export function HeatScreen() {
  const state = useGameState();

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const status = heatStatus(state);
  const warnings = heatWarnings(state);
  const tipoff = raidTipoff(state);
  const countries = countryHeatRows(state);
  const copRelief = beatCopRelief(state);
  const sources = heatSourceRows(state);
  const passivePerHour = totalPassiveHeatPerHour(state);
  const incomePenaltyPct = lieLowIncomePenaltyPct();

  const setLieLow = (countryId: string, enabled: boolean) =>
    useGameStore.getState().setLieLow(countryId, enabled);

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
        <span className="cg-kicker">Heat</span>
        <span className="cg-label" aria-live="polite">
          {status.lyingLow ? 'Lying low · cooling faster' : 'Heat is local — lie low where it burns'}
        </span>
      </header>

      {/* The headline gauge — the hottest country's tier (design/07 §5). */}
      <Card heading="Current attention">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span className="cg-title" style={{ margin: 0 }}>
            {status.tierName}
          </span>
          <HeatDots value={status.filled} max={status.total} tier={status.tierName} />
        </div>
        <p className="cg-label" style={{ marginTop: 10 }} data-testid="heat-hottest">
          Hottest in {status.hottestCountryName}. Heat is per country now — what you do
          somewhere draws eyes there, and lying low cools that place alone.
        </p>
        <p className="cg-label" data-testid="heat-notoriety">
          Notoriety {Math.round(status.notoriety)}/100 — your name carries everywhere and
          fades far slower than local heat.
        </p>
      </Card>

      {/* Telegraphed threats — warned BEFORE the crossing lands (design/07 §5). */}
      {warnings.length > 0 ? (
        <Card heading="Threats telegraphed">
          <div style={{ display: 'grid', gap: 8 }}>
            {warnings.map((w) => (
              <SceneText key={w.id} tone="bust">
                {w.text}
              </SceneText>
            ))}
          </div>
        </Card>
      ) : null}

      {/* The map made legible: every country the empire touches, hottest first,
          each with its own meter and lie-low lever (per-country heat, v30). */}
      <Card heading="Attention by country">
        <div style={{ display: 'grid', gap: 8 }}>
          {countries.map((row) => (
            <Panel key={row.countryId} heading={`${row.name}${row.isHome ? ' · home' : ''}`}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span className="cg-label" data-testid="country-heat-tier">
                  {row.tierName}
                </span>
                <HeatDots value={row.filled} max={row.total} tier={row.tierName} />
              </div>
              {row.patternLine ? (
                <p className="cg-label" style={{ marginTop: 8 }}>
                  {row.patternLine}
                </p>
              ) : null}
              {row.investigationLine ? (
                <p className="cg-label" style={{ marginTop: 8 }}>
                  {row.investigationLine}
                </p>
              ) : null}
              <Button
                variant={row.lyingLow ? 'primary' : 'secondary'}
                fullWidth
                onClick={() => setLieLow(row.countryId, !row.lyingLow)}
                data-testid={`lie-low-${row.countryId}`}
                aria-pressed={row.lyingLow}
              >
                {row.lyingLow ? `Lying low in ${row.name} ✓ — resume ops` : `Lie low in ${row.name}`}
                <small>
                  {row.isHome
                    ? row.lyingLow
                      ? `income −${incomePenaltyPct}%`
                      : `cools faster · income −${incomePenaltyPct}%`
                    : 'cools this country faster'}
                </small>
              </Button>
            </Panel>
          ))}
        </div>
      </Card>

      {/* Why is my heat rising — every active source itemized, shown = applied
          (design/13 B5; Prompt 44). Quiet operations show the quiet line. */}
      <Card heading="Why your heat is rising">
        {sources.length === 0 ? (
          <p className="cg-label" data-testid="heat-sources-quiet">
            Nothing is drawing attention right now. Busts, big shipments, reused
            routes, and a growing empire all raise it.
          </p>
        ) : (
          <ul style={{ display: 'grid', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
            {sources.map((row) => (
              <li key={row.id} className="cg-label" data-testid="heat-source-row">
                {row.label}
                {row.perHour !== undefined ? (
                  <strong style={{ marginLeft: 6 }}>
                    +{row.perHour.toFixed(2)}/hr
                  </strong>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {passivePerHour > 0 ? (
          <p className="cg-label" style={{ marginTop: 10 }} data-testid="heat-sources-total">
            Passive total: +{passivePerHour.toFixed(2)} notoriety per played hour.
          </p>
        ) : null}
      </Card>

      {/* Payroll raid tip-off — lead time to move product (design/07 §5). */}
      {tipoff ? (
        <Card heading="Word from the inside">
          <SceneText tone="bust" who="Your cop:">
            {tipoff.text}
          </SceneText>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate('storage')}
            data-testid="raid-tipoff"
          >
            Move product
            <small>{tipoff.chancePct}% raid risk · {tipoff.stashName}</small>
          </Button>
        </Card>
      ) : null}

      {/* The standing cop relief — in-fiction, never a "buy heat" store. */}
      <Card heading="Cool it down">
        <Panel heading="Cop on the payroll">
          <p className="cg-label" style={{ marginBottom: 10 }}>
            {copRelief.text}
          </p>
          {copRelief.onPayroll ? (
            <SceneText tone="win" who="Your cop:">
              Heat cools faster while I'm on the take.
            </SceneText>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => navigate('corruption')}
              data-testid="payroll-cop"
            >
              Put a cop on the payroll
              <small>cools heat faster</small>
            </Button>
          )}
        </Panel>
      </Card>
    </div>
  );
}
