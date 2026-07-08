# Prompt 05 — Heat & law enforcement + raids

**Phase:** 1 — Simulation core
**Depends on:** 03, 04
**Design refs:** `design/01` §4 (heat curve, tiers, raids); `design/07` §5 (Heat wireframe);
GDD §4.5 (escalating heat), §5.4 (estimable uncertainty)

## Goal
Implement heat as the tension/estimable-uncertainty system: it accrues from risky
actions, **decays over time**, escalates the LE tier across telegraphed thresholds, and
periodically triggers **raids** on stash locations. A single raid is survivable; being
wiped is not (that path is owned by Prompt 11).

## Build
- `src/engine/config/heat.ts` — tier thresholds Local(0–30)/DEA(30–60)/CIA-Interpol
  (60–100) on a 0–100 scale (note: product `heatPerUnit` in design/01 §2 is on a 0–1
  scale — pick one internal scale and document the conversion), decay rate (~5%/hr),
  lie-low multiplier, raid base rates.
- `src/engine/heat.ts`
  - `addHeat(state, amount, source): GameState` and `decayHeat(state, dtHours)`
    (registered into `clock.tick`; decays faster when lying low, slower at higher empire
    size — design/01 §4).
  - `currentTier(state): LeTier` and `tierDots(state): {filled:number,total:number}`.
  - `checkTierEscalation(state): { crossed:boolean; newTier:LeTier; beatKey?:string }`
    — crossing a threshold is a **telegraphed** event that fires a narrative beat /
    session-end hook (design/07 §5: "a task force just opened a file on you").
  - `rollRaid(state, rng): RaidEvent | null` — probability scales with heat & size;
    selects a **single** location to hit (raid resolution itself lives in Prompt 06's
    `storage.ts` — heat.ts decides *whether/where* a raid triggers and hands off).
  - `LieLowIntent` / `reduceHeatByBribe` hooks (bribe amount → heat reduction; the
    bribe economy proper is Prompt 09).
- Register heat decay + raid roll into `clock.tick` in the documented order.

## Acceptance criteria (vitest)
- Heat decays deterministically at the configured rate; lying low decays faster and
  slows income (a flag the laundering engine can read).
- Tier boundaries classify correctly; crossing a threshold returns `crossed:true` with
  a beat key exactly once per crossing (telegraphed, not silent).
- Raids target **exactly one** location; raid frequency rises with heat & empire size;
  determinism holds under a fixed seed.
- Raids never fire during `settleOffline` (offline is safe). (GDD §6)

## Guardrails
- Heat is a **tension meter, not a currency you spend** (design/01 §1) — model it as a
  scalar with decay, not a wallet.
- Every escalation is **telegraphed before it lands** (design/07 §5). No surprise CIA.
- **Sequence bad outcomes after rewards** — expose enough state for onboarding/beats to
  hold the first heat scare as a guaranteed survival. (design/04 §2, Sid Meier)
