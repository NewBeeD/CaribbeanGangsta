/**
 * The Debt / loan-shark screen — borrowing where the terms are fully disclosed and
 * the shark is a CHARACTER, not a UI (Prompt 21; design/10 whole doc, esp. §3
 * mechanics, §4 ethical contract, §5 ladder). This is the system closest to the
 * dark-pattern line, so the screen REINFORCES the four guarantees (design/10 §4):
 *
 *  - Full terms — principal, weekly rate, total-to-repay at the soft due date — are
 *    shown BEFORE the loan confirms; no hidden balloon (§3, §4.4).
 *  - The due-day is stated in IN-GAME played time, and the copy says outright that
 *    interest freezes while you're away — absence is never punished (§4.2).
 *  - Early/partial repayment is stated to be free; partial pay buys patience (§3).
 *  - The default ladder is telegraphed in full — the run-ending last rung is always
 *    the visible end, never a surprise (§5, §4.3).
 *
 * There is NO "log in or your debt grows" pressure anywhere here, and never a debt-
 * guilt notification (§4.2). PURE composition — every number comes from
 * `debtScreen.model` selectors and borrow/repay dispatch through the store; the
 * screen authors no interest/cap/ladder math.
 */

import { useState } from 'react';
import { useGameState, useGameStore } from '@/store';
import { Button, Card, Panel, SceneText, Stat } from '@/ui/components';
import {
  activeLoan,
  borrowQuote,
  collateralOptions,
  debtScenes,
  ladderTelegraph,
  lenderOptions,
  lifeline,
  repayPlan,
  type ActiveLoan,
  type LadderStep,
  type LifelineView,
} from './debtScreen.model';
import type { GameState, LenderId } from '@/engine';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** The telegraphed escalation ladder — the fatal last rung always visible (design/10 §5). */
function LadderTelegraph({ steps }: { readonly steps: readonly LadderStep[] }) {
  return (
    <div style={{ display: 'grid', gap: 6 }} data-testid="ladder-telegraph">
      {steps.map((s) => (
        <div
          key={s.rung}
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'baseline',
            opacity: s.reached ? 1 : 0.85,
          }}
        >
          <span
            className={s.fatal ? 'cg-label cg-tone-red' : 'cg-label'}
            style={{ minWidth: 18, fontVariantNumeric: 'tabular-nums' }}
            aria-hidden="true"
          >
            {s.rung}.
          </span>
          <span className={s.fatal ? 'cg-tone-red' : undefined} style={{ fontSize: 14 }}>
            {s.sign}
            {s.reached ? ' — happening now.' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Pay-in-full / buy-patience — the intervention actions (design/10 §3; free & patience-resetting). */
function RepayControls({ state }: { readonly state: GameState }) {
  const plan = repayPlan(state);
  const repay = (amount: number) => useGameStore.getState().repayLoan(amount);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Button
        variant="primary"
        fullWidth
        disabled={!plan.canPayFull}
        onClick={() => repay(plan.fullAmount)}
        data-testid="repay-full"
      >
        Pay in full
        <small>{plan.canPayFull ? money(plan.fullAmount) : `${money(plan.fullAmount)} · short`}</small>
      </Button>
      <Button
        variant="secondary"
        fullWidth
        disabled={!plan.canPayPartial}
        onClick={() => repay(plan.partialAmount)}
        data-testid="repay-partial"
      >
        Buy patience (partial)
        <small>
          {plan.canPayPartial ? `${money(plan.partialAmount)} · resets his clock` : 'pay full instead'}
        </small>
      </Button>
      <p className="cg-label">
        Early or partial, you’re only ever charged what you owe — no prepayment penalty.
      </p>
    </div>
  );
}

/** The live loan: balance, in-game due countdown, patience prose, and its ladder. */
function ActiveLoanCard({
  loan,
  state,
  showRepay,
}: {
  readonly loan: ActiveLoan;
  readonly state: GameState;
  readonly showRepay: boolean;
}) {
  const dueLine = loan.overdue
    ? `Past due by ${loan.overdueDays} in-game ${loan.overdueDays === 1 ? 'day' : 'days'}`
    : `Due in ${loan.daysUntilDue} in-game ${loan.daysUntilDue === 1 ? 'day' : 'days'} (day ${loan.dueDay})`;

  return (
    <Card heading={`You owe ${loan.lenderName}`}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Stat label="Balance owed" value={money(loan.owed)} tone="red" big />
        <Stat label="Weekly rate" value={`${loan.weeklyRatePct}%`} tone="default" />
      </div>
      <p className="cg-label" style={{ marginTop: 8 }}>
        {money(loan.principal)} principal + {money(loan.accruedInterest)} interest so far
        {loan.collateralLabel ? ` · secured on ${loan.collateralLabel}` : ' · unsecured'}
      </p>

      <p
        className={loan.overdue ? 'cg-label cg-tone-red' : 'cg-label'}
        style={{ marginTop: 6 }}
        data-testid="due-countdown"
      >
        {dueLine}. Interest only grows on days you play — it freezes while you’re away.
      </p>

      <SceneText tone={loan.overdue ? 'bust' : 'default'} who={`${loan.lenderName}:`}>
        {loan.patienceProse}
      </SceneText>

      {showRepay ? (
        <div style={{ marginTop: 12 }}>
          <RepayControls state={state} />
        </div>
      ) : null}

      <details style={{ marginTop: 12 }}>
        <summary className="cg-label" style={{ cursor: 'pointer' }}>
          If you don’t pay — the whole ladder, up front
        </summary>
        <div style={{ marginTop: 8 }}>
          <LadderTelegraph steps={ladderTelegraph(state, loan.lenderId)} />
        </div>
      </details>
    </Card>
  );
}

/** Amount presets as a fraction of the cap — button-driven, no free-text entry. */
const AMOUNT_PRESETS: readonly { readonly label: string; readonly frac: number }[] = [
  { label: '25%', frac: 0.25 },
  { label: '50%', frac: 0.5 },
  { label: 'Max', frac: 1 },
];

/** The borrow flow — pick a lender, an amount, optional collateral; full terms before confirm. */
function BorrowFlow({ state }: { readonly state: GameState }) {
  const lenders = lenderOptions(state);
  const collateral = collateralOptions(state);
  const [lenderId, setLenderId] = useState<LenderId>(lenders[0]!.id);
  const [frac, setFrac] = useState(0.5);
  const [collateralRef, setCollateralRef] = useState<string | undefined>(undefined);

  const selected = lenders.find((l) => l.id === lenderId) ?? lenders[0]!;
  // Cap reflects the pledged collateral; derive the amount as a fraction of it.
  const cap = borrowQuote(state, lenderId, 0, collateralRef).cap;
  const amount = Math.round(cap * frac);
  const quote = borrowQuote(state, lenderId, amount, collateralRef);

  const borrow = () => {
    const result = useGameStore.getState().borrowLoan(lenderId, amount, collateralRef);
    if (result?.ok) {
      setCollateralRef(undefined);
      setFrac(0.5);
    }
  };

  return (
    <>
    <Card heading="Borrow">
      <p className="cg-label" style={{ marginBottom: 12 }}>
        Every door’s open — what you can draw is set by your reputation and any collateral,
        never a locked menu. Take only what you can pay back.
      </p>

      {/* Choose the lender (a character, cheapest-consequence first). */}
      <div style={{ display: 'grid', gap: 8 }}>
        {lenders.map((l) => (
          <Panel
            key={l.id}
            heading={
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{l.name}</span>
                <span className="cg-label">{l.weeklyRatePct}%/wk</span>
              </span>
            }
            style={l.id === lenderId ? { outline: '2px solid var(--cg-brass)' } : undefined}
          >
            <p className="cg-label" style={{ marginBottom: 8 }}>
              {l.title} · up to {money(l.cap)} · {l.consequenceLabel}.
            </p>
            <Button
              variant={l.id === lenderId ? 'primary' : 'secondary'}
              fullWidth
              onClick={() => setLenderId(l.id)}
              aria-pressed={l.id === lenderId}
              data-testid={`lender-${l.id}`}
            >
              {l.id === lenderId ? 'Selected ✓' : 'Choose this lender'}
            </Button>
          </Panel>
        ))}
      </div>
    </Card>

    <Card heading="How much">
      {/* How much — presets against the cap (never over what the shark will lend). */}
      <p className="cg-label" style={{ marginBottom: 6 }}>
        How much (cap {money(cap)})
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {AMOUNT_PRESETS.map((p) => (
          <Button
            key={p.label}
            variant={frac === p.frac ? 'primary' : 'secondary'}
            onClick={() => setFrac(p.frac)}
            aria-pressed={frac === p.frac}
            data-testid={`amount-${p.label.toLowerCase()}`}
          >
            {p.label}
            <small>{money(Math.round(cap * p.frac))}</small>
          </Button>
        ))}
      </div>

      {/* Optional collateral — pledging raises the cap; defaulting transfers that one asset. */}
      {collateral.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <p className="cg-label" style={{ marginBottom: 6 }}>
            Pledge collateral (optional) — raises your cap; a default takes that one asset.
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {collateral.map((c) => {
              const on = c.ref === collateralRef;
              return (
                <Button
                  key={c.ref}
                  variant={on ? 'primary' : 'ghost'}
                  fullWidth
                  onClick={() => setCollateralRef(on ? undefined : c.ref)}
                  aria-pressed={on}
                  data-testid={`collateral-${c.ref}`}
                >
                  {on ? '✓ ' : ''}
                  {c.label}
                  <small>+{money(c.addedHeadroom)} headroom</small>
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>

    {/* Full terms, up front — no hidden balloon (design/10 §3, §4.4). */}
    <Card heading="Your terms, in full">
        <div style={{ display: 'grid', gap: 8 }}>
          <Stat label="You receive now" value={money(quote.principal)} tone="gold" big />
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Stat label="Weekly rate" value={`${quote.weeklyRatePct}%`} />
            <Stat label="Interest by due date" value={money(quote.interestAtDue)} />
          </div>
          <Stat
            label={`Total to repay by day ${quote.dueDay}`}
            value={money(quote.totalToRepayAtDue)}
            tone="red"
            big
          />
          <p className="cg-label" data-testid="borrow-terms">
            Soft due date is {quote.softDueDays} in-game days out — consequences only begin if
            you’re past it. Interest freezes while you’re away; it only grows on days you play.
          </p>
        </div>

        <Button
          variant="primary"
          fullWidth
          disabled={!quote.withinCap}
          onClick={borrow}
          data-testid="take-loan"
          style={{ marginTop: 12 }}
        >
          Take the loan
          <small>
            {quote.withinCap
              ? `${money(quote.principal)} now · repay ${money(quote.totalToRepayAtDue)} by day ${quote.dueDay}`
              : 'choose an amount'}
          </small>
        </Button>
    </Card>

    {/* The whole ladder for this lender, telegraphed before you ever borrow. */}
    <Card heading={`If you default — ${selected.name}’s ladder`}>
      <p className="cg-label" style={{ marginBottom: 8 }}>
        Here’s the whole ladder for {selected.name}, up front — nothing hidden:
      </p>
      <LadderTelegraph steps={ladderTelegraph(state, lenderId)} />
    </Card>
    </>
  );
}

/** The lifeline — the prominent way back when wiped (design/10 §1). */
function LifelineCard({ life }: { readonly life: LifelineView }) {
  const take = () =>
    useGameStore.getState().borrowLoan(life.lenderId, life.amount);

  return (
    <Card heading="A hand back up">
      <SceneText tone="win">{life.reason}</SceneText>
      <p className="cg-label" style={{ margin: '8px 0 12px' }}>
        {money(life.amount)} to get back on your feet, at {life.weeklyRatePct}%/wk. Same deal as
        ever — the clock only runs while you’re working, and the terms are the terms.
      </p>
      <Button variant="primary" fullWidth onClick={take} data-testid="take-lifeline">
        Take the lifeline
        <small>+{money(life.amount)} · {life.weeklyRatePct}%/wk</small>
      </Button>
    </Card>
  );
}

export function DebtScreen() {
  const state = useGameState();

  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const loan = activeLoan(state);
  const scenes = debtScenes(state);
  const life = lifeline(state);
  const hasDefaultScene = scenes.some((s) => s.kind === 'default');

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
        <span className="cg-kicker">Debt</span>
        <span className="cg-label" aria-live="polite">
          {loan ? `Owe ${money(loan.owed)} to ${loan.lenderName}` : 'No loan — the door’s open'}
        </span>
      </header>

      {/* The lifeline out of the spiral — presented prominently as the way back. */}
      {life ? <LifelineCard life={life} /> : null}

      {/* Debt story-beats surfaced as scenes (design/10 §5). Default rungs carry the
          intervention actions here; the full negotiate/favor/remove card presenter
          arrives in Prompt 22. */}
      {scenes.length > 0 ? (
        <Card heading={hasDefaultScene ? 'The shark’s calling it in' : 'Word from the shark'}>
          <div style={{ display: 'grid', gap: 10 }}>
            {scenes.map((s) => (
              <SceneText key={s.id} tone={s.kind === 'cleared' ? 'win' : 'bust'}>
                {s.text}
              </SceneText>
            ))}
            {hasDefaultScene && loan ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <RepayControls state={state} />
                <p className="cg-label">
                  Or do him a favor / negotiate — those play out as a scene (coming soon).
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {loan ? (
        <ActiveLoanCard loan={loan} state={state} showRepay={!hasDefaultScene} />
      ) : (
        <BorrowFlow state={state} />
      )}
    </div>
  );
}
