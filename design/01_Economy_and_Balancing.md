# 01 — Economy & Balancing

> Companion to `CaribbeanGangsta_GDD.md`. This doc turns "the economy math *is*
> the narrative" (dl.acm 3311350) into concrete, tunable numbers. **All values
> below are v1 starting hypotheses to be replaced by playtest telemetry** (see
> `06_Playtest_and_Telemetry.md`) — they exist so the game is *playable and
> falsifiable*, not because they're right.

## 0. Design principles for the numbers

1. **Deterministic spine, variable texture.** Core progression is predictable and
   competence-based; randomness only garnishes it. (GDD §5.4)
2. **No unrecoverable state.** Every number can recover through time; no value can
   hit a floor the player can't climb back from. (dl.acm 3311350)
3. **Estimable-but-fair randomness.** Any displayed odd matches its real
   probability. A "70% clean" run busts ~30% of the time — measured, not vibes.
   (Sid Meier)
4. **Curves, not walls.** Costs escalate smoothly so there's always a next
   affordable step (the "one more day" affordability lever). (Stardew; idle CHI)

## 1. Currencies

| Currency | Source | Sink | Notes |
|---|---|---|---|
| **Dirty cash** | Deals, raids, windfalls | Buying product, bribes, weapons | High-risk to hold; seizable during raids |
| **Clean cash** | Laundering fronts (idle engine) | Legit assets, expansion, bail, upgrades | Safe; the offline-return payoff |
| **Reputation (Street / Business / Political)** | Actions matching a playstyle | Unlocks, alliances, prices | 3 separate tracks = 3 viable paths (autonomy) |
| **Heat** | Deals, violence, size | Decays over time; reduced by bribes/lying low | The tension meter, not a currency you "spend" |
| **Influence (prestige/meta)** | Legacy runs, mastery | Permanent bonuses in Legacy mode | Cross-run; see §7 |

## 2. Core deal loop (Loop 1) math

Base sale margin per unit, by product tier:

| Product | Buy | Sell (base) | Margin | Heat/unit | Unlock |
|---|---|---|---|---|---|
| Weed | 10 | 18 | 80% | 0.1 | Start |
| Pills/synthetics | 40 | 85 | 112% | 0.4 | District controlled |
| Cocaine | 200 | 480 | 140% | 1.0 | Smuggling route |
| Arms (per crate) | 1,500 | 3,200 | 113% | 2.5 | Arms unlock (paradigm shift) |

**Price volatility:** each market price = `base × (1 ± volatility)` where
`volatility` ∈ [0.15, 0.45] driven by supply, events, rivals, LE pressure.
Volatility is *visible* (a price trend arrow), so buy-low/sell-high is a skill
(competence), not a gamble.

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
- **Front upgrade cost curve:** `cost(n) = base × 1.15^n` — the classic idle
  geometric curve; keeps a next affordable step always in reach.

**Golden-hour events** (bonus-only return triggers): spawn on a Poisson process
(~1 per 3–5h online-equivalent), live for 5–15 min, **bonus-only** — missing one
costs a bonus you never had, never a loss. (dl.acm 3173574)

## 4. Heat & law enforcement curve

- Heat accrues per risky action; **decays** at `~5%/hour` (faster when lying low,
  slower at higher empire size).
- Thresholds escalate the LE tier: Local (0–30) → DEA (30–60) → CIA/Interpol
  (60–100). Crossing a threshold is a *telegraphed* event (a session-end hook —
  "a new task force just opened a file on you").
- **Raids** can seize *dirty* cash and product but **never clean assets or crew
  loyalty permanently** — keeps the fail state recoverable. (dl.acm 3311350)

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

## 7. Legacy / prestige math

- On death/imprisonment: heir inherits **X% of clean assets** (start: 25%), full
  reputation minus a decay, and **Influence** = `f(peak net worth, rivals toppled,
  years survived)`.
- Influence buys permanent multipliers (start rate, offline cap, crew loyalty
  floor). Compounding but sub-linear so early runs still matter.
- **Voluntary early legacy** allowed (retire the character) — no punishment for
  choosing to reset, matching ethical NG+. (dl.acm 3173574)

## 8. What to tune first (playtest priorities)

1. First-session length distribution vs. D1 retention (the §9 hypothesis).
2. Offline cap × front rate — does return feel rewarding without feeling mandatory?
3. Bust-probability clamp — do displayed odds *feel* fair? (survey perceived fairness)
4. Upgrade cost multiplier (1.15) — is there always a next affordable step?

See `06_Playtest_and_Telemetry.md` for the measurement plan.
