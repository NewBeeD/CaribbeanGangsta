# Prompt 45 — Production v2: Pacing, Pause, Destination

**Depends on:** 43 (integer yields / `pendingYield`), 39 (production engine),
06 (storage), live-clock (30 real sec = 1 game hr).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **C**; Ideas2.md round-4 feedback ("production is too fast", "only
saves in the home stash… maxes out at 290", "I should be able to pause
production", "how does offline work for fronts and production").

## Objective

Make production livable under the live clock: slower config-tuned rates, a
pause toggle, a per-op destination stash, and the offline contract stated in
the UI instead of leaving players guessing.

## Deliverables

- **Pacing (config-only).** Retune `config/production.ts`
  `unitsPerHourPerLevel` for the live clock (~÷4–6 as the v1 hypothesis; a L5
  hydro-farm should feel like a supply line, not a faucet). Validate session
  yield against the Prompt 25 batch sim and a timed live-clock run. Numbers
  stay in the config group — no literals.
- **Destination.** `ProductionOp.stashId?` — `productionStep` deposits into
  the op's assigned stash (default: home, today's `stashes[0]` behavior). The
  Production screen gets a destination picker limited to stashes in the op's
  country (production is physical; no teleporting yield). A full destination
  idles the op exactly as today (overflow never produced, heat tracks actual
  output).
- **Pause.** `ProductionOp.paused` + `setProductionPaused(opId, paused)`
  store intent → pure engine op. A paused op yields nothing and emits **no
  heat** (cold lab). Rendered as a toggle on each op row; paused state shown
  plainly ("Paused — no yield, no heat").
- **Offline copy.** Production screen (and the Money screen's fronts card)
  carry the one-line contract: "Runs while you play. Frozen while you're
  away — nothing accrues, nothing is lost." This documents the already-tested
  ACTIVE-only behavior; no engine change.
- `state.ts`: schema bump shared with Prompt 43's `pendingYield` if landed
  together (`stashId`, `paused` on `ProductionOp`); migration defaults
  existing ops to home-stash, unpaused.

## Acceptance criteria

- [ ] Yield rates come from config; the retuned numbers produce sim-validated
      session yields (documented in the config docstring).
- [ ] An op assigned to a non-home stash deposits there and only there;
      unassigned ops behave exactly as before (home).
- [ ] The destination picker offers only same-country stashes.
- [ ] A paused op deposits nothing and adds no heat over any `dtHours`;
      unpausing resumes at the same accumulator (no lost remainder).
- [ ] Offline still deposits nothing (existing guarantee, re-asserted in
      tests alongside the new fields).
- [ ] Old saves migrate: ops default to home/unpaused; nothing seized.
- [ ] Full suite green, `tsc` clean.

## Ethical guardrails

- Absence forgoes yield, never seizes it — unchanged and restated in-UI.
- Pause is free and instant both ways: never a trap, never a fee.
- The units/hr shown remains exactly what the engine deposits (fairness law).
