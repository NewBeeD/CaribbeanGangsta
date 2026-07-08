# Prompt 25 — Telemetry & playtest harness

**Phase:** 3 — Onboarding & integration
**Depends on:** 14 (+ systems emit events as built)
**Design refs:** `design/06_Playtest_and_Telemetry.md`; `design/01` §8 (tune-first list);
`design/10`/`design/09` telemetry rows; GDD §15 (falsifiable claims)

## Goal
Turn every retention claim into a **measured, falsifiable metric**. Build a local
telemetry bus + a live playtest overlay (the prototype already does a slice of this) so
you can watch the funnel and the ethical guarantees while playing.

## Build
- `src/telemetry/bus.ts` — a typed event bus: `track(event, props)`; a pluggable
  sink interface (`ConsoleSink`, `LocalSink` for on-device inspection; a `RemoteSink`
  **stub** for later). No PII; local-first.
- Instrument the key events (design/06 + the per-system telemetry rows):
  - **Funnel:** session length, time-to-first-sale, deals, busts, first-front-opened,
    session-end reached, D1-return proxy.
  - **Economy:** idle rate, offline earned, upgrade cadence.
  - **Death spiral (top priority, design/01 §8.5):** spiral-entry rate, run-length
    distribution, "was it earned/readable" flag, **dead-on-arrival seeds (target ~0)**.
  - **Debt (design/10):** borrow rate, average leverage, default rate, dig-out rate, and
    **borrower sentiment/retention vs non-borrowers** (the frustration-signature watch).
  - **Corruption/storage (design/09):** diversification index, avg raid-loss %, raid-
    induced wipe rate, bribe spend/shipment, payroll as % of clean income, official-flip
    rate.
  - **Fairness audit:** log displayed-odds vs rolled-outcome so the fairness law is
    continuously verifiable in aggregate.
  - **Guarantee audit:** assert-and-log that owed balance / assets are uncorrelated with
    real-world absence (proves offline-freeze). (design/10 §6)
- `src/ui/shell/TelemetryOverlay.tsx` — a dev-only overlay (toggle) showing the live
  funnel + event log while playing (port/extend the prototype's telemetry panel).

## Acceptance criteria
- Every metric named in design/06 + the per-system rows above is emitted with correct
  props; the overlay shows them live.
- A batch/headless sim run over many seeds reports **dead-on-arrival = ~0** and a
  sane run-length distribution. (design/01 §8)
- The fairness audit shows aggregate displayed-odds ≈ realized-odds within tolerance.
- The offline-freeze audit shows **zero correlation** between absence and owed balance.
- `RemoteSink` is a drop-in stub; nothing depends on it.

## Guardrails
- Telemetry serves **tuning and the ethical audit**, not dark-pattern optimization. If a
  metric (e.g. borrower churn) signals need-frustration, treat it as a **balance bug**,
  not a KPI to push. (design/10 §4 watch item, GDD §15)
- Local-first, no PII. Remote is opt-in and stubbed for now.
