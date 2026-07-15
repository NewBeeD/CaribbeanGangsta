# 13 — Ideas2 Round 4: Fixes, Consequence, and Expansion

Source: `Ideas2.md` (round-4 playtest feedback, July 2026) **plus three direct
user additions**: (1) bulk transport types — shipping containers etc. — so
players can move far more units per run; (2) more crew members; (3) the Money
tab's notification feed capped at the **5 latest** with a **Clear all** button.

Rounds 1–3 (design/11, design/12, prompts/37) are built. This round is played
against the working-tree build that includes production, territory
consolidation, the mule wash queue, and arms. Items are grouped into eight
workstreams (A–H), sized as candidate prompts **43–50**.

House rules that bind everything below (prompts/README.md, Ideas.md):

- **Engine stays pure and deterministic** — all new mechanics live in
  `app/src/engine`; UI only renders view-models and dispatches intents. No
  `Math.random` (route through `engine/rng.ts`), no wall clock (`clock.ts`).
- **Config, not literals** — every new number goes in `app/src/engine/config/`
  and a `state.config` group (Prompt 26). New persisted shape ⇒ bump
  `SCHEMA_VERSION` in `state.ts` + a hydrate migration that never seizes
  anything a player earned.
- **Money is the only gate** (Drug Lord 2 open access). One signed-off
  exception exists for TERRITORY consolidation (memory
  `territory-open-access-override`); do not generalize it. Workstream F brushes
  this line — see Open decisions.
- **Rejections never mutate state; outcomes carry scene keys, not error
  strings.** Offline is frozen: absence forgoes gains, never risks progress.
- Definition of done per prompt: `npm run typecheck`, `npm run lint`,
  `npm run test` all green; re-run the Prompt 25 batch sim after any retune.

---

## A — Correctness pass (Prompt 43) · fix before tuning anything

Bugs contaminate every balance signal in this file — land these first.

### A1. Fractional inventory breaks selling

**Feedback.** "I have 216.57861666666642 in weed. When I try to sell the max,
it just says 'The deal is done.' and nothing happens."

**Root cause (verified).** `engine/production.ts` `productionStep` deposits
`productionYieldRate × dtHours` — a fractional number every tick — straight
into the home stash. `engine/deals.ts` `resolveSell` (line ~537) rejects any
non-integer qty (`Number.isInteger(qty)`), so a "sell max" built from a
fractional holding is rejected — and the rejection surfaces copy
indistinguishable from success.

**Design.** Product units are **integers everywhere**. `productionStep` keeps a
per-op fractional accumulator (`ProductionOp.pendingYield`) and deposits only
`Math.floor(accumulated)` whole units; the remainder carries to the next tick,
so nothing is lost and nothing fractional ever lands in an inventory. Migration
rounds existing fractional holdings **up** to the next whole unit (never seize).
Sell/move/convert "max" selectors floor to whole units. A rejected deal must
never reuse a success scene key — audit the deal scene-key map.

### A2. "LAUNCHFix the manifest first"

**Root cause (verified).** `ShipmentDesk.tsx:272` — the disabled-state hint
(`'Fix the manifest first'`) is rendered adjacent to the button label with no
separator. Pure markup fix: hint renders as its own helper line under the
button, never inside the label.

### A3. Phantom port-bribe card ("3% → 3%", no shipment made)

**Feedback.** "What is this about 'Puerto Verde port 3% → 3% Shipment
~$221,673 · pay to drop seizure from 3% to 3%'? Because I didn't make any
shipments."

**Root cause (verified).** `corruption.ts` `quoteBribe` sets `baseSeizurePct`
to `PORT_PAID_SEIZURE` when the port is **already paid** (line ~178), so the
UI's "from X% to Y%" renders 3% → 3%. And the surfacing UI quotes a
hypothetical `shipmentValue` even when nothing is staged.

**Design.** While a port is paid, the offer row is replaced by a status line
("Protected · runs at 3% until <time>"), never a quote. A quote only renders
against a real staged manifest value. `quoteBribe` itself is fine — this is
presentation + surfacing eligibility.

### A4. Opaque move rejection (Colombia → Container)

**Feedback.** "Couldn't move that — check space and what's held."

