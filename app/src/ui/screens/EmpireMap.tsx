/**
 * The Empire Map — Loop 3, the metagame backbone (Prompt 16; design/07 §2).
 *
 * Growth made visible with the next affordable step always in reach. The whole map
 * is open from minute one (Ideas.md — Drug Lord 2 open access): every country is a
 * district you already hold (home / an opened route) or a route you can OPEN the
 * moment you can pay for a foothold. Money is the only gate — expansion targets are
 * always visible AND priced; affordability limits them, never a progression flag.
 *
 * PURE composition: every number comes from `empireMap.model` selectors and the one
 * action dispatches through the store — the screen authors no economic math.
 */

import { useGameState, useGameStore } from '@/store';
import { Button, Card, Stat } from '@/ui/components';
import { navigate } from '@/ui/shell/useHash';
import {
  EXPANSION_TYPE,
  cleanRate,
  districtViews,
  empireSummary,
  nextAffordableStep,
  type DistrictView,
} from './empireMap.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Short badge copy for a district's control state. */
function statusLabel(d: DistrictView): string {
  if (d.status === 'unowned') return 'No presence';
  if (d.contested) return 'Contested';
  if (d.status === 'home') return 'Home turf';
  return 'Route open';
}

export function EmpireMap() {
  const state = useGameState();
  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const districts = districtViews(state);
  const summary = empireSummary(state);
  const rate = cleanRate(state);
  const next = nextAffordableStep(state);
  const cleanCash = state.cleanCash;

  const build = (countryId: string) =>
    useGameStore.getState().buildStash({ stashType: EXPANSION_TYPE, countryId });
  // Held districts REINFORCE by upgrading their lead stash for space (design/13 G).
  const reinforce = (stashId: string) => useGameStore.getState().upgradeStash(stashId);

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
        <span className="cg-kicker">Empire</span>
        <span className="cg-label cg-tone-green" aria-live="polite">
          {rate > 0 ? `Clean ${money(rate)}/h ▲ accruing…` : 'Clean $0/h · open a front'}
        </span>
      </header>

      <Card heading="Territory">
        <Stat label="Clean cash" value={money(cleanCash)} tone="gold" big />
        <p className="cg-label" style={{ marginTop: 8 }}>
          Every district below is a door — open a route, or reinforce turf you already hold.
        </p>
      </Card>

      {districts.map((d) => {
            const highlighted = next?.countryId === d.countryId;
            const isOpen = d.status === 'unowned';
            const blocked = d.blockedByCrew;
            const affordable = cleanCash >= d.openCost;
            const canAct = isOpen
              ? affordable && !blocked
              : affordable && !d.reinforceMaxed;
            const actionLabel = isOpen ? 'Open route' : d.reinforceMaxed ? 'Maxed' : 'Reinforce';
            const costNote = d.reinforceMaxed
              ? 'fully upgraded'
              : !affordable
                ? `${money(d.openCost)} · short`
                : blocked
                  ? `${money(d.openCost)} · needs a lieutenant`
                  : money(d.openCost);

            return (
              <Card
                key={d.countryId}
                heading={
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span>{d.name}</span>
                    <span
                      className={
                        isOpen ? 'cg-tone-dim' : d.contested ? 'cg-tone-amber' : 'cg-tone-green'
                      }
                      data-status={d.status}
                      data-control={d.contested ? 'contested' : d.status === 'unowned' ? 'none' : 'controlled'}
                    >
                      {statusLabel(d)}
                      {d.exposed ? ' · exposed' : ''}
                    </span>
                  </span>
                }
                style={
                  highlighted
                    ? { outline: '2px solid var(--cg-brass)' }
                    : undefined
                }
              >
                {isOpen ? (
                  <>
                    <p className="cg-label" style={{ margin: '2px 0 12px' }}>
                      {d.hooks[0] ?? 'An untapped market — plant a foothold to open it.'}
                    </p>
                    {blocked ? (
                      <p className="cg-label cg-tone-amber" style={{ margin: '0 0 12px' }}>
                        Reach past your grip — promote a lieutenant to run new turf.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="cg-label" style={{ marginBottom: 6 }}>
                      {d.stashCount} stash{d.stashCount === 1 ? '' : 'es'} ·{' '}
                      {d.capacityUsed}/{d.capacityTotal} units
                    </div>
                    <div
                      className="cg-empire__bar"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(d.fill * 100)}
                      aria-label={`${d.name} capacity`}
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'var(--cg-ink-750)',
                        overflow: 'hidden',
                        marginBottom: d.contested ? 6 : 12,
                      }}
                    >
                      <i
                        style={{
                          display: 'block',
                          width: `${Math.round(d.fill * 100)}%`,
                          height: '100%',
                          background: 'var(--cg-brass)',
                        }}
                      />
                    </div>
                    {d.contested ? (
                      <p className="cg-label cg-tone-amber" style={{ margin: '0 0 12px' }}>
                        Consolidating control · {Math.round(d.consolidationPct * 100)}%
                        {d.exposed ? ' · running hot' : ''}
                      </p>
                    ) : null}
                  </>
                )}

                <Button
                  variant={highlighted ? 'primary' : 'secondary'}
                  fullWidth
                  disabled={!canAct}
                  onClick={() =>
                    isOpen
                      ? build(d.countryId)
                      : d.reinforceStashId
                        ? reinforce(d.reinforceStashId)
                        : undefined
                  }
                >
                  {actionLabel}
                  <small>{costNote}</small>
                </Button>
              </Card>
            );
          })}

      {/* Moving product lives on its own Transport page now (design/12 Item 8);
          opening the routes it ships between stays here. */}
      {state.shipments.length > 0 || state.stashes.length > 1 ? (
        <Card heading="Transport">
          <p className="cg-label" style={{ marginBottom: 12 }}>
            {state.shipments.length > 0
              ? `${state.shipments.length} shipment${state.shipments.length === 1 ? '' : 's'} on the water.`
              : 'Routes open — move product across the water from the Transport desk.'}
          </p>
          <Button variant="secondary" onClick={() => navigate('transport')}>
            Open the Transport desk →
          </Button>
        </Card>
      ) : null}

      <Card heading="Empire at a glance">
        <div className="cg-label">
          Fronts {summary.fronts} · Crew {summary.crew} · Routes {summary.routes} ·
          Rivals {summary.rivals}
        </div>
        {summary.contested > 0 ? (
          <div className="cg-label cg-tone-amber" style={{ marginTop: 6 }}>
            {summary.contested} district{summary.contested === 1 ? '' : 's'} still
            consolidating — hold to lock in reach.
          </div>
        ) : null}
        {summary.lieutenantRequired && !summary.lieutenantReady ? (
          <>
            <div className="cg-label cg-tone-amber" style={{ margin: '6px 0 8px' }}>
              New turf now needs a lieutenant to run it.
            </div>
            <Button variant="secondary" onClick={() => navigate('crew')}>
              Promote a lieutenant on the Crew screen →
            </Button>
          </>
        ) : null}
      </Card>
    </div>
  );
}
