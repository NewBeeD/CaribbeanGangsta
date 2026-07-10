# Prompt 29 — Regional Markets, Product Lines & Plugs (engine)

> **Status: IMPLEMENTED** (Ideas2 application pass). This prompt records the
> contract the implementation honors, so later prompts can depend on it the same
> way they depend on 02–13.

**Depends on:** 02 (world gen), 04 (deal loop), 06 (storage), 16 (territory model).
**Design authority:** `design/11_Regional_Markets_Travel_and_Products.md`; Ideas2.md; the open-access rule (Ideas.md).

## Objective

Replace the three abstract route legs with REAL per-country markets (Ideas2
§2/§3/§5), add the derived-product lines and conversions (§4), the premium
strain line (§5), and the true-source plug system (§2) — all engine-only, pure,
deterministic, and open-access.

## Deliverables (as built)

- `engine/config/countries.ts` — `Region` + `REGION_DISTANCE`; 11-product
  `PRODUCT_PRICE_BANDS`; 9-country roster (4 Caribbean start-eligible islands +
  Colombia, Mexico, Miami, Rotterdam, Golden Crescent) with `region`,
  `startEligible`, `risk`, `traded`, `costBias`/`demandBias`, `productBias`,
  `plugFor`/`plugCost`/`plugPriceFactor`; `getCountry`, `findCountry`,
  `isTraded`, `requiresPlug`, `COUNTRY_IDS`, `START_COUNTRIES`.
- `engine/config/products.ts` — per-product `sourceRegion` + elasticities for
  the full roster; `EXOTIC_STRAINS` pool.
- `engine/config/conversions.ts` + `engine/conversions.ts` —
  `convert(state, { type: 'convert', recipe, batches, stashId? })`,
  `maxBatches(recipeId, stash)`; recipes `cook-crack`, `press-hash`.
- `engine/plugs.ts` — `buyPlug(state, countryId)`, `hasPlug`, `plugQuote(s)`,
  `PLUG_MEETING_HEAT`; intent `{ type: 'buyPlug', countryId }`.
- `engine/world.ts` — start pick from `START_COUNTRIES`; global source board;
  supplier geography with `demandFactor`; `exoticStrain`;
  `basePriceAt(world, product, countryId)`; `productDisplayName`;
  `hydrateLegacyWorld` (v7→v8).
- `engine/deals.ts` — `Markets` keyed by countryId; `getMarketPrice(state,
  product, countryId)`; deals execute at the target stash's country; reject
  reasons `not-traded` / `no-plug`; `computeBustProbability(state, product,
  qty, countryId)` uses country `risk`.
- `state.ts` — `SCHEMA_VERSION 8`, `plugs: readonly string[]`, intents wired.
- `store/persistence.ts` — migration 7→8 (holdings/RNG preserved; world grown
  deterministically from the save's seed; markets re-keyed; plugs `[]`).
- UI kept compiling: Deal screen deals at the home stash's country with
  availability-filtered rows; corruption shipment value falls back to the board
  for un-traded products. (Full surfacing is Prompt 31.)

## Acceptance criteria (all covered by tests)

- [x] Cocaine sell widens Colombia → islands → Miami; the margin widens with it.
- [x] The plug contract price is the cheapest standing buy and never drifts.
- [x] Buying a `plugFor` product at a source without the plug rejects
      (`no-plug`) without mutation; with the plug it lands at the shown price.
- [x] Products with no local market reject (`not-traded`); meth/fentanyl/
      pills/heroin never trade on a Caribbean island.
- [x] Prices are computable/visible for EVERY country (no concealed markets).
- [x] Conversions are deterministic, consume input + batch cost + add heat, and
      are value-adding on average (per-day market reading decides the rest).
- [x] `buyPlug` is a pure money gate: quoted from minute one, clean-cash cost,
      shown heat; rejects unknown/repeat/unfunded without mutation.
- [x] Starting country is always start-eligible; `exoticStrain` comes from the
      pool and varies across runs.
- [x] v7 saves migrate: holdings/cash/RNG intact, deterministic world growth,
      empty `plugs`, country-keyed markets.
- [x] Full suite green (`vitest`), `tsc` clean.

## Ethical guardrails honored

- No time locks or progression flags — the plug and every market are money-gated only.
- Odds shown = odds rolled (bust % inputs changed, contract unchanged).
- Offline stays frozen/safe (drift/chaos remain active-only; nothing new runs offline).
- Failure stays a scene key, never an error toast.
