# Prompt 57 — Turf War Rewards (captured arms, topple spoils, win rep)

**Depends on:** turf wars (schema v22, `engine/turfWar.ts`), 35 (arms trade —
the armory the captures land in), 26 (config).
**Design authority:** `design/15_Turf_War_Stakes_and_Rewards.md` Workstream
**A**; user feedback (July 2026): "There should be some benefit towards turf
wars … add some extra benefits or losses to having turf wars."

## Objective

Turn the battle/topple loop from a pure sink into a rough cash break-even and
a clear strategic win (design/15 §0.1: winning today is threat removal, never
gain). Three rewards, almost no new state: won battles capture rival firepower
and pay street rep; a topple seizes a cut of the rival's operation as dirty
cash. Open decisions resolved per the doc's recommendations: A2 spoils sized
to roughly recoup `DECLARE_WAR_COST` (not deliberately profitable), and A
ships alone as 57.

## Deliverables

- **A1 — Captured arms on a won battle.** The `resolveBattle` win branch adds
  units to `state.armory`, tier flavored by the war kind (`hot` drops
  rifles/automatic, `raid` pistols, `cold`/`undercut` a thin mixed bag — their
  strength was never guns). Deterministic, no roll: a `CAPTURE_UNITS_BY_KIND`
  config table scaled by the rival's `aggression` via
  `CAPTURE_AGGRESSION_SCALE`, floored at 0. Applied before the telegraph; the
  `turf-war-battle` / `turf-war-won` summary names the haul. A pure
  `battleCapture` selector is the single source (shown = applied).
- **A2 — War spoils on a topple.** Breaking a rival seizes
  `TOPPLE_SPOILS_BASE × (1 + reach × TOPPLE_REACH_WEIGHT + aggression ×
  TOPPLE_AGGRESSION_WEIGHT)` as **dirty** cash (their money is never clean),
  deposited in the contested country's stash so it feeds the wash/laundering
  pipeline. Target band $150k–$500k (v1: BASE 150_000, weights 1.0 / 0.75) —
  a declared war roughly recoups its `DECLARE_WAR_COST`. The `turf-war-won`
  telegraph names the number. Not farmable: rivals are finite and topple is
  permanent (design/15 §0.5).
- **A3 — Street rep on won battles.** Mirror `BATTLE_LOSS_REP` with
  `BATTLE_WIN_REP` (v1: 3), clamped per war at `WIN_REP_CAP_PER_WAR` (v1: 9)
  via a new `repEarned` counter on `TurfWar` — schema bump to **v25** with a
  migration seeding `repEarned: 0` on any in-flight war (nothing seized). Rep
  already has teeth (borrow cap, lifeline floor, corruption discounts) — a
  real economic reward with zero new systems.
- **Surface the stakes.** The Turf War screen's war card shows what a win
  pays: the capture haul (exact, it's deterministic) and, on a
  player-declared war, the topple spoils figure — both read from the same
  engine selectors the resolve path applies (shown = applied).

## Acceptance criteria

- [ ] Win a battle → armory gains per the kind table × aggression scale, and
      the outcome summary names the haul.
- [ ] Topple → the spoils land as dirty cash in a stash in the contested
      country, and the telegraph names the exact number.
- [ ] Rep rises `BATTLE_WIN_REP` per won battle and clamps at
      `WIN_REP_CAP_PER_WAR` across a single war.
- [ ] No reward path is reachable from a loss or any `rejected` branch.
- [ ] Migrating a v24 save with an in-flight war yields `repEarned: 0`, the
      new config knobs from the default, and no change to cash/holdings/RNG.
- [ ] Full suite green, `tsc` clean, lint clean; re-run the Prompt 25 batch
      sim (rewards are additive — no death-spiral expected).

## Ethical guardrails

- Every number lives in `config/turfWar.ts` and reads live from
  `state.config.turfWar` — no literals in the engine.
- Rewards are deterministic and disclosed: the war card and the outcome
  telegraphs show exactly what the engine applied (design/01 §0.3 spirit).
- Offline stays frozen — all three rewards apply only inside `resolveBattle`,
  a player-initiated action; nothing drips.
- Open access holds: no new gates, no progression flags — rewards are earned
  in the fight, never unlocked.
