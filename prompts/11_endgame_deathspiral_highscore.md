# Prompt 11 — Death spiral, permadeath, high score & prestige

**Phase:** 1 — Simulation core
**Depends on:** 06, 09, 10
**Design refs:** `design/01` §4a (death spiral) & §7 (high-score/prestige math); GDD §7,
§8 (permadeath is consensual/telegraphed); `design/07` §6 (run-end wireframe)

## Goal
Own the run's terminal logic: the **readable death-spiral chain**, permadeath, and the
**high-score chase** that persists past death and pulls the next run. Death must always
feel *earned and readable* — the top churn risk of the roguelike pivot is a cheap dice
death.

## Build
- `src/engine/endgame.ts`
  - **Peak trackers** updated every tick: `peakNetWorth`, and an empire-size composite
    `w1·districts + w2·routes + w3·fronts + w4·crew + w5·actReached` (design/01 §7). Score
    banks from **peak** values, so a late wipe still records the height climbed.
  - `evaluateSpiral(state): SpiralStatus` — the readable chain (design/01 §4a): (1) wipe
    (operating capital ~0 — flagged by Prompt 06/09) → (2) can't pay crew/payroll/loan
    installments → (3) protection collapses (unpaid crew/officials walk/flip; heat
    unmanaged) → (4) hunted. Each step is inspectable so the UI can telegraph it.
  - **Exits before terminal** (all in-fiction, all checked): a **lifeline** offer
    (Prompt 10 `lifelineOffer`), **liquidate** fast (dump fronts/assets at a haircut), or
    **go to ground** (shed crew/heat, rebuild small). Only if none is available/taken does
    the spiral reach terminal.
  - `endRun(state, cause: 'killed'|'prison'|'retired'): RunEndResult` — sets `runStatus`,
    **banks the score** to persistent high-score storage, produces the run-recap +
    prestige unlocks, and the run-end `sceneKey`. A **judge on payroll** (Prompt 09) can
    convert `prison` into a survivable comeback instead of ending the run.
  - `retire(state)` — voluntary bank-and-reset, **no penalty**.
- `src/engine/config/prestige.ts` + persistence:
  - Prestige = deterministic cross-run **mastery unlocks** (routes mastered, rivals
    toppled, farthest act) → **cosmetic/roster/starting-scenario variety, NOT power
    multipliers** (compounding power would dilute the stakes — GDD §7). Store separately
    from run state (survives permadeath) via a `MetaProgressStore` (local; cloud-stub).
  - `bankScore(meta, runEndResult)` → updates personal best + prestige unlocks.
- **Legacy/heir is PARKED** — leave a clearly-marked seam (an interface/flag) but do
  **not** build inheritance/compounding bonuses. (GDD §7, design/01 §7)

## Acceptance criteria (vitest)
- Score banks from **peak** values the instant the run ends — a late-game wipe still
  records the max reached (not zero). (design/01 §7)
- `evaluateSpiral` returns each step as inspectable/telegraphable; the run only reaches
  terminal when **no exit** (lifeline/liquidate/go-to-ground) is available or taken.
- The spiral **never advances offline** (re-assert via a test through `settleOffline`).
- A judge on payroll converts a `prison` end into a survivable comeback.
- Prestige unlocks are **non-power** (roster/scenario/cosmetic only); personal best and
  leaderboard entry persist across runs and permadeath.
- `retire` banks and resets with no penalty.

## Guardrails
- **Permadeath is consensual, in-game, telegraphed** — every spiral rung readable before
  entry; the fatal step is always the visible last rung after warnings, never a hidden
  roll, never from absence. (GDD §8, design/01 §4a)
- Death **banks** the score (rewarding how big you got) — it is *thrilling, not
  demoralizing*. Frame the end as a *fall* (a scene), then the tally that dares the next
  run. (design/01 §7, design/05 §4)
