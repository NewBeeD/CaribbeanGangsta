# Prompt 03 — Core game state, clock/tick & persistence

**Phase:** 1 — Simulation core
**Depends on:** 02
**Design refs:** `design/01` §1 (currencies), §3 (offline), §7 (high score persists);
GDD §6 (offline is safe/frozen); `prompts/README.md` (persistence interfaces, local-first)

## Goal
Define the single `GameState` shape that is the truth of a run, the injected-time
`tick` that advances the sim, and the save/load layer (local-first, cloud stubbed).
Time is **injected**, never read from the clock inside the engine — this is what keeps
the sim deterministic and lets offline accrual be computed by the store and fed in.

## Build
- `src/engine/state.ts`
  - `GameState` — includes at least: `seed`, `rngState`, `world`, `clock` (in-game
    day/week + accumulated in-game hours), currencies (`dirtyCash` is **located**, see
    Prompt 06; `cleanCash`), reputation `{ street, business, political }`, `heat`,
    `inventory` (by product), `stashes`, `fronts`, `crew`, `corruption`, `debt`,
    `rivals`, `flags` (progression/onboarding gates), `beatsFired`, `pendingChoices`
    (the return-hook queue), `highScore` (peak trackers), `runStatus`
    (`'active' | 'dead' | 'prison' | 'retired'`).
  - `createInitialState(seed): GameState` — builds from `generateWorld`.
  - Reducer entry point: `applyIntent(state, intent): GameState` — pure, immutable,
    returns new state. (Individual intent handlers are added by later prompts; this
    prompt defines the dispatch skeleton + `Intent` union stub.)
- `src/engine/clock.ts`
  - `tick(state, dtHours): GameState` — advances in-game time by `dtHours` and runs
    time-based systems in a defined order (heat decay, laundering accrual, debt
    interest **only when active**, chaos rolls, beat checks). Later prompts register
    their per-tick step here via small pure functions.
  - Distinguish **active ticks** (player online) from **offline settlement** (Prompt
    07): debt interest and any spiral progression must **not** advance on offline
    settlement. Expose `settleOffline(state, realHoursAway): GameState`.
- `src/store/persistence.ts`
  - `interface SaveStore { save(slot,state): Promise<void>; load(slot): Promise<GameState|null>; list(): Promise<SlotMeta[]>; delete(slot): Promise<void>; }`
  - `LocalSaveStore` — IndexedDB implementation (versioned; include a `schemaVersion`
    and a migration hook). Serialize `rngState` so randomness resumes exactly.
  - `CloudSaveStore` — stub conforming to the interface (throws `NotImplemented` or
    no-ops), so cloud sync can drop in later without touching callers.
- `src/store/gameStore.ts` (thin for now) — Zustand store holding current `GameState`,
  a `dispatch(intent)` that calls `applyIntent`, `tickBy(dtHours)`, and
  `hydrate()/persist()` using `SaveStore`. Records `lastPlayedRealTime` so the store
  can compute `realHoursAway` for `settleOffline` on next load.

## Acceptance criteria (vitest)
- `createInitialState(seed)` is deterministic and round-trips through
  `LocalSaveStore` (mock IndexedDB) to a deep-equal state, **including RNG state** (a
  post-load deal roll matches the pre-save roll).
- `tick` advances the in-game clock correctly; `settleOffline(state, N)` **never**
  increases `debt` owed and **never** changes `runStatus` to dead/prison. (GDD §6;
  design/10 §4.2)
- Schema version + migration hook present; loading an older stub migrates or rejects
  cleanly.

## Guardrails
- **Offline is frozen/safe**: `settleOffline` may only *add* clean cash and *queue*
  choices/events — never seize, never kill, never advance debt or the spiral.
- High score persists past run end (design/01 §7) — put it in a place `endgame.ts`
  (Prompt 11) can bank to on death without touching the run's active state.
