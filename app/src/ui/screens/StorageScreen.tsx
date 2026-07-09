/**
 * The Storage screen — the *where to stash* decision with its shown risk numbers
 * (Prompt 20; design/09 System A, GDD §4.8). Each stash reads its capacity, its
 * **effective seizure %** (the exact number a raid rolls — fairness law), heat
 * footprint, access speed, and guard; you can build new stashes, move product and
 * dirty cash between them (with travel-delay feedback), and post a guard (whose
 * loyalty feeds the seizure %). A diversification cue tells you if you're over-
 * concentrated — informational, never nagging.
 *
 * Open access (Ideas.md): every stash type is buyable from minute one — the price
 * is the only gate. Raid losses render as SCENES here (design/09 A.4), not toasts.
 * PURE composition — every number comes from `storageScreen.model`; actions dispatch
 * through the store, and the screen authors no seizure/capacity/cost math.
 */

import { useState } from 'react';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, SceneText } from '@/ui/components';
import { navigate } from '@/ui/shell/useHash';
import type { ProductId } from '@/engine';
import {
  buildOptions,
  diversificationCue,
  guardOptions,
  homeCountryId,
  moveTargets,
  raidScenes,
  stashRows,
  type StashRow,
} from './storageScreen.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** "instant" / "8h out" access-speed copy from a travel delay. */
function accessLabel(hours: number): string {
  return hours <= 0 ? 'instant' : `${hours}h out`;
}

/** A capacity fill bar (used / total) — the glanceable presence readout. */
function CapacityBar({ used, total }: { readonly used: number; readonly total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={used}
      aria-label="Capacity used"
      style={{
        height: 6,
        borderRadius: 3,
        background: 'var(--cg-ink-750)',
        overflow: 'hidden',
        margin: '8px 0 12px',
      }}
    >
      <i
        style={{
          display: 'block',
          width: `${pct}%`,
          height: '100%',
          background: 'var(--cg-brass)',
        }}
      />
    </div>
  );
}

