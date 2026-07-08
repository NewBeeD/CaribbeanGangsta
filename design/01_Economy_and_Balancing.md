# 01 — Economy & Balancing

> Companion to `CaribbeanGangsta_GDD.md`. This doc turns "the economy math *is*
> the narrative" (dl.acm 3311350) into concrete, tunable numbers. **All values
> below are v1 starting hypotheses to be replaced by playtest telemetry** (see
> `06_Playtest_and_Telemetry.md`) — they exist so the game is *playable and
> falsifiable*, not because they're right.

## 0. Design principles for the numbers (v1.1 — roguelike)

1. **Random world, skillful play.** Each run randomizes the world — starting country
   and its economy, price boards, rival personalities, event timing (§0a). The
   player's *skill* (reading markets, spreading inventory, timing bribes) is what's
   rewarded; the *world* is what varies. Doing the same thing across two runs should
   **not** give the same result. (GDD §5.4; `Ideas.md` #1)
2. **Recoverable — until it isn't.** Most setbacks recover through time (a lost deal,
   a raid on one stash, a bad market). But a **total wipe is terminal**: if you can't
   pay crew/loans and can't buy protection, the run enters the **death spiral** (§4a)
   and ends unless a lifeline (credit / a trusting contact — doc 10) pulls you out.
   Offline never triggers this; only in-game decisions do. (GDD §6; `Ideas.md` Storage #1)
3. **Estimable-but-fair randomness.** Any displayed odd matches its real
   probability. A "70% clean" run busts ~30% of the time — measured, not vibes. This
   is what keeps a high-variance roguelike *fair*: you lose to a read, not a hidden
   roll. (Sid Meier)
4. **Curves, not walls.** Costs escalate smoothly so there's always a next
   affordable step (the "one more day" affordability lever). (Stardew; idle CHI)

## 0a. Per-run randomization (what varies each run)

The roguelike "seed." Randomize at run start, within believable bounds, and **show
the player their starting hand** (no hidden traps):

| What | Range / method | Note |
|---|---|---|
| **Starting country** | pick from the roster; each has its own starting cash, prices, heat baseline, port protection, and opening hooks | `Ideas.md`: "each has its own starting values" |
| **Price boards** | each product's local base drawn within its real-world band (§2a), then drifting live | no two markets read alike |
| **Rival roster** | 2–4 rivals with randomized personalities/aggression from the archetype pool (GDD §4.4) | different antagonist every run |
| **Event timing** | Chaos Engine events (hurricanes, busts, gluts) seeded per run (§4.7 GDD) | the world surprises you differently |
| **Supplier geography** | which source countries are cheap/hot this run | shapes the route you build |

**Bounded, not chaotic:** randomization is within *realistic* ranges so a run is
always *playable* and *readable* — variety, never unfairness. (estimable-but-fair, §0.3)

## 1. Currencies

| Currency | Source | Sink | Notes |
|---|---|---|---|
| **Dirty cash** | Deals, raids, windfalls | Buying product, bribes, weapons | High-risk to hold; **must be stored & guarded** (doc 09); seizable during raids |
| **Clean cash** | Laundering fronts (idle engine) | Legit assets, expansion, bail, upgrades, **loan repayment** | Safe; the offline-return payoff and the lifeline out of a spiral |
| **Reputation (Street / Business / Political)** | Actions matching a playstyle | Unlocks, alliances, prices, **credit lines** | 3 separate tracks = 3 viable paths (autonomy); rep is *why* someone still fronts you when you're broke (doc 10) |
| **Heat** | Deals, violence, size | Decays over time; reduced by bribes/lying low | The tension meter, not a currency you "spend" |
| **High score (meta)** | Peak net worth / empire size, per run | — (display only) | Cross-run chase; persists past death; see §7 |

## 2. Core deal loop (Loop 1) math — real-world prices (v1.1)

**Prices are real dollars, not scaled units** (`Ideas.md`: "reflect real life… not
made up prices"). The deal table below *is* the in-game economy; per kg unless noted,
compiled from UNODC/DEA/InSight Crime (see `realism_recommendations.md`). Numbers vary
**per country and per run** (§0a) — the bands are the spawn range, not fixed values.

| Product | Buy (source) | Sell (wholesale) | Margin | Heat/unit | Unlock |
|---|---|---|---|---|---|
| **Weed** | $700–1,500/kg | $1,200–2,500 | ~60–80% | low (0.1) | Start |
| **Synthetics** (pills/meth; fentanyl precursors ex-Asia) | $2k–5k | $10k–30k+ | high, variable | 0.4 | District controlled |
| **Cocaine** (primary) | $1,500–3,000/kg (source) | mid-route $5k–10k; wholesale $20k–60k+; street gram $60–200 | widens with distance | 1.0 | Smuggling route |
| **Arms** | handgun $500–2k; rifle $1k–5k+ | +50–100% | +50–100% | high (2.5) | Arms unlock (paradigm shift) |

Design structure the real numbers preserve:
- **Cocaine is the margin engine**, and its margin *widens the further product travels
  from source* (source → mid-route → wholesale) — the mechanical reason international
  routes (GDD §4.6) feel like a paradigm-shift payoff.
- **Arms are a high-heat premium tier**; synthetics sit between weed and coke.
- **Margins scale with risk & heat** — higher tiers pay more precisely because they
  carry more seizure risk and heat/unit. That trade-off *is* the deal loop.

> **Canonical prices:** this real-dollar table is the single source of truth. Docs
> 09–10 have been restated to reference it (their old scaled-unit examples — "weed
> 10/18, coke 200/480" — are retired). Any future doc citing prices should point here.

**Price volatility (real supply/demand dynamics — `Ideas.md` #2/#3):** each market
price = `base × (1 ± volatility)` where `volatility` ∈ [0.20, 0.50] (real markets
swing ~20–50% on supply gluts, weather closing a port, LE operations, and rival
pressure). Volatility is *visible* (a price trend arrow), so buy-low/sell-high is a
skill (competence), not a gamble — exactly how Drug Lord 2's price events read.
**Arms carry their own dynamics** (`Ideas.md` #3): supply tightens after a big bust or
a conflict spike, prices jump; the "Iron River" straw-purchase pipeline sets the floor.

**Bust probability on a deal** = `f(heat, location risk, crew skill, product tier)`,
clamped to [3%, 60%], **always displayed** before commit. Sequence: reward text
first when a deal succeeds; loss text only after the player has felt some wins in
the session. (Sid Meier)

## 3. Idle / offline engine (laundering) math

The offline payoff must reward return without punishing absence. (GDD §6)

- **Clean-cash rate** = `Σ(front_rate_i × front_level_i)` per real hour, accruing
  offline.
- **Offline cap:** accrual continues up to a generous soft cap (start: **12h**),
  then slows to 25% rate (not zero). Rationale: rewards return, but a long absence
  is never a *hard* loss — the empire just idles, consistent with "absence forgoes
  gains but never risks progress." (dl.acm 3173574)
- **On return, the payoff is *decisions*, not just a number:** accumulated cash +
  a queue of 1–3 pending choices (a buyer waiting, a crew dilemma, a rival move).
  (dl.acm 3173574)
- **Front upgrade cost curve:** upgrade cost = `buy_in × 1.15^level` — the classic
  idle geometric curve; keeps a next affordable step always in reach.

### 3a. Front rate table (concrete v1 hypotheses, real dollars)

Each front generates clean cash per real hour = **`rate_per_level × level`** (so the
§3 total is `Σ(rate_per_level_i × level_i)`). Levels 1–5; the per-level rate and every
buy-in are **shown in-game** (estimable-but-fair, §0.3).

| Front type | Unlock | Clean $/hr **per level** | Levels | Buy-in (Lvl 1) | Heat/hr | Role |
|---|---|---|---|---|---|---|
| **Bar / food cart / music** | first front (onboarding) | **$120** | 1–5 | $2,000 | ~0 | Starter front; teaches the idle engine |
| **Nightclub / restaurant** | district controlled | **$450** | 1–5 | $12,000 | +0.02 | Mid-tier throughput |
| **Resort / casino / real estate** | regional scale | **$1,600** | 1–5 | $60,000 | +0.05 | Heavy earner (≈ the old "$2,100/h" convention at Lvl 1–2) |
| **Crypto** | tech / low-profile path | **$900 (±40% volatile)** | 1–5 | $20,000 | +0.01 (lowest) | Fast, low-heat, but the rate *swings* — pairs with the tech playstyle |

**Special channels (not simple rate fronts):**
- **Trade-based laundering** (over/under-invoiced import/export): capacity **scales
  with shipment volume**, not a fixed hourly rate — launders up to ~**15–20% of the
  dollar value of product you move**, so it *grows with the empire*. Unlock:
  international routes.
- **Black Market Peso Exchange:** a **sink with a haircut**, not a generator —
  converts a lump of dirty US cash to clean local funds at a **~10–20% discount**
  (the haircut is shown before you commit).
- **Political donations / permits:** overlaps the corruption network (doc 09) — buys
  *protection* and unlocks new fronts, not clean cash directly.

**Pacing check (why these numbers):**
- One **Bar Lvl 1** = $120/hr → a 12h absence (the soft cap) returns **~$1,440**
  clean — about one early weed run (doc 10 §3). Idle *rewards* return without
  *replacing* active play.
- Mid-game, ~3 fronts averaging **$3,000/hr** combined → a 12h return of **~$36,000**
  to allocate (payroll, bribes, expansion — the sinks in doc 09).
- Late-game **Resort Lvl 5** = $8,000/hr each, keeping idle pace with the coke-scale
  deal loop (§2) so laundering never becomes the *only* thing worth doing.

All fronts keep the ethical idle rules (GDD §6): they generate on return, never rot in
absence, and each rate/haircut is **shown** (estimable-but-fair).

**Golden-hour events** (bonus-only return triggers): spawn on a Poisson process
(~1 per 3–5h online-equivalent), live for 5–15 min, **bonus-only** — missing one
costs a bonus you never had, never a loss. (dl.acm 3173574)

## 4. Heat & law enforcement curve

- Heat accrues per risky action; **decays** at `~5%/hour` (faster when lying low,
  slower at higher empire size).
- Thresholds escalate the LE tier: Local (0–30) → DEA (30–60) → CIA/Interpol
  (60–100). Crossing a threshold is a *telegraphed* event (a session-end hook —
  "a new task force just opened a file on you").
- **Raids** seize *dirty* cash and product at the raided location (doc 09). Clean
  cash in fronts and crew loyalty are **not** directly seized — but if a raid (or a
  bad shipment, or a default) leaves you with **no operating capital and no protection**,
  that's the entry to the death spiral (§4a). A single raid is survivable; being
  *wiped* is not.

## 4a. The death spiral (permadeath, v1.1)

The run's terminal failure mode — the stakes that make every capital decision matter
(`Ideas.md` Storage #1). It is a **readable chain**, never a surprise:

1. **Wipe.** You sink everything into a shipment/deal and lose it (seizure, bust,
   betrayal, market crash). Operating capital → ~0.
2. **Can't pay.** Crew wages, payroll officials (doc 09), and loan installments
   (doc 10) come due and you can't cover them.
3. **Protection collapses.** Unpaid crew/officials walk or flip; your heat isn't
   being managed; guards leave stashes exposed. Your **effective safety** drops.
4. **Hunted.** With no protection, a rival, a stiffed shark, or the state moves on
   you. Death (or long imprisonment) ends the **run** — your high score banks (§7).

**The only exits (all in-fiction, all telegraphed):**
- **A lifeline of credit** — a loan shark or contact who *still trusts you* fronts
  cash or product (doc 10). Reputation is what keeps this door open, which is why rep
  is survival, not flavor.
- **Liquidate fast** — dump clean assets/fronts at a haircut to make payroll.
- **Go to ground** — abandon territory, shed crew, cut heat, and rebuild small.

**Guardrails that keep it fair (not a dark pattern):**
- Every step above is **shown before you commit** to the risk that triggers it
  (deal odds, over-exposure warnings, missed-payment previews). You choose to bet big.
- **Offline never advances the spiral** — you are never killed while away (§0.2, GDD §6).
- Death is the **genre contract** (roguelike), not a punishment for absence.

## 5. Progression pacing (competence spine)

Deterministic mastery tracks that are the *safe* compulsion (meta-achievement
rewards are not linked to problematic play — tandfonline 1521326):

| Track | Milestones | Reward cadence |
|---|---|---|
| Route mastery | Bronze → Silver → Gold per route | Constant-earning bar (battle-pass feel) |
| District control | 1 → all districts on an island | Unlocks next island |
| Front reputation | per laundering business type | Higher clean-cash rate |
| Tech tree | tiered research | New systems (paradigm shifts) |

**Best rewards withheld for biggest beats** (gamedesignskills): the flashiest
unlocks (subs, offshore banking, a new region) land on major story thresholds, not
drip-fed.

## 6. First-session numbers (onboarding budget)

Target: **10–20 min, frustration-free, ends on an open loop.** (GDD §9)

Suggested minute budget for the opening:
- 0–2 min: reveal the dream + first hand-held sale (beat the 2-min churn cliff).
- 2–8 min: 3–4 more deals, first heat scare *survived* (competence), hire first runner.
- 8–15 min: first laundering front opened → sets up the offline engine → session
  ends with money about to accrue and one buyer waiting. That dangling thread is
  the return hook.

Cap on-screen instruction at ~8 words; introduce currency/laundering by minute ~8,
not minute 1 (PvZ delayed core currency to level ~10). (gamedeveloper PvZ)

## 7. High-score & prestige math (v1.1)

The run ends (death/prison); the **score persists**. This is the meta-loop
(`Ideas.md` #4; GDD §7).

- **Run score** = `peak_net_worth` (primary) and an **empire-size composite** =
  `w1·districts + w2·routes + w3·fronts + w4·crew + w5·act_reached`. Track both; show
  a **personal best** and global/seasonal leaderboards (GDD §12).
- **Score banks the instant the run ends**, from peak values reached — so a
  late-game wipe still records the height you climbed to (you're rewarded for how big
  you got, not penalized to zero for dying). This keeps death *thrilling*, not
  demoralizing.
- **Prestige** = deterministic cross-run mastery unlocks (routes mastered, rivals
  toppled, farthest act) — cosmetic/roster unlocks and starting-scenario variety, **not
  power multipliers** (compounding power would dilute the high-score stakes — GDD §7).
- **Voluntary retire** allowed (bank the current run and start fresh) — no punishment
  for choosing to reset.

> **Parked:** the v1.0 Influence/heir-inheritance formula (heir inherits X% of clean
> assets + compounding multipliers) is shelved with Legacy mode (GDD §7). If Legacy
> returns as an optional lower-stakes mode, this is its math. (dl.acm 3173574 held for
> that contingency.)

## 8. What to tune first (playtest priorities)

1. First-session length distribution vs. D1 retention (the §9 hypothesis).
2. Offline cap × front rate — does return feel rewarding without feeling mandatory?
3. Bust-probability clamp — do displayed odds *feel* fair? (survey perceived fairness)
4. Upgrade cost multiplier (1.15) — is there always a next affordable step?
5. **Death-spiral rate & fairness (v1.1 top priority).** How often do runs end in the
   spiral, and did players feel it was *earned/readable* vs. a cheap dice death? A
   too-high or "unfair" death rate is the #1 churn risk of the roguelike pivot (GDD §15).
6. **Run-length distribution** — median time-to-death; is a run a satisfying arc, not a
   grind or a coin-flip?
7. **Randomization variety vs. fairness (§0a)** — do runs feel *different* without any
   spawning *unwinnable*? Track "dead-on-arrival" seeds (should be ~0).
8. **Lifeline reach (doc 10)** — of players who hit a wipe, what % find a credit
   lifeline and recover vs. die? Tune so a wipe is scary but not always terminal.

See `06_Playtest_and_Telemetry.md` for the measurement plan.
