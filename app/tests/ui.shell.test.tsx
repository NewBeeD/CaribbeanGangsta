import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState, type OfflineReport } from '@/engine';
import { BottomNav, type BottomNavItem } from '@/ui/components';
import { NewRunGate } from '@/ui/shell/NewRunGate';
import { ReturnHook } from '@/ui/shell/ReturnHook';
import { DISCLOSURE_NODES } from '@/ui/shell/Disclosure';

describe('NewRunGate (Prompt 14 — the entry gate)', () => {
  it('offers only a fresh start when there is no save', () => {
    const html = renderToStaticMarkup(
      <NewRunGate hasSave={false} onNewRun={() => {}} onContinue={() => {}} />,
    );
    expect(html).toContain('Start the come-up');
    expect(html).not.toContain('Continue');
  });

  it('emphasizes Continue when a run can be resumed', () => {
    const html = renderToStaticMarkup(
      <NewRunGate hasSave onNewRun={() => {}} onContinue={() => {}} />,
    );
    expect(html).toContain('Continue');
    expect(html).toContain('Start a new run');
  });
});

describe('ReturnHook (Prompt 14 — reward, never punishment; GDD §6)', () => {
  const report: OfflineReport = {
    hoursAway: 7 + 20 / 60,
    cappedAt: 8,
    cleanEarned: 10_800,
    pendingChoices: [
      {
        id: 'buyer-1',
        kind: 'buyer',
        summary: 'A buyer has been waiting on a shipment.',
        createdAtHours: 12,
      },
    ],
  };

  it('frames the return as gains + decisions to allocate', () => {
    const html = renderToStaticMarkup(
      <ReturnHook report={report} onContinue={() => {}} onSee={() => {}} />,
    );
    expect(html).toContain('7h 20m');
    expect(html).toContain('+ $10,800');
    expect(html).toContain('A buyer has been waiting on a shipment.');
  });

  it('never surfaces a loss for being away', () => {
    const html = renderToStaticMarkup(
      <ReturnHook report={report} onContinue={() => {}} />,
    ).toLowerCase();
    expect(html).not.toContain('lost');
    expect(html).not.toContain('you lose');
    expect(html).not.toContain('at risk');
  });
});

describe('Bottom nav disclosure (design/07 §2/§8)', () => {
  it('renders locked tabs greyed (disabled), never missing', () => {
    const state = createInitialState('nav');
    const items: BottomNavItem[] = DISCLOSURE_NODES.filter((n) => n.inNav).map((n) => ({
      id: n.id,
      label: n.label,
      disabled: !n.unlocked(state),
    }));

    const html = renderToStaticMarkup(
      <BottomNav items={items} activeId="deals" onSelect={() => {}} />,
    );

    // All four tabs render...
    for (const label of ['Deals', 'Crew', 'Money', 'Heat']) {
      expect(html).toContain(label);
    }
    // ...but crew/money/heat are disabled on minute one (3 of 4 locked).
    expect((html.match(/disabled/g) ?? []).length).toBe(3);
  });
});
