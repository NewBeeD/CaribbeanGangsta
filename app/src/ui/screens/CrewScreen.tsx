/**
 * The Crew screen — the relatedness engine's face (Prompt 17; design/07 §3,
 * design/02 whole doc). Crew are presented as PEOPLE: each row leads with a prose
 * loyalty line ("Been quiet since you passed him over."), never a bar and never a
 * number (design/02 §1) — the success test is that players end up naming them.
 *
 * The whole roster of who you can bring on is open from the start; you build the crew
 * up one person at a time (open access — Ideas.md; the [[open-access-design]] rule).
 * Tapping a row opens `CrewDetail`, where you see their side. PURE composition: prose
 * and skill dots come from `crew.model` selectors; the store dispatches crew intents.
 */

import { useState } from 'react';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, StampBadge } from '@/ui/components';
import { CrewDetail } from './CrewDetail';
import { crewRoster, recruitableArchetypes, type CrewRow } from './crew.model';

/** One roster row — a tap-through into the person (design/07 §3). */
function RosterRow({ row, onOpen }: { readonly row: CrewRow; readonly onOpen: () => void }) {
  return (
    <button
      type="button"
      className="cg-panel"
      onClick={onOpen}
      style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span className="cg-stat__value">{row.name}</span>
        <span className="cg-label">{row.roleLabel} ›</span>
      </div>

      <div className="cg-label" style={{ marginTop: 4 }}>
        {row.assignment}
      </div>

      {/* Loyalty as a LINE, not a bar or a number (design/02 §1). */}
      <p
        className={row.hasArc ? 'cg-tone-red' : undefined}
        style={{ margin: '8px 0' }}
        data-testid="loyalty-line"
      >
        {row.hasArc ? '⚠ ' : ''}
        {row.loyaltyLine}
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {row.skills.map((s) => (
          <span key={s.skill} className="cg-label" aria-label={`${s.label} ${s.filled} of ${s.total}`}>
            {s.label}{' '}
            {Array.from({ length: s.total }, (_, i) => (i < s.filled ? '●' : '○')).join('')}
          </span>
        ))}
        {row.isWire && <StampBadge variant="danger" label="Wire" />}
        {row.isFamily && !row.isWire && <StampBadge variant="filed" label="Family" />}
      </div>
    </button>
  );
}

export function CrewScreen() {
  const state = useGameState();
  const [openId, setOpenId] = useState<string | null>(null);

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  // Detail tap-through — see the person's side (design/02 §2).
  if (openId) {
    return <CrewDetail crewId={openId} onBack={() => setOpenId(null)} />;
  }

  const roster = crewRoster(state);
  const recruitable = recruitableArchetypes(state);

  const recruit = (archetypeId: string) => {
    const crew = useGameStore.getState().recruitCrew(archetypeId);
    // Meet who you just brought on — straight into their story.
    if (crew) setOpenId(crew.id);
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
        <span className="cg-kicker">Crew</span>
        <span className="cg-label">
          {roster.length} {roster.length === 1 ? 'person' : 'people'}
        </span>
      </header>

      <Card heading="Your people">
        {roster.length === 0 ? (
          <p className="cg-label">
            You&apos;re running this alone. Bring someone on you can trust.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {roster.map((row) => (
              <RosterRow key={row.id} row={row} onOpen={() => setOpenId(row.id)} />
            ))}
          </div>
        )}
      </Card>

      {recruitable.length > 0 && (
        <Card heading="Bring someone on">
          <div style={{ display: 'grid', gap: 8 }}>
            {recruitable.map((r) => (
              <Panel key={r.archetypeId} heading={`${r.name} · ${r.roleLabel}`}>
                <p className="cg-label" style={{ margin: '2px 0 12px' }}>
                  {r.bond}
                </p>
                <Button variant="secondary" fullWidth onClick={() => recruit(r.archetypeId)}>
                  + Recruit {r.name}
                </Button>
              </Panel>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
