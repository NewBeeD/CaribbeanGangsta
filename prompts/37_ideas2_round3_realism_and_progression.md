# Prompts 37–41 — Ideas2 Round 3: Realism & Progression Pass

Source: `Ideas2.md` items **1–6** (round-3 feedback). Item **6** ("I want to see
drug prices by country as well just like Drug Lord 2") is now filled in and
planned as **P6 (Prompt 42)** at the end of this file — a *completion* pass, since
the cross-country price board already largely exists (see its Root cause).

This file plans six self-contained prompts (candidate files **37–42**), executed
**in order**, one per commit, exactly like the Round-2 workstreams in
`design/12`. Each is grounded in the current engine.

## House rules that bind everything below (`prompts/README.md`, Ideas.md)

- **Engine stays pure & deterministic** — all new mechanics live in
  `app/src/engine`; UI only renders view-models and dispatches intents. No
  `Math.random` (route through `engine/rng.ts`), no wall clock (time via
  `clock.ts`).
- **Config, not literals** — every new number goes in `app/src/engine/config/`
  and a `state.config` group (Prompt 26). New persisted shape ⇒ bump
  `SCHEMA_VERSION` in `state.ts` **+ a hydrate migration**.
- **Money is the only gate** (Drug Lord 2 open access — Ideas.md). No time /
  flag / level / reputation *flag* gates. A rising **cash price** is a money
  gate and is allowed; a **reputation-scaled borrow cap** (already in
  `config/lenders.ts`) is an economic curve, not a flag, and is allowed. A
  **hard "you can't do this yet" lock is not.** Item 5 below brushes this line —
  see its **Open decision**.
- **Rejections never mutate state; outcomes carry scene keys, not error strings.**
- Definition of done per prompt: `npm run typecheck`, `npm run lint`,
  `npm run test` all green.

---

## P1 (Prompt 37) — Fixed 6-front laundering roster, single-buy + upgrade-only

**Depends on:** 07 (laundering engine), 18 (Money screen), 26 (config injection).
**Design authority:** `Ideas2.md` item 1; the three-stage laundering research it
quotes (Placement / Layering / Integration); `design/01` §3a; the open-access
rule (Ideas.md).

### Feedback

"The game gives you the ability to create **infinite fronts**, which makes no
sense." The player wants a **fixed roster** where each front maps to a real
laundering technique from the research, each buyable **once**, then **upgrade-
only** (the existing `buy_in × 1.15^level` curve), with buy-ins that **scale
steeply** so a richer player pays much larger sums for the heavier fronts.

### Root cause (verified)

`engine/laundering.ts` `buyFront()` counts existing copies (`nOwned`) and mints
`front-${type}-${nOwned+1}` every time — so a player can own N bars. `FRONT_TYPES`
in `config/fronts.ts` currently has **4** archetypes (`bar`, `nightclub`,
`resort`, `crypto`).

### Design — one front per technique, six total (the cap)

Replace the 4-type roster with **6 techniques from the research**, ordered by
buy-in (Placement → Layering → Integration), each a distinct `FrontType`:

| id | name | stage | ratePerLevel | buyIn | heat/hr | swing |
|----|------|-------|-------------|-------|---------|-------|
| `cash-front` | Cash-Intensive Front (bar / car wash / nail salon) | Placement | 120 | 2,000 | 0 | 0 |
| `smurf-network` | Smurf / Structuring Network | Placement | 300 | 8,000 | 0.02 | 0 |
| `crypto` | Crypto / Stablecoin Exchange | Layering | 900 | 20,000 | 0.01 | 0.4 |
| `shell-company` | Shell Company | Layering | 700 | 35,000 | 0.015 | 0 |
| `trade-front` | Trade-Based Front (import/export, false invoicing) | Layering→Integration | 1,300 | 90,000 | 0.03 | 0 |
| `real-estate` | Real-Estate Holdings (property / hotels) | Integration | 2,600 | 250,000 | 0.05 | 0 |

(Rates/buy-ins are v1 HYPOTHESES — the ×1.15 upgrade curve and 5-level cap are
unchanged; only the roster and the single-buy rule change. `real-estate` is the
"much larger sum" the feedback asks for. Retune against the Prompt 25 batch sim.)

### Deliverables

- `config/fronts.ts` — `FrontType` becomes the 6-id union above; `FRONT_TYPES`
  holds the six configs; keep `crypto`'s `swing`. Docstring updated to cite the
  research and the **single-buy** rule.
- `engine/laundering.ts` `buyFront()` — reject with a new
  `'already-owned'` `LaunderRejectReason` when a front of that `type` exists;
  drop the `nOwned` copy-count and mint a stable `front-${type}` id (one per
  type). `upgradeFront()` unchanged.
- `state.ts` — bump `SCHEMA_VERSION`; `store/persistence.ts` migration maps
  legacy front ids on old saves: `bar → cash-front`, `nightclub →
  shell-company`, `resort → real-estate`, `crypto → crypto`; if a save somehow
  holds duplicates of a type, **keep the highest-level one and refund nothing**
  (migrations never seize — fold duplicates by max level). Preserve `level`,
  `cleanCash`, RNG.
- UI — `ui/screens/moneyScreen.model.ts` / `MoneyScreen.tsx`: the FRONTS list
  shows all six as **owned (with upgrade)** or **buyable-once (with buy-in)**;
  a bought front's buy row disappears. No "buy another" affordance.
- `telemetry/simulation.ts` — the scripted launderer buys each type at most
  once; still survives every seed to the horizon.

### Acceptance criteria

- [ ] `buyFront` a second time for an owned type returns `rejected:
      'already-owned'` **without mutation**; a fresh type still succeeds.
- [ ] Exactly six front types exist; the Money screen never offers a 7th or a
      duplicate.
- [ ] Upgrade cost still equals `buyIn × 1.15^level`; max level unchanged.
- [ ] Legacy saves migrate: old fronts remap by the table above, levels
      preserved, no cash/RNG change; duplicate legacy types fold to max level.
- [ ] Full suite green, `tsc` clean.

### Ethical guardrails

- The single-buy rule is a **roster fact**, not a progression flag — every one
  of the six is offered from minute one; the buy-in (money) is the only gate.
- Migration adds/loses nothing an existing player earned (fold-by-max, no
  seizure).

---

## P2 (Prompt 38) — Remove the quick "bribe a cop to lower heat" lever

**Depends on:** 05 (heat), 09 (corruption payroll), 19 (Heat screen), 20
(Corruption screen).
**Design authority:** `Ideas2.md` item 2; `design/09` System B (payroll).

### Feedback

"I don't like the idea of a **bribe-a-cop button to lower heat**. Best to remove
this feature, and leave the **cop on payroll** instead."

### Root cause (verified)

`engine/heat.ts` exposes a standalone quick lever: `reduceHeatByBribe`,
`bribeCoolQuote`, `bribeToCoolHeat`, surfaced by the Heat screen's
`[ Bribe a cop -$X ]` button (`heatScreen.model.ts`, `HeatScreen.tsx`), tuned by
`config/heat.ts` `QUICK_BRIBE_DOLLARS` / `BRIBE_HEAT_PER_DOLLAR`. Separately,
`config/corruption.ts` already has the **Beat Cop** payroll official whose
benefit is `raid-tipoff` — *"Tips you off on local raids and **cools local heat
faster**."*

### Design — payroll is the only cop-driven heat relief

Delete the one-tap bribe lever. The Beat-Cop retainer becomes the deliberate,
recurring way to keep heat down (a standing relationship you manage, with a
telegraphed flip risk — not a vending machine).

### Deliverables

- `engine/heat.ts` — remove `reduceHeatByBribe`, `bribeCoolQuote`,
  `bribeToCoolHeat`, `BribeCoolQuote`, `BribeCoolResult`. `addHeat` stays the
  canonical mutator; chaos/deal callers of `addHeat` are untouched.
- `config/heat.ts` — remove `QUICK_BRIBE_DOLLARS`, `BRIBE_HEAT_PER_DOLLAR`; drop
  from the `heat` config group + any Prompt-26 schema/migration touchpoint.
- `store/gameStore.ts` — remove the bribe intent/action; `engine/index.ts` drops
  the re-exports.
- UI — `heatScreen.model.ts` / `HeatScreen.tsx`: remove the
  `[ Bribe a cop -$X ]` lever and its quote row. In its place, if **no beat cop
  is on payroll**, show a one-line pointer to the Corruption screen
  ("Put a cop on the payroll to cool local heat" → routes to Corruption); if one
  **is** on payroll, show the standing benefit line. **Lie-low stays** as the
  free, always-available heat lever (`setLieLow`) — do not remove it.
- **Wire the benefit if it's currently cosmetic:** confirm the Beat-Cop
  `raid-tipoff` benefit actually multiplies heat decay in `heat.ts`/
  `corruption.ts` (the summary promises "cools local heat faster"). If it does
  not yet, add a `PAYROLLED_COP_DECAY_MULTIPLIER` (config/heat.ts) applied in
  `decayHeat` when a loyal beat cop is on payroll — otherwise removing the bribe
  leaves the player with no cop-driven relief, which the feedback does not
  intend.
- Tests — delete `heat.test.ts` bribe cases; add a `decayHeat` case proving the
  payrolled-cop multiplier; update `ui.heat.test.tsx`.

### Acceptance criteria

- [ ] No `bribe*`/`reduceHeatByBribe` symbol remains in engine, store, or UI; no
      `[ Bribe a cop ]` control renders on the Heat screen.
- [ ] A loyal Beat Cop on payroll measurably speeds heat decay vs. no cop
      (same heat, same `dtHours`).
- [ ] Lie-low still toggles and still slows income (`LIE_LOW_*` untouched).
- [ ] Config group loses both bribe knobs; old saves migrate without them.
- [ ] Full suite green, `tsc` clean.

### Ethical guardrails

- Payroll remains **optional deterministic power** with a *telegraphed* flip
  risk (design/09 B.3) — not pay-to-win, not a loot box.
- Offline stays frozen: the cop's decay boost is an ACTIVE-only `decayHeat`
  effect (heat never moves while away).

---

## P3 (Prompt 39) — Weed cultivation, strains, and drug production (become a supplier)

**Depends on:** 06 (storage), 32 (finite stock / one-price), 08 (crew delegation),
26 (config). **This is the largest item — build the grow first, factories second;
consider splitting into 39a/39b at implementation time.**
**Design authority:** `Ideas2.md` item 3; existing `engine/conversions.ts`
(weed→hash already exists); `design/11` §4.

### Feedback

Three escalating asks:
1. **Grow weed** — and **different strains** for more profit.
2. Optionally **convert weed → hashish** (this recipe already exists as
   `press-hash`; strains just feed it richer input).
3. **Later**, a crew member can be **transferred to manage the grow**.
4. **Later still**, set up **drug factories** to *produce* certain drugs and
   **become a supplier**.

### Design — a hands-off production layer that mirrors fronts (time → product)

Fronts turn time into **clean cash**; production turns time into **product
units** in a stash. Same idle spine, same offline-freeze guarantee (product
accrues on ACTIVE ticks only; absence forgoes yield, never seizes it).

- **`config/production.ts` (new group):** a `GROW_OPS` roster and a
  `DRUG_FACTORIES` roster. A `GrowOp`/`Factory` config carries: `id`, `name`,
  `buyIn` (clean cash), `product` (a `ProductId`), `unitsPerHourPerLevel`,
  `heatPerHour`, `maxLevel`, upgrade growth (reuse `1.15`). **Strains** = grow-op
  variants of `weed` with different `unitsPerHourPerLevel` **and** a per-strain
  quality that lifts the local sale price / hash yield (a "more profit" lever,
  not just more mass). Money is the only gate — steep buy-ins, no flags.
- **`engine/production.ts` (new, pure):** `buyGrowOp`/`buyFactory` (single-buy
  per id, like P1 fronts), `upgradeProduction`, and an ACTIVE-only tick step
  `production-yield` (register in `clock.ts` **after** `laundering-accrual`)
  that deposits `unitsPerHour × level × dtHours` of the op's product into the
  home/assigned stash **up to `effectiveCapacity`** (overflow is simply not
  produced — never spoils an existing holding), and adds `heatPerHour`.
  Offline path deposits **nothing** (frozen), consistent with `settleOffline`'s
  add-only guarantee.
- **Crew delegation (ask 3):** reuse the lieutenant-delegation machinery that
  already powers `frontLieutenantBonus` (`engine/crew.ts`) — assign a promoted
  crew member to a grow-op/factory for a yield bonus + (optionally) letting it
  run without the player present each session. No new gate: assignment is a
  crew action, available whenever you have crew.
- **Drug factories (ask 4):** same shape as grow-ops but produce a *cooked*
  product (e.g. crack, or a new `meth`/`pills` product added to
  `config/countries.ts` `PRODUCT_IDS`) at a higher buy-in and higher heat.
  "Become a supplier" = your factory output feeds the crew corner queue
  (`street.ts` `bookStreetStock`, already used by `cook-crack`) and/or bulk
  sale, so you sell *into* markets rather than only buying from them.
- **`state.ts`:** add `growOps` / `factories` arrays (shape mirrors `Front`:
  `{ id, type, level, assignedCrewId? }`); bump `SCHEMA_VERSION`; migration
  seeds empty arrays on old saves.
- **UI:** a Production panel (own screen or a section on the Empire/Money
  screen — match `moneyScreen.model.ts` front rows): buy-once rows, upgrade
  rows, per-op `$/h`-equivalent (units × local price), and a crew-assignment
  control. All numbers shown = numbers the engine uses.

### Acceptance criteria

- [ ] A grow-op deposits its product into a stash over ACTIVE hours only,
      capped at `effectiveCapacity` (never past it, never offline).
- [ ] Strains differ measurably in yield **and** profit (quality lifts sale
      price or hash yield), all disclosed.
- [ ] `press-hash` consumes grown weed exactly as today (no regression).
- [ ] A crew member assigned to an op adds the disclosed bonus; unassigning
      restores base — reusing the front-lieutenant path, no new randomness.
- [ ] A factory's output reaches the market (corner queue or bulk sale) so the
      player can act as a supplier.
- [ ] Single-buy per op id (reject `already-owned`); money is the only gate.
- [ ] Old saves migrate with empty production arrays; full suite green.

### Ethical guardrails

- Production is idle **yield**, subject to the same hard line as laundering:
  **absence forgoes gains, never risks progress** — offline deposits nothing and
  seizes nothing.
- No flag gates: grow-ops and factories are offered from the start; steep
  buy-ins (and heat) are the only limiter.

### Open decision

Factories can produce a **new** drug (`meth`/`pills`) or reuse existing products
(`crack`, `cocaine`). New products touch `config/countries.ts` price bands,
`config/products.ts` elasticity, and every market/travel path (Prompt 32/30
contracts). Recommend **reusing existing products for 39a** and gating a new
drug behind its own follow-up prompt to keep the market retune contained.

---

## P4 (Prompt 40) — Rebalance early loans (kill the too-generous starting loan)

**Depends on:** 10 (debt engine), 21 (Debt UI), 26 (config).
**Design authority:** `Ideas2.md` item 4; `design/10`; `design/01`.

### Feedback (endorsed by the player)

The starting loan is too generous — a ~$1,500–2,000 day-1 line removes the
early-game sweat. Lower the initial principal cap to ~$600–900, keep the street
shark as the early lender, scale up with reputation, and apply **stronger early
pressure** (faster vig on the first loan) — **without** guilt or offline risk.

### Design — pure config retune + one first-loan pressure tweak (NO new gates)

This is almost entirely a **tuning** change to `config/lenders.ts`. The existing
reputation/collateral borrow-cap curve (`CAP_REPUTATION_FLOOR`,
`CAP_REPUTATION_SCALE`, `CAP_COLLATERAL_FRACTION`) **already** implements
"tiered / reputation-gated offers" as an economic curve — no flag gate needed,
so it stays open-access-clean.

### Deliverables

- `config/lenders.ts`:
  - `papa-cass.maxPrincipal`: **2,000 → 900**; keep `weeklyRate` 0.2, shorten
    `softDueDays` **14 → 10** (first loan bites sooner, per the feedback).
  - Lower `CAP_REPUTATION_FLOOR` (**0.35 → ~0.20**) so a **rep-0, no-collateral**
    day-1 player draws ≈ `900 × 0.20 ≈ $180–200`… — retune the floor + shark max
    together so the **first live offer lands in the $600–900 band only after a
    little rep**, and a cold-start offer is the small-timer $200-ish stake the
    feedback wants. Document the worked numbers in the docstring (fairness law:
    the offer shown is the offer given).
  - Keep `money-man` ($25k) and `financier` ($500k) as the mid/late tiers —
    reputation + repayments unlock those bands via the *existing* curve; no
    change needed beyond confirming the ramp reads smoothly after the floor cut.
- **First-loan vig (stronger early pressure):** in `engine/debt.ts`, make the
  **first loan of a run** advance the vig-warning rung (`LADDER_VIG_RATE_INCREASE`
  at rung 1) after ~1 played week instead of the full soft-due window — a
  telegraphed rung, still one-at-a-time, still ACTIVE-only. Gate this on a
  `state.debt.loansTaken === 0`-style counter (a **behavioral** first-loan
  signal, not a progression flag) so it applies only to the opening loan.
- Tests — `debt.test.ts`: assert the day-1 cold-start cap is in the small band;
  assert the first loan warns faster than a later loan under identical timing;
  assert the offline freeze still holds (interest ONLY on active days —
  guarantee #2 is untouched).

### Acceptance criteria

- [ ] A rep-0, collateral-0, day-1 player's max borrow is a small-timer stake
      (~$150–250), not $1,500+.
- [ ] After a clean repayment / rep gain, the cap climbs the existing curve into
      the $600–900+ band, then toward the money-man tier — no flag unlock.
- [ ] The first loan's vig warning fires faster than an identical later loan.
- [ ] Interest still accrues **only on active in-game days**; offline freeze and
      the four `design/10` guarantees are intact.
- [ ] Full suite green, `tsc` clean.

### Ethical guardrails

- The four debt guarantees (`design/10` §4) hold verbatim — especially offline
  freeze and telegraphed, one-rung-at-a-time escalation.
- Reputation-scaled cap = an economic curve the player can see and grow, **not**
  a locked menu (open access preserved).

---

## P5 (Prompt 41) — Make territory expansion meaningful (cost, heat, vulnerability)

**Depends on:** 16 (Empire Map), 06 (storage/raids), 05 (heat), 26 (config).
**Design authority:** `Ideas2.md` item 5; `empireMap.model.ts`; the open-access
rule (Ideas.md) — **read the Open decision first.**

### Feedback

Territory access is too easy; holding ground should feel earned and vulnerable.
Requests: (a) raise the cost curve for new territory, steeper for later
districts / new islands; (b) **consolidation & defense** — a hold phase before a
district is "fully controlled"; (c) a **vulnerability window** where new
territory has higher raid risk + rival pressure; (d) playstyle paths
(street/business/political); (e) map polish (control %, "contested", next-step
cost).

### Root cause (verified)

`empireMap.model.ts` `expansionCost()` = `stashCost('floor', nOwned)` — every
new foothold is the same cheap floor-stash step, count-scaled but not
destination- or reach-scaled, and takes effect **instantly** with no added risk.

### Design — implement the money-gated + emergent-risk subset now

The parts that are **pure money gates or emergent consequences** are open-access-
clean and land in this prompt:

- **Steeper, reach-scaled cost curve.** In `empireMap.model.ts`, price a new
  foothold by *reach*, not just count: multiply `stashCost` by a
  `TERRITORY_REACH_MULTIPLIER^(distinctCountriesHeld)` and an extra
  **new-region** jump when the target country is in a region you don't yet touch
  (use `REGION_DISTANCE` from the markets/travel config). Config group
  `config/territory.ts` (new, Prompt 26). The price stays **shown and live the
  moment you can pay** — a bigger number, never a lock.
- **Vulnerability window (emergent, not a gate).** A freshly opened stash
  carries a time-decaying **raid-risk surcharge**: tag the stash with
  `openedAtHours`; in `engine/heat.ts` `raidChance`, add a bounded multiplier
  that fades over `VULNERABILITY_WINDOW_HOURS` of ACTIVE play. This makes
  over-expansion dangerous **without** blocking it, and stays offline-safe
  (raids are already ACTIVE-only). Telegraph it: a "new territory is exposed"
  return-hook / session-end line (reuse the `pendingChoices` pattern).
- **Heat spike on takeover.** Opening a route adds a one-time `addHeat` bump
  (config'd) — expansion draws attention. Emergent, not a gate.
- **Map polish.** `empireMap.model.ts` / `EmpireMap.tsx`: show per-district
  `fill`/control %, a "newly opened / exposed" badge during the vulnerability
  window, and the reach-scaled next-step cost highlighted when affordable
  (the `nextAffordableStep` selector already exists — extend its cost).

### Open decision — consolidation TIME & lieutenant-requirement vs. open access

The feedback's **"hold for 3–7 in-game days before a district is *fully
controlled* / counts for unlocks"** and **"subsequent districts *require* a
lieutenant / stronger crew"** are **hard time/flag gates**. The project's
standing guardrail (memory `open-access-design`, Ideas.md) is: *"no progression
gates, money is the only limiter; never add flag gates."* These two requests
**directly conflict** with that contract.

**Recommendation:** ship the money-gated + emergent-risk subset above (steep
reach-scaled cost, vulnerability window, heat spike, polish), which delivers the
"expansion is a real trade-off" feel **without** breaking open access. **Do NOT**
implement consolidation-time or crew-requirement locks until the user explicitly
signs off on relaxing the open-access rule for territory. Surface this to the
user before implementing P5. (Playstyle paths (d) are a larger design item —
defer to its own prompt.)

### Acceptance criteria (subset that respects open access)

- [ ] The 2nd/3rd district and a new-region foothold cost visibly more than the
      first via the reach-scaled curve; the price is always shown and actionable
      the instant it's affordable (no lock).
- [ ] A newly opened stash has measurably higher raid risk that fades over the
      vulnerability window (ACTIVE-only); an old stash's risk is unchanged.
- [ ] Opening a route adds a one-time heat bump and a telegraphed "exposed"
      hook.
- [ ] Map shows control %/fill and a vulnerability badge; next-step cost
      reflects the new curve.
- [ ] Offline stays frozen (no raid/heat movement while away); full suite green.

### Ethical guardrails

- Money remains the only *gate*; the new risk is **emergent and telegraphed**,
  never a hidden lock. Consolidation-time / crew-requirement gates are **out of
  scope pending explicit sign-off** (see Open decision).

---

## P6 (Prompt 42) — Country price sheets: read every drug's price by country (Drug Lord 2 price book)

**Depends on:** 29–31 (regional markets + the World Market board), 32 (one-price /
finite stock), 15 (Deal screen). **Config-light, UI + pure-model only — no engine
math, no schema change.**
**Design authority:** `Ideas2.md` item 6; `design/11` §1–§2; the open-access rule
(Ideas.md); the existing `worldMarket.model.ts` docstring, which already frames
this screen as "just like Drug Lords 2."

### Feedback

"I want to see **drug prices by country** as well **just like Drug Lord 2**."

### Root cause (verified) — this is a *completion*, not a build

The Drug-Lord-2 price board **already exists** and is wired into nav (`market`
route → `WorldMarketScreen`, Prompt 31). What ships today is **product-centric**:
`boardRows(state, product)` picks **one drug** and lists its live price in **all
28 countries** (`worldMarket.model.ts`). Numbers are `getMarketPrice` verbatim, so
fairness is already right.

The genuine gap vs. Drug Lord 2 is the **inverse, location-centric view**: in DL2
you stand in a city and read the **whole drug menu at once** (every drug's price,
side by side), then flip cities. Today the only "every drug in one place" list is
`productRows()` on the **Deal** screen — and it is limited to a stash's **own
country** (`marketCountryId(stash)`), i.e. only markets where you already hold
presence. There is **no way to browse an arbitrary country's full price list**
without a stash there, and no **all-drugs × all-countries matrix** (the DL2 "price
book"). `countryDetail()` shows *which* products trade in a country but **not their
prices**. P6 closes exactly that: read any country's full price sheet, and scan the
whole book at a glance — from minute one, everywhere (open access).

### Design — add two location-centric reads to the existing board (no new screen needed)

Extend the World Market screen with a **view toggle** — `By product` (today's
board, unchanged) ↔ `By country` (new) — plus an optional `Price book` matrix.
All new numbers are `getMarketPrice` verbatim; the component authors no economic
math (README UI rule), so a price shown here is the price a deal there executes at.

- **`worldMarket.model.ts` — new pure selectors (no engine changes):**
  - `countryPriceSheet(state, countryId): readonly BoardRow[]` — the mirror of
    `boardRows`: **one country, every product**, reusing the exact `BoardRow`
    shape (price / stock / trend / traded / plugGated / plugPriced / plugCost /
    presence) so the row renderer is shared. Non-traded products render inert
    ("no market"), exactly like the product board's non-traded cells. Arms are
    **excluded** from the drug sheet (they're off the drug board — `dealScreen`
    already filters `id !== 'arms'`; match that).
  - `priceBook(state): { products; countries; cell(product,country) }` (or a
    row-major `readonly BoardRow[][]`) — the full drugs × countries grid for the
    matrix view. Reuse `boardRows` per product so there is a single price path.
  - Keep `boardRows` / `widestSpread` untouched (sessionEnd depends on the
    latter).
- **`WorldMarketScreen.tsx` — a segmented `By product | By country | Price book`
  toggle** (local `useState`, like the existing product picker):
  - `By product`: today's board verbatim.
  - `By country`: a **country picker** (the 28 countries, in roster order — reuse
    `COUNTRIES`) → renders `countryPriceSheet` rows with the **same** row
    component as the product board (price, `~stock on the street`, trend arrow,
    🔌 plug/intro line, 📍 presence). Tapping a product row can deep-link into
    the Deal screen prefiltered to that product where presence exists (optional
    polish; keep it a pure `navigate`, no new store intent).
  - `Price book`: a compact scrollable matrix — products as rows, countries as
    columns (or vice-versa on narrow screens) — each cell the live price, with
    the widest-spread pair subtly highlighted (reuse `widestSpread`). This is the
    "see everything at once" DL2 payoff.
- **`config`:** none required — this is presentation over existing selectors. Only
  touch config if the matrix wants a display threshold (e.g. a "hot spread"
  highlight cutoff); if so it goes in a config group, never a literal.

### Deliverables

- `ui/screens/worldMarket.model.ts`: add `countryPriceSheet` and `priceBook` (+
  their view-model types); **no** change to `boardRows`, `widestSpread`,
  `countryDetail`, or any engine module.
- `ui/screens/WorldMarketScreen.tsx`: the three-way view toggle, the country
  picker, the shared price-row renderer (extract today's inline `rows.map` into a
  small local `PriceRow` so product- and country-views share it), and the matrix.
- Tests — `worldMarket.model.test.ts`: `countryPriceSheet(c)` equals, cell-for-
  cell, the price `getMarketPrice(state, product, c)` returns and matches the
  corresponding `boardRows(product)` entry for that country (the fairness cross-
  check — same number both ways); a plug-gated country shows contract price + intro
  cost on its sheet; a non-traded product is inert; arms never appear on the drug
  sheet. Add/extend `ui.worldMarket.test.tsx` for the toggle + country picker.

### Acceptance criteria

- [ ] The World Market screen offers a `By country` view: pick any of the 28
      countries and read **every drug's** live price/stock/trend there, from
      minute one, **without holding a stash there** (open access).
- [ ] For every (product, country), the price on the `By country` sheet is
      byte-identical to the `By product` board and to `getMarketPrice` — one price
      path, no divergence.
- [ ] Plug-gated sources show the contract price + one-time intro cost on the
      country sheet (money gate, never a hidden menu); non-traded cells read "no
      market"; arms are absent from the drug sheet.
- [ ] A `Price book` matrix renders all drugs × all countries; the widest spread
      is legible at a glance.
- [ ] `boardRows` / `widestSpread` / `countryDetail` and every engine module are
      unchanged; no `SCHEMA_VERSION` bump. Full suite green, `tsc` clean.

### Ethical guardrails

- Pure **read** feature — no mutation, no new gate. Every country's full price
  sheet is visible from minute one; presence still governs where a deal *executes*
  (the Deal screen), never where a price can be *seen* (the board already states
  "Prices are visible everywhere; deals execute where you have a stash").
- Fairness law holds by construction: the number shown is `getMarketPrice`
  verbatim — the number a deal there will run at.

### Note

Because the cross-country board already exists, P6 is the **smallest** item in
this file (UI + two pure selectors, no engine/schema/config churn). It slots
naturally right after **P1** (both are read-model/UI polish) or as a quick win
before the heavier P3.

---

## Suggested order & notes

1. **P4 (loans)**, **P2 (remove bribe)**, and **P6 (country price sheets)** are
   the smallest — config/deletions and pure read-model/UI; do them first for
   quick wins. (P6 has no engine, schema, or config churn at all.)
2. **P1 (6-front roster)** next — self-contained, one migration.
3. **P5 (territory)** — implement the open-access-clean subset **after** raising
   the Open decision with the user.
4. **P3 (cultivation/factories)** is the biggest — schedule last and consider
   splitting 39a (grow + strains + crew delegation) from 39b (factories +
   supplier sales).

Every prompt bumps `SCHEMA_VERSION` only if it changes persisted shape (P1, P3,
possibly P5's `openedAtHours`), each with a hydrate migration. Re-run the
Prompt 25 batch sim after P1/P3/P4 to confirm the retuned economy still lets a
policy reach the horizon on every seed.
