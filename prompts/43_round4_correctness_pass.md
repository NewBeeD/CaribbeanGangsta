# Prompt 43 — Round 4 Correctness Pass (bugs before tuning)

**Depends on:** 39 (production), 30 (travel/shipment desk), 09/20 (corruption &
port bribes), 06 (storage), 22 (pending-choice presenter).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **A** (A1–A6); Ideas2.md round-4 feedback; user addition 3
(notification cap + Clear all).

## Objective

Fix the six defects the round-4 playtest surfaced, so every later retune
(prompts 44–50) reads clean signals. No balance changes here; one small schema
bump (A1's `pendingYield`) shared with Prompt 45.

## Deliverables

- **A1 · Integer inventory.** `engine/production.ts` `productionStep` gains a
  per-op fractional accumulator (`ProductionOp.pendingYield`): deposit only
  `Math.floor` whole units, carry the remainder — nothing fractional ever
  lands in `stash.inventory`, nothing is lost. Migration rounds existing
  fractional holdings UP to whole units (never seize). "Max" selectors in
  `dealScreen.model.ts` / move / convert paths floor to whole units. Audit the
  deal scene-key map: a rejected deal must never render success copy ("The
  deal is done"), every `DealRejectReason` maps to its own line.
- **A2 · Launch button markup.** `ShipmentDesk.tsx` (~line 272): the disabled
  hint ("Fix the manifest first") renders as a helper line under the button,
  never concatenated into the label.
- **A3 · Phantom bribe card.** While a port is on `corruption.paidPorts`, the
  bribe offer row is replaced by a status line ("Protected · shipments here run
  at 3% until <time>") — no quote, no "3% → 3%". A quote renders only against a
  real staged manifest value, never a hypothetical shipment. (`quoteBribe`
  itself unchanged — surfacing eligibility + copy only.)
- **A4 · Legible move rejections.** Map each `storage.moveProduct` reject
  reason to specific scene copy with numbers ("Container is full — 12 of 40
  fit", "That stash doesn't hold 30 weed"). Move sheet shows the destination's
  remaining `effectiveCapacity` before committing.
- **A5 · Notification feed: latest 5 + Clear all.** The Money screen's
  "Waiting on you" card renders only the **5 newest** `pendingChoices` with a
  "+N older" count. New pure engine op `dismissAllPendingChoices` (mirrors the
  single-dismiss default path) behind a **Clear all** button. Any pending
  choice whose dismissal is consequential (not a safe no-action default) is
  excluded from Clear all and labeled as such.
- **A6 · No silent cash movement.** Every dirty-cash sink emits a feed line:
  deal-bust seizure ("Bust at Home stash — $12,400 dirty seized"), wash-queue
  pickup ("Mules picked up $9,000"), collector/raid seizures. Presentation
  only — the bust-seizure *model* change is Prompt 44.

## Acceptance criteria

- [ ] After hours of simulated production, every inventory quantity is an
      integer; total yield over time equals the shown rate (remainder carried,
      not dropped).
- [ ] Selling "max" of a previously-fractional holding executes; a rejected
      deal renders reject copy, never "The deal is done".
- [ ] A save with `216.578…` weed migrates to `217` (round up, never seize).
- [ ] The launch button never renders hint text inside its label.
- [ ] A paid port shows a protection status line; no bribe quote appears
      without a staged manifest; "X% → X%" can never render.
- [ ] Each move-reject reason shows its own copy with numbers.
- [ ] With 12 pending choices, the Money screen shows 5 + "+7 older"; Clear
      all resolves the dismissible ones via the same default path as a single
      dismiss; consequential choices survive and are labeled.
- [ ] Every dirty-cash decrease in a play session has a visible feed line.
- [ ] Full suite green, `tsc` clean; schema bump + migration covered by
      persistence tests.

## Ethical guardrails

- Migrations round in the player's favor; nothing earned is seized.
- Clear all never silently picks a consequential branch — dismissal is only
  ever the safe default the single-dismiss already implements.
- Rejections keep never mutating state; outcomes carry scene keys.
