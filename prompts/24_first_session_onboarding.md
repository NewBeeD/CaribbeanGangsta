# Prompt 24 — First-session onboarding (the invisible tutorial)

**Phase:** 3 — Onboarding & integration
**Depends on:** 13, 15, 17, 18, 22 (and the engine spine)
**Design refs:** GDD §9; `design/01` §6 (minute budget); `design/04` §2; `design/07` §7;
`prototype/` (reference implementation of this exact flow)

## Goal
Wire the first session — the single steepest drop-off — as an **invisible tutorial**
that teaches through fiction and ends on a return hook. Target **10–20 min**,
frustration-free, with a **win inside 2 minutes**.

## Build
- `src/engine/onboarding.ts` (or a flags-driven sequencer) implementing the flow
  (design/07 §7, design/01 §6):
  1. **Cold open (0–2 min):** an evocative scene → the aspiration ("the empire you could
     build") → **one guided first sale, guaranteed success** (`ONB-01`). Beat the 2-min
     churn cliff with a *win*, not a menu.
  2. **First heat scare (2–8 min):** a close call that is a **guaranteed survival**
     (loss-sequencing); 3–4 more free deals; hire the **first runner** (one crew member —
     decision-fatigue gate).
  3. **First front (8–15 min):** open the first laundering front → the idle engine starts
     → **session ends on an open loop**: money about to accrue + a buyer waiting.
- **Adaptive hints:** show a hint **only** if the player visibly fumbles; fast learners
  never see it (preserves competence). (design/04 §2, PvZ)
- Introduce currency/laundering complexity around **minute 8**, not minute 1.
- Gate all other nav/features via progressive disclosure until their onboarding step.
- On-screen instruction **≤ ~8 words** at any time; no screen labeled "Tutorial".

## Acceptance criteria
- A first-session playthrough reaches the first sale **≤ 2 minutes** and completes the
  full flow within the **10–20 min** window (measure via telemetry, Prompt 25).
- The guided sale and first heat scare are **guaranteed survivals**; real bust risk only
  begins after competence is established. (prototype fidelity note)
- Exactly one crew member and one front are introduced during onboarding; other systems
  stay disclosed-later.
- The session ends **mid-motion** (income accruing + a buyer waiting). (GDD §11)
- No on-screen instruction exceeds ~8 words; nothing is labeled "Tutorial".

## Guardrails
- **Invisible tutorial, learn by doing, progressive disclosure, reveal the dream first.**
  (GDD §9 rules 1–7)
- **Wins before risk** — never sequence a loss before the player has banked wins.
  (design/04 §2, Sid Meier)
- Onboarding is *prior to* retention — if the first minutes don't land, nothing
  downstream runs. Treat this prompt as make-or-break. (GDD §9)
