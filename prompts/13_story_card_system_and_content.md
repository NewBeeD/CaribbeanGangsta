# Prompt 13 — Story-card system + MVP content

**Phase:** 1 — Simulation core (data + logic; presenter UI is Prompt 22)
**Depends on:** 12
**Design refs:** `design/08_Story_Cards_Template_and_Examples.md` (schema + 19 worked
cards); `design/05` (triggers); GDD §2 (narrative style), §9 (invisible tutorial)

## Goal
Turn beats into playable scenes. Define the **story-card schema** (matching the doc-08
template), a loader/registry that binds cards to beat ids, and author the **MVP card
set** — the scenes that carry onboarding, the first rival arc, the loan-shark hook, the
corruption unlocks, and the run-end fall.

## Build
- `src/engine/cards/schema.ts` — `StoryCard` type mirroring the design/08 template:
  `id`, `trigger` (beat id from Prompt 12), `triggerType`, `act`, `arc`, `characters`,
  `hookRole` (onboarding/session-end/return/plateau), `oneShot`, `prerequisites`,
  `sceneText`, `choices: Choice[]`, `reputationVariants: { street; business; political }`,
  `writerNotes`, `telemetryFlag`.
  - `Choice` = `{ label; effects: CardEffect[]; setsFlags?; firesCard?; sceneResult? }`.
  - `CardEffect` = a **declarative** engine mutation (cash/heat/rep/inventory/loyalty/
    unlock/queue-choice), applied through the engine reducers — cards never mutate state
    directly. Keep effects auditable and testable.
- `src/engine/cards/registry.ts` — `cardForBeat(beatId, state): StoryCard | null`
  (picks the reputation variant from the player's dominant rep track), and
  `applyChoice(state, cardId, choiceIndex): GameState`.
- `src/engine/cards/content/` — author the **MVP cards** (port the 19 worked examples in
  design/08 and the beats named in design/05/09/10). At minimum:
  - Onboarding: `ONB-01` First Sale (Auntie Pearl), `ONB-02..` guided flow, first heat
    scare (survivable), hire first runner, open first front, **session-end hook** card.
  - Rival: `RIV-01` The First Message + one full grudge arc.
  - Debt: `DEBT-01` Papa Cass's first offer (teach terms + the freeze-offline rule *in
    fiction*), `DEBT-CLEAR-01`, `DEBT-DEFAULT-01`.
  - Corruption/storage: `CORR-01`, `CORR-FLIP-01`, `STASH-01`, `RAID-01`.
  - Endgame: the death-spiral fall + the run-end tally scene.
  - Each with the 3 reputation variants and telemetry flags.
- Failure/negative scenes must read as **scenes**, never error toasts, and be sequenced
  after wins (design/05 §4).

## Acceptance criteria (vitest)
- Every authored card validates against the schema; every `trigger` maps to a real beat
  id from Prompt 12 (no orphan cards, no beat without a card for MVP-critical beats).
- `applyChoice` produces the declared effects **through engine reducers** (a choice that
  says "-$5,000, +heat, unlock front" does exactly that) — deterministic, testable.
- Reputation-variant selection picks the correct branch for the dominant rep track.
- One-shot cards fire once; prerequisite chains resolve.
- Onboarding cards keep on-screen instruction **≤ ~8 words** and teach through fiction
  (no card literally labeled "tutorial"). (GDD §9, design/08)

## Guardrails
- **The scene carries the teaching**, not UI text (invisible tutorial — GDD §9).
- Best beats/rewards withheld for the biggest thresholds. (design/08, design/05 §2)
- Leave **apophenia gaps** — imply backstory, don't fully author it. (design/05 §5)
- Every card is **testable**: declarative effects, explicit flags. (design/08 intro)
