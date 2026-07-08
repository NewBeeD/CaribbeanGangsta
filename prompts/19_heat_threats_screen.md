# Prompt 19 — Heat / Threats screen (tension system UI)

**Phase:** 2 — UI
**Depends on:** 05, 09, 14
**Design refs:** `design/07` §5 (Heat wireframe); `design/04` §1; GDD §4.5

## Goal
Make tension **legible and estimable**: current LE tier, a decaying heat gauge, and
**telegraphed** threshold-crossing warnings — plus the levers to reduce heat.

## Build
- `src/ui/screens/HeatScreen.tsx` (design/07 §5):
  - "Current attention: DEA" + a `HeatDots` gauge ("decays as you lie low").
  - **Telegraphed warning** panel when a task force opens a file / a tier crossing looms
    ("⚠ A task force just opened a file. Cross into CIA range and it gets personal.") —
    surfaced from `checkTierEscalation`.
  - Reduce-heat actions: `[ Bribe a cop -$X ]` (into the corruption layer, Prompt 20),
    `[ Lie low (slower income) ]`.
  - Show any active **payroll tip-offs** ("A bought cop tipped a raid — move product").
- Dispatch `LieLowIntent` / bribe intents; read tier/dots from selectors.

## Acceptance criteria
- Tier and heat dots match engine state; lying low visibly slows income (reflected on
  the Money screen rate).
- Threshold-crossing warnings appear **before** the tier actually escalates
  (telegraphed, not after the fact). (design/07 §5)
- Raid tip-offs from bought officials appear with enough lead to act.

## Guardrails
- Tension must be **estimable** and every escalation **telegraphed** — no surprise LE.
  (design/07 §5, GDD §5.4)
- Heat is a meter, not a spendable currency — the UI reduces it via in-fiction levers,
  never a "buy heat" store. (design/01 §1)
