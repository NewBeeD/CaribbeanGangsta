# Prompt 07 — Laundering / idle-offline engine

**Phase:** 1 — Simulation core
**Depends on:** 03
**Design refs:** `design/01` §3 & §3a (front rates, offline cap, golden hours); GDD §6
(ethical appointment design), §4.2 (laundering); `design/07` §4 (Money wireframe)

## Goal
Build the empire's idle engine: laundering fronts generate **clean cash** while the
player is away, and **return is rewarded with decisions to allocate, never with loss**.
This is the ethical core — absence forgoes gains but never risks progress.

## Build
- `src/engine/config/fronts.ts` — front-type table (design/01 §3a): bar/food-cart,
  nightclub/restaurant, resort/casino, crypto (rate swings ±40%) — each with
  `ratePerLevel`, levels 1–5, buy-in, heat/hr, unlock gate. Upgrade cost
  `buy_in × 1.15^level`. Plus special channels: trade-based laundering (capacity scales
  with shipment volume, ~15–20% of moved value), Black Market Peso Exchange (a **sink**
  converting dirty→clean at a shown ~10–20% haircut).
- `src/engine/laundering.ts`
  - `cleanCashRate(state): number` = `Σ(ratePerLevel_i × level_i)` (crypto rate applies
    its live swing).
  - `accrue(state, dtHours): GameState` — active accrual, registered into `clock.tick`.
  - `settleOffline(state, realHoursAway): { state; report: OfflineReport }` — the
    offline payoff. Accrues at full rate up to a soft cap (**12h**), then **25% rate**
    (never zero). Produces an `OfflineReport` with `cleanEarned` **and** a queue of 1–3
    `pendingChoices` (a buyer waiting, a crew dilemma, a rival move) — the return is
    *interesting choices*, not just a number. **Adds only; never seizes/kills/advances
    debt.** (this is the concrete implementation of Prompt 03's `settleOffline` hook)
  - `buyFront`, `upgradeFront`, `pesoExchange(amount)` (applies shown haircut).
  - `rollGoldenHour(state, rng)` — Poisson (~1 / 3–5h online-equiv), 5–15 min lifetime,
    **bonus-only** (a golden-hour buyer / one-time bent-cop deal). Missing it costs a
    bonus never had. (design/01 §3a)

## Interfaces
```ts
export interface OfflineReport { hoursAway:number; cappedAt:number; cleanEarned:number;
  pendingChoices:PendingChoice[]; goldenHour?:GoldenHourEvent; }
export function settleOffline(state:GameState, realHoursAway:number):
  { state:GameState; report:OfflineReport };
```

## Acceptance criteria (vitest)
- Offline accrual matches the piecewise curve exactly: full rate ≤12h, 25% beyond;
  a 12h absence at one Bar Lvl 1 ($120/hr) returns ~$1,440. (design/01 §3a pacing check)
- `settleOffline` **only increases** clean cash and **only queues** choices — it never
  reduces any asset, changes `runStatus`, or advances `debt`. (GDD §6; property test)
- Upgrade cost follows `buy_in × 1.15^level`; there's always a next affordable step on
  the intended curve.
- Golden-hour events are bonus-only; absence never triggers a penalty branch.
- Peso exchange applies exactly the disclosed haircut.

## Guardrails
- **No punishment for absence, ever** — this is the single hardest line in the game
  (GDD §6, §8). Any code path that could reduce assets during `settleOffline` is a bug.
- On return, surface **choices to allocate**, honoring "the longer you're away, the more
  options await." (design/07 §4)