**Root cause.** `storage.ts` `moveProduct` rejects for distinct reasons
(capacity at line ~326, holdings, etc.) but the UI collapses them into one
generic line.

**Design.** Surface the *specific* reject reason with numbers: "Container is
full — 12 of 40 units fit" / "That stash doesn't hold 30 weed." Reject reasons
already exist; map each to its own scene copy. While the infinite-stash model
still stands (until Workstream G), also show remaining `effectiveCapacity` on
the move sheet so the player can predict the outcome.

### A5. Money-tab notification feed: latest 5 + Clear all *(user addition 3)*

**Root cause (verified).** `MoneyScreen.tsx` "Waiting on you" renders every
`pendingChoices` entry, unbounded; each must be dismissed one by one
(`dismissPendingChoice`).

**Design.** The card shows only the **5 newest** items with a "+N older" count
line, plus a **Clear all** action that resolves every pending choice through
the same safe default path `dismissPendingChoice` uses (dismissal = the
no-action default; it must never silently pick a consequential branch — any
choice whose dismissal is consequential is excluded from Clear all and said
so). Engine gains `dismissAllPendingChoices` (pure, mirrors the single
dismiss); no schema change.

### A6. Dirty cash "disappears" — make every cash movement legible

**Feedback.** "The dirty cash disappears for no reason."

**Root cause (verified).** `deals.ts` `resolveSell` bust path (line ~560)
**zeroes the entire stash's `dirtyCash`** on a busted street deal. It is
disclosed nowhere prominent; the player experiences it as vanishing money. The
wash queue also pulls dirty out of stashes into `wash.queuedDirty` (by design,
counted in net worth) — a second "where did it go" source.

**Design (interim, this prompt).** Every dirty-cash sink emits a feed line
("Bust at Home stash — $12,400 dirty seized"; "Mules picked up $9,000"). The
*model* change (busts stop seizing stored cash) is Workstream B — A6 only makes
the current behavior visible so nothing ever reads as a silent loss.

---

## B — Heat & consequence rework (Prompt 44)

### B1. Heat comes from getting caught, not from trading

**Feedback.** "Buying drugs should not increase heat. Only if police catch a
transaction or catch drugs in transit. Based on the amount and type of drugs,
my heat should be raised accordingly. Same for arms."

**Root cause (verified).** `deals.ts:522` adds heat on every **buy**
(`BUY_HEAT_FACTOR`), `deals.ts:595` on every **sell**, `arms.ts:492` on every
arms sale — transacting itself is hot today.

**Design.** Remove the per-transaction heat adds (`deal.buy`, `deal.sell`,
`arms.sell`). Heat now lands when the world catches you: bust
(`deal.bust`, scaled `heatPerUnit × qty × bustHeatMultiplier` — already
shaped right), interdiction (`shipment.seized`), arms bust, plus the passive
sources (production, fronts, territory, plugs) which stay. **Compensating
retune:** raise bust/interdiction heat multipliers and/or bust probability's
heat coupling so total heat pressure over a session stays roughly where the
sim has it today — this is a redistribution, not a nerf. `BUY_HEAT_FACTOR`
and the sell add are deleted from the config group (migration drops them).

### B2. Dirty cash is seized in raids, not in street busts

**Feedback.** "If cops bust my trade, my dirty cash should not be taken. My
dirty cash should only be taken if they raid a stash."

**Design.** `resolveSell`/`resolveBuy` bust paths seize **the goods and cash on
the table** — the product being moved and, for a buy, the cash staked on that
transaction — and stop zeroing the stash's stored `dirtyCash`. Stored dirty
cash is lost only through the raid path (`heat.ts` `rollRaid` →
`storage.ts` seizure), which already exists and is unchanged. Together with A6
this closes the "disappearing cash" complaint at the root.

### B3. Marked must mean something

**Feedback.** "You're marked. With no way to pay and no protection, this can
end the run. But nothing happens."

**Root cause (verified).** Debt rung 5 sets `DEBT_MARKED_FLAG`
(`debt.ts:413`), which is read **only** by `endgame.ts` `evaluateSpiral`'s
`hunted` step — and that step is inert unless the player is *also* wiped and
can't pay (`endgame.ts:166–177`). A solvent-but-marked player sees zero
consequence.

