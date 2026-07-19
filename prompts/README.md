# Build Prompts — Caribbean Gangsta (MVP → full vertical slice)

This folder is the **complete, ordered set of build prompts** for implementing the
game described in `CaribbeanGangsta_GDD.md` and the `design/` companion docs. Each
numbered file is a **self-contained prompt** you hand to a coding agent (or do
yourself) one at a time, in order. Every prompt references the design docs as the
source of truth, states concrete deliverables with file paths and TypeScript
signatures, and ends with **acceptance criteria** and the **ethical guardrails** that
apply.

> Design authority: the `design/` docs and the GDD win any conflict. Numbers in the
> economy doc (`design/01`) are **v1 hypotheses** — implement them as tunable config
> (see Prompt 26), never as hard-coded literals scattered through the sim.

## How to use

1. Do the prompts **in order**. Each declares its `Depends on`.
2. Treat each prompt's **Acceptance criteria** as a definition-of-done gate before
   moving on. Most sim prompts require passing `vitest` tests.
3. The **simulation core is headless and pure** — no DOM, no React, no `Date.now()`
   inside logic (time is injected). This is what makes the game unit-testable and the
   randomness auditable. UI prompts (14+) only render state and dispatch intents.
4. Keep the existing `prototype/` as reference for feel/visual direction; the real
   build lives in `app/`. Do not edit `prototype/`.

## Target architecture (the contract every prompt honors)

```
app/
  package.json            vite + react + typescript + zustand + vitest
  src/
    engine/               PURE simulation — no DOM, no React, deterministic
      rng.ts              seeded PRNG (mulberry32/xoshiro); all randomness routes here
      world.ts            per-run world generation (design/01 §0a)
      state.ts            GameState type + reducers; single source of run truth
      clock.ts            tick(state, dtHours) — advances sim by injected time
      deals.ts            price/volatility/bust-odds/deal resolution (design/01 §2)
      heat.ts             heat curve, LE tiers, raids (design/01 §4)
      storage.ts          stashes, dirty-cash locations, raid resolution (design/09 A)
      laundering.ts       fronts + offline accrual + golden hours (design/01 §3)
      crew.ts             NPC model, loyalty, memory, betrayal arcs (design/02)
      corruption.ts       port bribes + standing payroll + flips (design/09 B)
      debt.ts             loan sharks, interest (freeze-offline), default ladder (design/10)
      endgame.ts          death spiral, permadeath, high score, prestige (design/01 §4a,§7)
      chaos.ts            procedural events (design/01 §4.7, design/05)
      beats.ts            state -> narrative-beat trigger engine (design/05)
      cards/              story-card schema + content (design/08)
      config/             all tunable numbers (design/01) — one place to balance
      index.ts            public engine API (intents in, new state out)
    store/                Zustand store bridging engine <-> React; save/load
      gameStore.ts
      persistence.ts      SaveStore interface + LocalSaveStore (IndexedDB) + CloudSaveStore stub
      leaderboard.ts      Leaderboard interface + LocalLeaderboard + RemoteLeaderboard stub
    ui/                   React — renders state, dispatches intents ONLY
      shell/ screens/ components/ theme/
    telemetry/            event bus + funnel counters (design/06)
    main.tsx
  tests/                  vitest specs for engine/*
```

### Non-negotiable engineering rules (repeat in every code prompt)

- **Determinism:** given the same seed and the same ordered intents, the engine
  produces byte-identical state. All randomness goes through `engine/rng.ts`. No
  `Math.random`, no `Date.now()` inside `engine/`.
- **Purity:** `engine/` never imports React, the DOM, or the store. Intents in →
  new immutable state out. This is what the tests exercise.
- **Time is injected:** the sim advances only via `tick(state, dtHours)` and explicit
  intents. The store computes elapsed real time (for offline accrual) and feeds it in.
- **Odds shown = odds rolled (fairness law):** any probability surfaced to the player
  (bust %, seizure %, flip risk) is the exact value passed to the RNG. Tests assert
  this. (design/01 §0.3, GDD §8)
- **Config, not literals:** every balance number lives in `engine/config/` (Prompt 26).

