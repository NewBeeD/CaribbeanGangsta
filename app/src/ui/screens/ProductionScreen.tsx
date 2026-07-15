/**
 * The Production screen (Prompt 39; Ideas2 item 3) — become a supplier. Grow-ops
 * and drug factories turn ACTIVE time into PRODUCT UNITS in the home stash, the
 * mirror of the Money screen's fronts (which turn time into clean cash). Each op
 * shows its live units/hr, the dollar value of that hour at the home market, its
 * heat footprint, and a priced next upgrade — every number from
 * `production.model` selectors (the screen authors no yield/cost/price math).
 *
 * Open access (Ideas.md — Drug Lord 2): every op is buyable from minute one; the
 * steep buy-in (and heat) is the only gate. A promoted lieutenant can be
 * transferred to run an op for a disclosed yield bonus (crew delegation reusing
 * the front-lieutenant path). The ethical spine (GDD §6): production is idle YIELD
 * — absence forgoes it, never seizes it — so there is no loss surface here.
 */

import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, Stat } from '@/ui/components';
import { navigate } from '@/ui/shell/useHash';
import {
  availableManagers,
  buyOpOptions,
  nextAffordableOpUpgradeId,
  opRows,
  type BuyOpOption,
  type OpRow,
} from './production.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
// Product quantities are shown as whole units, ROUNDED UP — you never read a
// fractional kilo/pill. Display-only: the engine still accrues the exact
// fractional yield (production.ts), so the idle economy is unchanged.
const product = (n: number): string => `${Math.ceil(n).toLocaleString('en-US')}`;
// Heat is a rate, not a drug quantity — keep its one-decimal read (don't ceil).
const units = (n: number): string => `${(Math.round(n * 10) / 10).toLocaleString('en-US')}`;

function KindTag({ kind }: { readonly kind: 'grow' | 'factory' }) {
  return (
    <span
      className="cg-label"
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        opacity: 0.75,
      }}
    >
      {kind === 'grow' ? 'Grow' : 'Factory'}
    </span>
  );
}

/** One owned op: live yield, its market value/hr, heat, a level bar, and delegation. */
function OpCard({
  row,
  highlighted,
  managers,
  onUpgrade,
  onAssign,
  onUnassign,
}: {
  readonly row: OpRow;
  readonly highlighted: boolean;
  readonly managers: readonly { readonly id: string; readonly name: string }[];
  readonly onUpgrade: () => void;
  readonly onAssign: (crewId: string) => void;
  readonly onUnassign: (crewId: string) => void;
}) {
  return (
    <Panel
      heading={
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>
            {row.name} <KindTag kind={row.kind} />
          </span>
          <span className="cg-tone-green" aria-label={`${product(row.unitsPerHour)} ${row.productName} per hour`}>
            {product(row.unitsPerHour)} {row.productName}/h
          </span>
        </span>
      }
      style={highlighted ? { outline: '2px solid var(--cg-brass)' } : undefined}
    >
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
        <Stat label="Worth / h (home market)" value={`${money(row.valuePerHour)}`} tone="gold" />
        <Stat label="Heat / h" value={units(row.heatPerHour)} tone="default" />
      </div>
      <div className="cg-label" style={{ marginBottom: 6 }}>
        Level {row.level} / {row.maxLevel}
        {row.managerBonus > 0 && row.manager
          ? ` · ${row.manager.name} running it (+${Math.round(row.managerBonus * 100)}%)`
          : ''}
      </div>
      <div
        className="cg-money__bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={row.maxLevel}
        aria-valuenow={row.level}
        aria-label={`${row.name} level`}
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--cg-ink-750)',
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <i
          style={{
            display: 'block',
            width: `${Math.round((row.level / row.maxLevel) * 100)}%`,
            height: '100%',
            background: 'var(--cg-brass)',
          }}
        />
      </div>

      {row.maxed ? (
        <Button variant="ghost" fullWidth disabled>
          Maxed out
        </Button>
      ) : (
        <Button
          variant={highlighted ? 'primary' : 'secondary'}
          fullWidth
          disabled={!row.affordable}
          onClick={onUpgrade}
        >
          Upgrade
          <small>{row.affordable ? money(row.upgradeCost) : `${money(row.upgradeCost)} · short`}</small>
        </Button>
      )}

      {/* Crew delegation (Ideas2 item 3) — transfer a lieutenant to manage the op. */}
      <div style={{ marginTop: 10 }}>
        {row.manager ? (
          <Button
            variant="ghost"
            fullWidth
            data-testid="op-unassign"
            onClick={() => onUnassign(row.manager!.id)}
          >
            Pull {row.manager.name} off
            <small>back to base yield</small>
          </Button>
        ) : managers.length > 0 ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <span className="cg-label">Put a lieutenant on it for a yield bonus:</span>
            {managers.map((m) => (
              <Button
                key={m.id}
                variant="ghost"
                data-testid="op-assign"
                onClick={() => onAssign(m.id)}
              >
                {m.name} runs it
              </Button>
            ))}
          </div>
        ) : (
          <Button variant="ghost" fullWidth onClick={() => navigate('crew')}>
            Promote a lieutenant to run it →
          </Button>
        )}
      </div>
    </Panel>
  );
}

