/**
 * The Turf War page (design "Turf Wars Between Countries"). Rivals contest
 * SPECIFIC countries you hold; here you fight them off — or go on the offensive to
 * seize ground and topple a rival. PURE composition: it reads numbers from
 * `turfWarScreen.model` selectors and dispatches store actions only. It authors no
 * battle/pressure/odds math — the win chance shown is `battleStrength` verbatim,
 * and that is exactly what `resolveBattle` rolls (fairness). Weapons committed are
 * spent from the armory, win or lose. Outcomes read as scenes.
 */

import { useState } from 'react';
import type { BattleCommitment, BattleResult, WeaponTierId } from '@/engine';
import { currentTier, tierDots } from '@/engine';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, HeatDots, Panel, SceneText, Stat } from '@/ui/components';
import {
  armoryRows,
  battlePreview,
  captureNote,
  declareCost,
  declareTargets,
  fighterRows,
  rivalsStanding,
  turfWarRows,
} from './turfWarScreen.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (p: number): string => `${Math.round(p * 100)}%`;

export function TurfWarScreen() {
  const state = useGameState();
  const [openWarId, setOpenWarId] = useState<string | null>(null);
  const [crewSel, setCrewSel] = useState<ReadonlySet<string>>(new Set());
  const [armsSel, setArmsSel] = useState<Readonly<Record<string, number>>>({});
  const [result, setResult] = useState<BattleResult | null>(null);
  const [scene, setScene] = useState<string | null>(null);

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const wars = turfWarRows(state);
  const targets = declareTargets(state);
  const heat = tierDots(state);
  const standing = rivalsStanding(state);

  const resetFight = () => {
    setOpenWarId(null);
    setCrewSel(new Set());
    setArmsSel({});
  };

  // A resolved battle reads as a scene — win or loss, with the shown = rolled odds.
  if (result) {
    const won = result.won === true;
    return (
      <Card heading={won ? 'You held the block' : 'They pushed back'}>
        <SceneText tone={won ? 'win' : 'bust'}>
          {won
            ? result.warEnded
              ? result.toppled
                ? 'You broke them for good. That rival is finished for the rest of the run.'
                : 'You pushed the rival out. The war over that ground is settled.'
              : 'You won the fight. The rival falls back — but this war is not over.'
            : result.seizedCountry
              ? 'They overran the ground. You lost the country and the stash there is gone.'
              : 'You lost the fight. The rival is taxing that operation now — regroup and hit back.'}
        </SceneText>
        {result.captured && captureNote(result.captured) !== '' && (
          <SceneText>{`You took their guns — ${captureNote(result.captured)}. They're in your armory.`}</SceneText>
        )}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {result.winChance !== undefined && (
            <Stat label="Win chance this fight" value={pct(result.winChance)} big />
          )}
          {result.spoils !== undefined && (
            <Stat label="Spoils seized" value={`${money(result.spoils)} dirty`} tone="gold" />
          )}
          {result.repGained !== undefined && result.repGained > 0 && (
            <Stat label="Street rep" value={`+${result.repGained}`} />
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              setResult(null);
              resetFight();
            }}
          >
            Back to the map
          </Button>
        </div>
      </Card>
    );
  }

  // A declare/truce/tribute outcome reads as a short scene.
  if (scene) {
    return (
      <Card heading="Word travels">
        <SceneText>{scene}</SceneText>
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" fullWidth onClick={() => setScene(null)}>
            Back to the map
          </Button>
        </div>
      </Card>
    );
  }

  const openWar = wars.find((w) => w.warId === openWarId) ?? null;

  const commitment: BattleCommitment = {
    crewIds: [...crewSel],
    arms: Object.fromEntries(
      Object.entries(armsSel).filter(([, n]) => n > 0),
    ) as Partial<Record<WeaponTierId, number>>,
  };
  const preview = openWar ? battlePreview(state, openWar.warId, commitment) : null;

  const toggleCrew = (id: string) =>
    setCrewSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setArms = (tier: WeaponTierId, n: number) =>
    setArmsSel((prev) => ({ ...prev, [tier]: Math.max(0, n) }));

  const fight = () => {
    if (!openWar) return;
    const r = useGameStore.getState().commitBattle(openWar.warId, commitment);
    if (r && r.rejected === undefined) setResult(r);
  };

  const truce = (warId: string) => {
    const r = useGameStore.getState().sueForTruce(warId);
    if (r && r.rejected === undefined) setScene('You bought peace. The war is settled.');
  };

  const tribute = (warId: string) => {
    const r = useGameStore.getState().payTribute(warId);
    if (r && r.rejected === undefined) setScene('You paid them off. The heat comes down — for a price.');
  };

  const declare = (countryId: string, rivalId: string) => {
    const r = useGameStore.getState().declareTurfWar(countryId, rivalId);
    if (r && r.war && r.rejected === undefined) {
      setScene('You made the first move. It is a war now — go win it.');
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
        <span className="cg-label">Turf · {standing} rival{standing === 1 ? '' : 's'} standing</span>
        <HeatDots value={heat.filled} max={heat.total} tier={currentTier(state)} />
      </header>

      {wars.length === 0 && (
        <Card heading="No wars — for now">
          <SceneText>
            Nobody is moving on your ground today. Push into a rival’s territory and that
            can change fast. Keep your crew close and your armory stocked.
          </SceneText>
        </Card>
      )}

      {/* Active wars — defend, buy peace, or appease. */}
      {wars.map((w) => (
        <Card
          key={w.warId}
          heading={`${w.countryName} · ${w.rivalName}`}
          data-testid={`turf-war-${w.warId}`}
        >
          <p className="cg-label">
            {w.archetype} — {w.kindNote}
            {w.initiatedByPlayer ? ' · your move' : ''}
          </p>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            <Stat label="Pressure" value={`${Math.round(w.pressure)}/100`} tone={w.pressure >= 80 ? 'red' : 'gold'} />
            <Stat label="At stake" value={money(w.stake)} />
            <Stat label="Battles lost" value={String(w.lossCount)} />
          </div>
          <p className="cg-label" style={{ marginTop: 8 }}>
            A win pays:{' '}
            {[
              w.winCaptureNote ? `their guns (${w.winCaptureNote})` : null,
              w.winRep > 0 ? `+${w.winRep} street rep` : null,
              w.spoilsOnTopple !== null ? `topple seizes ${money(w.spoilsOnTopple)} dirty` : null,
            ]
              .filter((s): s is string => s !== null)
              .join(' · ') || 'the war ends'}
          </p>
          {w.tributeActive && (
            <p className="cg-label" style={{ marginTop: 8, color: 'var(--cg-danger, #c0392b)' }}>
              Paying tribute — the rival is skimming this operation until you win it back.
            </p>
          )}
          {w.isHome && (
            <p className="cg-label" style={{ marginTop: 8 }}>
              This is home ground — it can’t be taken from you, only bled.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <Button
              variant={openWarId === w.warId ? 'secondary' : 'primary'}
              onClick={() => (openWarId === w.warId ? resetFight() : setOpenWarId(w.warId))}
              data-testid={`turf-fight-${w.warId}`}
            >
              {openWarId === w.warId ? 'Close' : 'Take the fight'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => tribute(w.warId)}
              disabled={state.cleanCash < w.tributeCost}
            >
              Pay tribute <small>{money(w.tributeCost)}</small>
            </Button>
            <Button
              variant="ghost"
              onClick={() => truce(w.warId)}
              disabled={state.cleanCash < w.truceCost}
            >
              Sue for truce <small>{money(w.truceCost)}</small>
            </Button>
          </div>

          {/* The fight panel — pick your fighters + firepower, see the itemized odds. */}
          {openWarId === w.warId && preview && (
            <Panel heading="Muster for battle">
              <p className="cg-label" style={{ marginBottom: 8 }}>
                Commit crew and weapons. Guns are spent whether you win or lose.
              </p>

              <div className="cg-label" style={{ marginTop: 8, marginBottom: 4 }}>Crew</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {fighterRows(state).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="cg-panel"
                    aria-pressed={crewSel.has(f.id)}
                    onClick={() => toggleCrew(f.id)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%',
                      outline: crewSel.has(f.id) ? '2px solid var(--cg-brass)' : 'none',
                    }}
                  >
                    <span className="cg-stat__value">{f.name}</span>
                    <span className="cg-label"> · {f.role} · muscle {f.muscle}</span>
                  </button>
                ))}
                {fighterRows(state).length === 0 && (
                  <p className="cg-label">No crew yet — you’ll fight this one alone.</p>
                )}
              </div>

              <div className="cg-label" style={{ marginTop: 12, marginBottom: 4 }}>Firepower</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {armoryRows(state).map((a) => (
                  <div
                    key={a.tier}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <span className="cg-label">
                      {a.name} — hold {a.held}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Button
                        variant="secondary"
                        onClick={() => setArms(a.tier, (armsSel[a.tier] ?? 0) - 1)}
                        disabled={(armsSel[a.tier] ?? 0) <= 0}
                        aria-label={`Fewer ${a.name}`}
                      >
                        −
                      </Button>
                      <span className="cg-stat__value" style={{ minWidth: 28, textAlign: 'center' }}>
                        {Math.min(armsSel[a.tier] ?? 0, a.held)}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => setArms(a.tier, Math.min(a.held, (armsSel[a.tier] ?? 0) + 1))}
                        disabled={(armsSel[a.tier] ?? 0) >= a.held}
                        aria-label={`More ${a.name}`}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <Stat label="Win chance" value={pct(preview.winChance)} tone="green" big />
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                  <Stat label="Your strength" value={String(Math.round(preview.playerStrength))} />
                  <Stat label="Their strength" value={String(Math.round(preview.rivalStrength))} />
                </div>
                <div style={{ marginTop: 8 }}>
                  {preview.playerTerms.map((t) => (
                    <p key={`p-${t.label}`} className="cg-label" style={{ margin: '2px 0' }}>
                      {t.label}: +{Math.round(t.contribution)}
                    </p>
                  ))}
                </div>
              </div>

              <Button
                variant="primary"
                fullWidth
                onClick={fight}
                data-testid={`turf-commit-${w.warId}`}
                style={{ marginTop: 12 }}
              >
                Send them in <small>Win chance {pct(preview.winChance)}</small>
              </Button>
            </Panel>
          )}
        </Card>
      ))}

      {/* Go on the offensive — declare war to seize ground or topple a rival. */}
      {targets.length > 0 && (
        <Card heading="Go on the offensive">
          <p className="cg-label" style={{ marginBottom: 10 }}>
            Move on a rival in a country you already hold. Cost to open: {money(declareCost(state))}{' '}
            clean, plus the heat of a loud move. Win it out and you break them for the run.
          </p>
          {targets.map((t) => (
            <div key={t.countryId} style={{ marginBottom: 12 }}>
              <div className="cg-stat__value">{t.countryName}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {t.rivals.map((r) => (
                  <Button
                    key={r.id}
                    variant="secondary"
                    onClick={() => declare(t.countryId, r.id)}
                    disabled={state.cleanCash < declareCost(state)}
                    data-testid={`turf-declare-${t.countryId}-${r.id}`}
                  >
                    Hit {r.name}
                    <small>{r.archetype}</small>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
