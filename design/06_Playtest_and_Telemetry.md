# 06 — Playtest & Telemetry Plan

> Companion to every other doc. The research repeatedly shows engagement is a
> **tunable funnel stage, not a fixed property** — onboarding measurably moves
> retention *and* monetization (gdcvault 1019769), and telemetry↔retention links
> are real (gamedeveloper CK3). This doc makes the whole design *falsifiable*:
> every retention claim in the GDD becomes a metric with a target and a kill/keep
> rule.

## 0. Principle: measure needs and funnels, not just DAU

We track two families:
1. **Funnel health** (are players getting in and staying?).
2. **Need satisfaction** (are they *enjoying* it, or compulsively churning?) — because
   need frustration can raise playtime while *predicting quitting* (tandfonline
   0144929X). High engagement + low sentiment = a dark-pattern leak, not a win.

## 1. Core funnel metrics + targets

| Metric | Why | Starting target (hypothesis) |
|---|---|---|
| **First-session length** | Correlates with D1 (11-pt gap over/under ~9 min) | Median 10–20 min (gamedeveloper) |
| **2-minute churn** | ~20% install churn hits here | < 20% (beat the benchmark) |
| **Second-session return** | Only ~half return | > 50% |
| **D1 / D7 / D30 retention** | Standard | D1 ≥ 30% (beat the "long session" cohort) |
| **Session-end open-loop rate** | Do sessions end on a hook? | > 80% of sessions end with a pending thread |
| **Return-to-allocate rate** | Do players come back to spend offline income? | Majority of returns touch the money screen |

*(F2P-mobile benchmarks — treat exact numbers as hypotheses for a slower sim; the
directions are robust. GDD §15.)*

## 2. Need-satisfaction instrumentation (PENS-lite)

Adapt the **PENS** measure — the validated SDT-for-games instrument (autonomy,
competence, relatedness) (selfdeterminationtheory PENS). Lightweight in-game or
post-session micro-surveys:

| Need | Proxy behavior (telemetry) | Optional survey item |
|---|---|---|
| **Competence** *(strongest persistence driver)* | Win-rate trend; do they beat heat scares?; do they stop consulting hints? | "I felt like I was getting good at running the empire" |
| **Autonomy** | Playstyle spread across street/business/political; choice diversity | "I could play it my way" |
| **Relatedness** | Do players name crew?; engagement with character scenes | "I cared what happened to my crew" |

**Watch for the frustration signature:** rising playtime + falling sentiment +
rising rage-quits = need *frustration*, not satisfaction. Escalate as a design bug.
(tandfonline 0144929X)

## 3. Onboarding-specific tests

Onboarding is *prior* to retention (gdcvault 1023231), so test it hardest:
- **Funnel drop map** for the first 20 min (which step loses people — like CK3's
  67→22 box finding: overload is the enemy).
- **Adaptive-hint efficacy:** do fumbling players who get a hint recover?
- **Comprehension ≠ completion:** measure *understanding* of core loop, not tutorial
  completion (CK3: completion didn't predict retention).
- **A/B the reveal order** (dream-first vs. task-first) — GDD §5.2 hypothesis.

## 4. Economy / balance telemetry

Feeds `01_Economy_and_Balancing.md`:
- Bust-odds *perceived* fairness (survey) vs. actual bust rate (must match — Sid Meier).
- Offline cap utilization: are players hitting the 12h cap (raise it) or never
  returning within it (rewards too weak)?
- Upgrade cadence: is there always a next affordable step (1.15 curve check)?
- Currency sinks/faucets balance over a session and a week.

## 5. Narrative-beat reach rates

Feeds `05_Narrative_Beats_and_Simulation_Triggers.md`:
- What % of players reach each act/beat? (Expect a funnel — only ~10% finish AAA
  games, so *aspirational* beats being rare is fine; *early* beats being missed is a
  bug. medium.com ironsource)
- Do act-defining beats land as "earned"? (post-beat micro-survey / sentiment)

## 6. Ethical / well-being monitoring (a real dashboard, not a footnote)

Because the dark path is a *churn* path, we monitor for it:
- **Spend-vs-regret:** cohorts with high spend + low D30 or negative sentiment =
  dark-pattern leak to fix (GDD §8; dl.acm 3491101).
- **Vulnerable-player watch:** heavy-session / late-night patterns; ensure
  well-being tools (reminders, spend caps) get surfaced. Reward risk is higher for
  vulnerable players (tandfonline 1521326).
- **Streak-guilt check:** confirm no notification or UI ever frames absence as loss
  (GDD §6/§8).

## 7. Cadence

| Stage | Method |
|---|---|
| Pre-alpha | Moderated playtests (5–8 players): watch the first session live; where do they get confused/bored? |
| Alpha | Instrument the funnel + PENS-lite; small cohort |
| Beta / soft-launch | Full telemetry; A/B onboarding & reveal order; economy tuning |
| Live | Ongoing funnel + need-satisfaction + ethics dashboards; seasonal re-checks |

## 8. The one rule

**If a change raises a funnel metric but lowers need-satisfaction/sentiment, it does
not ship.** That single rule operationalizes the entire ethical stance: we grow on
satisfied needs, not frustrated ones.
