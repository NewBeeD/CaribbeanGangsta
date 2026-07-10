# Prompt 30 — Travel, Transports & Couriers (engine)

**Depends on:** 29 (regional markets & plugs), 06 (storage/moveProduct), 08 (crew), 09 (paid ports).
**Design authority:** `design/11_Regional_Markets_Travel_and_Products.md` §3; Ideas2.md §1/§3; the open-access rule (Ideas.md); the fairness law (design/01 §0.3); offline-frozen (GDD §6).

## Objective

Make moving product between countries a PRICED, RISKY, READABLE decision
(Ideas2 §1/§3): pick a transport (go-fast boat / ferry / plane), pay its cost,
see the exact interdiction odds before committing, and choose between carrying
it yourself or consigning it to crew for a cut — with extra escorts buying
security. This supersedes the free/instant `storage.moveProduct` path for
cross-country moves (same-country moves stay instant).

## Deliverables

1. **`engine/config/transport.ts`** — the mode table (config, not literals):

```ts
export type TransportId = 'go-fast' | 'ferry' | 'plane';
export interface TransportConfig {
  readonly id: TransportId;
  readonly name: string;
  /** $ cost per unit of REGION_DISTANCE for the leg. */
  readonly costPerDistance: number;
  /** Max units carried per shipment. */
  readonly cargoCap: number;
  /** In-game hours per unit of distance (shipments resolve on ONLINE ticks). */
  readonly hoursPerDistance: number;
  /** Baseline interdiction exposure 0..1 — one input to the displayed odds. */
  readonly baseRisk: number;
  /** Fraction of the cargo's sell VALUE owed to the boat's owner (go-fast only, Ideas2 §1). */
  readonly ownerCutPct?: number;
}
```

   v1 hypotheses: `go-fast` (cheap-ish, cargo 400, fast, baseRisk high,
   ownerCutPct ~0.10), `ferry` (cheapest, cargo 60, slow, baseRisk low),
   `plane` (dear, cargo 100, fastest, baseRisk mid). All buyable from minute
   one — cash is the gate.

2. **`engine/travel.ts`** — the shipment engine:

```ts
export interface ShipIntent {
  readonly type: 'ship';
  readonly product: ProductId; readonly qty: number;
  readonly fromStashId: string; readonly toStashId: string;
  readonly mode: TransportId;
  /** Crew consignment (Ideas2 §1): who rides along / sells on arrival. */
  readonly courierIds?: readonly string[];
}
export function interdictionChance(state, intent): number; // THE number rolled
export function quoteShipment(state, intent): ShipmentQuote; // cost, cut, eta, odds
export function ship(state, intent): ShipResult;             // validate & launch
export function travelStep(state, dtHours): GameState;       // ONLINE tick: arrivals
```

   - `interdictionChance` = f(mode.baseRisk, REGION_DISTANCE leg, cargo heat
     (`heatPerUnit × qty`), destination country risk, port protection, paid
     ports (design/09 A.3), escorts). Clamped like the bust window; the quote
     shows exactly this number (fairness law).
   - **Solo vs consigned** (Ideas2 §1): no couriers = you make the run —
     no cut, but an interdiction lands the bust heat on YOU (spike + scene).
     Couriers = each takes a % of the cargo's sell value; each ADDITIONAL
     escort reduces the displayed odds (added security) and adds their cut.
   - Courier loyalty routes through the crew spine (design/02): a low-loyalty
     courier's possible skim/flip is a TELEGRAPHED arc, never a hidden roll.
   - In-flight cargo lives on a `shipments` list on state (schema bump + save
     migration); a loss seizes only that cargo and enqueues a scene.
   - **Offline-frozen:** `travelStep` is registered ACTIVE-only. Shipments
     never resolve, arrive, or get seized while away.

3. **`state.ts`** — `shipments: readonly Shipment[]`, `ship` intent wired,
   schema v9 + migration (empty list).

## Acceptance criteria

- [ ] Odds shown by `quoteShipment` are byte-identical to the number
      `travelStep` rolls against (Monte Carlo test like the deal loop's).
- [ ] Go-fast owner's cut + courier cuts are charged exactly as quoted.
- [ ] Each added escort strictly lowers the displayed odds; totals stay clamped.
- [ ] Rejections (`invalid-qty`, unknown stash, over cargo cap, cross-country
      without funds, courier not idle) never mutate state.
- [ ] Same-country `moveProduct` still instant/free; cross-country moves route
      through shipments only.
- [ ] Offline: a save with an in-flight shipment settles nothing while away.
- [ ] Determinism: same seed + same intents → identical state. Suite green.

## Ethical guardrails

- No punishment for absence: in-flight cargo is frozen, never lost offline.
- Every probability surfaced is the exact number rolled.
- All modes available from the start — money is the only gate.
- A seized shipment renders as a scene (design/05 §4), and it is recoverable —
  it can never wipe stashes it didn't carry.
