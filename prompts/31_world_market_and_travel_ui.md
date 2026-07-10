# Prompt 31 — World Market Board, Plugs, Conversions & Travel (UI)

**Depends on:** 29 (regional markets engine), 30 (travel engine), 14 (shell), 15 (deal screen), 16 (empire map).
**Design authority:** `design/11` §1–§5; Ideas2.md §2/§3 ("Just like Drug Lords 2, there should be a market to see drug prices across all regions"); design/04 UX; design/07 wireframes.

## Objective

Surface Prompt 29/30 in the UI: a Drug-Lord-2-style **world market board**
(every country × every product, always visible), market switching on the Deal
screen, the **plug** purchase flow, the **cook/press** conversion flow, and
shipment dispatch/tracking. Screens render state and dispatch intents only —
no economic math in components (README UI rule).

## Deliverables

1. **World Market screen** (`ui/screens/WorldMarketScreen.tsx` + `.model.ts`,
   header uplink like Storage/Corruption — Prompt 20 pattern):
   - A country × product price grid built purely from `getMarketPrice` /
     `basePriceAt`, with trend arrows and the run's strain name via
     `productDisplayName`. EVERY country shows from minute one (open access;
     un-traded cells read "no market", plug cells show the contract price with
     a 🔌 affordance and the intro cost).
   - Row tap → that country's detail: traded list, local risk, your presence
     (stashes there), plug quote (`plugQuote`), and a "plant foothold" hand-off
     to the Empire Map's `addStash` flow.
   - Plug purchase: shows cost, unlocked products, and the meeting's heat
     BEFORE commit (`PLUG_MEETING_HEAT` — fairness); dispatches
     `{ type: 'buyPlug' }`; result renders as a scene, never a toast.

2. **Deal screen market switcher** (`dealScreen.model.ts` extension): pick any
   stash you own; the board re-renders for that stash's country (the engine
   already prices/validates by stash country). Plug-gated rows show the reject
   reason as prose ("The cartel doesn't sell to strangers — $220,000 buys the
   introduction"), with a jump to the plug flow.

3. **Conversion panel** (Deal screen or Storage screen card): for a stash
   holding cocaine/weed, "Cook crack" / "Press hash" with a batch stepper
   clamped by `maxBatches`, showing consumed/produced/cost/heat before commit;
   dispatches `{ type: 'convert' }`; outcome renders the recipe's prose scene.

4. **Shipment dispatch + tracker** (Empire Map extension): from a stash, pick
   product/qty/destination/mode/couriers; render `quoteShipment` verbatim
   (cost, cuts, ETA, interdiction % on the RiskMeter — the exact rolled
   number); in-flight shipments show on the map with ETA; arrival/interdiction
   renders as a scene.

5. **Session-end hook** (Prompt 22 pattern): an affordable plug or a wide
   cross-country margin is a legitimate "one more day" open loop.

## Acceptance criteria

- [ ] The world board lists all 9 countries × 11 products with live numbers
      identical to `getMarketPrice` (spot-check test), un-traded cells inert.
- [ ] The plug flow shows cost + heat before commit; after purchase the
      contract price row updates and the buy gate lifts (component test).
- [ ] Conversion panel numbers equal the recipe config; commit updates
      holdings; outcome is a scene (component test).
- [ ] Shipment dialog's risk % equals `interdictionChance` verbatim
      (fairness-law component test, like the Deal screen's RiskMeter test).
- [ ] One primary action per screen state (design/04); everything reachable
      from minute one — price, not progression, is the gate.
- [ ] Suite green, `tsc` clean.

## Ethical guardrails

- Odds shown = odds rolled, on every meter this prompt adds.
- No dark-pattern nudges: the plug/shipment quotes are complete (cost, cut,
  heat, odds) before any commit button is enabled.
- Failure and loss render as scenes, never error toasts.
- Nothing here runs offline; session-end hooks are bonus-framing only.
