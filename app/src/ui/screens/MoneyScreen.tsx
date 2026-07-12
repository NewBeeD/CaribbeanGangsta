/**
 * The Money screen — the return payoff (Prompt 18; design/07 §4, design/04 §1/§3).
 *
 * On reopen this is where "the longer you're away, the more options await" is made
 * concrete: the offline take reads as GAINS + decisions to allocate, never a loss.
 * Fronts turn time into clean cash; each shows its $/h and a priced next upgrade with
 * the affordable step highlighted. Fronts are the ONLY dirty→clean route (design/12
 * Item 12 — the bulk peso exchange was removed so a front means something). Every
 * front is buyable from minute one (open access — Ideas.md); money is the only gate.
 *
 * The hard line (GDD §6, §8): absence forgoes gains but never risks progress. There
 * is NO "your fronts are at risk" surface anywhere here. PURE composition — every
 * number comes from `moneyScreen.model` selectors and actions dispatch through the
 * store; the screen authors no rate/cost/haircut math.
 */

import { useGameState, useGameStore, useOfflineReport } from '@/store';
import { Button, Card, Panel, SceneText, Stat } from '@/ui/components';
import { SessionEndHook } from '@/ui/shell/SessionEndHook';
import { navigate } from '@/ui/shell/useHash';
import {
  buyFrontOptions,
  frontRows,
  nextAffordableUpgradeId,
  pendingDecisions,
  totalCleanRate,
  totalDirty,
  type FrontRow,
} from './moneyScreen.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** "7h 20m" from fractional hours (display formatting only — no game logic). */
function formatAway(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h <= 0 ? `${m}m` : `${h}h ${m}m`;
}

/** One owned front: its live $/h, a level bar, and the priced next upgrade. */
function FrontCard({
  row,
  highlighted,
  onUpgrade,
}: {
  readonly row: FrontRow;
  readonly highlighted: boolean;
  readonly onUpgrade: () => void;
}) {
  return (
    <Panel
      heading={
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{row.name}</span>
          <span className="cg-tone-green" aria-label={`${money(row.ratePerHour)} per hour`}>
            {money(row.ratePerHour)}/h{row.swings ? ' ~' : ''}
          </span>
        </span>
      }
      style={highlighted ? { outline: '2px solid var(--cg-brass)' } : undefined}
    >
      <div className="cg-label" style={{ marginBottom: 6 }}>
        Level {row.level} / {row.maxLevel}
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
    </Panel>
  );
}

export function MoneyScreen() {
  const state = useGameState();
  // The offline settlement, if it hasn't been acknowledged yet — read as gains.
  const report = useOfflineReport();

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const rows = frontRows(state);
  const highlightId = nextAffordableUpgradeId(state);
  const buyOptions = buyFrontOptions(state);
  const decisions = pendingDecisions(state);
  const rate = totalCleanRate(state);
  const cleanCash = state.cleanCash;
  const dirty = totalDirty(state);

  const upgrade = (frontId: string) => useGameStore.getState().upgradeFront(frontId);
  const buy = (type: FrontRow['type']) => useGameStore.getState().buyFront(type);

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
        <span className="cg-kicker">Money</span>
        <span className="cg-label cg-tone-green" aria-live="polite">
          {rate > 0 ? `Clean ${money(rate)}/h ▲ accruing…` : 'Clean $0/h · open a front'}
        </span>
      </header>

      {/* The return payoff — gains + choices only. No loss surface, ever (GDD §6). */}
      {report && report.hoursAway > 0 ? (
        <Card heading="While you were gone">
          <p className="cg-label" style={{ marginBottom: 8 }}>
            {formatAway(report.hoursAway)} away
          </p>
          <Stat
            label="Clean earned"
            value={`+ ${money(report.cleanEarned)}`}
            tone="green"
            big
          />
          {report.goldenHour ? (
            <SceneText tone="win">{report.goldenHour.summary}</SceneText>
          ) : null}
        </Card>
      ) : null}

      {decisions.length > 0 ? (
        <Card heading="Waiting on you">
          <div style={{ display: 'grid', gap: 10 }}>
            {decisions.map((d) => (
              <Button
                key={d.id}
                variant="secondary"
                onClick={() => {
                  // The hook did its job — clear it, then drop into the screen that
                  // resolves it (Prompt 22: return-hooks clear when acted on).
                  useGameStore.getState().dismissPendingChoice(d.id);
                  navigate(d.route);
                }}
                data-testid="pending-decision"
              >
                ➜ {d.summary}
                <small>See →</small>
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card heading="Dirty vs clean">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Stat label="Clean cash" value={money(cleanCash)} tone="gold" big />
          <Stat label="Dirty (in stashes)" value={money(dirty)} tone="default" big />
        </div>
        <p className="cg-label" style={{ marginTop: 12 }}>
          {dirty > 0
            ? 'Fronts turn the operation legitimate — run and upgrade them to keep the clean side growing.'
            : 'No dirty cash yet — sell some product, then let the fronts wash it.'}
        </p>
      </Card>

      <Card heading="Fronts">
        {rows.length === 0 ? (
          <p className="cg-label">
            No fronts yet. Open one below to start turning time into clean cash.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((row) => (
              <FrontCard
                key={row.id}
                row={row}
                highlighted={row.id === highlightId}
                onUpgrade={() => upgrade(row.id)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card heading="Open a new front">
        <div style={{ display: 'grid', gap: 8 }}>
          {buyOptions.map((o) => (
            <Panel
              key={o.type}
              heading={
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{o.name}</span>
                  <span className="cg-tone-green">{money(o.ratePerLevel)}/h · Lv1</span>
                </span>
              }
            >
              <Button
                variant="secondary"
                fullWidth
                disabled={!o.affordable}
                onClick={() => buy(o.type)}
              >
                Buy front
                <small>{o.affordable ? money(o.buyIn) : `${money(o.buyIn)} · short`}</small>
              </Button>
            </Panel>
          ))}
        </div>
      </Card>

      {/* Never leave clean — the open loop that pulls the next session (GDD §11). */}
      <SessionEndHook />
    </div>
  );
}
