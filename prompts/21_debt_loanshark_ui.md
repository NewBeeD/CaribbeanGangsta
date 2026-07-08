# Prompt 21 — Debt / loan-shark UI

**Phase:** 2 — UI
**Depends on:** 10, 14
**Design refs:** `design/10` (whole doc, esp. §3 mechanics, §4 ethical contract, §5 ladder)

## Goal
Present borrowing so the terms are **fully disclosed up front**, the shark is a
**character** (not a UI), and the freeze-offline guarantee is legible. This is the
system closest to the dark-pattern line — the UI must reinforce the guarantees.

## Build
- `src/ui/screens/DebtScreen.tsx` / a loan-shark card flow:
  - Lender as an NPC (portrait/voice/menace + memory of your history).
  - **Borrow flow:** choose amount (≤ cap), pledge optional collateral; show
    **principal, weekly rate, and total-to-repay at the soft due date** *before*
    confirming — no hidden balloon. Explicitly state, in fiction, that **interest freezes
    while you're away** (teach it via `DEBT-01`). (design/10 §3, §4.2)
  - **Repay flow:** partial and full; state that **early repayment is free**.
  - **Status:** current balance, due-day countdown (in **in-game played time**, not
    real time), patience/relationship state as prose.
  - **Default ladder** rungs surface as story-card scenes (Prompt 22) with agency (pay /
    partial / negotiate / favor / remove).
  - **Lifeline:** when wiped, present the lifeline offer prominently as the way back.
- Dispatch borrow/repay/negotiate intents.

## Acceptance criteria
- Full terms (principal, rate, total-to-repay) shown **before** the loan confirms.
- The due-day is expressed in **in-game played time**; nothing in the UI implies real-
  world time increases the debt. (design/10 §4.2)
- Partial/early repayment paths carry no penalty.
- Default ladder rungs render as scenes with intervention actions.
- The lifeline offer appears on a wipe when reputation warrants (from Prompt 10).

## Guardrails (reinforce the four guarantees in the UI)
- Opt-in only; never nudge/auto-enroll into debt.
- **Never** display or send any "log in or your debt grows" pressure. No debt-guilt
  notifications, ever. (design/10 §4.2)
- The ladder is telegraphed; the fatal last rung is always the visible end, never a
  surprise. (design/10 §4.3, §5)
