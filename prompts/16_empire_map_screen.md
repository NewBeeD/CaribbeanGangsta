# Prompt 16 — Empire Map screen (Loop 3 backbone)

> **REVISED (Ideas.md):** open access — the whole map is visible and every zone/route is
> purchasable from the start. **Money is the gate**: a route or territory push shows its
> price and is actionable the moment the player can pay, never behind a progression flag.

**Phase:** 2 — UI
**Depends on:** 06, 07, 14
**Design refs:** `design/07` §2 (Empire wireframe); `design/04` §1; GDD §3 Loop 3,
§5.2 (medium-term metagame = retention backbone); Ideas.md (open access)

## Goal
Make empire growth **visible** and always show the **next affordable step**. This is the
retention backbone — invest the polish here.

## Build
- `src/ui/screens/EmpireMap.tsx` matching design/07 §2:
  - The whole map rendered from minute one: districts/territories with control state
    (`controlled`, `60% ==== ○ > push`), and priced expansion targets
    (`MIAMI · open route $25,000`) the player can act on whenever he can pay.
  - Header: `Clean $ ▲ accruing…` (reads laundering rate).
  - **Next affordable step highlighted** — compute which expansion the player can afford
    now and emphasize it. (design/07 §2)
  - Glanceable empire summary row: `Fronts N · Crew N · Routes N · Rivals N`.
  - Tap-through to district/route detail (push control, open a route, view front).
- Expansion actions dispatch the relevant intents (control push, open route). Travel and
  route-opening cost money (and add heat with the extra motion) — no flag gates. Reads
  composite empire-size (Prompt 11) for the summary.

## Acceptance criteria
- Controlled/partial/unowned states render distinctly; unowned zones show their price,
  and are actionable when affordable. (Ideas.md)
- The next affordable expansion is highlighted based on current cash.
- Summary counts match engine state.
- Opening a route is a purchase: pay the cost, the route works immediately (wider
  margins, more heat with the added motion). (GDD §4.6; Ideas.md)

## Guardrails
- Growth must be **glanceable** and the **next step always in reach** — the "one more
  day" affordability lever. (design/01 §0.4, GDD §5.2)
- **Money is the only gate** — never hide or flag-lock a zone; if the player has the
  cash, the option is live. (Ideas.md)
