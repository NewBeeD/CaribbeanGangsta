# Prompt 06 — Contraband storage (vaults & secret places)

**Phase:** 1 — Simulation core
**Depends on:** 04, 05
**Design refs:** `design/09_Storage_and_Corruption.md` System A (A.1–A.5); `design/01` §4a
(wipe → death spiral); GDD §4.8

## Goal
Make *where you stash product and dirty cash* a life-or-death risk decision.
Diversification is the survival skill: **a raid hits exactly ONE location**, so
spreading inventory caps a single night's loss — while over-concentration lets one raid
wipe you (the entry to the death spiral, owned by Prompt 11).

## Build
- `src/engine/config/stashes.ts` — the stash-type table (design/09 A.3): floor stash,
  buried cache, safehouse vault, container/offshore, decoy — each with capacity,
  seizure %, heat footprint, access speed (travel delay), cost. Container seizure drops
  from 15% → ~3% **if the port is paid** (hook into Prompt 09).
- `src/engine/storage.ts`
  - Model `dirtyCash` as **located** (design/09 A.3a): it lives in stash locations and
    shares that location's seizure %. Large piles require a crew guard (wages; low-loyalty
    guard raises effective seizure % — inside job, ties to Prompt 08).
  - `addStash`, `moveProduct(from,to)` (respects capacity + access-speed travel delay),
    `storeCash`, `capacityRemaining`.
  - `effectiveSeizurePct(state, location): number` — base seizure adjusted by guard
    loyalty and (for ports) whether it's paid. **This is the number shown on the storage
    screen AND rolled on a raid** (fairness law).
  - `resolveRaid(state, raid: RaidEvent, rng): RaidResult` — for the single raided
    location, roll seizure at exactly `effectiveSeizurePct`; on hit, remove product +
    dirty cash **at that location only**; produce a `sceneKey` (never zeroes the whole
    player by itself — but flag if this raid dropped operating capital to ~0 so Prompt 11
    can evaluate the spiral).
  - `diversificationIndex(state): number` — telemetry signal (design/09 telemetry).
- `src/engine/config/stashes.ts` upgrade curve `cost(n)=base×1.15^n` (design/09 A.5).

## Acceptance criteria (vitest)
- A raid affects **exactly one** location; a diversified player loses `< ~40%` of held
  product to any one raid, while an over-concentrated player *can* be wiped (by design).
  (design/09 A.2, telemetry target)
- Displayed seizure % == rolled seizure % (fairness law); property test over many raids.
- Dirty cash is seizable at its location; guard loyalty raises effective seizure %.
- Capacity and access-speed (travel delay) are enforced on moves.
- `resolveRaid` sets a `wipedOperatingCapital` flag when appropriate but does **not**
  itself end the run (that's Prompt 11), and never runs offline.

## Guardrails
- **Anti-wipe on defaults/seizures elsewhere** (debt/corruption) still holds: those
  seize *one* location max. A wipe only happens by the player's own over-concentration
  choice — always readable in advance via the shown seizure %s. (design/09 A.2, §4a)
- Loss renders as a **scene** ("They took the Springtown cache; the floor cash they
  missed."), never a toast. (design/09 A.4)
