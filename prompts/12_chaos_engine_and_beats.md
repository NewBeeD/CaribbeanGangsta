# Prompt 12 — Chaos engine + narrative-beat trigger system

**Phase:** 1 — Simulation core
**Depends on:** 04–11
**Design refs:** `design/05_Narrative_Beats_and_Simulation_Triggers.md` (whole doc);
GDD §4.7 (Chaos Engine), §3 (rising action); `design/01` §4.7

## Goal
Two coupled systems: the **Chaos Engine** (procedural world events — hurricanes,
busts, market crashes/gluts, rival moves, windfalls, adaptive rerouting) and the
**beat engine** that fires narrative beats off **simulation state, not a script**, so
every player gets a personal, earned story.

## Build
- `src/engine/config/events.ts` — Chaos event table: hurricanes, big busts, task-force
  surges, supply gluts/crashes, rival moves, windfalls — each with trigger weight,
  effect on prices/heat/routes, and telegraph text. **Adaptive routes:** a major
  disruption opens an alternate corridor (e.g. Guyana/Suriname) rather than collapsing.
- `src/engine/chaos.ts`
  - `rollChaos(state, rng, dtHours): ChaosEvent[]` — seeded from `world.eventSeed`
    (reproducible per run), registered into `clock.tick`. Effects are **bounded and
    estimable** — the variable-reward core, but never a hidden progress gamble.
  - Apply-effect handlers that mutate prices/heat/routes and enqueue telegraphs.
- `src/engine/beats.ts`
  - `BeatTrigger` = a predicate over `GameState` + a `beatId` + `once?:boolean` +
    `triggerType: 'deterministic' | 'variable'`.
  - The trigger table from design/05 §2 (+ the new rows in design/09 & design/10):
    first sale, first district, first front, clean cash > 1M, arms unlock, crew
    betrayal alignment, heat crosses CIA, first international route, major disruption,
    supply glut/crash, peak-net-worth milestone, wipe-with/without-lifeline, run ends,
    Papa Cass first offer, port official first offer, official flip, judge saves a run.
  - `checkBeats(state): FiredBeat[]` — evaluates triggers each tick; respects `once`
    (via `state.beatsFired`); **act-defining beats use deterministic triggers**
    (GDD §5.4). Returns beat ids for the story-card layer (Prompt 13) to render.
  - **Plateaus** (design/05 §3): a mechanism to deliberately space major beats and mark
    rest stretches (surface quiet character beats there, not escalation).
- Register both into `clock.tick` in the documented order (after economic systems, so
  beats see post-tick state).

## Acceptance criteria (vitest)
- Chaos events are reproducible per run seed; effects stay within estimable bounds;
  a major disruption **opens an alternate route** rather than dead-ending. (design/05 §2)
- `checkBeats` fires each beat when its state threshold is crossed, **once** if flagged;
  act-defining beats are deterministic (fire whenever *that player* reaches the state).
- Beats never fire from offline settlement in a way that punishes (they may *queue* a
  return-hook choice — that's allowed and desired). (GDD §6/§11)
- Loss/negative beats are sequenced **after** the player has banked wins in the arc
  (expose the "wins banked" signal to the trigger predicates). (design/05 §4, Sid Meier)

## Guardrails
- The Chaos Engine is the **variable-reward core** — powerful and bounded: odds/effects
  are estimable, never a hidden roll or a real-money gamble. (GDD §5.4, §8)
- **Beats key off state, not a fixed timeline** — same milestone fires the same beat
  whenever the player reaches it. (design/05 §0)
- **Apophenia budget:** don't over-author; leave implied gaps. (design/05 §5)
