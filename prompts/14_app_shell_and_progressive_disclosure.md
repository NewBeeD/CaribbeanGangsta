# Prompt 14 — App shell, store wiring & progressive disclosure

**Phase:** 2 — UI
**Depends on:** 01, 03 (and the engine through 13 for full wiring)
**Design refs:** `design/04` §0 (progressive disclosure, decision-fatigue gating);
`design/07` §2 (bottom nav); GDD §9 (onboarding), §5.2 (goal layering)

## Goal
Build the React shell that renders the current run and dispatches player intents to the
engine — and the **progressive-disclosure system** that unlocks screens/features step by
step, so minute one isn't the whole dashboard.

## Build
- `src/store/gameStore.ts` (flesh out from Prompt 03): Zustand store exposing selectors
  the UI reads and a single `dispatch(intent)` + `tickBy(dtHours)`. On app open it calls
  `settleOffline(realHoursAway)` and surfaces the `OfflineReport`. The store owns the
  **only** `Date.now()` usage (to compute real elapsed time) — the engine stays pure.
- `src/ui/shell/AppShell.tsx` — layout with a **persistent bottom nav**
  (Deals · Crew · Money · Heat), Empire Map + High Score one level up (design/07 §2/§8).
  Portrait/mobile-first; one **primary action** per screen state.
- Routing (hash or a tiny router) between screens (Prompts 15–23).
- `src/ui/shell/Disclosure.ts` — a gating layer driven by `state.flags`: nav tabs and
  in-screen features are **visible-but-locked** (greyed, aspirational) or hidden until
  their unlock flag is set, per progressive disclosure. Feed off the same flags the beats
  set. (design/04 §0, design/07 §2)
- `src/ui/shell/ReturnHook.tsx` — on load, present the `OfflineReport` as **cash +
  decisions to allocate** (never a loss), then route into any queued `pendingChoices`.
- Global error boundary + a "no active run → new run / continue" entry gate.

## Acceptance criteria
- App boots into either a saved run (with an offline-return summary) or the new-run gate.
- Locked features render as **greyed aspiration**, not missing, and unlock exactly when
  their flag flips. (design/07 §2)
- Exactly one primary action is emphasized per screen state. (design/04 §3)
- The UI **only** reads state and dispatches intents — no game logic in components
  (lint/review check: no economic math in `ui/`).
- `settleOffline` runs once per app open and its result is shown as gains + choices.

## Guardrails
- **Progressive disclosure** — don't expose the whole map/tech tree/market on minute one
  (decision fatigue). (design/04 §0/§0.3, GDD §9)
- The shell must make the return **rewarding, never punishing** — no "you lost X while
  away" surface anywhere. (GDD §6)
