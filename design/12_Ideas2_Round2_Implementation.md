# 12 — Ideas2 Round 2: Implementation Plan

Source: `Ideas2.md` items 1–13 (round-2 playtest feedback, July 2026). Round 1
(regional markets, plugs, travel — design/11, prompts 29–31) is DONE; this doc
plans everything new. Items are grouped into five workstreams (A–E) at the end,
sized as candidate prompts 32–36.

House rules that bind everything below (prompts/README.md, Ideas.md):

- **Engine stays pure and deterministic** — all new mechanics live in
  `app/src/engine`, UI only renders models and dispatches intents.
- **Config, not literals** — every new number goes in `app/src/engine/config/`
  and a `state.config` group (schema bump to **v11**, hydrate migration).
- **Money is the only gate** — no time/flag/level gates. The arms unlock (item 1)
  is a plug-style cash intro, which is a money gate and therefore allowed.
- **Rejections never mutate state; outcomes carry scene keys, not error strings.**

---

## Item 3 — Single price per drug per market (THE big change; do first)

**Feedback.** Buy and sell prices in the same city differ hugely (cocaine buy
band $1.5k–3k vs sell band $20k–60k in `config/countries.ts` →
`PRODUCT_PRICE_BANDS`), so you can buy and flip in place. Player wants the
Drug Lord 2 model: **one visible price per drug per country**; profit comes
from buying where it's cheap (sources/plugs) and transporting to where it's
expensive.

**Design.** Collapse each product's `buy`/`sell` bands into a single `price`
band = the product's price *at its source region*. A country's displayed price
is `basePrice × geographyStretch × countryBias × driftFactor`, and **buying and
selling both execute at that one number**. Margin now comes only from:

1. Geography — `REGION_DISTANCE` × per-product elasticity (already exists in
   `config/products.ts`; it becomes the whole margin engine, so elasticities
   need retuning upward).
