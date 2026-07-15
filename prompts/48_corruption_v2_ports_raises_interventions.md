# Prompt 48 — Corruption v2: Raise Caps, Ports Everywhere, Call-in-a-Favor

**Depends on:** 47 (manifest flow / itemized quote), 09 (corruption engine),
20 (Storage & Corruption UI), 26 (config).
**Design authority:** `design/13_Ideas2_Round4_Fixes_and_Expansion.md`
Workstream **F** + Open decision 1; Ideas2.md round-4 feedback ($10B raise
asks; bribe option only at Puerto Verde; "if my drugs come across law
officials, I should be able to call someone on payroll"; payroll for massive
shipments).

## Objective

Make the corruption network behave like relationships instead of vending
machines gone feral: sane raise asks, a bribe surface at every port with
major-port pricing, an active "call in the favor" when a shipment is about to
be lost, and payroll coverage that matters for massive manifests — as a
disclosed surcharge, never a hard lock.

## Deliverables

- **Raise sanity.** `corruption.ts` `computeRaiseAsk` output is capped at
  `retainerPerWeek × RAISE_MAX_MULTIPLE` (~1.5 v1) AND a per-archetype
  absolute ceiling (`config/corruption.ts`), with a
  `RAISE_MIN_WEEKS_BETWEEN` cooldown per official. The raise arc
  (pending/accept/refuse/grievance) is untouched — only the number and the
  cadence get bounds. Docstring documents the worked ladder (a late-game DEA
  ask lands in the low millions, never billions).
- **Ports everywhere, priced by weight.** Every port country surfaces the
  bribe offer (Storage screen + Shipment Desk when a manifest routes through
  it), not just Puerto Verde. `config/corruption.ts` gains per-port tiers:
  minor ports — cheap ask, long `PORT_PAID_DURATION_HOURS`; major ports
  (Miami/Rotterdam class) — a multiple of the ask for a fraction of the
  duration. Existing greed/drift factors keep per-port personality; Prompt
  43's A3 eligibility rules (no quote while protected, no hypothetical
  shipments) apply everywhere.
- **Call in a favor.** When an interdiction roll comes up bad and a relevant
  official (customs / port authority / DEA / judge — mapping in config) is on
  payroll, loyal past the tested bar, and unflipped, the seizure resolves
  into a telegraphed choice instead of a flat loss: *call them* — pay a favor
  fee scaled to cargo value + spend disclosed loyalty, the load survives — or
  *let it go* (today's seizure). Deterministic given the already-rolled
  value; the fee and loyalty cost are shown before choosing. Favor use feeds
  the existing flip-risk arc (an official you burn favors on remembers).
- **Massive-shipment coverage (soft).** An above-threshold manifest
  (`config`: units and/or value) into a major country **without** relevant
  payroll coverage carries a **disclosed seizure surcharge** shown as its own
  line on Prompt 47's itemized quote ("No one at the Rotterdam port is on
  your payroll — +18%"); covered manifests don't. **NOT a hard gate** — see
  design/13 Open decision 1; a hard requirement ships only with an explicit
  user sign-off recorded like the territory override.

## Acceptance criteria

- [ ] No sequence of cool-heat asks / time / net-worth growth produces a
      raise ask above the cap or ceiling; asks respect the cooldown.
- [ ] Every port country can quote, haggle, and pay; a major port charges a
      config'd multiple for a config'd fraction of the duration; all A3
      eligibility rules hold at every port.
- [ ] An interdicted shipment with a qualifying official presents the favor
      choice with fee + loyalty cost shown; paying saves the exact load;
      declining seizes exactly as today; no qualifying official ⇒ no choice.
- [ ] The uncovered-massive surcharge appears as an itemized quote line and
      in the rolled odds (shown = rolled); covered manifests show no
      surcharge. Launching uncovered is always *possible*.
- [ ] Batch sim reaches horizon on all seeds; full suite green, `tsc` clean.

## Ethical guardrails

- Open access holds: coverage is a money-mediated pressure (a worse shown
  price), never a lock. The hard-requirement variant is explicitly out of
  scope pending sign-off.
- Favor mechanics are deterministic against the already-shown roll — no
  second hidden roll; fees and loyalty costs disclosed before commitment.
- Officials stay relationships with telegraphed flip arcs — bounded raises
  keep them from becoming absurdist ATMs in reverse.
