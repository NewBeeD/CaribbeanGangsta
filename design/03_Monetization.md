# 03 — Monetization Design

> Companion to `CaribbeanGangsta_GDD.md` §8. The research is unusually pointed
> here: **dark patterns arise largely from commercial pressure and metrics, not
> designer intent** — designers described it as "us against the business guy," and
> most mobile games as "fundamentally healthy but wrapped in exploitative
> monetization" (dl.acm 3491101). This doc is the contract that keeps monetization
> on the healthy side of that line. It is deliberately conservative.

## 0. The core stance

**Monetize acceleration, expression, and support — never power, and never
absence.** The same study shows the dark path also *increases intention to quit*
(need frustration → churn, tandfonline 0144929X), so a respectful model is also
the retention-safe model. Ethics and revenue point the same way.

## 1. What we sell (allowed)

| Product | Type | Why it's healthy |
|---|---|---|
| **Cosmetics** | Avatar looks, stronghold/vehicle skins, name colors | Pure expression; the safest revenue (dl.acm 3491101) |
| **"Constant-earning" pass** (seasonal) | Battle-pass-style track, mostly cosmetic + convenience | Battle passes were cited as *enhancing* engagement via a constant feeling of earning (dl.acm 3491101) |
| **Convenience / acceleration** | Offline-cap extension, extra crew slot, faster research | Buys time, not power; a patient F2P player reaches the same place |
| **Supporter subscription** | Small monthly: cosmetic drip + QoL + cloud perks | Recurring support without gating content |
| **Remove ads** | One-time | Standard |

## 2. What we never sell (forbidden — each tied to a finding)

| Never | Because |
|---|---|
| **Loot boxes / gacha for progression** | Gambling mechanics were *unanimously* rated the darkest pattern; players regret them even while engaging (dl.acm 3491101) |
| **Pay-to-win on leaderboards** | Pay-to-win is a top player-flagged dark pattern (dl.acm 3491101); GDD §12 keeps ranks skill-based |
| **Losable streaks / "don't lose your progress" pressure** | Contingency/streak rewards link to problematic play, worse for vulnerable (ADHD) players (tandfonline 1521326) |
| **Punishment-relief sales** ("your empire is being raided — pay to stop it") | Weaponizes need frustration and loss aversion; the FarmVille dark pattern (core.ac.uk 30100776) |
| **Energy gates / artificial deficit** | Players flag "Artificial Deficit" and "Invested Value" as manipulative (dl.acm 3491101) |

## 3. Rewarded ads (careful)

- Opt-in only, **bonus-only** framing (watch → *extra* golden-hour buyer), never to
  *undo a loss* or *unlock required progress*.
- Same rule as every timed thing: optional bonus = not a dark pattern
  (core.ac.uk 30100776).

## 4. Transparency (turns any residual risk non-dark)

Disclosure and "manipulation literacy" neutralize darkness (core.ac.uk 30100776):

- **Show real odds** on anything random that's purchasable (there shouldn't be
  much — see §2 — but any drop rate is displayed and honest).
- Clear "what you get" on every purchase; no bait pricing.
- **Optional well-being tools:** a play-time reminder and an easy self-imposed
  spend cap. Players in the research reported a felt need to limit playtime due to
  "burnout" — giving them the tool builds trust (dl.acm 3491101).

## 5. First-purchase & pacing

- **No paywall in the first session.** The opening 10–20 min is protected onboarding
  (GDD §9); nothing is sold there.
- Introduce the store only after the player has felt genuine competence/autonomy —
  monetization rides *on top of* satisfied needs, never in place of them.

## 6. Success metric (aligned incentives)

Track **revenue-per-satisfied-player**, and watch **spend-vs-regret**: if a cohort
shows high spend but low D30 or negative sentiment, treat it as a dark-pattern leak
to fix, not a win. The whole point of §2 is to make "the business guy" and "the
player" want the same thing.

*A separate live-ops pricing doc can follow once the game is in soft-launch; this
doc defines the boundaries that pricing must respect.*
