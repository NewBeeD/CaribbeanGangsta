/**
 * Crew detail — the tap-through that lets you see the person's SIDE (Prompt 17;
 * design/07 §3, design/02 §2 perspective-taking). Their story and bond, the memory
 * log of what they remember you did, their assignment/development controls, and —
 * when it's live — the betrayal arc surfaced as a readable sign with its intervention
 * actions (raise pay / confront / promote / remove; design/02 §4).
 *
 * Everything is composed from `crew.model` selectors and dispatched through the store.
 * Loyalty is shown ONLY as the engine's prose — the raw 0–100 never reaches here.
 */

import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, SceneText, StampBadge } from '@/ui/components';
import type { CrewSkill } from '@/engine';
import {
  RAISE_PAY_AMOUNT,
  crewDetail,
  type SkillDots,
} from './crew.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** A labelled skill dot track — light stats only, never the raw number (design/07 §3). */
export function SkillTrack({ skill }: { readonly skill: SkillDots }) {
  return (
    <div
      className="cg-label"
      style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}
    >
      <span>{skill.label}</span>
      <span aria-label={`${skill.label} ${skill.filled} of ${skill.total}`}>
        {Array.from({ length: skill.total }, (_, i) => (i < skill.filled ? '●' : '○')).join('')}
      </span>
    </div>
  );
}

/** Readable heading for the arc stage (design/02 §4). */
function arcHeading(stage: string | null): string {
  if (stage === 'warning') return 'A warning sign';
  if (stage === 'point-of-no-return') return 'Point of no return';
  if (stage === 'flipped') return 'They flipped';
  return 'Trouble';
}

export function CrewDetail({
  crewId,
  onBack,
}: {
  readonly crewId: string;
  readonly onBack: () => void;
}) {
  const state = useGameState();
  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const view = crewDetail(state, crewId);
  // The person is gone (dismissed / flipped-out) — fall back to the roster.
  if (!view) {
    onBack();
    return null;
  }

  const store = useGameStore.getState;

  const train = (skill: CrewSkill) => store().trainCrew(crewId, skill);
  const promoteTo = (frontId: string) =>
    store().promoteCrew(crewId, { kind: 'front', targetId: frontId });
  const guard = (stashId: string) =>
    store().assignCrew(crewId, { kind: 'guard', targetId: stashId });
  const setIdle = () => store().assignCrew(crewId, { kind: 'idle' });
  const raisePay = () => store().treatCrew(crewId, { kind: 'paid', amount: RAISE_PAY_AMOUNT });
  const confront = () => store().treatCrew(crewId, { kind: 'confronted' });
  const remove = () => {
    store().dismissCrew(crewId);
    onBack();
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
        <Button variant="ghost" onClick={onBack} aria-label="Back to crew">
          ‹ Crew
        </Button>
        <span className="cg-label">
          {view.member.name} · {view.roleLabel}
        </span>
        {view.isWire ? (
          <StampBadge variant="danger" label="Wire" />
        ) : view.isFamily ? (
          <StampBadge variant="filed" label="Family" />
        ) : (
          <span />
        )}
      </header>

      <Card heading="Their story">
        <SceneText tone="default">{view.bond}</SceneText>
        <p className="cg-label" style={{ marginTop: 12 }} data-testid="loyalty-line">
          {view.loyaltyLine}
        </p>
        <p className="cg-label" style={{ marginTop: 6 }}>
          {view.assignment}
        </p>
      </Card>

      {view.arcSign && (
        <Card heading={arcHeading(view.arcStage)}>
          <SceneText tone="bust">{view.arcSign}</SceneText>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {view.isWire ? (
              <Button variant="primary" fullWidth onClick={remove}>
                Cut them loose
                <small>They can&apos;t be trusted anymore</small>
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={raisePay}
                  disabled={view.cleanCash < RAISE_PAY_AMOUNT}
                >
                  Raise their pay
                  <small>{money(RAISE_PAY_AMOUNT)} — buy back some goodwill</small>
                </Button>
                <Button variant="secondary" fullWidth onClick={confront}>
                  Confront them
                  <small>Clear the air, face to face</small>
                </Button>
                {view.canPromote &&
                  view.promoteFronts.map((f) => (
                    <Button
                      key={f.frontId}
                      variant="secondary"
                      fullWidth
                      onClick={() => promoteTo(f.frontId)}
                    >
                      Promote — give them {f.name}
                      <small>A seat at the table</small>
                    </Button>
                  ))}
                <Button variant="ghost" fullWidth onClick={remove}>
                  Cut them loose
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      <Card heading="Skills">
        <div style={{ display: 'grid', gap: 6 }}>
          {view.skills.map((s) => (
            <SkillTrack key={s.skill} skill={s} />
          ))}
        </div>
      </Card>

      <Card heading="Assignment">
        <p className="cg-label" style={{ marginBottom: 10 }}>
          {view.assignment}
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {state.stashes.map((s) => {
            const here = view.member.assignment.kind === 'guard' && view.member.assignment.targetId === s.id;
            return (
              <Button
                key={s.id}
                variant={here ? 'secondary' : 'ghost'}
                fullWidth
                disabled={here}
                onClick={() => guard(s.id)}
              >
                {here ? `Guarding ${s.name}` : `Put on ${s.name}`}
              </Button>
            );
          })}
          {view.member.assignment.kind !== 'idle' && (
            <Button variant="ghost" fullWidth onClick={setIdle}>
              Stand them down
            </Button>
          )}
        </div>
      </Card>

      <Card heading="Develop">
        <div style={{ display: 'grid', gap: 8 }}>
          {view.trainOptions.map((t) => (
            <Button
              key={t.skill}
              variant="ghost"
              fullWidth
              disabled={t.disabled}
              onClick={() => train(t.skill)}
            >
              Train {t.label}
              <small>{t.maxed ? 'Maxed out' : money(t.cost)}</small>
            </Button>
          ))}
          {view.canPromote &&
            !view.arcSign &&
            view.promoteFronts.map((f) => (
              <Button
                key={f.frontId}
                variant="secondary"
                fullWidth
                onClick={() => promoteTo(f.frontId)}
              >
                Promote to run {f.name}
                <small>Lieutenant · runs it autonomously</small>
              </Button>
            ))}
          {view.canPromote && view.promoteFronts.length === 0 && (
            <p className="cg-label">Open a front on the Money screen to promote a lieutenant.</p>
          )}
        </div>
      </Card>

      <Card heading="What they remember">
        {view.memory.length === 0 ? (
          <p className="cg-label">Nothing between you yet — just the work.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {view.memory.map((m, i) => (
              <Panel key={i}>
                <span className={m.grievance ? 'cg-tone-red' : 'cg-tone-dim'}>{m.note}</span>
              </Panel>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
