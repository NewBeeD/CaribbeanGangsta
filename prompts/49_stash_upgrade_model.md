# Prompt 49 — Stash Upgrade Model (one stash per spot, levels for space)

**Depends on:** 43 (integer inventory), 45 (production destinations), 16
(Empire Map), 06 (storage), 41 (territory consolidation), 26 (config).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **G**; Ideas2.md round-4 feedback ("I don't like the idea of
infinite stashes. A stash should be upgraded for more space, not an
additional stash." · "The drug production only saves in the home stash,
which maxes out at 290 units.").

> **Model change notice:** this reverses part of the Prompt 16 expansion
> model (memory `empire-map-territory-model`): stacking `addStash` per
> district is replaced by `upgradeStash` levels. Territory footholds — new
> districts, new countries, port containers — are untouched. Update the
> memory/design references when this lands.

## Objective

Within a district/country the player owns **one stash** whose capacity grows
by **upgrade levels**, replacing the stack-another-stash loop. Expansion still
means new ground (money-gated as ever); depth now means investment in the
ground you hold. Carries the round's most delicate migration — a fold that
must never lose a unit or a dollar.

## Deliverables

- **Engine.** `storage.ts`: `Stash.level`; `upgradeStash(state, stashId)` on
  the `cost × 1.15^level` family curve (base cost per stash kind — floor /
  safehouse / port container — in `config/stashes.ts`); `effectiveCapacity`
  scales steeply with level (config curve), crew-carry bonus still applies on
  top. `addStash`/`buildStash` reject `already-present` for a spot that has
  one (opening a NEW district/country/port is unchanged).
- **Empire read-model.** District "fill"/control derives from stash levels
  instead of stash count; the `nextAffordableStep` selector offers the next
  upgrade (or the next new foothold) with its live price. Consolidation /
  vulnerability mechanics (Prompt 41) read the same signals as before.
- **Migration (write this first).** Fold each spot's existing stashes into
  one: capacity level = the smallest level whose capacity ≥ the folded
  stashes' combined `effectiveCapacity` (round UP); inventories and dirty
  cash merged unit-for-unit and dollar-for-dollar; production destinations
  and any references re-pointed to the survivor id. Property test on
  generated saves: total units, total dirty cash, and total capacity never
  decrease across migration. Schema bump.
- **UI.** Storage/Empire screens: an upgrade row per stash (cost, current →
  next capacity), the "add another stash here" affordance removed; move
  sheets and Prompt 43's capacity copy read the new numbers.
- **Config.** `config/stashes.ts` gains the level-capacity curve + per-kind
  base costs; retune so a maxed home stash comfortably holds a production
  campaign (the "290 units" complaint dies here) and a maxed port container
  swallows a container-ship load (Prompt 47 synergy).

## Acceptance criteria

- [ ] A spot holds exactly one stash; upgrading it raises
      `effectiveCapacity` on the shown curve; a second build on the same spot
      rejects without mutation.
- [ ] New districts/countries/ports open exactly as before (money only).
- [ ] Migration folds every legacy save with zero loss: units, dirty cash,
      and capacity all ≥ pre-migration totals (property-tested).
- [ ] Production destinations survive the fold and keep depositing.
- [ ] A maxed home stash holds a config-documented multiple of today's 290;
      a maxed port container fits a container-ship manifest.
- [ ] Empire fill/consolidation read correctly from levels; full suite
      green, `tsc` clean.

## Ethical guardrails

- The fold rounds every quantity in the player's favor — a migration must
  never seize or shrink anything earned.
- Upgrade prices are always shown and always actionable the moment they're
  affordable (money the only gate; no level locks on ground you hold).
