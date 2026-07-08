# Prompt 26 — Balancing config & tuning knobs

**Phase:** 3 — Onboarding & integration
**Depends on:** 04–12 (consolidation pass over the config already introduced)
**Design refs:** `design/01` (all numbers are v1 hypotheses); §8 (tune-first priorities);
GDD §14/§15

## Goal
Consolidate **every balance number** into one typed, documented config surface so the
game is tunable from telemetry (Prompt 25) without hunting literals through the sim. The
economy doc is explicit: these numbers are hypotheses to be replaced by playtest data.

## Build
- `src/engine/config/index.ts` — a single `GameConfig` object composing the per-system
  config modules (products, fronts, stashes, heat, lenders, corruption, events, prestige,
  onboarding budget). Each value annotated with a comment citing its design/01 source and
  marked as a tunable hypothesis.
- Make the engine take `GameConfig` by injection (default = the v1 config) so tests and
  playtests can run **alternate tunings** without code changes. Thread it through
  `createInitialState` / the reducers.
- Expose the **tune-first knobs** from design/01 §8 prominently: offline cap × front
  rate, bust-probability clamp, upgrade multiplier (1.15), death-spiral rate/fairness,
  run-length, randomization variety bounds, lifeline reach.
- Add a `config/scenarios.ts` for prestige-unlocked starting scenarios (Guyana corridor,
  etc.) — data only, **no power multipliers**. (GDD §7)
- A `tuning.md` note in `app/` documenting each knob, its current value, its design
  source, and the telemetry signal that should drive it.

## Acceptance criteria
- No balance literal remains hard-coded in system logic — grep for magic numbers in
  `engine/*.ts` returns only references into `config/`.
- The engine accepts an injected `GameConfig`; a test runs the sim under two different
  tunings and observes different outcomes with identical seeds.
- The tune-first knobs (design/01 §8) are all present and documented.
- Prestige scenarios are data-only and non-power.

## Guardrails
- **Config, not literals** — one place to balance. (README engineering rules)
- Tuning is driven by the **falsifiable metrics** (Prompt 25), not by engagement
  maximization. Ethical guardrails are not tunable away. (GDD §8/§15)