/** One managed stash: risk numbers + guard/move/cash controls (local UI state only). */
function StashCard({ row, others }: { readonly row: StashRow; readonly others: readonly StashRow[] }) {
  const store = useGameStore.getState();
  const guards = guardOptions(useGameStore.getState().state!);

  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const [moveProductId, setMoveProductId] = useState<ProductId | ''>(
    row.heldProducts[0]?.id ?? '',
  );
  const [moveQty, setMoveQty] = useState(1);
  const [cashTo, setCashTo] = useState(others[0]?.id ?? '');
  const [cashAmt, setCashAmt] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const doMove = () => {
    if (!moveProductId || !moveTo) return;
    const result = store.moveStashProduct(row.id, moveTo, moveProductId, moveQty);
    if (result?.ok) {
      const delay = result.travelDelayHours;
      setFeedback(
        delay > 0
          ? `Moved — ${delay}h in transit before it lands.`
          : 'Moved — it’s in place.',
      );
    } else {
      setFeedback('Couldn’t move that — check space and what’s held.');
    }
  };

  const doCash = () => {
    if (!cashTo || cashAmt <= 0) return;
    const result = store.moveStashCash(row.id, cashTo, cashAmt);
    if (result?.ok) {
      const delay = result.travelDelayHours;
      setFeedback(
        delay > 0 ? `Cash moved — ${delay}h in transit.` : 'Cash moved — it’s in place.',
      );
    } else {
      setFeedback('Couldn’t move that cash — not enough here.');
    }
  };

  return (
    <Panel
      heading={
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>
            {row.name} · {row.typeName}
          </span>
          <span
            className={row.seizurePct >= 0.5 ? 'cg-tone-red' : 'cg-label'}
            data-testid="stash-seizure"
            aria-label={`Seizure risk ${row.seizurePctLabel}`}
          >
            Seizure {row.seizurePctLabel}
          </span>
        </span>
      }
      style={row.unguardedRisk ? { outline: '2px solid var(--cg-brass)' } : undefined}
    >
      <div className="cg-label">
        {row.capacityUsed} / {row.capacityTotal} units · {accessLabel(row.travelDelayHours)} ·
        heat {row.heatFootprintPct}%
      </div>
      <CapacityBar used={row.capacityUsed} total={row.capacityTotal} />

      {row.dirtyCash > 0 ? (
        <p className="cg-label" style={{ marginBottom: 8 }}>
          Dirty cash here: {money(row.dirtyCash)}
        </p>
      ) : null}

      {/* Guard — loyalty feeds the seizure % above (design/09 A.3a). */}
      <div style={{ marginBottom: 10 }}>
        <p className="cg-label" style={{ marginBottom: 6 }}>
          Guard:{' '}
          {row.guardName ? (
            <strong>{row.guardName}</strong>
          ) : (
            <span className={row.unguardedRisk ? 'cg-tone-red' : undefined}>
              {row.unguardedRisk ? 'unguarded — an inside job waiting to happen' : 'none'}
            </span>
          )}
        </p>
        {guards.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select
              className="cg-select"
              aria-label={`Assign a guard to ${row.name}`}
              value={row.guardCrewId ?? ''}
              data-testid="assign-guard"
              onChange={(e) =>
                store.assignStashGuard(row.id, e.target.value === '' ? undefined : e.target.value)
              }
            >
              <option value="">No guard</option>
              {guards.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.isWire ? ' (compromised)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="cg-label">Recruit crew to post a guard.</p>
        )}
      </div>

      {/* Move product / dirty cash — only meaningful with somewhere to move it. */}
      {others.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {row.heldProducts.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="cg-select"
                aria-label="Product to move"
                value={moveProductId}
                onChange={(e) => setMoveProductId(e.target.value as ProductId)}
              >
                {row.heldProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.qty})
                  </option>
                ))}
              </select>
              <input
                className="cg-input"
                type="number"
                min={1}
                aria-label="Quantity to move"
                value={moveQty}
                onChange={(e) => setMoveQty(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                style={{ width: 72 }}
              />
              <select
                className="cg-select"
                aria-label="Move product to"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    → {o.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={doMove} data-testid="move-product">
                Move
              </Button>
            </div>
          ) : null}

          {row.dirtyCash > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="cg-input"
                type="number"
                min={0}
                aria-label="Dirty cash to move"
                value={cashAmt}
                onChange={(e) => setCashAmt(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                style={{ width: 110 }}
              />
              <select
                className="cg-select"
                aria-label="Move cash to"
                value={cashTo}
                onChange={(e) => setCashTo(e.target.value)}
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    → {o.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={doCash} data-testid="move-cash">
                Store cash
              </Button>
            </div>
          ) : null}

          {feedback ? (
            <p className="cg-label" aria-live="polite" data-testid="move-feedback">
              {feedback}
            </p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

export function StorageScreen() {
  const state = useGameState();

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const rows = stashRows(state);
  const options = buildOptions(state);
  const cue = diversificationCue(state);
  const scenes = raidScenes(state);
  const homeCountry = homeCountryId(state);

  const build = (type: StashRow['type']) =>
    useGameStore.getState().buildStash({ stashType: type, countryId: homeCountry });

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
        <span className="cg-kicker">Storage</span>
        <span
          className={cue.concentrated ? 'cg-label cg-tone-red' : 'cg-label'}
          aria-live="polite"
        >
          {cue.concentrated ? 'Over-concentrated' : 'Weight spread'}
        </span>
      </header>

      {/* Raid outcomes render as scenes, never toasts (design/09 A.4). */}
      {scenes.length > 0 ? (
        <Card heading="What went down">
          <div style={{ display: 'grid', gap: 8 }}>
            {scenes.map((s) => (
              <SceneText key={s.id} tone="bust">
                {s.text}
              </SceneText>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Diversification cue — informational, not nagging (design/09 A.2). */}
      <Card heading="Spread of the load">
        <p className="cg-label">{cue.line}</p>
      </Card>

      <Card heading="Your stashes">
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row) => (
            <StashCard key={row.id} row={row} others={moveTargets(state, row.id)} />
          ))}
        </div>
      </Card>

      <Card heading="Build a stash">
        <div style={{ display: 'grid', gap: 8 }}>
          {options.map((o) => (
            <Panel
              key={o.type}
              heading={
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{o.name}</span>
                  <span className="cg-label">
                    seizure {o.baseSeizurePctLabel}
                    {o.paidSeizurePctLabel ? ` → ${o.paidSeizurePctLabel} paid` : ''}
                  </span>
                </span>
              }
            >
              <div className="cg-label" style={{ marginBottom: 8 }}>
                {o.capacity} units · {accessLabel(o.travelDelayHours)} · heat {o.heatFootprintPct}%
                {o.requiresGuard ? ' · needs a guard' : ''}
                {o.isDecoy ? ' · draws a raid onto nothing' : ''}
              </div>
              <Button
                variant="secondary"
                fullWidth
                disabled={!o.affordable}
                onClick={() => build(o.type)}
                data-testid="build-stash"
              >
                Build
                <small>{o.affordable ? money(o.cost) : `${money(o.cost)} · short`}</small>
              </Button>
            </Panel>
          ))}
        </div>
      </Card>

      <Card heading="Buy your way safer">
        <p className="cg-label" style={{ marginBottom: 10 }}>
          A paid port drops a container’s seizure to the floor. Bribe ports and put
          officials on standing payroll from the Corruption desk.
        </p>
        <Button variant="ghost" fullWidth onClick={() => navigate('corruption')}>
          Corruption desk →
        </Button>
      </Card>
    </div>
  );
}