/** One buyable-once op: what it makes, its yield/heat, and the buy-in. */
function BuyOpCard({ o, onBuy }: { readonly o: BuyOpOption; readonly onBuy: () => void }) {
  return (
    <Panel
      heading={
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>
            {o.name} <KindTag kind={o.kind} />
          </span>
          <span className="cg-tone-green">
            {product(o.unitsPerHourPerLevel)} {o.productName}/h · Lv1
          </span>
        </span>
      }
    >
      <p className="cg-label" style={{ marginBottom: 8 }}>
        {o.blurb} <span style={{ opacity: 0.7 }}>· {units(o.heatPerHour)} heat/h</span>
      </p>
      <Button variant="secondary" fullWidth disabled={!o.affordable} onClick={onBuy} data-testid="op-buy">
        Set up
        <small>{o.affordable ? money(o.buyIn) : `${money(o.buyIn)} · short`}</small>
      </Button>
    </Panel>
  );
}

export function ProductionScreen() {
  const state = useGameState();
  if (!state) return null;

  const rows = opRows(state);
  const highlightId = nextAffordableOpUpgradeId(state);
  const buyOptions = buyOpOptions(state);
  const managers = availableManagers(state);
  const totalValue = rows.reduce((sum, r) => sum + r.valuePerHour, 0);

  const store = useGameStore.getState;
  const upgrade = (opId: string) => store().upgradeProductionOp(opId);
  const buy = (type: BuyOpOption['type']) => store().buyProductionOp(type);
  const assign = (opId: string, crewId: string) =>
    store().assignCrew(crewId, { kind: 'production', targetId: opId });
  const unassign = (crewId: string) => store().assignCrew(crewId, { kind: 'idle' });

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
        <span className="cg-kicker">Production</span>
        <span className="cg-label cg-tone-green" aria-live="polite">
          {totalValue > 0
            ? `~${money(totalValue)}/h of product · flowing into your stash`
            : 'No production yet · set up a grow'}
        </span>
      </header>

      <Card heading="Supply">
        <p className="cg-label">
          Grows and factories turn time into product in your home stash — the units
          you own outright, to sell into any market or feed the corners. Bounded by
          your stash space; a full stash idles the op until you make room. While
          you're away it freezes — nothing is produced, nothing is lost.
        </p>
      </Card>

      <Card heading="What you're producing">
        {rows.length === 0 ? (
          <p className="cg-label">
            Nothing in production yet. Set up a grow or a factory below to start
            stacking product.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((row) => (
              <OpCard
                key={row.id}
                row={row}
                highlighted={row.id === highlightId}
                managers={managers}
                onUpgrade={() => upgrade(row.id)}
                onAssign={(crewId) => assign(row.id, crewId)}
                onUnassign={(crewId) => unassign(crewId)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card heading="Set up production">
        {buyOptions.length === 0 ? (
          <p className="cg-label">
            Every grow and factory is running — upgrade the ones you own to stack
            more weight.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {buyOptions.map((o) => (
              <BuyOpCard key={o.type} o={o} onBuy={() => buy(o.type)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
