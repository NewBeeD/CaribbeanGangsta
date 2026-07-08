# Prompt 18 — Money / Laundering screen (idle return payoff)

**Phase:** 2 — UI
**Depends on:** 07, 14
**Design refs:** `design/07` §4 (Money wireframe); `design/04` §1/§3; GDD §6, §11

## Goal
Render the **return hook**: on reopen show accrued clean cash **and decisions to
allocate** — never a loss. This is where "the longer you're away, the more options
await" is made concrete.

## Build
- `src/ui/screens/MoneyScreen.tsx` (design/07 §4):
  - "While you were gone (Nh Nm): + $X clean" from the `OfflineReport`.
  - **Pending decisions** as return hooks: "➜ A buyer is waiting on you. [See]",
    "➜ Marco flagged a problem. [See]" — route into the story-card presenter (Prompt 22).
  - **FRONTS list:** each front with `$/h`, level bar, and `[ Upgrade $cost ]` where the
    cost is `buy_in × 1.15^level` and the **next step is affordable-highlighted**.
  - Special channels: **Peso exchange** (dirty→clean at the **shown haircut**), buy new
    front (gated by disclosure).
  - Dirty vs Clean totals (dirty is **located** — link to storage, Prompt 20).
- Dispatch upgrade/buy/exchange intents; read rate/accrual from selectors.

## Acceptance criteria
- The offline summary shows **gains + choices only** — there is **no** surface anywhere
  that says the player lost anything while away. (GDD §6 — hard line)
- Upgrade costs match `buy_in × 1.15^level`; the affordable next step is highlighted.
- Peso exchange shows the exact haircut before commit.
- Pending decisions route into the card presenter and clear when resolved.

## Guardrails
- **Absence forgoes gains, never risks progress** — no "your fronts are at risk"
  pressure, ever. (design/07 §4, GDD §6/§8)
- The return payoff is framed as **decisions to allocate**, not just a bigger number.
  (design/04 §3, design/07 §4)
