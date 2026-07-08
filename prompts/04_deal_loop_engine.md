# Prompt 04 — Deal loop engine (Loop 1)

**Phase:** 1 — Simulation core
**Depends on:** 02, 03
**Design refs:** `design/01` §2 & §2a (real-dollar prices, volatility, bust probability);
`design/07` §1 (Deal wireframe); GDD §3 Loop 1, §5.4 (fair odds), §4.1 (dynamic markets)

## Goal
Implement the atomic unit of gameplay: buy low / sell high / dodge heat, with **real
dollar prices**, visible price trends, and a **displayed bust probability that exactly
equals the rolled probability**. Failure returns a *scene*, not an error.

## Build
- `src/engine/config/products.ts` — the product table (design/01 §2): weed, synthetics,
  cocaine, arms — each with source-buy band, sell band(s), margin behavior, `heatPerUnit`,
  and unlock gate. Values as config constants (Prompt 26 will centralize).
- `src/engine/deals.ts`
  - `getMarketPrice(state, product, location): { buy:number; sell:number; trend:'up'|'down'|'flat'; volatility:number }`
    — resolves current price = `base × (1 ± volatility)` drifting live; trend arrow
    derived from last cycle. Cocaine margin **widens with distance from source**
    (source → mid-route → wholesale). (design/01 §2)
  - `driftPrices(state, rng, dtHours): GameState` — the per-tick price walk within the
    market's volatility band; registered into `clock.tick`.
  - `computeBustProbability(state, product, qty, location): number` —
    `f(heat, locationRisk, crewSkill, productTier)` **clamped to [0.03, 0.60]**. This
    exact number is what the UI shows AND what the RNG rolls.
  - `resolveDeal(state, intent: BuyIntent | SellIntent): DealResult` — validates funds/
    inventory/capacity, rolls the bust check via `state` RNG for a sell/move, applies
    cash + inventory + heat changes, and returns a `DealResult` carrying an
    `outcome: 'success' | 'bust'` and a `sceneKey` for the narrative layer (Prompt 13).
    On bust: lose product + staked cash at that location (design/07 §1), spike heat.
- Wire `BuyIntent`/`SellIntent` into `applyIntent` (Prompt 03).

## Interfaces
```ts
export interface DealResult { state: GameState; outcome:'success'|'bust';
  displayedBustProb:number; rolledValue:number; cashDelta:number; sceneKey:string; }
export function computeBustProbability(state:GameState, product:ProductId,
  qty:number, location:LocationId): number;   // == the number shown to the player
export function resolveDeal(state:GameState, intent:DealIntent): DealResult;
```

## Acceptance criteria (vitest)
- **Fairness law (critical):** over N=100k simulated sells at a displayed prob `p`,
  observed bust frequency ≈ `p` within tolerance; assert `resolveDeal` rolls against
  exactly `displayedBustProb`. (design/01 §0.3, GDD §8)
- Bust probability always within `[0.03, 0.60]`.
- Buy-low/sell-high is profitable when read correctly; cocaine margin widens with
  route distance (a source sale < mid-route < wholesale for the same product).
- A bust removes product + staked cash **only at the deal's location** and raises heat.
- Insufficient funds / inventory / storage capacity are rejected without mutating state.
- Determinism: same seed + same intent sequence → identical results.

## Guardrails
- Odds shown = odds rolled — no hidden modifier applied after the number is displayed.
- **Loss sequencing:** the engine exposes whether "some wins have been banked this
  session" so onboarding (Prompt 24) can keep the first deals guaranteed-survivable and
  real bust risk starts only after competence is established. (design/01 §2, Sid Meier)
- Prices are the **real-dollar table** (design/01 §2), not scaled units.
