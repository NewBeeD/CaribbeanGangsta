# Tuning worksheet (Prompt 26)

Every balance number in the game is a **v1 hypothesis** (design/01 preamble) held in
one typed surface: `GameConfig` in `src/engine/config/index.ts`, composed from the
per-system modules under `src/engine/config/`. Nothing in system logic hard-codes a
balance literal — the engine reads its numbers from `state.config`, injected at
`createInitialState(seed, config)` (default `DEFAULT_GAME_CONFIG`).

## How to run an alternate tuning (no code changes)

```ts
import { tunedConfig, createInitialState } from '@/engine';
import { runBatchSim } from '@/telemetry/simulation';

const gentler = tunedConfig({ deals: { BUST_MAX: 0.45 } });

// A single run…
const state = createInitialState('some-seed', gentler);

// …or the headless batch playtest (Prompt 25) over the same seeds as v1:
const report = runBatchSim([1, 2, 3 /* … */], { config: gentler });
```

- The same seed under the same config is byte-identical (determinism holds).
- The config is plain data saved **on the run** (`GameState.config`, schema v10), so
  a loaded save resumes under the exact numbers it was played with; pre-v10 saves
  migrate onto the v1 default.
- `TUNE_FIRST` (exported from `@/engine`) is this table in code — each knob with its
  config paths, design source, and driving telemetry signal.

## Tune-first knobs (design/01 §8, in priority order)

| # | Knob | Config path(s) | v1 value | Design source | Telemetry signal that should drive it |
|---|------|----------------|----------|---------------|----------------------------------------|
| 1 | First-session length budget | `onboarding.SESSION_TARGET_MIN/MAX_MINUTES`, `onboarding.MINUTE_BUDGET` | 10–20 min; sale by 2, scare by 8, front by 15 | design/01 §6, §9; GDD §9 | first-session length distribution vs. D1 retention (the §9 hypothesis) |
| 2 | Offline cap × front rate | `fronts.OFFLINE_SOFT_CAP_HOURS`, `fronts.OFFLINE_REDUCED_RATE`, `fronts.FRONT_TYPES[].ratePerLevel` | 12 h full rate, then 25%; bar 120/nightclub 450/resort 1600/crypto 900 $/h/level | design/01 §3, §3a | return-session frequency; "rewarding without feeling mandatory" survey |
| 3 | Bust-probability clamp | `deals.BUST_MIN`, `deals.BUST_MAX` (weights: `deals.BUST_*_WEIGHT`) | 3%–60% | design/01 §2 | perceived-fairness survey vs. realized bust rate (odds shown are odds rolled) |
| 4 | Upgrade cost multiplier | `fronts.FRONT_COST_GROWTH`, `stashes.STASH_COST_GROWTH` | 1.15 | design/01 §3, §0.4 | time-to-next-affordable-step — "always a next step" |
| 5 | **Death-spiral rate & fairness** (v1.1 top priority) | `prestige.SPIRAL_HEAT_UNMANAGED/HUNTED`, `prestige.SPIRAL_RIVAL_HUNTED`, `stashes.WIPE_CAPITAL_THRESHOLD` | 70 / 90 / 70 / $100 | design/01 §4a; GDD §15 | % runs ending in the spiral; "earned & readable vs. cheap dice death" survey |
| 6 | Run-length distribution | emergent — chiefly `heat.HEAT_DECAY_RATE_PER_HOUR`, `heat.RAID_BASE_RATE_PER_HOUR` | 5%/h; local .001 / dea .006 / cia .02 per h | design/01 §8.6 | median time-to-death from the batch sim (`runBatchSim().medianDays`) |
| 7 | Randomization variety bounds | `world.VOLATILITY_RANGE`, `world.SUPPLIER_HEAT_FACTOR_RANGE`, `world.RIVAL_COUNT` | 0.20–0.50; 0.8–1.5; 2–4 rivals | design/01 §0a | dead-on-arrival seed count (`runBatchSim().deadOnArrival`, target ~0) vs. run variety |
| 8 | Lifeline reach | `lenders.LIFELINE_CAPITAL_THRESHOLD`, `lenders.LIFELINE_MIN_REPUTATION`, `lenders.LIFELINE_OFFER_FRACTION` | $100 / 15 street rep / 50% of the line | design/10 §1 | of players who hit a wipe: % offered + taking a lifeline who recover vs. die |

## The rest of the surface (by group)

Each per-system module documents every value's design citation inline — the config
file **is** the annotation. Summary of what lives where:

| Group | Module | What's in it |
|-------|--------|--------------|
| `world` | `config/world.ts` | volatility band, supplier heat band + cheap/hot thresholds, rival count |
| `products` | `config/products.ts` | the product table: price bands, heat/unit, tier risk, distance elasticities |
| `deals` | `config/deals.ts` | bust clamp + model weights, buy-heat factor |
| `heat` | `config/heat.ts` | tier thresholds, decay, lie-low, bribe rates, raid rates, telegraph margins |
| `stashes` | `config/stashes.ts` | stash archetypes (capacity/seizure/cost/delay), cost growth, guard penalties, wipe threshold |
| `fronts` | `config/fronts.ts` | front roster (rates/buy-ins/heat), offline curve, peso haircut, golden hours, crypto swing |
| `crew` | `config/crew.ts` | loyalty event bases + trait fit, betrayal thresholds, wire heat, training |
| `corruption` | `config/corruption.ts` | port-bribe formula terms, paid-port floor/duration, haggle odds, retainer/raise loyalty |
| `lenders` | `config/lenders.ts` | lender roster (rates/caps/ceilings), borrow-cap scaling, ladder, lifeline, rep bonuses |
| `events` | `config/events.ts` | chaos rate + per-tick cap; narrative-beat thresholds (on-the-map, crown, plateau spacing) |
| `prestige` | `config/prestige.ts` | empire-composite weights, death-spiral thresholds |
| `transport` | `config/transport.ts` | transport roster, interdiction clamp + weights, courier cuts/skim/escorts |
| `conversions` | `config/conversions.ts` | cook/press recipes (batch sizes, costs, heat) |
| `plugs` | `config/plugs.ts` | plug meeting heat (per-source intro costs live on the country roster) |
| `onboarding` | `config/onboarding.ts` | first-session minute budget, instruction word cap, loss sequencing |

**Content, not knobs** (deliberately outside `GameConfig`): the country roster and
its price bands / plug costs (`config/countries.ts` — world geography), officials,
crew archetypes, chaos event table, rival archetypes, prestige unlocks, story cards,
and starting scenarios (`config/scenarios.ts` — data-only, non-power by construction).

**Not tunable, ever** (GDD §8/§15; Prompt 26 guardrail): the ethical laws — offline
only ever adds (`settleOffline`'s asserted guardrails), shown odds are rolled odds
(the fairness law), escalations telegraph before they land, betrayal is never a
hidden roll. These are enforced in code and tests, not numbers in this file. Tuning
is driven by the falsifiable Prompt 25 metrics — never by engagement maximization.
