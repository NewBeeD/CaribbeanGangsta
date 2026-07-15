# Prompt 47 — Logistics v2: Bulk Transports, Owned Vessels, Concurrency

**Depends on:** 44 (self-run arrest), 46 (crew/couriers), 30 (travel engine),
30-UI (Shipment Desk / Transport page), 26 (config).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **E**; Ideas2.md round-4 feedback (multiple shipments capped at
crew + me; container boats & semi-submersibles; courier/go-fast cuts too high;
"every shipment to England is seized"; "invest in container ships");
**user addition 1: bulk transport types so players can move far more units.**

## Objective

Scale the water: two bulk charter modes, outright vessel ownership as the
billionaire money sink (which also transports), concurrent shipments capped by
couriers + yourself, gentler middleman cuts, and a quote sheet that teaches
what actually lowers interdiction odds.

## Deliverables

- **New charter modes** (`config/transport.ts` `TRANSPORTS` — pure config
  rows; `travel.ts` already prices any mode):
  - `container-ship` — cargoCap ~2,000, slowest, cheapest per unit-distance,
    low `baseRisk` (hidden among legitimate freight); a seizure loses a
    fortune, which is its own deterrent.
  - `semi-sub` — cargoCap ~800, very low `baseRisk`, extreme charter price,
    moderate speed. The stealth play.
  - v1 numbers are HYPOTHESES in the config docstring; retune on the sim.
- **Owned vessels — the late-game sink.** New `config/vessels.ts` +
  `state.vessels` + `engine/vessels.ts` (pure): buy a vessel outright from
  CLEAN cash ($5M–$50M class; single-buy per id, upgrade levels raise cargo
  cap on the `×1.15` family curve). An owned vessel charters its mode with
  **no owner cut** and a steep per-leg discount, and counts in `netWorth`.
  Schema bump + migration (empty fleet on old saves).
- **Concurrency — people are the capacity** *(the user's worked example is
  the spec)*. Every run needs at least one person aboard — a crew member
  helming it, or you — and **each person can be on at most one run at a
  time**. Extra crew join the *same* run as escorts (existing mechanic: each
  lowers the displayed odds, each takes a cut), so people spent per run trade
  directly against runs you can still launch. Spec example: 5 crew + you = 6
  people → send 2 to England (4 left) → send 3 on another run (1 left: you) →
  helm a run yourself (0 left) → no further launches until someone returns.
  You can helm at most one shipment, and helming is what exposes you to
  Prompt 44's arrest. The desk supports staging/launching additional
  manifests while others fly and shows "People: 5 of 6 out".
  (`state.shipments` is already an array — this is people-accounting + desk
  UI, not an engine rebuild.)
- **Cut retune (config-only).** `COURIER_CUT_PCT` 0.05 → ~0.03; go-fast
  `ownerCutPct` 0.10 → ~0.06; owned vessels 0.
- **Teach the run.** The launch quote itemizes the existing
  `interdictionChance` inputs as readable lines — mode risk, distance, cargo
  heat, destination, port protection (paid/unpaid), escorts — each with its
  current contribution, so "why is England 75%?" answers itself. No new math:
  expose the terms `travel.ts` already computes. Retune long-haul weights only
  if the sim shows a *prepared* run (paid ports + escort + modest qty) still
  losing most loads.

## Acceptance criteria

- [ ] Five transport modes quote and resolve; container-ship moves ~2,000
      units in one leg at the cheapest per-unit cost; semi-sub shows the
      lowest displayed odds for identical cargo.
- [ ] Buying a vessel debits clean cash, appears in `netWorth`, removes the
      owner cut, and discounts its legs; second buy of the same id rejects
      `already-owned` without mutation.
- [ ] The worked example passes as a test: 5 crew + you → launch a 2-person
      run, then a 3-person run, then helm a solo run; a fourth launch rejects
      with readable copy; a returning run frees exactly its people.
- [ ] A person on an in-flight run can't be assigned anywhere else (courier,
      escort, or you); escorts on a shared run each lower the shown odds and
      each take their cut.
- [ ] Helming is disclosed on the quote and routes interdiction into the
      Prompt 44 arrest; consigned runs never do.
- [ ] The quote sheet lists every odds term with its contribution; the total
      equals the displayed (and rolled) `interdictionChance` exactly.
- [ ] Prepared England-class runs succeed at sim-validated rates; batch sim
      reaches horizon on all seeds.
- [ ] Old saves migrate (empty fleet); full suite green, `tsc` clean.

## Ethical guardrails

- Every mode and vessel is offered from minute one — price is the only gate
  (open access; the vessel is a money sink, never a license).
- Odds shown = odds rolled, now itemized rather than opaque.
- Offline stays frozen: in-flight cargo neither resolves nor is seized while
  away (existing travel guarantee, re-asserted with concurrency).
