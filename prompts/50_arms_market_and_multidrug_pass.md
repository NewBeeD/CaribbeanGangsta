# Prompt 50 — Markets & Arms Pass (price books, multi-drug play, mule boost)

**Depends on:** 35 (arms trade), 42 (country price sheets — the selector
template), 33 (market events & rumors), design-decision mule wash queue, 26
(config).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **H**; Ideas2.md round-4 feedback ("arms do not show well in
market… does not show the prices of the different types… probably a separate
arms market" · "I tend to solely trade cocaine… I want to trade all drugs
because of price hikes across countries" · "with every front unlocked and
upgraded, add a speed boost to the mules' conversion rate").

## Objective

Close the round's read-and-tune tail: give arms the price book they never got,
retune events/spreads so cocaine stops being strictly dominant, and couple the
mule wash rate to the front empire. Config + UI + one small engine multiplier —
no schema change expected.

## Deliverables

- **Arms price book.** Arms are correctly OFF the drug board
  (`worldMarket.model.ts` — "Arms trade through their own screen"); the gap is
  the Arms screen itself. Add per-tier × per-country price sheets in the
  Prompt 42 style: pure selectors over the existing `arms.ts` pricing (shown =
  executed, verbatim), every tier's price, demand note, and heat class,
  visible from minute one. By-tier and by-country views share the Prompt 42
  row pattern; no engine math in components.
- **Multi-drug incentives (config-only).** Retune `config` event
  magnitude/frequency and per-product regional elasticities so at any moment
  some non-cocaine product is the best $/unit-of-risk somewhere. The rumor
  channel (Prompt 33) already carries the information; the sim gains a
  per-product trade-mix report, and the acceptance bar is measured there —
  not vibes.
- **Fronts feed the mules.** `config/fronts.ts` `washRatePerHour` (currently
  flat: `WASH_MAX_DEPOSIT × WASH_DEPOSITS_PER_DAY / 24`) gains
  `× (1 + WASH_FRONT_BOOST × Σ owned front levels)` — placement
  infrastructure moves more paper. New knob in the fronts config group;
  `wash.ts` reads it through the existing `washRate(state)` path so the ETA
  shown stays the ETA drained. Wash card discloses the bonus ("Your 9 front
  levels: +45% throughput").

## Acceptance criteria

- [ ] The Arms screen shows every tier's price in every trading country; each
      number equals what a sale/purchase there executes at (fairness
      cross-check test, per the Prompt 42 pattern).
- [ ] Arms remain absent from the drug board and drug price book.
- [ ] Batch sim per-product trade mix: cocaine's share of optimal-policy
      volume drops below a documented threshold (config docstring records the
      target, e.g. <60%), with every seed still reaching the horizon.
- [ ] Wash throughput scales with total front levels exactly as the card
      discloses; a front-less run's rate is unchanged (backward-compatible
      default `WASH_FRONT_BOOST` applies from config, migration adds the
      knob).
- [ ] ETA shown on the wash card equals the drain time at the boosted rate.
- [ ] Full suite green, `tsc` clean.

## Ethical guardrails

- Pure reads and disclosed multipliers — no new gates anywhere; arms prices
  are visible from minute one like every other price.
- Events/rumors keep the Prompt 33 contract: rumor truthfulness rules
  unchanged; no event ever moves a price the player already locked in a
  quote for.
- The mule boost is shown before it's earned (the wash card lists the
  formula's terms) — never a hidden modifier.
