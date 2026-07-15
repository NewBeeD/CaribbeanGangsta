# Prompt 44 — Heat & Consequence Rework (caught, not transacting)

**Depends on:** 43 (correctness pass), 05 (heat), 04 (deal loop), 30 (travel),
10/21 (debt), 11 (endgame), 23 (run-end).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **B** (B1–B4); Ideas2.md round-4 feedback (heat on buy/sell, dirty
cash on busts, marked-but-nothing-happens, personal-delivery punishment).

## Objective

Redistribute risk so heat and losses come from **getting caught and getting
big**, not from trading: no transaction heat, the six-source heat model (B5)
in its place, bust seizures limited to what's on the table, stored dirty cash
lost only to raids, a real enforcement arc while debt-marked, and an arrest
consequence when a self-run shipment is interdicted.

## Deliverables

- **B1 · Transaction heat removed.** Delete the `addHeat` calls at
  `deals.ts` buy (`BUY_HEAT_FACTOR`, ~line 522), `deals.ts` sell (~595), and
  `arms.ts` sell (~492); drop `BUY_HEAT_FACTOR` (and the sell factor if
  config'd) from the config group with a migration. Heat now lands on:
  `deal.bust` (already `heatPerUnit × qty × bustHeatMultiplier` — amount- and
  type-scaled, keep), `shipment.seized`, `arms.bust`, and the passive sources
  (production, fronts, territory, plugs — unchanged). The lost transaction
  heat is replaced by the **B5 six-source model below** — a redistribution,
  not a nerf.
- **B5 · The six-source heat model** (user-specified; design/13 B5 is the
  authority). All weights in `config/heat.ts`; every source itemized on the
  Heat screen ("why is my heat rising") — shown = applied:
  1. *Shipment volume & route risk* — heat on launch/landing scaled by
     `cargo heat class × qty × corridor risk` (the interdiction quote's own
     inputs; big moves on hot corridors run hot even when they succeed).
  2. *Storage concentration* — ACTIVE-only passive term when one stash holds
     units above a config'd threshold curve (fat stashes hum before they're
     raided).
  3. *Repeated patterns* — per-stash/per-port `recentUse` counters decaying
     over active hours; reuse inside the window adds a disclosed heat and
     interdiction-odds surcharge (schema bump shared with B3's state).
  4. *Violence & flashy actions* — one-time config'd bumps on rival
     conflicts, survived raids, and conspicuous purchases (vessel/real-estate
     class).
  5. *Failed deals & busts* — existing spike kept, plus a temporary
     **investigation window** after a major bust: slower heat decay + a raid-
     chance multiplier for a disclosed number of active hours.
  6. *Empire size* — extend the `RAID_EMPIRE_FACTOR` idea into a mild passive
     heat term (bigger operations attract more attention).
- **B2 · Busts seize the table, raids seize the stash.** `resolveSell` /
  `resolveBuy` bust paths seize the product being moved plus the cash staked
  on *that transaction* — and stop zeroing the stash's stored `dirtyCash`
  (today's behavior at `deals.ts` ~560). The raid path (`heat.ts` `rollRaid` →
  `storage.ts` seizure) remains the only way stored dirty cash is lost.
- **B3 · Marked enforcement.** New ACTIVE-only tick step (after the debt
  ladder): while `DEBT_MARKED_FLAG` is set, telegraphed collector pressure
  escalates one rung at a time on a visible clock — warning card first, then:
  seize dirty cash from the fattest stash → jump an in-flight shipment → lean
  on a crew member. Each hit is preceded by its warning; repaying to zero
  clears the mark and the pressure instantly. All rates/sizes in
  `config/lenders.ts`. Offline frozen (no collector moves while away — the
  Prompt 21 tested guardrail holds verbatim).
- **B4 · Self-run arrest.** An interdicted shipment with **no courier
  consigned** (you helmed it) triggers an arrest interrupt in the
  death-spiral style: *post bond* (clean-cash hit scaled to net worth + heat
  spike) or *the run ends* (`arrested` run-end reason through `endCurrentRun`
  → Prompt 23 summary/leaderboard). The launch quote discloses it: "You're
  driving — if this is stopped, you're in the cuffs." Consigned interdictions
  keep today's `CONSIGNED_BUST_HEAT_FACTOR` behavior (courier takes the fall).
- Telemetry: sim policy updated (it may consign everything); re-run the batch
  sim — all seeds still reach the horizon.

## Acceptance criteria

- [ ] Buying or selling cleanly (no bust) adds **zero** heat, for drugs and
      arms; a bust adds heat scaled by qty × product heat class.
- [ ] Each B5 source is individually testable: a bigger/hotter shipment heats
      more than a small/cool one; a stash over the concentration threshold
      accrues while a spread empire doesn't; the third run from the same port
      inside the window costs more heat (and odds) than the first, and the
      surcharge decays; a survived raid / rival clash / vessel purchase each
      bump once; a major bust opens an investigation window with slower decay
      and raised raid chance that expires on schedule; empire growth raises
      the passive term.
- [ ] The Heat screen itemizes every active source with its contribution;
      the sum equals the applied heat (shown = applied).
- [ ] A busted street deal leaves the stash's stored `dirtyCash` untouched
      (only the transaction's goods/stake are lost); a raid still seizes.
- [ ] A solvent player hitting debt rung 5 sees the warning card, then
      escalating telegraphed collector hits on the config'd clock; repaying
      clears mark + pressure immediately; nothing moves offline.
- [ ] A self-run interdiction always presents bond-or-run-end; bond price is
      shown before choosing; "arrested" appears as the run-end reason.
- [ ] Batch sim: a mid-size operation's heat pressure lands in the pre-change
      band; a sprawling one runs measurably hotter (realistic escalation);
      every seed reaches the horizon.
- [ ] Config migration drops the transaction-heat knobs; full suite green.

## Ethical guardrails

- Every consequence is telegraphed before it lands (warning rungs, disclosed
  arrest risk, shown bond price) — no hidden punishment.
- Offline stays frozen: collectors, raids, and interdictions are ACTIVE-only.
- The arrest choice is consensual in presentation (the player chose to helm)
  and never fires from a consigned run.
- B2 only *narrows* seizures — no migration or model change takes anything a
  player currently holds.
