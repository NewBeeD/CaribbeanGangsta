# 11 — Regional Markets, Plugs, Travel & Product Lines

**Source:** `Ideas2.md`, reconciled with the open-access rule (`Ideas.md`, design/01 §0)
**Status:** §1, §2, §4, §5 implemented (Prompt 29). §3 travel/couriers implemented (Prompt 30 — `engine/travel.ts`, `config/transport.ts`, schema v9). UI surfaced (Prompt 31 — World Market screen, deal-screen market switcher & conversions, shipment desk on the Empire map).

This doc turns the five Ideas2 notes into mechanics that keep the three
non-negotiables intact: **open access** (money is the only gate — never a time
lock or progression flag), the **fairness law** (odds shown = odds rolled), and
**offline is frozen/safe**.

---

## 0. The five ideas → the model

| Ideas2 | Mechanic | Where |
| --- | --- | --- |
| §2/§5 See prices everywhere; regional drug cultures | Every **country is a market**; per-country `traded` lists; prices visible for ALL countries always | `config/countries.ts`, `world.basePriceAt`, `deals.getMarketPrice` |
| §2 The plug / true source | `plugFor` countries (Colombia, Mexico, Rotterdam, Golden Crescent); one-time cash intro; fixed cheapest contract price | `plugs.ts` |
| §4 Convert coke→crack, weed→hash | Batch conversion recipes at a stash | `conversions.ts`, `config/conversions.ts` |
| §5 Premium weed, random on the market | `exotic` product line; per-run strain name drawn in world gen | `world.exoticStrain`, `EXOTIC_STRAINS` |
| §1/§3 Go-fast boats, ferry, plane; couriers & escorts | Transport modes + shipments + consignments | **Prompt 30** (spec in §3 below) |

## 1. Geography is the margin engine

The old model priced three abstract route legs. Now the legs are real places:

- **Regions:** `caribbean`, `latin-america`, `north-america`, `europe`, `asia`,
  with a symmetric `REGION_DISTANCE` table (0..1).
- **One global source board per product** (resolved in-band per run, unchanged
  bands for the original four) + per-country projection:

  `buy = board.buy × (1 + dist × buyElasticity) × costFactor × productBias`
  `sell = board.sell × (1 + dist × sellElasticity) × demandFactor × productBias`

  where `dist` runs from the **product's source region** (cocaine: latin-america,
  heroin/hash: asia, synthetics: europe, pills/arms: north-america, weed/exotic:
  caribbean) to the country's region. Cocaine keeps `sellElasticity 2.0` — the
  margin engine: Colombia ≈ board, the islands ≈ ×1.5, Miami ≈ ×1.8 × demand
  1.3–1.6, Rotterdam ≈ ×2.7 × demand 1.25–1.5.
- `costFactor`/`demandFactor` resolve per run from per-country bias bands
  (supplier geography), so WHERE is cheap/hungry varies run to run — the
  transferable skill is reading the board.
- **Bust risk input:** the abstract leg risk became per-country `risk`
  (Marigot 0.15 … Miami 0.55). Same clamp, same fairness law.
- A deal executes at the **target stash's country** — a foothold is presence
  (Prompt 16's territory model). Prices for every country are always visible;
  only *execution* is bounded by `traded` and the plug.

## 2. The plug (open-access reconciliation)

Ideas2 says the source connection "could be unlocked after a certain time".
A time/progression gate would break the tested open-access guardrail, so the
plug is a **pure money gate** that produces the same arc:

- Colombia (cocaine, $220k, ×0.55), Mexico (cocaine/meth/fentanyl, $300k,
  ×0.65), Rotterdam (synthetics, $150k, ×0.60), Golden Crescent (heroin/hash,
  $180k, ×0.55).
- The quote is visible and buyable from minute one; a fresh run simply can't
  afford it yet. "Not from the get-go" is an economic truth, not a lock.
- The contract buy price (`board.buy × plugPriceFactor`) is the cheapest
  *standing* price in the game and does **not** drift — readable, dependable.
  (A once-in-a-while street glut can dip below it; that's market reading, and
  the cartel list price holding steady is the realistic behavior.)
- Buying `plugFor` products at a source without the plug rejects (`no-plug`);
  selling and all non-source products there are open. The intro costs clean
  cash (same capital pool as footholds) and a small **shown** heat hit.

## 3. Travel, transports & couriers (Prompt 30 spec)

Moving product between stashes becomes a priced, risky decision (today
`storage.moveProduct` is instant/free):

- **Modes (config):** `go-fast` (fast, big cargo, high interdiction, the boat's
  owner takes a % of the cargo's value — Ideas2 §1/§3), `ferry` (cheap, slow,
  small cargo, low profile), `plane` (expensive, fastest, moderate risk, small
  cargo). All available from minute one; cash is the gate.
- **Shipment:** displayed interdiction % (fairness law: exactly the rolled
  number), scales with cargo heat, mode, route distance, port protection and
  paid ports (design/09). A loss is a scene + heat spike, never a wipe of other
  stashes.
- **Go yourself vs send someone** (Ideas2 §1): solo = travel cost + you carry
  the bust risk personally (heat on failure). **Consignment** = assign crew as
  courier/seller for a % cut; each extra escort lowers the displayed risk and
  raises the cut. Courier loyalty matters — a low-loyalty courier can skim or
  flip (routes through the crew memory/betrayal spine, design/02; telegraphed,
  never a hidden roll).
- **Offline-safe:** shipments resolve on ONLINE ticks only; nothing is seized
  while away.

## 4. Conversions (implemented)

`cook-crack`: 10 cocaine + $400 → 40 crack (+2 heat) — 1 key of coke cooks
into 4 crack units, each priced/heated at roughly a quarter of a coke unit.
`press-hash`: 10 weed + $150 → 2 hash (+0.5 heat). Deterministic, no roll —
the risk lives downstream in selling a hotter product (a cooked key carries
~1.4 heat sold as crack vs 1.0 sold raw). Value-add
holds **on average**; on a given day the crack market can be soft — check the
board before you cook.

## 5. The product roster & regional cultures (implemented)

11 products: weed, **exotic** (per-run strain name), **hash**, synthetics,
cocaine, **crack**, **meth**, **heroin**, **fentanyl**, **pills**, arms.

- **Caribbean islands** trade: weed, exotic, hash, synthetics, cocaine, crack,
  arms. **No meth, fentanyl, pills, or heroin on the islands** (Ideas2 §5).
- **Miami** trades everything (the demand sink, hottest streets).
- **Mexico** meth/fentanyl/heroin + coke; **Colombia** coke + weed;
  **Rotterdam** hash/synthetics/pills/heroin/coke; **Golden Crescent**
  heroin/hash/arms.
- Bands are v1 hypotheses (Prompt 26 tunes): crack $8–22.5k/unit sell (4 units per
  key of coke — above coke per key, more heat), fentanyl $40–120k (heat/unit 2.0 — the hottest drug),
  meth $8–25k from an $0.8–2k Mexican buy, heroin $25–70k, pills $8–20k,
  hash $6–14k, exotic $6–14k.

## 6. Save migration

Schema v8. Old saves keep everything they resolved (holdings, cash, RNG
stream, original four boards); the world deterministically grows the new
boards/suppliers/strain from the save's own seed; `plugs` starts empty; markets
re-key to countries with only transient drift factors reset.
