# Prompt 46 — Crew Expansion (a bigger cast, a readable payroll)

**Depends on:** 08 (crew relatedness engine), 17 (Crew screen), 39
(production delegation), 26 (config).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **D**; Ideas2.md round-4 feedback ("only 3 crew members are
available to run drug production… not able to put a lieutenant on it");
**user addition 2: "I want you to add more crew members."**

> **Design-stance note:** design/02 §7 deliberately kept the roster small
> ("large rosters / deep skill trees" rejected). The user's addition is the
> sign-off to relax that — record the relaxation in design/02 rather than
> silently contradicting it. The relatedness pillar itself is NOT relaxed:
> every new member is a written character, not a faceless merc.

## Objective

Roughly double the crew roster (7 → ~14 archetypes) so fronts, production
ops, couriers, escorts, and street teams stop starving each other for the
same three lieutenants — and make "who is free" readable at a glance.

## Deliverables

- **Roster.** `config/crew.ts`: ~7 new archetypes in the design/02 voice —
  each with the full template (relationship seed, loyalty curve, betrayal
  arc, story hooks, wage). Skew the additions toward the duties the empire
  now runs: growers/cooks (production lieutenants), boat people (couriers /
  escorts), corner captains (street teams). Wages scale so a 14-body payroll
  is a real weekly obligation (`config` numbers, sim-validated).
- **Hiring.** Unchanged mechanics — money-gated, open from minute one. Verify
  nothing in the hire/offer path assumes the 7-name roster (closed-union
  guards, tests, story cards referencing names).
- **Lieutenant span of control** *(user addition)*: a promoted lieutenant can
  run **up to 2 production sites** at once —
  `LIEUTENANT_MAX_PRODUCTION_OPS = 2` in `config/crew.ts`. Assigning a third
  op rejects (`lieutenant-at-capacity`) without mutation, with readable copy;
  unassigning frees the slot. Fronts keep today's one-front-per-lieutenant
  rule. `productionLieutenantBonus` resolves per-op when its lieutenant holds
  two assignments — the full disclosed bonus on each, no hidden dilution.
  (Crew state moves from a single `assignment` to supporting two production
  assignments; promotion rules in `crew.ts` otherwise untouched; schema
  bump + migration mapping the old single assignment.)
- **Crew screen legibility.** `crew.model.ts` / Crew screen: group members by
  current duty — Front / Production / Courier (in flight vs idle) / Street /
  Unassigned — with an "available now" count in the header. Half the original
  complaint was not being able to SEE who was free.
- **Migration.** New archetypes appear as hireable candidates on existing
  saves; no schema change expected (roster is config) — confirm hydrate
  tolerates unknown-to-save archetypes cleanly.
- Story/beats: at least a light hook per new archetype so none is a blank
  face (design/02 §4 telegraphed-arc rule applies to all of them).

## Acceptance criteria

- [ ] ~14 archetypes exist; every one carries the full relatedness template
      (no stat-block-only members).
- [ ] With six production ops, six fronts, and two shipments crewed
      simultaneously, at least one lieutenant-capable member remains hireable
      or assignable (the original starvation case).
- [ ] A lieutenant runs two production ops with the full disclosed bonus on
      each; assigning a third rejects without mutation; a fully-delegated
      six-op layer needs exactly three lieutenants.
- [ ] Old saves migrate the single `assignment` cleanly; a legacy lieutenant
      keeps their one op and gains a free second slot.
- [ ] Crew screen groups by duty and shows the available count; an in-flight
      courier reads as busy.
- [ ] Payroll for a full roster is a material weekly obligation in the sim
      without bankrupting the mid-game policy (all seeds reach horizon).
- [ ] Old saves load; new candidates appear; nothing owned changes.
- [ ] Full suite green, `tsc` clean.

## Ethical guardrails

- Hiring stays money-gated only — the bigger cast is offered from minute one.
- Betrayal arcs on new members follow the tested telegraphed-signs contract
  (design/02 §4): never a hidden roll.
- Wages are shown before hiring; the payroll line always reflects the real
  weekly draw.