**Design.** While marked, an ACTIVE-only **enforcement pressure** step runs:
telegraphed collector events on a visible clock — first a warning card, then
escalating hits (seize dirty cash from the fattest stash, jump a shipment,
lean on a crew member), each one rung at a time in the debt ladder's style,
each preceded by its warning. Repaying clears the mark and the pressure the
moment the balance hits zero. Offline stays frozen (no collector moves while
away — the tested ethical guardrail from Prompt 21 holds). All rates/sizes in
`config/lenders.ts`.

### B4. Getting caught carrying it yourself has teeth

**Feedback.** "If I make deliveries myself, and get caught, then there should
be some sort of punishment. Prison time or game over."

**Design.** A **self-run** shipment (no courier consigned) that is interdicted
now triggers an **arrest**, not just cargo loss: a telegraphed, consensual
choice card in the death-spiral style — *post bond* (a large clean-cash hit,
scaled to net worth, plus a heat spike) or *the run ends* ("arrested" run-end
reason feeding the Prompt 23 summary/leaderboard). The solo-vs-consign
trade-off is now real: couriers cost a cut (and can skim), but they take the
fall (`CONSIGNED_BUST_HEAT_FACTOR` already encodes this). Disclosed on the
launch quote: "You're driving — if this is stopped, you're in the cuffs."

### B5. Where heat comes from now — the six-source model *(user addition, round-4 follow-up)*

With transaction heat gone (B1), the user specified the sources that replace
it. Heat generation becomes six legible categories, each disclosed on the Heat
screen ("why is my heat rising" itemized — the same fairness law as the odds):

1. **Shipment volume & route risk** — launching/landing a shipment adds heat
   scaled by `cargo heat class × qty × corridor risk` (the same inputs the
   interdiction quote already computes). Big moves on hot corridors run hot
   even when they succeed.
2. **Storage concentration** — an ACTIVE-only passive term when a single
   stash holds units above a config'd threshold curve. Fat stashes hum;
   spreading out (or Workstream G upgrades with better cover) quiets them.
   Raid targeting already weights the fattest stash — this makes the pressure
   visible before the raid lands.
3. **Repeated patterns** — per-stash/per-port rolling usage counters that
   decay over active hours; re-running the same origin/port inside the window
   adds a disclosed heat (and interdiction-odds) surcharge. Vary your routes.
   Small state addition (`recentUse` maps) — schema bump shared with B3.
4. **Violence & flashy actions** — one-time config'd bumps on rival
   conflicts, surviving raids, and conspicuous purchases (vessels, the
   real-estate front class): overt spending gets noticed.
5. **Failed deals & busts** — the existing spike (`heatPerUnit × qty ×
   bustHeatMultiplier`) stays, plus a temporary **investigation window**
   after a major bust: heat decays slower and raid chance runs a config'd
   multiplier for a disclosed number of active hours.
6. **Empire size** — the existing `RAID_EMPIRE_FACTOR` idea extends to a mild
   passive heat term: bigger operations naturally attract more attention
   (realistic escalation, already half-built in `raidChance`).

All weights live in `config/heat.ts`; the batch sim validates that total heat
pressure lands in today's band for a mid-size operation and escalates for a
sprawling one. B1's "compensating retune" is superseded by this model — the
six sources ARE the compensation.

---

## C — Production v2: pacing, pause, destination (Prompt 45)

**Feedback.** "Production is too fast." · "The drug production only saves in
the home stash, which maxes out at 290 units." · "I should be able to pause
production." · "How does offline work for fronts and production?"

**Root cause (verified).** `productionStep` deposits only into
`state.stashes[0]` (home). Rates (`0.8–3.0 units/hr/level`) were tuned before
the live clock (30 real sec = 1 game hr ⇒ a L5 hydro-farm mints ~20 weed per
real minute). No pause exists.

**Design.**

- **Pacing:** config-only retune of `unitsPerHourPerLevel` (roughly ÷4–6,
  validated against the batch sim and live-clock session lengths). Numbers stay
  in `config/production.ts`.
