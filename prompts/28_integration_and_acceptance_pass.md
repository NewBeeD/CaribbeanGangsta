# Prompt 28 — Integration & acceptance pass (the vertical slice)

**Phase:** 3 — Onboarding & integration
**Depends on:** 00–27 (everything)
**Design refs:** GDD §14 (MVP scope), §16 (design-implications checklist); `design/06`;
all per-system acceptance criteria

## Goal
Prove the **MVP vertical slice** holds together end to end: a full run from cold-open
onboarding through empire-building to a permadeath run-end and a new run — with every
ethical guarantee verified. This is the ship gate for the MVP defined in GDD §14.

## Build
- **End-to-end tests** (Playwright or the `webapp-testing` toolkit) covering the golden
  path: new run → guided first sale → free dealing → heat scare survived → hire runner →
  open front → close app → reopen (offline return summary, no loss) → borrow from Papa
  Cass → grow → a raid → a betrayal arc → a death spiral with a lifeline offer → a run
  end → score banked → start next run (new world).
- **A headless full-run simulation** (engine only, no UI) driving intents over a run to
  assert the sim reaches a natural end and banks a score — fast regression coverage.
- **Ethical-guarantee test suite** (the GDD §8 checklist as executable assertions):
  - offline never punishes (assets/debt/heat/spiral unchanged by absence);
  - no forbidden notification can be sent;
  - odds shown == odds rolled across all risk surfaces;
  - permadeath only via telegraphed rungs, never a hidden roll or absence;
  - no loot box / paid reroll / pay-to-win path exists.
- **MVP scope checklist** (GDD §14): core deal loop, randomized run setup, empire map,
  crew slice, idle engine, permadeath + high-score/leaderboard, loan-shark lifeline, the
  §9 onboarding, one rival arc — each mapped to a passing test.
- A `RELEASE_CHECKLIST.md` in `app/` mapping GDD §16 implications + §8 guardrails to the
  test(s) that verify each.

## Acceptance criteria
- The golden-path E2E test passes; the headless full-run sim reaches a scored end.
- Every item in the ethical-guarantee suite passes.
- Every MVP-scope item (GDD §14) maps to a passing test in `RELEASE_CHECKLIST.md`.
- `npm run typecheck`, `npm run lint`, `npm run test`, and the E2E suite all pass green.
- First-session telemetry (Prompt 25) shows time-to-first-sale ≤ 2 min and a 10–20 min
  first session on the golden path.

## Guardrails
- Ship a **small subset of high-impact features done well**, not everything thinly.
  (GDD §14, RimWorld) Defer expansion systems (arms breadth, offshore banking,
  international-route depth, large crew rosters) to post-MVP — they have seams already.
- The **ethical-guarantee suite is a release blocker**: a failure there blocks ship
  regardless of engagement metrics. (GDD §8)
