# Prompt 10 — Debt & loan sharks (capital, leverage & the lifeline)

**Phase:** 1 — Simulation core
**Depends on:** 03, 06, 08
**Design refs:** `design/10_Debt_and_Loan_Sharks.md` (whole doc — read §4 Ethical Contract
before coding); GDD §4; `design/01` §4a (the lifeline out of the spiral)

## Goal
Implement borrowing at interest — the early-game **come-up hook** and the **only lifeline
out of the death spiral**. This system sits closest to the dark-pattern line, so the four
guarantees in design/10 §4 are **enforced in code**, not just intended.

## Build
- `src/engine/config/lenders.ts` — lender progression (design/10 §2): street shark
  ("Papa Cass"), neighborhood money-man, cartel financier — each with max principal,
  weekly interest, consequence ceiling, unlock gate. Lenders are **NPCs** (reuse Prompt
  08's model: loyalty/memory; pay reliably → bigger lines; burn them → they become rivals).
- `src/engine/debt.ts`
  - `debt` ledger on state: `{ lenderId, principal, rate, accruedInterest, dueDay,
    collateralRef?, patience }`.
  - `borrow(state, lenderId, amount, collateral?)` — cap = `f(reputation, collateral)`;
    **terms shown up front in full**: principal, weekly rate, total-to-repay at soft due
    date. No hidden balloon.
  - `accrueInterest(state, activeDaysElapsed)` — compounds at `rate/7` per **in-game day
    actually played**. Registered into `clock.tick` (active) — **NEVER** into
    `settleOffline`. This is Guarantee #2, enforced.
  - `repay(state, amount)` — partial allowed & encouraged (resets shark patience);
    **early repayment is always free** (no prepayment penalty).
  - `defaultLadder(state, rng): GameState` — advances the readable escalation ladder
    (design/10 §5) only when the soft due date passes unpaid: (1) vig added → (2) a visit
    (scare, heat-free) → (3) collateral/one stash taken (anti-wipe: one asset) → (4) a
    front/corner taken → (5) **marked** → can end the run (banks high score) — the
    telegraphed last rung, never silent. Each rung is a story beat with player agency
    (pay / partial / negotiate / do a favor / remove the shark).
  - `lifelineOffer(state): LenderOffer | null` — surfaces a credit offer when the player
    is wiped (capital ~0). Reputation/history keeps this door open; Prompt 11 checks it
    before declaring the spiral terminal.

## Acceptance criteria (vitest)
- **Guarantee #2 (critical):** `settleOffline` and any real-time elapse **never** change
  `accruedInterest` or advance the default ladder. Property test: for any `realHoursAway`,
  owed balance is unchanged. (design/10 §4.2)
- Interest compounds only per **active** in-game day at `rate/7`; matches the worked
  example (borrow $1,500 @20%/wk → ~$1,800 after one played week; ~$2,600 after three).
- Terms (principal, rate, total-to-repay) are computed and exposed **before** the player
  confirms a loan. Early/partial repayment carries no penalty and resets patience.
- Default ladder advances one readable rung at a time, only past the soft due date, each
  with an intervention; collateral seizure takes **exactly one** asset (anti-wipe).
- `lifelineOffer` appears when wiped **if** reputation/history warrants; otherwise null
  (and Prompt 11 may then declare the spiral terminal).

## Guardrails (the four guarantees — enforce, don't just document)
1. **Opt-in/consent** — never auto-enroll the player in debt.
2. **Absence never punished** — debt frozen offline (enforced above). No debt-guilt
   notifications, ever.
3. **Telegraphed, never silent** — the run can end at the ladder's end, but only as the
   visible last rung after readable warnings; never a hidden roll.
4. **Frustration only as challenge-that-resolves-to-competence** — if telemetry later
   shows borrowers churning, that's a balance bug, not a KPI win. (design/10 §4 watch item)