- **Destination:** `ProductionOp.stashId?` — each op deposits into its assigned
  stash (default home); a full destination idles the op exactly as today. The
  Production screen gets a destination picker limited to stashes in the op's
  country (production is physical).
- **Pause:** `ProductionOp.paused` + `setProductionPaused` intent. Paused ops
  yield nothing and emit **no heat** (the lab is cold). Shown as a toggle.
- **Offline copy:** the Production and Money screens each carry the one-line
  contract: "Runs while you play. Frozen while you're away — nothing accrues,
  nothing is lost." (This is already the tested engine behavior; the player
  just couldn't see it.)
- Schema bump: `pendingYield` (A1), `stashId`, `paused` on `ProductionOp` —
  one migration covers A1+C.

---

## D — Crew expansion (Prompt 46) *(user addition 2)*

**Feedback.** "Only 3 crew members are available to run drug production. When
I have all production working, I am not able to 'Put a lieutenant on it'." ·
User addition: "I want you to add more crew members."

**Root cause (verified).** The roster in `config/crew.ts` is a deliberately
small 7-archetype cast (deon, marco, yolanda, tpopz, reyes, iris, nadia —
design/02 §7 explicitly rejected large rosters). Lieutenants are promoted crew
(`crew.ts:594`), and fronts, production ops, couriers, escorts, and street
teams all draw from the same pool — six production ops alone exhaust it.

**Design.** This relaxes design/02's small-roster stance **at the user's
request** (this doc is the sign-off; note it in design/02 rather than silently
contradicting it). Roughly double the roster to ~14 archetypes: each new
member keeps the full relatedness shape (relationship, loyalty, betrayal arc,
story hooks — no faceless mercenaries; write real people in the design/02
voice). Hiring stays money-gated and open from minute one; wages scale so a
big payroll is a real weekly obligation. The Crew screen groups by current
duty (front / production / courier / street / unassigned) so "who is free"
is readable at a glance — that legibility gap is half of the original
complaint.

**Lieutenant span of control *(user addition, round-4 follow-up)*:** a
promoted lieutenant can run **up to 2 production sites** at once
(`LIEUTENANT_MAX_PRODUCTION_OPS = 2`, config). Assigning a third rejects with
readable copy; fronts keep today's one-front-per-lieutenant rule. This is a
capacity relief (one person, two ops) AND a cap (never a whole industry on
one back) — with the ~14-body roster it makes a fully-delegated six-op
production layer cost three lieutenants, not six. `productionLieutenantBonus`
must resolve per-op when its lieutenant holds two assignments (full disclosed
bonus on each; no hidden dilution).

---

## E — Logistics v2: bulk transports, owned vessels, concurrency (Prompt 47) *(user addition 1)*

**Feedback.** "I should be able to make multiple shipments to a country…
max should be the total number of crew members available plus myself." ·
"Please add more transportation types. Container boats, semi-submersible
submarines, etc." · "Couriers take too much of a cut… go-fast boats charge
too much." · "Every time I transport cocaine to England I lose the shipment…
how do I access the market?" · "Add more expensive avenues to spend larger
sums… invest in container ships (that would also give the option to
transport drugs)." · User addition: bulk container transport so players can
move far more units.

**Root cause (verified).** `config/transport.ts` has three modes (go-fast 400
cap / ferry 60 / plane 100). `state.shipments` is already an **array** — the
engine happily holds several in flight; the desk UI and courier availability
are what bottleneck launches. England (far region, hot cargo, big qty) drives
`interdictionChance` toward the 0.75 ceiling; the mitigations (paid ports,
escorts, cool cargo, ferry) exist but nothing teaches them.

**Design.**

- **Two new charter modes** in `TRANSPORTS`:
  `container-ship` (cargoCap ~2,000, slowest, cheapest per unit, low baseRisk —
  but a seizure loses a fortune, which is its own balance) and `semi-sub`
  (cargoCap ~800, very low baseRisk, extreme charter price). Both are pure
  config rows — `travel.ts` already prices any mode.
- **Owned vessels — the billionaire sink.** New `config/vessels.ts` +
  `state.vessels`: buy a container ship / go-fast fleet outright (clean-cash,
  $5M–$50M class). An owned vessel charters its mode with **no owner cut** and
  a steep per-leg discount, and counts in `netWorth`. Single-buy per vessel id,
  upgrade levels raise its cargo cap. This is the "more expensive avenues"
  ask — pure money sink, open access.
