# Prompt 08 — Crew & NPC relatedness engine

**Phase:** 1 — Simulation core
**Depends on:** 03
**Design refs:** `design/02_Crew_and_NPC_Systems.md` (whole doc); GDD §4.3, §5.1
(relatedness); `design/07` §3 (Crew wireframe)

## Goal
Model crew as *people you care about or hate*, not stat lines. Loyalty is **hidden and
surfaced through prose/behavior**, memory ripples earlier choices forward, and betrayal
is a **telegraphed story arc**, not a dice roll.

## Build
- `src/engine/config/crew.ts` — 5–8 fully-realized crew archetypes (design/02 §7 MVP):
  each with `traits` (2–4), `skills` (deal/muscle/tech/laundering/driving), a hidden
  `agenda`, and seed dialogue lines. Plus one family/personal high-stakes relationship.
- `src/engine/crew.ts`
  - NPC data model (design/02 §1): `traits`, `skills`, `loyalty` (0–100, **hidden**),
    `bond`, `agenda`, `memoryLog: MemoryEntry[]`, `role`, `assignment`, `activeArc?`.
  - `loyaltyDelta(state, npcId, event)` — loyalty shifts from **pay, treatment, shared
    success, trait fit** (not one lever). Underpaying an ambitious lieutenant with a
    rival ally is the danger combo. Writes a `MemoryEntry`.
  - `describeLoyalty(npc): string` — returns **prose**, not a number ("Marco's been
    quiet since you passed him over"). The UI shows this, never `73/100`.
  - `recordMemory(npc, entry)` and `readsMemory(...)` — later dialogue/loyalty checks
    read the log ("You left Deon to take the fall in Kingston.").
  - **Betrayal arc** state machine: when `loyalty + agenda + opportunity` align, start a
    `BetrayalArc` (warning signs → point of no return → the flip). Readable signs at each
    stage; player agency to intervene (raise pay, promote, confront, remove). A flip
    turns the crew member into a **wire** feeding the heat/LE system (Prompt 05/09).
  - `recruit`, `train` (deterministic competence track), `promote` (a lieutenant runs a
    territory/front autonomously = idle delegation), `assign`.
  - Guard-loyalty hook consumed by `storage.ts` (low-loyalty guard → higher seizure %).

## Acceptance criteria (vitest)
- Loyalty responds to the multi-factor model (pay + treatment + success + trait fit),
  not a single input; every shift writes a memory entry.
- `describeLoyalty` returns prose and **never exposes the raw number**.
- Betrayal arcs are **deterministic given state** — the "flip" only fires after the
  telegraphed stages, with an intervention window at each. No pure-random betrayals.
- Promotion delegates a front/territory (interacts with laundering/storage).
- Memory persists across save/load and is read by later checks (an NPC never acts as if
  a remembered wrong didn't happen). (design/02 §3 consistency law)

## Guardrails
- **Hide the numbers; surface behavior/dialogue.** (design/02 §1)
- Betrayal is a **story beat, not a dice roll** — signs are readable, intervention is
  possible. This is estimable-but-fair tension. (design/02 §4, Sid Meier)
- Leave **apophenia gaps** — imply agendas/backstory rather than fully spelling them
  out. (design/02 §6, design/05 §5)
- Ship a **small subset done well** (MVP roster), defer large rosters/deep skill trees.