2. Plugs — `plugPriceFactor` puts the source price below every open market
   (unchanged mechanic; now it's visibly "the lowest price in the world").
3. Events (item 6) and drift.

Suggested v1 anchor for cocaine (real-band flavored): Colombia w/ plug ~$1.5k,
Caribbean ~$3–5k, Miami ~$18–30k, Rotterdam ~$35–55k. Other products scale from
their current sell bands.

**Implementation.**

- `config/countries.ts`: `ProductPriceBand` loses `buy`/`sell`, gains
  `price: Band`. Retune every product.
- `world.ts` `basePriceAt()`: return one `price` (keep `plugPriced` flag; a plug
  replaces the price rather than discounting a buy side).
- `deals.ts` `getMarketPrice()`: return `{ price, trend, volatility, plugPriced }`;
  `buyProduct`/`sellProduct` both use `price`. Bust math unchanged.
- `travel.ts` / shipments: quotes already price by destination country — verify
  they read the new single price.
- UI: `dealScreen.model.ts` `ProductRow` gets one `price`; **delete `marginPct`**
  (this also closes item 11). `DealScreen.tsx`, `WorldMarketScreen.tsx`,
  `ShipmentDesk.tsx` render one number per product.
- Schema **v10 → v11** migration in state hydrate: rebuild `markets` factors
  (safe — factors are relative), drop nothing player-owned.

**Tests.** Buy-then-sell in place is a wash (minus heat/bust risk); price at a
far region strictly exceeds source price for every product at neutral drift;
plug price < every open-market price for that product.

## Item 10 — Finite supply per market

**Feedback.** "There seems to be an infinite amount of drugs in each country."

**Design.** Each `markets[countryId][productId]` (`MarketState` in `deals.ts`)
gains a **stock pool**: `stock` units, seeded per run from a config band scaled
by the country's size/bias, **depleted by buys, replenished by a restock rate**
during active play (same active-only tick as `driftPrices` — the world stays
frozen offline, GDD §6). Player sells add back a fraction of stock (goods
re-enter the market). Plug sources get much deeper pools (that's what a source
is). Low stock nudges the drift factor up (scarcity pricing) — cheap emergent
juice, one multiplier.

**Implementation.** Extend `MarketState { factor, prevFactor, stock }`;
`buyProduct` clamps qty to stock and rejects `no-supply` past it (with prose);
restock step registered in `clock.ts` next to `driftPrices`. Config:
`config/deals.ts` or new `config/markets.ts` group — `STOCK_SEED_BANDS`,
`RESTOCK_PER_DAY`, `SCARCITY_PRICE_WEIGHT`. UI: DealScreen row shows
"~N on the street" so the clamp is never a surprise (fairness — no hidden caps).

## Item 4 — Numeric quantity input + crew-scaled carry, no hard max

**Feedback.** Clicking `+` forever is painful; max holdings should grow with
the crew, with no fixed ceiling.

**Design.**

- **Input:** a `QtyInput` component (stepper **plus a free-number text field**,
  plus a MAX chip that fills in the current clamp). Reused by DealScreen
  buy/sell, the convert card, and ShipmentDesk.
- **Capacity:** stash archetype capacity (`config/stashes.ts`) stays as the
  *base*, but effective capacity becomes
  `base + CREW_CARRY_PER_MEMBER × crew.length` (config knob, e.g. 25–50
  units/member). With recruiting unbounded, capacity is unbounded — "no max"
  achieved without deleting the storage system (design/09) or its raid-seizure
  stakes. `stashUnits`/capacity checks in `deals.ts:359`, `conversions.ts:91`,
  and `storage.ts` all route through one new
  `effectiveCapacity(state, stash)` helper so the rule lives in one place.

**Tests.** Capacity grows linearly with crew; QtyInput clamps to
min(cash, stock, capacity) and shows which limit bound it.

## Item 5 — Crack: fix the reject, retune the economics, add street teams

**Feedback.** (a) Had 50 cocaine "in hand" but got "Not enough on hand".
(b) Conversion needs an abuse limit. (c) Real ratio: powder $60–200/g vs crack
$20–100/g. (d) Cooked crack should go to the crew to sell on the street over
time as a second income stream.

**(a) The bug.** `DealScreen.tsx:418-420` shows "Not enough on hand" whenever
`maxBatches()` (`conversions.ts:72`) returns 0 — but that function is the min
of **units, cash, and stash space**, and cooking is space-hungry (10 coke →
40 crack = **net +30 units/batch**). A player with 50 coke in a near-full stash
gets 0 by *space* and is told they lack *product*. Also, the convert card runs
against the currently selected stash — coke sitting in another stash doesn't
count. Fix: surface the *binding* constraint (`insufficient-capacity` /
`insufficient-funds` / `insufficient-inventory` / wrong stash) as distinct
prose. This mislabel disappears entirely under (d), since output stops
occupying stash space.

**(b)+(c) Retune.** Real data says crack ≈ half powder's per-gram price, not a
value-add multiplier. Change `config/conversions.ts` `cook-crack` to
`10 cocaine → 18 crack` (modest mass gain from the cut, not 4×) and set crack's
single price band (item 3) at ~45–55% of cocaine's. The cook is then **not**
free money on price alone — its value is (d): converting bulk risk into a
hands-off income drip. That plus the street-team capacity below is the abuse
limiter; no artificial cooldown needed.

**(d) Street teams (new mechanic).** Cooking crack removes it from inventory
into `state.streetStock` (units + the local price it was booked at). It then
**drips back as dirty cash** over time via the laundering-style accrual
pattern (`laundering.ts` `accrue` is the template): sell-through rate =
`STREET_SALE_PER_CREW_PER_DAY × crew.length`, revenue = units × local crack
price, each active tick adds a little heat (corners are loud). Cap the queue at
`STREET_QUEUE_PER_CREW × crew.length` — that's the natural conversion limiter
(b): no crew, no corners. Offline: frozen, like everything else. New engine
module `street.ts`, config group `config/street.ts`, surfaced on the Deal
screen's convert card ("Your crew is holding N rocks — ~$X/day coming back").

## Item 6 — World price events with legit/fake intel

**Feedback.** Drug Lord 2-style events: prices rise/fall moderately or sharply
across markets, with news that may be true or false.

**Design.** A `MarketEvent` system layered on drift (`deals.ts`), driven by the
existing chaos cadence (`chaos.ts` owns event scheduling; `config/events.ts`
already exists as a config seam):

- Event = `{ product, scope: country|region|world, direction, magnitude:
  moderate|sharp, durationDays }`, applied as a temporary multiplier on the
  market factor (moderate ×1.3–1.6, sharp ×2–3, and inverse for crashes),
  decaying back to baseline.
- **Rumors:** each event *may* be preceded by a news line; each news line has a
  `credible: boolean` rolled per rumor (config `RUMOR_TRUTH_RATE`, ~0.65). Fake
  rumors point at events that never land. News renders as story-card-style
  lines in a small ticker on Deal/World Market screens (`cards/content/world.ts`
  is the content home; presenter already exists from Prompt 22).
- Events also shock **stock** (item 10): a bust event drains supply, a glut
  fills it — one system, two levers.

**Tests.** Multiplier applies/decays deterministically from the seeded RNG;
fake rumor produces no event; event prices stay within documented outer bounds.

## Item 1 — Arms dealing: its own page, plug-style unlock, real-market flavor

**Feedback.** Arms should not be sold on the drug board; separate page; unlock
via a very expensive (millions) plug-style intro; highest heat in the game;
grounded in how real arms markets work.

**Real-market grounding (for mechanics + prose).** The real trade runs on
*brokers*, not shelves: licensed grey-market dealers divert surplus state
stock using forged **end-user certificates (EUCs)**; the black market moves
small volumes at huge markups into embargoed/conflict zones (an AK that's
$500–800 near surplus stockpiles clears $2,000–5,000+ under embargo); the
Caribbean/Latin corridor is the **"Iron River"** — straw-purchased US guns
flowing south (Port Lazaro's `productBias.arms` already nods at this). Demand
is *event-driven*: coups, gang wars, embargoes spike prices far harder than
drug demand ever moves.

**Design.**

- Remove `'arms'` from the drug board: it stays a `ProductId` (state/shipments
  reuse everything) but `dealScreen.model.ts` filters it out; a new
  **ArmsScreen** (`screens.tsx` key `arms`, header uplink like Storage/
  Corruption — the Prompt 20 pattern) is the only place arms trade.
- **The Broker intro:** one-time cash unlock `ARMS_BROKER_COST = $2,500,000`
  (config). Pure money gate. Until paid, the Arms page is *visible* with the
  intro priced in prose ("The broker takes meetings at two and a half") — the
  plug-gate pattern from `plugGateProse`.
- **Categories, not one SKU:** split into tiers as products-within-arms
  (config table, not new ProductIds): `pistols` / `rifles` / `automatic` /
  `military` with rising price bands and `heatPerUnit` from 2.5 up to ~6 —
  **the heaviest heat in the game** (drug max is fentanyl 2.0).
- **EUC paperwork = corruption tie-in:** holding a Customs Chief (item 13)
  meaningfully cuts arms shipment seizure odds — paper is the product.
- **Demand is event-driven:** arms prices mostly sit flat at low margin;
  item 6's event system generates *conflict events* (region scope, sharp,
  long duration) that are where arms money is made. Selling into a conflict
  spike adds bonus heat (config) — the risk/reward the player asked for.

**New files:** `engine/arms.ts`, `engine/config/arms.ts`,
`ui/screens/ArmsScreen.tsx` + `armsScreen.model.ts`. State: `armsBroker:
boolean` + arms market states keyed like drug markets (v11 schema).

## Item 13 — Corruption retainers at realistic prices

**Feedback + exact numbers** (per week): Judge **$750,000**, Local Politician
**$400,000**, Customs Chief **$250,000**, DEA Insider **$100,000**, Beat Cop
**$50,000**.

**Implementation.** Pure config: `config/corruption.ts:61-102` currently has
1.5k / 8k / 6k / 12k / 20k — replace with the numbers above (note the player's
ordering also swaps DEA vs Customs rank: Customs $250k > DEA $100k; mirror
that in tier ordering/copy). **Balance check required:** these are 40–60×
current asks, so they only make sense *after* item 3's economy retune and the
arms/street income streams land — sequence this into the same balancing pass
(the Prompt 26 telemetry sim (`telemetry-harness-model`) should confirm a
mid-game empire can actually carry a Judge). `RETAINER_*` loyalty knobs
unchanged.

## Item 12 — Remove bulk dirty→clean conversion; fronts are THE laundry

**Feedback.** Fronts are pointless if you can bulk-convert dirty→clean.

**Implementation.** Delete the **peso exchange** path: `laundering.ts:395-417`
(`pesoExchangeQuote`, `pesoExchange`), its store action, its Money-screen card
(`moneyScreen.model.ts` / `MoneyScreen.tsx`), its config constants, and its
tests. Fronts (`buyFront`/`upgradeFront`/`accrue`) become the only
dirty→clean route. Hydrate keeps any historical fields harmlessly. Check
`SessionEndHook` / onboarding copy for references to the exchange.

## Item 2 — Restart the game fresh

**Feedback.** Player wants to restart and start over.

**Implementation.** `NewRunGate` (shell) already handles new-run at boot; what's
missing is restart *mid-run*. Add "Abandon run" in the header/settings area:
confirm modal (destructive — one clear warning, listing what's lost), then a
store `abandonRun()` that routes through **`endCurrentRun`** (memory:
`runend-leaderboard-model` — it is the ONLY banking path) with an `abandoned`
end-reason, banks the score, shows the Run-End screen, and reseeds via the
existing new-run flow. No parallel reset path.

## Item 8 — Transport gets its own page

**Feedback.** Move drug transportation off the Empire page; route *unlocking*
stays in Empire.

**Implementation.** `ShipmentDesk` is currently rendered inside
`EmpireMap.tsx:159`. Lift it to its own screen key (`shell/screens.tsx`, e.g.
`transport`) with a header uplink (Prompt 20 pattern), remove the embed, and
leave route purchase/unlock UI in EmpireMap. `shipmentDesk.model.ts` is already
self-contained — this is a mount move, not a rewrite. In-flight shipment status
should show on the Transport page (and a small badge count on the uplink).

## Item 9 — More countries

**Feedback.** Add more countries.

**Implementation.** Config-only (`config/countries.ts` roster + travel matrix
in `config/transport.ts`). Suggested additions keeping the regional-culture
logic (design/11 §1):

- **Caribbean:** Jamaica (weed/exotic source flavor, `plugFor: ['weed','exotic']`),
  Trinidad (transshipment, arms bias), Bahamas (Miami stepping-stone, high
  demand bias), Hispaniola (cheap, hot, low protection).
- **Latin America:** Panama (laundering flavor — front discount hook),
  Venezuela (arms + cocaine transit, very high risk).
- **North America:** New York (second demand sink, pills/heroin culture).
- **Europe:** London (highest cocaine demand bias in the game).
- **Africa/route flavor (optional):** West Africa (Sahel route — arms events).

Each needs: region, risk, biases, `traded` list, hooks (2 lines), travel legs.
Start-eligible stays Caribbean-only. Item 10's stock seeds scale by these
biases automatically.

## Item 7 — "Why do prices change when I switch stashes?" (answer + fix)

**Answer to the player.** Stashes are storage locations, and the Deal screen's
stash switcher is really a **market** switcher: the engine prices every deal by
the *country the stash stands in* (`deals.ts:332` `marketCountryFor`;
`dealScreen.model.ts:57-66`). Two stashes in the same country **do** see
identical prices — one price table exists per country (`state.markets` is keyed
by `countryId` only). If prices changed when switching, the second stash was in
a different country (port container stashes from Prompt 20 are keyed by their
port's `countryId`, and their names don't always make that obvious).

**Fix.** UI clarity, not engine: the switcher already carries `marketName` —
render it *prominently* on each choice and as a persistent "Market: {country}"
badge above the board, so a container in Rotterdam never masquerades as a home
stash. Add a regression test asserting equal `ProductRow` prices for two
stashes sharing a `countryId`.

## Item 11 — Remove the % badge on drug cards

Falls out of item 3 (no buy/sell pair ⇒ no margin %). Delete `marginPct`
(`dealScreen.model.ts:84-88`, `ProductRow.marginPct`) and its render in
`DealScreen.tsx`. Keep the trend arrow — it's price direction, not margin.

---

## Workstreams → candidate prompts

Ordered by dependency; A is the foundation everything else prices against.

| Prompt | Workstream | Items | Size |
|---|---|---|---|
| **32** | **A — One-price economy**: single price bands, geography-only margins, finite stock, scarcity pricing, remove margin %, schema v11 | 3, 10, 11 | L |
| **33** | **B — Market events & rumors**: event engine on drift+stock, legit/fake news ticker | 6 | M |
| **34** | **C — Crack & street teams**: reject-reason fix, recipe/price retune, street-sale drip, convert limiter | 5 | M |
| **35** | **D — Arms trade**: broker unlock, ArmsScreen, weapon tiers, conflict-event demand, EUC/corruption tie-in | 1 | L |
| **36** | **E — QoL & world pass**: QtyInput + crew-scaled capacity, Transport page, new countries, corruption retainer retune, remove peso exchange, abandon-run, stash-market badge | 4, 8, 9, 13, 12, 2, 7 | M |

Balancing note: 13's retainers, 3's flattened margins, and the new income
streams (34/35) must be tuned **together** — run the Prompt 25 batch sim after
32 and again after 35, and land all numbers through `config/` + `tunedConfig`
(Prompt 26 rules; memory: `balancing-config-model`).

Schema: one bump (v10 → v11) taken in Prompt 32 and extended in place by
33–35 (markets gain `stock` + event overlays; state gains `streetStock`,
`armsBroker`); hydrate migrations rebuild market shape, never player holdings.