- **Concurrency — people are the capacity** *(user addition, round-4
  follow-up, with worked example)*: every run needs at least one person
  aboard — a crew member helming it, or you — and **each person can be on at
  most one run at a time**. Extra crew join the same run as escorts (the
  existing escort mechanic: each lowers the displayed odds, each takes a
  cut). So the number of concurrent runs is bounded by available people, and
  people spent per run trade against runs you can still launch. The user's
  example is the spec: 5 crew + you = 6 people. Send 2 to England → 4 left.
  Send 3 on another run → 1 left (you). Helm a run yourself → 0 available,
  no further launches until someone returns. The desk shows "People: 5 of 6
  out" and allows staging the next manifest while others fly; helming is what
  exposes you to B4 arrest.
- **Cut retune:** `COURIER_CUT_PCT` 0.05 → ~0.03; go-fast `ownerCutPct`
  0.10 → ~0.06; owned vessels 0. Config-only.
- **Teach the England run:** the quote sheet itemizes the odds terms it
  already computes (mode, distance, cargo heat, destination, port protection,
  escorts) as "what would lower this" lines. No new math — expose the existing
  `interdictionChance` inputs. Long-haul risk gets a mild retune only if the
  sim shows a prepared run (paid ports + escort + modest qty) still losing
  most loads.

---

## F — Corruption v2: raise caps, ports everywhere, interventions (Prompt 48)

**Feedback.** "The DEA agent keeps raising his price up to $10 billion. If you
constantly ask the official to cool heat, a raise should be reasonable." ·
"Only Puerto Verde port gives me the bribe option — I want this for all ports;
major ports should charge much more for less time." · "Politicians and customs
officers are not able to cool the heat… if my drugs come across law officials
and I have someone on payroll, I should be given the option to call them." ·
"For massive shipments to major countries, there should be a requirement to
have officials on the payroll."

**Root cause (verified).** `computeRaiseAsk` (`corruption.ts:487`) grows with
business reputation/net-worth with **no absolute cap or frequency limit** — at
billionaire scale it produces absurd asks. Port bribes work anywhere
(`payBribe` is port-agnostic) but the **offer is only surfaced** where a
container stash exists, which in practice was Puerto Verde.

**Design.**

- **Raise sanity:** a pending raise is capped at
  `retainer × RAISE_MAX_MULTIPLE` (~1.5) with a per-archetype absolute ceiling
  and a cooldown (`RAISE_MIN_WEEKS_BETWEEN`). Config group additions; the
  raise arc (accept / refuse / grievance) is untouched.
- **Ports everywhere, priced by weight:** every port country gets a bribe
  surface (Storage/Shipment desks). `config/corruption.ts` gains per-port
  tiers: minor ports — cheap, long `PORT_PAID_DURATION_HOURS`; major ports
  (Miami, Rotterdam class) — multiples of the ask for a fraction of the
  duration. The existing greed/drift factors keep per-port personality.
- **Call in a favor (active intervention):** when an interdiction roll comes up
  bad and a relevant official (customs, port authority, DEA, judge) is on
  payroll, loyal, and unflipped, the seizure resolves into a telegraphed
  choice: *call them* — pay a scaled favor fee + spend loyalty, load survives —
  or *let it go*. Deterministic given the roll; the favor's price is shown
  before choosing. This makes payroll *do* what the player expects mid-crisis
  instead of only passive percentages.
- **Massive shipments & payroll — soft, not gated:** an uncovered
  above-threshold manifest into a major country carries a **disclosed seizure
  surcharge** ("No one at the Rotterdam port is on your payroll — +18%");
  covered manifests don't. This delivers the feedback's intent as a money-
  mediated pressure. A **hard requirement** would be a flag gate — parked as an
  Open decision below.

---

## G — Stash upgrade model (Prompt 49)

**Feedback.** "I don't like the idea of infinite stashes. A stash should be
upgraded for more space, not an additional stash."

