# Prompt 14 — App shell, store wiring & open-access navigation

> **REVISED (Ideas.md):** progressive disclosure is dropped. Like Drug Lord 2, the whole
> game is open from minute one — every screen, product, lender, and front is available;
> **money is the only limiter**. Screens never gate behind progression flags.

**Phase:** 2 — UI
**Depends on:** 01, 03 (and the engine through 13 for full wiring)
**Design refs:** `design/07` §2 (bottom nav); GDD §9 (onboarding), §5.2 (goal layering);
Ideas.md (open access — money limits options, not menus)

## Goal
Build the React shell that renders the current run and dispatches player intents to the
engine. Every screen is reachable from the start; what the player can afford to DO on a
screen is limited by money, never by hidden navigation.

## Build
- `src/store/gameStore.ts` (flesh out from Prompt 03): Zustand store exposing selectors
  the UI reads and a single `dispatch(intent)` + `tickBy(dtHours)`. On app open it calls
  `settleOffline(realHoursAway)` and surfaces the `OfflineReport`. The store owns the
  **only** `Date.now()` usage (to compute real elapsed time) — the engine stays pure.
- `src/ui/shell/AppShell.tsx` — layout with a **persistent bottom nav**
  (Deals · Crew · Money · Heat), Empire Map + High Score one level up (design/07 §2/§8).
  Portrait/mobile-first; one **primary action** per screen state.
- Routing (hash or a tiny router) between screens (Prompts 15–23).
- `src/ui/shell/nav.ts` — the screen registry & routing table. Pure routing (id ↔ hash ↔
  nav placement); it reads no game state and gates nothing.
- `src/ui/shell/ReturnHook.tsx` — on load, present the `OfflineReport` as **cash +
  decisions to allocate** (never a loss), then route into any queued `pendingChoices`.
- Global error boundary + a "no active run → new run / continue" entry gate.

## Acceptance criteria
- App boots into either a saved run (with an offline-return summary) or the new-run gate.
- **Every screen is navigable from minute one** — no locked or hidden tabs. (Ideas.md)
- Exactly one primary action is emphasized per screen state. (design/04 §3)
- The UI **only** reads state and dispatches intents — no game logic in components
  (lint/review check: no economic math in `ui/`).
- `settleOffline` runs once per app open and its result is shown as gains + choices.

## Guardrails
- **Money is the gate** — expensive products, fronts, and credit lines are always
  visible AND actionable; affordability (and rep-scaled caps) limits them, never a
  progression flag. (Ideas.md)
- The shell must make the return **rewarding, never punishing** — no "you lost X while
  away" surface anywhere. (GDD §6)
