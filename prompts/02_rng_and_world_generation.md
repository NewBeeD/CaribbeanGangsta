# Prompt 02 — Seeded RNG & per-run world generation

**Phase:** 1 — Simulation core
**Depends on:** 00
**Design refs:** `design/01_Economy_and_Balancing.md` §0a (per-run randomization) & §2/§2a
(price bands); GDD §5.4 (random world, not a slot machine), §4.4 (rival archetypes)

## Goal
Build the deterministic randomness foundation and the run "seed": a function that,
given a seed, generates a fully-specified, **playable and readable** world — starting
country, price boards, rival roster, event timing, supplier geography — within
believable bounds. This is what makes each run different while keeping mastery
transferable. (design/01 §0a)

## Build
- `src/engine/rng.ts`
  - `createRng(seed: number | string): Rng` — a seeded PRNG (mulberry32 or xoshiro128).
  - `Rng` interface: `next(): number` (0–1), `int(min, max)`, `float(min, max)`,
    `pick<T>(arr): T`, `weighted<T>(entries): T`, `chance(p): boolean`, `fork(label): Rng`
    (derive an independent sub-stream so, e.g., deal rolls don't desync world gen).
  - Serializable state (`getState()/setState()`) so RNG survives save/load.
  - **This is the only randomness source in `engine/`.** No `Math.random` anywhere.
- `src/engine/config/countries.ts` — the country roster data (a handful for MVP; one
  island chain), each with: id, name, startingCash band, heat baseline, port protection
  baseline, per-product price-band multipliers, opening story hooks.
- `src/engine/config/rivals.ts` — rival archetype pool (the violent bull, the
  politician, the ghost, the tech cartel) with aggression/personality ranges.
- `src/engine/world.ts`
  - `generateWorld(rng: Rng): World` producing:
    - `startingCountry` (with its resolved cash/heat/protection/prices)
    - `priceBoards`: per product a resolved local `base` drawn within its real-world
      band (design/01 §2a) plus a per-market `volatility ∈ [0.20, 0.50]`
    - `rivals`: 2–4 rivals with randomized personality/aggression from the pool
    - `eventSeed`: a sub-seed for the Chaos Engine (Prompt 12) so event timing is
      reproducible
    - `supplierGeography`: which source countries are cheap/hot this run
  - `describeStartingHand(world): StartingHand` — the **shown-to-player** summary (no
    hidden traps: GDD §5.4 requires surfacing the starting hand).
- Export types from `src/engine/index.ts`.

## Interfaces
```ts
export interface Rng { next(): number; int(min:number,max:number):number;
  float(min:number,max:number):number; pick<T>(a:readonly T[]):T;
  weighted<T>(e:readonly [T,number][]):T; chance(p:number):boolean;
  fork(label:string):Rng; getState():unknown; }
export function createRng(seed:number|string):Rng;
export function generateWorld(rng:Rng):World;
```

## Acceptance criteria (vitest)
- **Determinism:** same seed → deep-equal `World`; different seeds → different worlds.
- Every generated price sits **within its documented band** (design/01 §2a); volatility
  in `[0.20,0.50]`.
- Rival count ∈ [2,4]; each has a valid archetype.
- `fork()` streams are independent and reproducible.
- **No dead-on-arrival seeds:** a property test over 1,000 seeds asserts every world is
  playable (positive starting cash, at least one affordable product, reachable first
  sale). (design/01 §8 item 7)

## Guardrails
- Randomize **within realistic ranges** — variety, never unfairness. The world is
  random; the player's read is the skill. (design/01 §0a, GDD §5.4)
- The starting hand must be fully describable to the player — no concealed modifiers.