**Design.** Within a district/country, the player owns **one stash** that
**upgrades for capacity** (levels on the `buy_in × 1.15^level` family curve,
`effectiveCapacity` scaling steeply with level; the crew-carry bonus stays on
top). Territory expansion (new districts, new countries, ports/containers)
is untouched — footholds are still bought with money; what disappears is
stacking multiple stashes on one spot. This **reverses part of the Prompt 16
expansion model** (memory `empire-map-territory-model`): `addStash`-per-
district becomes `upgradeStash`; empire "fill" derives from stash levels
instead of stash count. Migration folds a district's existing stashes into one
at the equivalent capacity level (round **up**; merge inventories and dirty
cash — never seize) — the single most delicate migration this round; write it
first, test it against real saves. Combined with C's destination picker this
also resolves the "production maxes at 290" complaint. Do this prompt **last
of the schema-touching set** so the fold happens once.

---

## H — Markets & arms pass (Prompt 50)

**Feedback.** "Arms do not show well in market… it does not show the prices
of the different types of arms. Probably have an arms market separate." ·
"I tend to solely trade cocaine… I want to trade all drugs because of price
hikes across countries." · "With every front unlocked and upgraded, add a
speed boost to the mules' conversion rate."

**Root cause (verified).** Arms are deliberately excluded from the drug board
(`worldMarket.model.ts:66` — "Arms trade through their own screen"); the gap is
that the **Arms screen never grew a price sheet** — per-tier prices by country
are invisible. The mule rate (`config/fronts.ts` `washRatePerHour`, line ~244)
is **flat** — `WASH_MAX_DEPOSIT × WASH_DEPOSITS_PER_DAY / 24` — with no front
coupling. Cocaine dominance is a spread/eventing tune, not a missing system.

**Design.**

- **Arms price book:** the Arms screen gets its own by-tier × by-country price
  sheet in the World-Market style (P6/Prompt 42 selectors as the template) —
  every tier's price, demand note, and heat class, visible from minute one.
  No engine math; `arms.ts` prices verbatim.
- **Multi-drug incentives:** retune event magnitude/frequency and per-product
  regional elasticities so at any moment *some* non-cocaine product is the
  best $/unit-of-risk somewhere; the rumor system (Prompt 33) already carries
  the information channel. Config-only; validate with the sim's per-product
  trade mix.
- **Fronts feed the mules:** `washRatePerHour` gains
  `× (1 + WASH_FRONT_BOOST × Σ front levels)` — each owned front level adds
  deposit capacity (a front is placement infrastructure — thematically exact).
  Shown on the wash card ("Your 9 front levels: +45% throughput").

---

## Open decisions (need the user)

1. **Hard payroll requirement for massive shipments (F).** Shipped as a
   disclosed surcharge (soft, money-mediated). A hard "cannot launch without an
   official" lock violates open access — implement only with an explicit
   sign-off recorded like the territory override.
2. **Prison sentence vs. run-end on arrest (B4).** Shipped as bond-or-run-ends.
   A third option — a served *sentence* (frozen calendar time, empire exposed) —
   is juicier but touches the offline-freeze guarantee; parked until wanted.
3. **Roster ceiling (D).** ~14 keeps every member a written character. A
   procedurally-generated unlimited pool would break the relatedness pillar —
   recommend against; flag if the user wants numbers over names.

## Suggested order

| # | Prompt | Size | Why here |
|---|--------|------|----------|
| 43 | A — Correctness pass | M | Bugs poison all downstream tuning signals |
| 44 | B — Heat & consequence | M | Redefines the risk economy the retunes depend on |
| 45 | C — Production v2 | S | Config + small schema; pairs with 43's quantization |
| 46 | D — Crew expansion | S–M | Content-heavy, engine-light; unblocks 47's courier cap |
| 47 | E — Logistics v2 | L | Needs 46 (couriers) and 44 (self-run arrest) in place |
| 48 | F — Corruption v2 | M | Builds on 47's manifest flow for interventions |
| 49 | G — Stash upgrades | M | Heaviest migration — do the fold once, late |
| 50 | H — Markets & arms | S | Pure config/UI polish + sim validation pass |

Re-run the Prompt 25 batch simulation after 44, 47, and 50 — the sim policy
must still reach the horizon on every seed, and the per-product trade mix
should no longer be ~100% cocaine.
