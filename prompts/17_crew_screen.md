# Prompt 17 — Crew screen (the relatedness engine UI)

**Phase:** 2 — UI
**Depends on:** 08, 14
**Design refs:** `design/07` §3 (Crew wireframe); `design/02` (whole doc); GDD §4.3

## Goal
Present crew as **people**, surfacing loyalty as **behavior/prose, never a bar**, with a
tap-through to each character's story, memory log, and any active arc. The success test:
players end up naming their crew.

## Build
- `src/ui/screens/CrewScreen.tsx` (design/07 §3):
  - Roster rows: name + nickname, role, current assignment, and a **prose loyalty line**
    from `describeLoyalty` ("Been quiet since you passed him over.") — **no number**.
    Light skill dots only (`Deals ●●●○ Muscle ●○○○`).
  - `[ + Recruit ]` action (gated by disclosure — one crew member first, roster later).
- `src/ui/screens/CrewDetail.tsx` (tap-through): the character's story, the **memory
  log** ("You left him to take the fall in Kingston."), assignment controls (assign /
  train / promote), and any **active arc** (e.g. a betrayal warning surfaced as prose,
  with the intervention actions: raise pay / confront / promote / remove).
- Dispatch crew intents; read prose from engine selectors — the UI must **not** compute
  or display raw loyalty.

## Acceptance criteria
- Loyalty is shown only as prose/behavior; the raw 0–100 value never reaches the DOM
  (assert in a component test). (design/02 §1)
- Memory log renders past events and persists across reload.
- A betrayal arc surfaces its warning + intervention actions as readable prose.
- Recruit is gated to one crew member during onboarding, full roster later. (design/02 §5)

## Guardrails
- **Hide the numbers, surface behavior.** Loyalty as a line, not a bar. (design/02 §1,
  design/07 §3)
- Perspective-taking is the relatedness lever — detail views should let the player see
  the character's side. (design/02 §2)
- Consistency: a betrayed/remembered character never acts as if nothing happened.
  (design/02 §3)
