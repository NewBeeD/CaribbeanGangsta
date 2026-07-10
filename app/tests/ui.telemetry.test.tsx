import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '@/engine';
import type { AnyTelemetryEvent, TelemetryEventMap, TelemetryEventName } from '@/telemetry';
import { TelemetryPanel } from '@/ui/shell/TelemetryOverlay';
import { describeEvent, telemetryOverlayModel } from '@/ui/shell/telemetryOverlay.model';

let seq = 0;

function ev<K extends TelemetryEventName>(
  name: K,
  props: TelemetryEventMap[K],
  at = 0,
): AnyTelemetryEvent {
  return { name, props, at, seq: seq++ } as AnyTelemetryEvent;
}

const sale = (outcome: 'success' | 'bust'): AnyTelemetryEvent =>
  ev('deal_resolved', {
    kind: 'sell',
    outcome,
    product: 'cocaine',
    qty: 2,
    displayedBustProb: 0.05,
    rolledValue: outcome === 'bust' ? 0.01 : 0.9,
    cashDelta: outcome === 'bust' ? -500 : 3_000,
    secondsIntoSession: 30,
  });

const start = (seed: string, at: number): AnyTelemetryEvent =>
  ev('session_start', { source: 'new-run', seed, day: 1, everBorrowed: false }, at);

describe('telemetryOverlayModel — the live funnel (Prompt 25; design/06)', () => {
  it('aggregates the session funnel from the buffer', () => {
    const events = [
      start('overlay-seed', 1_000),
      sale('success'),
      sale('bust'),
      ev('first_sale', { secondsIntoSession: 42, day: 1 }),
      ev('first_front_opened', { frontType: 'carwash', secondsIntoSession: 90 }),
      ev('offline_settled', {
        hoursAway: 12,
        cleanEarned: 500,
        cappedAt: 8,
        goldenHour: false,
        freezeViolation: true,
        owedDelta: 0,
        heatDelta: 0,
      }),
      ev('session_end_reached', { cardId: 'onb-close' }),
    ];

    const m = telemetryOverlayModel(events, null, 61_000);
    expect(m.sessionSeconds).toBe(60);
    expect(m.deals).toBe(2);
    expect(m.busts).toBe(1);
    expect(m.timeToFirstSaleSec).toBe(42);
    expect(m.firstFrontSec).toBe(90);
    expect(m.sessionEndReached).toBe(true);
    expect(m.offlineEarned).toBe(500);
    expect(m.freezeViolations).toBe(1);
    expect(m.log[0]!.name).toBe('session_end_reached'); // newest first
  });

  it('the funnel resets at the latest session_start; fairness spans everything', () => {
    const events = [
      start('first-session', 1_000),
      sale('bust'),
      ev('odds_audit', { surface: 'deal', displayed: 0.05, hit: false }),
      start('second-session', 50_000),
      sale('success'),
    ];

    const m = telemetryOverlayModel(events, null, 60_000);
    expect(m.sessionSeconds).toBe(10);
    expect(m.deals).toBe(1);
    expect(m.busts).toBe(0);
    // The fairness law is judged in aggregate — the earlier roll still counts.
    expect(m.fairness.all.samples).toBe(1);
  });

  it('reads the live state for idle rate, heat and the spiral stage', () => {
    const state = createInitialState('overlay-state');
    const m = telemetryOverlayModel([], { ...state, heat: 37 }, 0);
    expect(m.heat).toBe(37);
    expect(m.spiralStage).toBe('stable');
  });

  it('describeEvent renders one human line per event', () => {
    expect(describeEvent(sale('success'))).toContain('sell 2 cocaine');
    expect(
      describeEvent(ev('odds_audit', { surface: 'raid', displayed: 0.25, hit: true })),
    ).toContain('shown 25%');
  });
});

describe('TelemetryPanel — the audits, visible while playing', () => {
  const noop = () => {};

  it('shows the fairness readout and a clean freeze audit', () => {
    const events = [
      start('panel-seed', 0),
      ev('odds_audit', { surface: 'deal', displayed: 0.1, hit: false }),
    ];
    const html = renderToStaticMarkup(
      <TelemetryPanel events={events} state={null} now={0} onClose={noop} onClear={noop} />,
    );
    expect(html).toContain('10% shown / 0% real (1)');
    expect(html).toContain('clean');
    expect(html).not.toContain('VIOLATION');
  });

  it('holds nothing back when the freeze guarantee is violated', () => {
    const events = [
      ev('offline_settled', {
        hoursAway: 10,
        cleanEarned: 0,
        cappedAt: 8,
        goldenHour: false,
        freezeViolation: true,
        owedDelta: 100,
        heatDelta: 0,
      }),
    ];
    const html = renderToStaticMarkup(
      <TelemetryPanel events={events} state={null} now={0} onClose={noop} onClear={noop} />,
    );
    expect(html).toContain('no rolls yet');
    expect(html).toContain('1 VIOLATION(S)');
  });
});
