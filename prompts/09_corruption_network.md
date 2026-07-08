# Prompt 09 — The corruption network (port bribes & payroll)

**Phase:** 1 — Simulation core
**Depends on:** 05, 06, 08
**Design refs:** `design/09_Storage_and_Corruption.md` System B (B.1–B.3); GDD §4.9;
`design/07` §5

## Goal
Implement the *buy-your-way-to-safety* layer and the main **sink for clean cash**: one-
off **variable port bribes** (a negotiation, not a fixed toll) and **standing payroll**
of police/politicians/judges with deterministic benefits and a **telegraphed flip risk**.

## Build
- `src/engine/config/corruption.ts` — payroll roster (design/09 B.2): beat cop,
  detective/DEA insider, customs chief, local politician, judge — each with weekly cost,
  standing benefit, and a hidden `greed`/`loyalty`. Port-bribe base params (base_bribe
  ~5–20% of shipment value, starts ~8%).
- `src/engine/corruption.ts`
  - **Port bribe** (per shipment): `askingPrice = base_bribe × (1+heat) × (1+rivalPressure)
    × greed × repDiscount`, and the **resulting seizure %** — both **shown before commit**.
    - `quoteBribe(state, port, shipmentValue): { ask:number; resultingSeizurePct:number }`
    - `haggle(state, port, rng): HaggleResult` — a readable gamble (odds shown) that
      lowers the ask or the official refuses *this* run.
    - `payBribe` / `walk` (ship at full risk or reroute). Prices **drift each cycle**
      (bonus to catch, never a punishment to miss).
    - A paid port lowers container-stash seizure to ~3% (feeds Prompt 06).
  - **Standing payroll**: `hire(officialId)`, weekly `chargeRetainers` (from clean cash,
    registered into `clock.tick` on the weekly boundary), standing benefits applied
    (tip-offs → raid warnings via Prompt 05; slowed escalation; dismissed charges; +rep).
    - **Raise asks** (design/09 v1.1): `new_ask = current × (1+Δbusiness) × (1+heat) ×
      greed × rivalPressure` — an official can ask for more as you grow. Player can
      accept / negotiate / refuse; **refusing == underpayment** → feeds flip risk.
    - **Flip risk** (telegraphed): rises on underpay, heat crossing their comfort
      threshold, a rival outbid, or LE turning them into a **wire** (reuses Prompt 08's
      betrayal machinery). Warning signs surfaced as prose; intervention = raise pay /
      cool heat / feed false intel / remove.
  - **Judge** benefit: can dismiss charges → **softens the imprisonment end-state**
    (keeps a run alive), a hook Prompt 11 consumes.

## Acceptance criteria (vitest)
- Bribe ask and resulting seizure % are computed from the documented formula and are the
  exact values shown before commit; haggle odds shown == rolled (fairness law).
- Paying a port lowers that port's container seizure to the configured floor.
- Weekly retainers are charged on the weekly boundary from **clean** cash; missing/under-
  paying raises the official's flip risk and writes a memory entry.
- Raise-asks scale with business level & heat per the formula; refusing counts as
  underpayment.
- Official flips are **telegraphed** (warning prose) with an intervention window — never
  a silent random flip. A flipped official feeds the heat/LE wire.
- Retainers **do not** charge during `settleOffline` in a way that could go negative and
  trigger consequences offline. (offline safe)

## Guardrails
- Payroll is **optional, deterministic power** — not a loot box, not pay-to-win, no
  gambling on progression. (design/09 B.3, GDD §8)
- Missing a payment is an **in-fiction consequence the player controls** — the menace is
  on the *character*, never guilt aimed at the human. No "pay or lose" notifications.
- A recurring, **scaling** clean-cash sink is the point — it gives the idle payoff
  somewhere meaningful to go. (design/09 Integration)