## The ethical guardrails (apply to every prompt; GDD §8)

Copy this checklist into any PR touching player-facing loops:

- [ ] No punishment for real-world absence. Offline is frozen/safe; it never advances
      heat, debt, the death spiral, or seizes anything. (GDD §6; design/10 §4.2)
- [ ] No loot boxes / gacha / paid rerolls / pay-to-win. Monetization = cosmetics &
      acceleration only. (GDD §8; design/03)
- [ ] Timed content is **bonus-only** — missing it costs a bonus you never had.
- [ ] Streaks (if any) are "welcome back," never losable.
- [ ] Randomness is **estimable-but-fair**: real odds always shown before commit.
- [ ] Permadeath is **consensual, in-game, telegraphed** — never a hidden roll, never
      from absence. Every death-spiral rung is readable before you enter it. (design/01 §4a)
- [ ] Failure renders as a **scene**, not an error toast. (design/07, design/05 §4)

## Build order

**Phase 0 — Foundation**
- `00_project_scaffold.md`
- `01_design_system.md`

**Phase 1 — Simulation core (headless, tested)**
- `02_rng_and_world_generation.md`
- `03_state_clock_and_persistence.md`
- `04_deal_loop_engine.md`
- `05_heat_and_law_enforcement.md`
- `06_contraband_storage.md`
- `07_laundering_idle_engine.md`
- `08_crew_relatedness_engine.md`
- `09_corruption_network.md`
- `10_debt_and_loan_sharks.md`
- `11_endgame_deathspiral_highscore.md`
- `12_chaos_engine_and_beats.md`
- `13_story_card_system_and_content.md`

**Phase 2 — UI (render state, dispatch intents)**
- `14_app_shell_and_progressive_disclosure.md`
- `15_deal_screen.md`
- `16_empire_map_screen.md`
- `17_crew_screen.md`
- `18_money_laundering_screen.md`
- `19_heat_threats_screen.md`
- `20_storage_and_corruption_ui.md`
- `21_debt_loanshark_ui.md`
- `22_story_card_presenter_and_session_end.md`
- `23_highscore_runend_and_leaderboard.md`

**Phase 3 — Onboarding, telemetry, tuning, ship**
- `24_first_session_onboarding.md`
- `25_telemetry_and_playtest_harness.md`
- `26_balancing_config_and_tuning.md`
- `27_pwa_notifications_accessibility.md`
- `28_integration_and_acceptance_pass.md`

**Phase 4 — World expansion (Ideas2.md; design/11)**
- `29_regional_markets_products_and_plugs.md` ✅ implemented (per-country
  markets, 11-product roster, conversions, plugs, exotic strains, schema v8)
- `30_travel_transport_and_couriers.md` ✅ implemented (go-fast/ferry/plane
  shipments, courier consignments & escorts, schema v9)
- `31_world_market_and_travel_ui.md` ✅ implemented (World Market screen,
  deal-screen market switcher & kitchen, shipment desk on the Empire map)

**Phase 5 — Deployment: cloud, web launch & mobile apps (design/14)**
- `51_supabase_auth_and_client.md` — Supabase project, anonymous-first auth
  (optional email upgrade), null-client offline guarantee
- `52_cloud_saves_and_meta_sync.md` — implement `CloudSaveStore` +
  `CloudMetaProgressStore`; debounced push / boot pull / conflict prompt;
  client-owned migrations
- `53_remote_leaderboard.md` — implement `RemoteLeaderboard`; `submit_run`
  Edge Function (dedup, rate limit, bounds); Global | Local boards
- `54_web_deploy_pwa_and_ci.md` — GitHub Actions gate, Vercel deploy, PWA
  manifest + offline shell (implements Prompt 27's PWA subset) — the launch
- `55_capacitor_mobile_shell.md` — committed iOS/Android Capacitor projects;
  `appStateChange` wired into the existing pause/settle path
- `56_store_submission_pass.md` — signing, listings, rating questionnaires
  (see design/14 §11 content-rating risk), Play first then Apple

Each prompt is written to be executed independently given its dependencies are done.
