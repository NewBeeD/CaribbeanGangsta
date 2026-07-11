# Prompt 32 — One-Price Economy & Finite Stock (engine + UI)

> **Status: IMPLEMENTED** (Ideas2 Round 2, Workstream A). This prompt records
> the contract the implementation honors, so prompts 33–36 can depend on it the
> same way 29–31 depend on each other.

**Depends on:** 29 (regional markets & plugs), 30 (travel), 31 (World Market UI), 26 (config injection).
**Design authority:** `design/12_Ideas2_Round2_Implementation.md` Items **3, 10, 11**; Ideas2.md round-2 feedback; the open-access rule (Ideas.md).

## Objective

Kill the in-place buy/flip (cocaine buy $1.5k–3k vs sell $20k–60k in the same
city) and install the Drug Lord 2 model: **one visible price per drug per
country** — buying and selling both execute at that number. Profit now comes
only from buying where it's cheap (sources/plugs) and transporting to where
it's expensive. Add **finite per-market stock** with restocking and scarcity
pricing so no country is an infinite well. Delete the margin % badge (item 11
falls out — no buy/sell pair ⇒ no margin).

## Deliverables (as built)

- `engine/config/countries.ts` — `ProductPriceBand` loses `buy`/`sell`, gains
  **`price: Band`** (the product's spawn band *at its source region*). Full
  roster retuned; cocaine anchored real-band flavored (Colombia plug ~$1.2–1.8k,
  islands ~$4–7k, Miami ~$11–17k, Rotterdam ~$40k+).
- `engine/config/products.ts` — `ProductConfig` carries one `price` band and
  ONE **`distanceElasticity`** (replacing the sell/buy elasticity pair). The
  geographic stretch is now **compound**: local base =
  `source price × (1 + elasticity)^REGION_DISTANCE` — geography is the whole
  margin engine, so elasticities are retuned sharply upward (cocaine 25).
- `engine/config/markets.ts` — **new config group** (`GameConfig.markets`,
  SCREAMING_SNAKE per Prompt 26): `STOCK_SEED_BAND`, `PLUG_STOCK_MULTIPLIER`,
  `RESTOCK_PER_DAY`, `SELL_RESTOCK_FRACTION`, `SCARCITY_PRICE_WEIGHT`.
- `engine/world.ts` — `ResolvedPrice`/`BasePrice` carry a single `price`;
  `basePriceAt()` returns one number (stretch × per-run `demandFactor` ×
  `productBias`); at a TRUE SOURCE the plug **replaces** the price
  (`board.price × plugPriceFactor`, drift-free, `plugPriced` kept) — visibly
  the lowest price in the world. `hydrateWorldV11()` rebuilds legacy boards
  deterministically from the save's own seed (`::migrate-v11` stream).
- `engine/deals.ts` —
  - `MarketState` gains **`stock`** (units on the street, fractional
    internally); `createInitialMarkets(rng, config)` seeds it per run from
    `STOCK_SEED_BAND × demand-bias midpoint`, with plug sources
    `× PLUG_STOCK_MULTIPLIER` (a source IS a deep pool).
  - `getMarketPrice()` returns `{ price, trend, volatility, plugPriced,
    stock }`; both `buy` and `sell` execute at `price`. Bust math unchanged.
  - Buys **deplete stock** and reject **`no-supply`** past it (no hidden
    clamp — the UI shows "~N on the street"); player sells put a
    `SELL_RESTOCK_FRACTION` of the units back on the street.
  - `driftPrices` gets a **scarcity nudge**: low stock biases the bounded
    random walk upward (`SCARCITY_PRICE_WEIGHT × (1 − stock/cap)`), never past
    the documented `1 ± volatility` band. Deliberately a *drift* bias, not an
    instant repricing — buying can't pump the number you immediately sell at.
  - `restockMarkets` — a new ACTIVE-only tick step (`market-restock`,
    clock.ts, right after `price-drift`): `RESTOCK_PER_DAY` units per in-game
    day, capped at the market's seed ceiling. Frozen offline (GDD §6).
- `engine/travel.ts` / shipments — quotes price cargo by destination at the
  single price (`getMarketPrice(...).price`); shipments move YOUR goods and
  never touch market stock.
- `engine/chaos.ts` — price shocks preserve `stock` (item 6's stock shocks are
  Prompt 33).
- `state.ts` — **`SCHEMA_VERSION 11`**; `store/persistence.ts` migration
  10→11: world price boards rebuilt via `hydrateWorldV11`, markets re-seeded
  (factors/stock are transient world state — never holdings, cash, or RNG),
  saved `config.products` swapped for the v11 table, `config.markets` added.
- UI — `dealScreen.model.ts` `ProductRow` carries one `price` + `stock`;
  **`marginPct` deleted** (item 11); `maxBuyQty` clamps to
  min(affordable, capacity, stock). `DealScreen.tsx` renders one number per
  product plus "~N on the street"; `WorldMarketScreen.tsx`/
  `worldMarket.model.ts` board rows carry one `price` (spread finder compares
  price-here vs price-there); session-end hook copy follows.
- `telemetry/simulation.ts` — the scripted dealer no longer flips in place
  (there is no in-place margin): it buys below base (drift factor < 1), sells
  at/above base, and still survives every seed to the horizon.

## Acceptance criteria (all covered by tests)

- [x] Buy-then-sell in place at the same instant is a **wash** (identical
      price, minus heat/bust risk).
- [x] At neutral drift, every product's price at its most distant region
      strictly exceeds its source-region price — for every seed's world
      (geography is the margin engine).
- [x] The plug price is **below every open-market price** for that product,
      for every seed at neutral drift.
- [x] Buying depletes stock; a buy past the shown stock rejects `no-supply`
      without mutation; selling puts a fraction back.
- [x] Restock refills over ACTIVE hours only (offline frozen), capped at the
      seed ceiling; low stock biases drift upward but never past
      `1 ± volatility`.
- [x] `marginPct` is gone from the deal board (item 11); rows render one
      price; the trend arrow stays (price direction, not margin).
- [x] v10 saves migrate: holdings/cash/plugs/RNG intact; boards/markets
      rebuilt deterministically from the save's own seed; config gains the
      `markets` group and the v11 product table.
- [x] Full suite green (`vitest`), `tsc` clean.

## Ethical guardrails honored

- No new gates: stock is a *market* fact shown on the board, never a hidden
  cap; the plug and every market stay money-gated only (Ideas.md).
- Odds shown = odds rolled (bust and interdiction contracts untouched).
- Offline stays frozen/safe: restock and scarcity drift are ACTIVE-only.
- Rejections (`no-supply` included) never mutate state; outcomes carry scene
  keys, never error strings.
