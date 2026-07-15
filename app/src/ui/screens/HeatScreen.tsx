/**
 * The Heat / Threats screen — the tension system made legible (Prompt 19; design/07
 * §5, design/04 §1, GDD §4.5). It makes tension **estimable**: the current LE tier,
 * a decaying `HeatDots` gauge, and — the core promise — **telegraphed** warnings
 * that a crossing looms or a task force has opened a file, always BEFORE the tier
 * actually escalates. Payroll raid tip-offs surface with lead time to move product.
 * Cooling it is in-fiction: lie low (slower income), and keep a beat cop on the
 * payroll (the standing "cools local heat faster" benefit — the one-tap
 * "bribe a cop" lever was removed, Ideas2 item 2; the pointer routes to Corruption).
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
  heatStatus,
  heatWarnings,
  lieLowLever,
  raidTipoff,
} from './heatScreen.model';

export function HeatScreen() {
  const state = useGameState();

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const status = heatStatus(state);
  const warnings = heatWarnings(state);
  const tipoff = raidTipoff(state);
  const lieLow = lieLowLever(state);
  const copRelief = beatCopRelief(state);

  const setLieLow = (enabled: boolean) => useGameStore.getState().setLieLow(enabled);

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
          {status.lyingLow ? 'Lying low · cooling faster' : 'Attention decays as you lie low'}
        </span>
      </header>

      {/* The gauge + current tier — the wireframe's top status (design/07 §5). */}
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
        <p className="cg-label" style={{ marginTop: 10 }}>
          Heat cools on its own the longer you lie low. Cross a threshold and the next
          agency takes over.
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

      {/* The reduce-heat levers — in-fiction, never a "buy heat" store. */}
      <Card heading="Cool it down">
        <div style={{ display: 'grid', gap: 8 }}>
          <Panel heading="Lie low">
            <p className="cg-label" style={{ marginBottom: 10 }}>
              Heat sheds faster while you stay quiet — income drops {lieLow.incomePenaltyPct}%
              until you come back up.
            </p>
            <Button
              variant={lieLow.active ? 'primary' : 'secondary'}
              fullWidth
              onClick={() => setLieLow(!lieLow.active)}
              data-testid="lie-low"
              aria-pressed={lieLow.active}
            >
              {lieLow.active ? 'Lying low ✓ — resume normal ops' : 'Lie low'}
              <small>{lieLow.active ? `income −${lieLow.incomePenaltyPct}%` : `slower income`}</small>
            </Button>
          </Panel>

          <Panel heading="Cop on the payroll">
            <p className="cg-label" style={{ marginBottom: 10 }}>
              {copRelief.text}
            </p>
            {copRelief.onPayroll ? (
              <SceneText tone="win" who="Your cop:">
                Local heat cools faster while I'm on the take.
              </SceneText>
            ) : (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate('corruption')}
                data-testid="payroll-cop"
              >
                Put a cop on the payroll
                <small>cools local heat faster</small>
              </Button>
            )}
          </Panel>
        </div>
      </Card>
    </div>
  );
}
