# Prompt 16 — Empire Map screen (Loop 3 backbone)

**Phase:** 2 — UI
**Depends on:** 06, 07, 14
**Design refs:** `design/07` §2 (Empire wireframe); `design/04` §1; GDD §3 Loop 3,
§5.2 (medium-term metagame = retention backbone)

## Goal
Make empire growth **visible** and always show the **next affordable step**. This is the
retention backbone — invest the polish here.

## Build
- `src/ui/screens/EmpireMap.tsx` matching design/07 §2:
  - Districts/territories with control state (`controlled`, `60% ==== ○ > push`),
    **visible-but-locked** future zones (`🔒 needs a route`, `MIAMI 🔒 international`) as
    greyed aspiration.
  - Header: `Clean $ ▲ accruing…` (reads laundering rate).
  - **Next affordable step highlighted** — compute which expansion the player can afford
    now and emphasize it. (design/07 §2)
  - Glanceable empire summary row: `Fronts N · Crew N · Routes N · Rivals N`.
  - Tap-through to district/route detail (push control, open a route, view front).
- Expansion actions dispatch the relevant intents (control push, open route → unlocks
  the paradigm-shift layers). Reads composite empire-size (Prompt 11) for the summary.

## Acceptance criteria
- Controlled/partial/locked states render distinctly; locked zones are greyed, not
  hidden (aspiration). (design/07 §2)
- The next affordable expansion is highlighted based on current cash.
- Summary counts match engine state.
- Opening a route flips the disclosure flags that unlock port bribes / international
  products (paradigm-shift unlock). (GDD §4.6, design/09 sequencing)

## Guardrails
- Growth must be **glanceable** and the **next step always in reach** — the "one more
  day" affordability lever. (design/01 §0.4, GDD §5.2)
- Progressive disclosure: don't reveal the whole map at once. (design/04 §0)
