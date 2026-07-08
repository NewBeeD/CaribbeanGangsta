# Prompt 15 — The Deal screen (Loop 1 UI)

**Phase:** 2 — UI
**Depends on:** 04, 14
**Design refs:** `design/07` §1 (Deal wireframe); `design/04` §1; GDD §3 Loop 1

## Goal
Render the core moment — buy low / sell high — so that market reading is a **legible
skill** and risk is **fair and estimable**. Success and bust both return a **scene**.

## Build
- `src/ui/screens/DealScreen.tsx` matching the wireframe (design/07 §1):
  - Location header with **heat as dots** (`HeatDots`), back nav.
  - Per product: name, **`TrendArrow`** (price rising/falling), buy price, sell price
    with margin %, "You hold / Cash".
  - A **RISK panel**: `RiskMeter` showing the **exact bust %** from
    `computeBustProbability` (the number shown == the number rolled), plus
    "If busted: lose product + cash".
  - Quantity stepper `[ - ] n units [ + ]` and a single primary action
    `[ MAKE THE SELL ]` / `[ BUY ]` (one primary per state — design/04 §3).
  - On result: **success** → short scene ("The buyer counts it twice, nods, gone.") +
    cash animates up; **bust** → `SceneText` narrative failure ("Blue lights hit the
    alley before the deal closed. You ran; the product didn't."), never a toast.
- Dispatch `BuyIntent`/`SellIntent`; read all numbers from selectors — no math in the
  component.
- Respect disclosure: products locked until their gate; risk panel appears once real
  bust risk is active (onboarding keeps early sells guaranteed — Prompt 24).

## Acceptance criteria
- The displayed bust % equals `computeBustProbability(...)` for the current selection
  (assert via a component test with a mocked store).
- Trend arrows reflect the live price walk; margins update with price.
- Bust and success both render **scene text**, not error/toast UI. (design/07 §1)
- One primary action; quantity clamped to affordable/held/capacity.
- No economic logic in the component (only selectors + intent dispatch).

## Guardrails
- **Odds shown = odds rolled** — never post-process the number after display. (GDD §8)
- Failure is a **scene**. (design/05 §4, design/07 §1)
- Numbers stay light elsewhere, but **risk keeps its exact % label**. (design/07 §8)
