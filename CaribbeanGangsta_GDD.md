# Caribbean Gangsta — Rise of the Drug Lord

## Game Design Document (v1.1 — Roguelike pivot)

> Supersedes `DrugLord_Rising_GDD.md` (v0.1) and the v1.0 engagement-grounded pass.
> It keeps that document's vision, systems, and research spine, but **re-genres the
> game** per the design decisions in `Ideas.md`. Every retention mechanic below still
> cites the finding it rests on; where the pivot changes a mechanic, the citation is
> re-interpreted, not deleted. Sources are inline short tags; full URLs are in
> `research/checkpoints/claims-slim.json`.

---

## Design direction (v1.1 — what changed and why)

The v1.0 identity was an **ethical idle/incremental sim** (deterministic spine, no
in-game wipe, Legacy New Game+). Per `Ideas.md`, the identity is now a
**realistic roguelike drug-trading game**. Four pillars flip:

| # | v1.0 (parked) | v1.1 (this doc) |
|---|---|---|
| **Randomness** | Deterministic spine; same play → same result | **Random world per run** — starting country, prices, rivals, and events differ every run. Skill still reads the odds; the *world*, not the player's mastery, is what's random. |
| **Fail state** | No unrecoverable loss; every setback recovers | **Permadeath.** Lose everything → you can't pay crew/loans → no protection → you get killed. A **line of credit / someone who still trusts you** is the *only* lifeline out of the spiral. |
| **Meta-loop** | Legacy / heir inheritance (compounding NG+) | **High-score chase** — money made and empire size. Beat your last run. (Legacy is **parked**, not deleted — see §7.) |
| **Prices** | Scaled game units, real prices as reference only | **Real-life prices are the actual units** (see doc 01 §2). |

**Why this is still ethical (the research survives the pivot).** The dark-pattern
literature condemns two specific things: *punishing real-world absence* and
*real-money gambling on the progression path*. Roguelike permadeath does **neither** —
you die from **in-game decisions you consented to** (the explicit genre contract, à la
Spelunky / FTL / Hades), and **being away never kills you** (offline is frozen/safe,
§6). We keep every guardrail in §8 except "no in-game death," which the genre replaces
with **consensual, telegraphed, skill-expressible death**. Randomness stays
**estimable-but-fair**: odds are always shown, so a run is lost to a *read you got
wrong*, never to a hidden dice roll.

---

## Companion design docs (`design/`)

This GDD is the top-level vision + engagement model. Detailed systems live in
focused companion docs, each grounded in the same research:

| Doc | Covers |
|---|---|
| [`design/01_Economy_and_Balancing.md`](design/01_Economy_and_Balancing.md) | Currencies, deal math, idle/offline rates, heat curves, prestige math, first-session minute budget |
| [`design/02_Crew_and_NPC_Systems.md`](design/02_Crew_and_NPC_Systems.md) | The relatedness engine — NPC model, perspective-taking, memory, betrayal arcs |
| [`design/03_Monetization.md`](design/03_Monetization.md) | What we sell / never sell, tied to the dark-pattern boundary |
| [`design/04_UX_and_UI.md`](design/04_UX_and_UI.md) | Core screens, first-session flow, session-end hooks, notifications |
| [`design/05_Narrative_Beats_and_Simulation_Triggers.md`](design/05_Narrative_Beats_and_Simulation_Triggers.md) | Macro arc + which sim thresholds fire which story beats |
| [`design/06_Playtest_and_Telemetry.md`](design/06_Playtest_and_Telemetry.md) | Turns every retention claim into a measured, falsifiable metric |
| [`design/07_Wireframes.md`](design/07_Wireframes.md) | Text/layout sketches of every core screen + the first-session flow (input to the art/mockup pass) |
| [`design/08_Story_Cards_Template_and_Examples.md`](design/08_Story_Cards_Template_and_Examples.md) | The story-writing form + 19 worked example beats (5 core + 5 realism + 5 failure-side + 4 payoff) (input to content authoring) |
| [`design/09_Storage_and_Corruption.md`](design/09_Storage_and_Corruption.md) | Contraband storage (vaults/secret places) + the corruption network (variable port bribes, politician/police payroll) |
| [`design/10_Debt_and_Loan_Sharks.md`](design/10_Debt_and_Loan_Sharks.md) | Borrowing at interest from loan sharks + the growing-debt pressure engine (the early-game capital source; ethical contract) |

---

## 0. How to read this document

The original GDD answered **"what systems does the game have?"** This one adds
**"why will a player come back tomorrow, and how do we do that without becoming a
slot machine?"**

Three ideas from the research frame everything:

1. **Engagement comes from satisfying three psychological needs — competence,
   autonomy, relatedness — not from reward loops alone.** Need satisfaction
   predicts enjoyment *and* intention to keep playing; each need contributes
   independently. (SDT — selfdeterminationtheory.org PENS; researchgate 225998888)
2. **Compulsion has a healthy form and a dark form, and they come from opposite
   places.** Healthy "one more turn" comes from *need satisfaction*. Compulsive,
   regretful play comes from *need frustration* — and need frustration also
   predicts intention to *quit*. So the dark path loses players too. (tandfonline
   0144929X; selfdeterminationtheory SDT 2010)
3. **A mechanic is only a "dark pattern" when three things hold at once:
   creator intent to harm, an experience against the player's interest, and no
   player consent.** Appointment mechanics, daily rewards, and sunk-cost loops are
   not inherently dark — they go dark on *tuning and combination*. (core.ac.uk
   30100776; dl.acm 3491101 CHI'22)

We use these as a filter: **keep the compulsion that comes from mastery, choice,
and characters; refuse the compulsion that comes from punishing absence, fear of
loss, and gambling.**

---

## 1. Game Overview

| | |
|---|---|
| **Title** | Caribbean Gangsta — Rise of the Drug Lord |
| **Genre** | **Roguelike crime-empire trading sim** — high-variance runs, permadeath, high-score chase |
| **Platform** | Web-first (HTML5/JS, cloud save) → PWA → native mobile |
| **Audience** | 18+. Fans of Dope Wars / Drug Lord 2, Cartel Tycoon, roguelikes (Spelunky, FTL), RimWorld-style story generators |
| **Core fantasy** | Rise from a small-time Caribbean hustler to an international drug lord through smart deals, ruthless calls, and empire management — knowing one bad run can end you |
| **Session shape** | 5–20 min core sessions, playable in the gaps of daily life; progresses while you're away (offline is safe — it never kills you) |
| **End conditions** | **Permadeath** — killed (broke, unprotected, no lifeline) or long-term imprisonment. A run ends; your **high score** (money made / empire size) persists to beat next time (§7). Death is the genre contract, not a punishment for absence. |

**Unique selling points**
- A **story generator**, not a script: emergent rise-and-fall tales from system
  interaction (rivals, crew, weather, markets, heat). RimWorld's designer credits
  exactly this framing — "not a game, but a story generator" — with unlocking
  compelling play. (gdcvault 1024232)
- **A different run every time**: randomized world (country, prices, rivals, events)
  means last run's plan won't win this one — you master the *odds*, not a script.
- **Real stakes**: permadeath. Bet everything on one shipment and lose it, and the
  spiral is real — no protection, hunted, dead unless someone still fronts you.
- **Real economics**: real-life drug and arms prices with real supply/demand swings
  (Drug Lord 2-style), not made-up numbers.
- **Deep, human crew**: NPCs you actually care about — the relatedness engine.
- **The high-score chase**: every run feeds one number — beat your best.

---

## 2. Setting & Narrative

- **World:** A fictional Caribbean island chain — tourist hubs, remote jungle
  labs, working ports — expanding along Latin America → US → Europe routes. A
  **persistent, living world**: seasons, rival empires, and markets keep moving
  whether or not you're watching. Football Manager credits its persistent
  "living, breathing world" as the thing that differentiates it and sustains
  long-term play. (smartseries.sportspromedia)
- **Grounded in the real transit model.** The Caribbean's real role is a
  **cocaine transit corridor** — product sourced from the Andean region moves
  through Caribbean hubs toward US and European markets, greased by port
  corruption and financed by US-sourced firearms flowing south (the "Iron
  River"). We model that: **cocaine-dominant** trade, secondary synthetics and
  arms, and networks that **adapt** — when one route is disrupted, traffic shifts
  (e.g., toward the Guyana/Suriname corridor). This grounding is a *believability*
  investment (see Tone below), not a documentary. (UNODC, DEA, InSight Crime
  trafficking research — see `realism_recommendations.md`)
- **Protagonist:** Customizable Caribbean gangsta; background choice (dock worker,
  fisherman's kid, deported hustler, ex-soldier, resort insider) sets starting
  bonuses and opening story hooks.
- **Tone:** Gritty realism, dark humor, moral ambiguity, cultural flavor
  (Carnival, local politics, patois dialogue). **Believability is a retention
  mechanic** — avoid anything that "jolts" the player out of the fiction.
  (smartseries.sportspromedia)
- **Narrative style:** Branching and emergent. The **economy math *is* the
  narrative** — new systems unlocking over time act as rising action, so story
  beats key off the simulation rather than scripted cutscenes. (dl.acm 3311350;
  academia.edu 90071060 shows an incremental loop can carry a full, imagery-rich
  story that playtesters found highly engaging.)
- **Deliberate omission as a feature:** Don't build everything. Leaving gaps makes
  players imaginatively fill in a richer world than you shipped (apophenia), and
  engagement depends on a *small subset of high-impact features*, not feature
  completeness. (gdcvault 1024232 RimWorld)

---

## 3. The Core Loops (Nested Compulsion)

Engaging games are **layers of chained, nested compulsion loops** — a
moment-to-moment micro-experience, wrapped in a progression system, wrapped in an
epic narrative. This nesting is what produces "one more turn," and it's
genre-agnostic. (gdcvault 1014958 "Turducken"; the compulsion loop is treated as
"the atomic unit of gameplay.")

**Loop 1 — Micro (seconds–minutes): The Deal.**
Buy low / sell high / move product / dodge heat. Every action returns feedback,
including failure. In a text/UI-driven game, *failed* actions must still produce
narrative feedback — a busted deal reads as a scene, not an error message.
(gamedesignskills text-based)

**Loop 2 — Session (minutes): The Day / The Job.**
A run of deals, a laundering cycle, a crew assignment, a rival skirmish. Modeled
on **Stardew's ~20-minute day**: keep the per-cycle commitment cost *low* so
players keep saying "one more day." Low friction to continue is the "ability"
lever in Fogg's behavior model. (linkedin Stardew)

**Loop 3 — Metagame (hours–days): Building the Empire.**
Territory, supply chains, laundering fronts, crew development, the tech tree.
**This is the most important tier for retention** — medium-term goals bridge
moment-to-moment play and long-term aspiration and occupy most of the player's
time. Invest design effort here. (medium.com ironsource "player goals")

**Loop 4 — Epic (across runs): The High Score.**
Become the untouchable kingpin / topple the cartel above you / die rich and feared —
then do it *bigger* next run. In the roguelike frame (v1.1) this tier is the
**cross-run chase**: each run feeds one number (peak net worth / empire size) and the
run-end screen dares you to beat it. Long-term in-run goals are *aspirational framing*
(only ~10% of players finish AAA games); the high score is what actually pulls the
*next* run. (medium.com ironsource; §7)

> **Design rule:** at every potential stopping point, close one loop and open the
> next in the same beat — reward the milestone, then immediately point at the next
> pending goal. That cliffhanger structure is exactly how Civ engineers "just one
> more turn." (gamedeveloper "just one more turn" / Sid Meier)

---

## 4. Key Systems

The systems below are inherited from v0.1; the **"Engagement hook"** notes are new
and tie each to a research finding.

### 4.1 Empire Building & Economy
- Supply chain: farms/labs (local cannabis, imported precursors) → smuggling
  (go-fast boats, semi-submersibles, light aircraft/air drops, drones,
  containerized cargo) → distribution through Caribbean hubs into US/Europe.
- Diversification: **cocaine is primary** (the transit-corridor reality);
  secondary lines are synthetics (pills/meth, plus fentanyl precursors sourced
  from Asia), arms, and precursor chemicals, with extortion/side revenues later.
- **Dynamic markets:** prices move on supply gluts, weather, events, rivals, and
  law-enforcement pressure — and disruption **forces route shifts** (§4.7).
- **Engagement hook:** markets are the primary source of **interesting decisions**
  — a decision is only interesting if the player perceives it as having impact, so
  surface consequence clearly even when the underlying swing is modest. (Sid Meier)

### 4.2 Money Laundering
- Legit fronts: nightclubs, resorts, casinos, real estate, crypto, music, horse
  racing.
- Advanced: offshore banking, trade-based laundering, underground networks,
  political donations.
- **Engagement hook:** laundering fronts are the **idle/offline engine** (§6) —
  they generate clean income while you're away and become the reason to return.

### 4.3 Crew & Social Simulation — *the relatedness engine*
- Deep NPCs: traits, loyalty, skills, hidden agendas, memory of what you've done.
- Recruitment, training, promotion; betrayal and snitching are possible.
- **Engagement hook:** relatedness is one of the three needs that independently
  predict enjoyment and intention to keep playing. In a single-player game it's
  satisfied through **connection with fictional characters, primarily via
  perspective-taking** — so give crew members interiority, not just stat lines.
  (frontiersin frvir 847120; SDT) NPC **memory that ripples earlier choices
  forward** deepens felt connection to decisions. (gamedesignskills text-based)

### 4.4 Rivals & Alliances
- Multiple AI rivals with distinct styles (the violent bull, the politician, the
  ghost, the tech cartel).
- Diplomacy, turf wars, temporary alliances, intelligence gathering.
- **Engagement hook:** rivals are **serialized medium-term arcs** — a named
  antagonist with a grudge that escalates over days is a return hook and a
  relatedness object (you can hate a character too).

### 4.5 Law Enforcement & Threats
- Escalating heat: Local → DEA → CIA/Interpol. Undercover agents, wiretaps, raids,
  asset seizures, counter-intel.
- **Engagement hook:** heat is the **tension/estimable-uncertainty system**.
  Randomness should be *estimable but uncertain* — displayed risk should match real
  outcomes (a "70% clean" deal busts about 30% of the time), which pairs suspense
  with perceived fairness. **Sequence bad outcomes *after* rewards are
  established**, never before. (Sid Meier) See §8 for the ethical line on loss.

### 4.6 Arms Dealing
- Sourcing and trading weapons; synergies with protection, turf, and expansion.
- **Real-world grounding:** guns flow *south* — US-sourced via straw purchases (the
  "Iron River"), handguns and rifles moving into the Caribbean. Arms carry
  **higher heat** than product and pair with the violent/protection playstyle.
- **Engagement hook:** a **paradigm-shift unlock** — a whole new systems layer that
  arrives mid-game as "rising action," creating fresh momentum without new content
  art. (dl.acm 3311350)

### 4.7 Chaos Engine (Procedural & Emergent)
- System-driven random events: hurricanes, betrayals, market crashes/supply
  gluts, rival moves, LE surges, windfalls.
- **Adaptive routes (realism):** a major disruption (a big bust, a task-force
  surge, a hurricane closing a port) pushes traffic onto **alternate corridors**
  (e.g., Guyana/Suriname) — mirroring how real networks reroute rather than
  collapse. This makes the world feel alive and keeps a setback recoverable (§6).
- **Engagement hook:** this is the **variable-reward core** — powerful and
  double-edged. See §5 and §8 for how we use it *and* how we bound it.

### 4.8 Contraband Storage — *vaults & secret places* → [`design/09`](design/09_Storage_and_Corruption.md)
- Store product across floor stashes, buried jungle caches, safehouse vaults, and
  port containers — each a different trade of **capacity vs. seizure risk vs. heat
  vs. access speed**.
- **Diversification is survival (v1.1):** a raid hits exactly *one* location, so
  spreading product caps a single night's loss. Concentrate everything in one place
  to save on storage and a bad roll can wipe you — and a wipe starts the death spiral
  (doc 09). Where you stash is now a *life-or-death* risk decision, not just a setback.
- **Engagement hook:** *where to stash* is an **interesting decision with perceived
  impact** (Sid Meier). The skill is reading exposure vs. cost; getting it wrong is
  how runs end. Learning to spread inventory is a **competence** track with real
  stakes. (dl.acm 3311350 — re-read for the roguelike frame)

### 4.9 The Corruption Network — *port bribes & payroll* → [`design/09`](design/09_Storage_and_Corruption.md)
- **Port officials (variable bribes):** pay per shipment to cut seizure risk; the
  price floats on your heat, rival bidding, the official's greed, and your
  reputation — a **negotiation**, not a fixed toll. Asking price + resulting odds
  are shown before you commit; you can haggle or walk.
- **Standing payroll (politicians & police):** put beat cops, a DEA insider, a
  customs chief, a politician, or a judge on a weekly retainer for standing
  protection — raid tip-offs, slowed escalation, dismissed charges. A **judge can
  soften the imprisonment end-state**, keeping a run alive for a comeback instead of
  ending it (§7).
- **Engagement hook:** deterministic *benefits* (buy safety) with a **telegraphed,
  readable betrayal risk** — a bought official can be underpaid, out-bid by a rival,
  or turned by LE into a wire (the snitch loop, §4.3). It's the **relatedness +
  counter-intel** layer, the backbone of the *business/political* playstyle
  (autonomy, §10), and a healthy **clean-cash sink** for the idle payoff. Kept off
  the dark-pattern line: optional power, never gambling or player-guilt (§8).

---

## 5. The Engagement Model (Why Players Return)

This section is the heart of the rebuild. It replaces v0.1 §5's feature list with a
model grounded in the research.

### 5.1 Satisfy the three needs first

Everything else is secondary to this. (SDT — PENS; researchgate 225998888;
tandfonline 0144929X)

| Need | What it means here | Concrete levers |
|---|---|---|
| **Competence** *(strongest driver of persistence)* | The player feels they're getting good at running an empire | Clear, timely feedback on every action; difficulty that ramps gradually; goals scaled to current skill. Competence was the single strongest predictor of whether players *chose to keep going*. (researchgate 225998888) |
| **Autonomy** *(leading driver of enjoyment in narrative games)* | Meaningful, consequential choice over goals and methods | Multiple viable playstyles (violent / business / political / low-profile / tech); rewards framed as **informational feedback, not behavioral control**. Autonomy was the most-cited reason for enjoyment in a narrative-game study (30% of responses). (frontiersin 847120; researchgate) |
| **Relatedness** | Caring about (or hating) the people in your story | Crew interiority, rival grudges, family/personal layer, perspective-taking scenes. (frontiersin 847120) |

> **Competence is the "price of admission."** Intuitive controls strongly predict
> continued play — but that effect is *fully mediated* by competence and autonomy.
> A clean, learnable UI doesn't hook players; it *lets* the need satisfaction hook
> them. Don't over-invest in flashy UI at the expense of clear feedback.
> (researchgate 225998888)

### 5.2 Goal layering & reveal order

Structure the player's time across three goal horizons, and **reveal them in a
specific non-chronological order** (medium.com ironsource):

1. **Long-term aspirational goal — revealed first**, to set context ("become the
   drug lord of the Caribbean"). Shown in the opening, before the player has skill.
2. **Short-term goals — during the tutorial** (make your first sale, hire your
   first runner).
3. **Medium-term goals — only after rudimentary skill** (control a district, open a
   laundering front). This is the retention backbone; don't dump it on minute one.

### 5.3 Reward pacing

- Withhold the **best rewards until the most significant story beats** to drive
  forward momentum. (gamedesignskills text-based)
- Prefer **continuous-progress "constant earning" structures** (a laundering
  "reputation track," a smuggling-route mastery bar) — a battle-pass-style constant
  sense of earning is perceived as *enhancing*, not degrading, engagement.
  (dl.acm 3491101)
- **Meta-achievement/completion rewards are the safe compulsion.** Trophies,
  completion percentages, and mastery milestones were **not** linked to problematic
  gaming, unlike random/appointment/social rewards. Lean on these for the
  always-on progression scaffolding. (tandfonline 1521326)

### 5.4 Randomness — a random world, not a slot machine (roguelike model)

Variable-ratio (unpredictable) rewards are the most extinction-resistant schedule —
the engine of "one more turn." They are also the reward type most strongly linked
to *problematic* gaming, especially for **vulnerable players (e.g. ADHD)**, when the
randomness is a **hidden dice roll the player can't read or a real-money gamble**.
(tandfonline 1521326; dl.acm 3311350)

The roguelike pivot leans *into* randomness — but on the healthy side of that line.
The distinction is **estimable-but-fair**: the *world* is random, the *outcome* is a
skill read.

- ✅ **The world seed varies every run** — starting country, price boards, rival
  personalities, the events that hit you. No two runs are the same, so mastery is
  *transferable knowledge* (reading a market, spreading inventory, timing a bribe),
  never a memorized optimal line.
- ✅ **Every risk shows its odds before you commit** — a "70% clean" run busts ~30%
  of the time, measured (§8, doc 01 §2a). You lose a run to a *read you got wrong*,
  not to a concealed roll. That's what keeps high variance feeling *fair*.
- ❌ **No real-money gambling on progress.** No loot boxes, no gacha, no paid
  reroll. In-game risk is free and information-rich; the wallet is never the dice.

> This is the difference between a roguelike and a slot machine: both are random,
> but a roguelike **pays out to skill** and **shows you the odds**. We are the
> former. (Sid Meier estimable-uncertainty; §8 guardrails.)

---

## 6. Idle / Offline Progression (Ethical Appointment Design)

The empire runs while the player is away. Idle design is where "addictive" and
"respectful" diverge most sharply, and the research is unusually specific here.

**The genre's core structure is a push–pull:** rules that encourage the player to
*leave* balanced against rules that reward *returning*, with the game progressing
autonomously in between. (dl.acm 3173574; dl.acm 3311350)

**Our idle rules (all evidence-backed):**

1. **Absence forgoes gains but never risks existing progress.** Idle games retain
   *without* loss-aversion pressure — unlike FarmVille, where you "must check in or
   lose progress." Your stash doesn't rot; your fronts don't burn down because you
   slept; **and you never get killed while offline.** Death only ever comes from
   *in-game decisions you made*, never from time away. (dl.acm 3173574)
2. **The fail state is in-game, consensual, and telegraphed — never a punishment for
   absence.** This is the roguelike contract (v1.1): over-expose yourself — bet the
   whole bankroll on one shipment, run with no protection, default on a shark with no
   lifeline — and a bad roll can spiral into death (see doc 09 death-spiral, doc 10
   lifeline). But the spiral is always **readable before you enter it** (odds shown),
   and **offline never advances it**. The empire is a "safe place to experiment"
   *within a run*; the stakes are that the run itself can end. (dl.acm 3311350 —
   re-read for the roguelike frame)
3. **The longer you're away, the more *options* await on return** (accumulated
   cash to allocate, decisions queued, events to resolve) — return is rewarded with
   *interesting choices*, not just a bigger number. (dl.acm 3173574)
4. **Return triggers are bonus-only and non-punitive.** Time-limited events (a
   "golden hour" buyer, a bent cop offering a one-time deal) work like Cookie
   Clicker's golden cookies: they *pull* you back and signal *attention is welcome
   but not required*. Missing one costs you a bonus you never had — never a loss.
   (dl.acm 3173574)
5. **Escalating complexity as rising action.** New systems/interface layers unlock
   over time (arms, offshore banking, international routes), which reads as
   narrative momentum. Space major beats across *larger* time intervals and build
   deliberate **plateaus that encourage temporary disengagement** — the research
   explicitly recommends this to reduce addictive potential. (dl.acm 3311350)

> **The bright line (from the dark-pattern literature):** appointment mechanics
> are dark *only* when a punishment forces you to schedule real life around the
> game; the same mechanic is fine when the timed content is **optional bonus**.
> (core.ac.uk 30100776) Every timed thing in this game is optional bonus.

---

## 7. Progression, High-Score & Prestige

**The meta-loop is the high-score chase (v1.1).** A run ends in death or prison; what
persists is your **score** — and the whole game is built to make you say *"one more
run, I can beat that."*

- **The score = money made and/or empire size.** Track a primary leaderboard number
  (peak net worth) and an empire-size composite (districts, routes, fronts, crew).
  Surface a **personal best** prominently, plus global/seasonal boards (§12). The
  run-end screen always reads "New best?" / "you were $X short" — the roguelike
  cliffhanger that starts the next run.
- **Prestige tracks** reward mastery across runs (routes mastered, empires built,
  rivals toppled, farthest act reached) as safe meta-achievement progression — the
  *safe* compulsion, not linked to problematic play. (tandfonline 1521326)
- **Research/tech tree** provides long-horizon competence goals *within* a run.
- **Consecutive-day play:** if used at all, keep it a *bonus* (a small returning
  boost), never a *streak you can lose*. Streak/contingency rewards are among the
  patterns players flag as manipulative and most linked to problematic play,
  especially for ADHD players. Prefer "welcome back" over "don't break your streak."
  (dl.acm 3491101; tandfonline 1521326)

> **Legacy / Heir mode is PARKED, not cut (v1.1).** The v1.0 plan — an heir inherits
> partial assets and permanent bonuses on death — is shelved because it *dilutes* the
> high-score stakes (if death compounds into an advantage, death stops mattering, and
> the roguelike tension collapses). We keep the design on ice: if playtests show pure
> permadeath is too punishing to retain players, Legacy returns as an **optional
> lower-stakes mode** alongside the high-score mode, never replacing it. The
> meta-achievement/prestige scaffolding above is the retention backbone in the
> meantime. (dl.acm 3173574 preserved for that contingency.)

---

## 8. The Ethical Line (Design Guardrails)

We build genuine compulsion and refuse predatory compulsion. The test, applied to
every retention feature: **does it satisfy needs, or exploit their frustration?**
Need frustration drives problematic play *and* intention to quit — so the
predatory path is also the churning path. (tandfonline 0144929X)

**Guardrails, each tied to a finding:**

| Guardrail | Rationale |
|---|---|
| No punishment for absence; timed content is always optional bonus | Appointment mechanics are dark only when absence is punished. (core.ac.uk 30100776; dl.acm 3173574) |
| No loot boxes / gacha / paid rerolls on the progression path | Gambling mechanics were unanimously rated the darkest pattern, and players regret them even while engaging. High variance is fine; a *real-money* gamble is not. (dl.acm 3491101) |
| Streaks are "welcome back" bonuses, never losable | Contingency/streak rewards link to problematic play, worse for vulnerable players. (tandfonline 1521326) |
| Randomness is estimable-but-fair: odds always shown, skill reads them; never a hidden roll | Keeps the healthy compulsion (mastering the odds) and rejects the slot-machine one (a concealed dice roll). The world is random; the outcome is a skill read. (§5.4; Sid Meier) |
| **Permadeath is consensual and in-game, never a punishment for absence** | The dark-pattern line is about punishing *real-world* absence; a roguelike death from *in-game* decisions the player opted into (and could read the odds of) is the genre contract, not a dark pattern. Offline never kills you. (core.ac.uk 30100776 re-read; §6) |
| Frustration is allowed only as *challenge that resolves into competence*, never as artificial deficit | "Interested" marks healthy engagement; designed-in frustration to force investment is the failure mode. (dl.acm 3491101) |
| Optional session-limit / well-being nudges; transparent about randomness (show real odds) | Disclosure/"manipulation literacy" neutralizes darkness; estimable-but-fair odds build trust. (core.ac.uk 30100776; Sid Meier) |
| Monetization = acceleration & cosmetics only; never pay-to-win on leaderboards | Pay-to-win is a top player-flagged dark pattern; commercial pressure, not design, is the usual source of darkness. (dl.acm 3491101) |

> These aren't just ethics — they're retention. The same research says the dark
> path frustrates needs, and need frustration predicts quitting. Doing right here
> *is* the growth strategy.

---

## 9. The First Session (Onboarding)

The single steepest drop-off in any game is the opening. The numbers (F2P mobile —
transferability to a slower sim is an open question, but the *direction* is robust):

- ~**20% of installs churn in the first 2 minutes**; only ~**half** of first-session
  players return for a second session. (gamedeveloper "how first session length")
- **First-session length correlates with Day-1 retention**: sessions over the
  ~9-min mean saw **31%** D1 retention vs **20%** for shorter — an 11-point gap.
  Target a **10–20 minute**, frustration-free first session that **ends in a
  return-conducive state.** (gamedeveloper; >70% F2P churn in the first few
  minutes per gdcvault 1019769)
- **Onboarding is *prior* to retention** — if you don't capture attention in the
  first minutes, no downstream retention mechanic ever gets to run. (gdcvault
  1023231 Gamer's Brain)

**Our onboarding rules:**

1. **Invisible tutorial.** No screen labeled "Tutorial." Teach through the fiction —
   a first score, a first buyer, a first close call. (gamedeveloper PvZ / George Fan)
2. **Learn by doing, not reading.** One demonstration of an action's result teaches
   better than text. Show hints *adaptively* — only to players visibly making
   mistakes — to preserve competence for quick learners. (PvZ / Fan)
3. **Progressive disclosure.** Introduce systems across many sessions, not upfront.
   CK3 cut its tutorial from **67 message boxes to ~22** and treated information
   overload as *the* first-session problem; completion of the tutorial did **not**
   predict retention — comprehension/investment did. (gamedeveloper CK3)
4. **≤ ~8 words of instruction on screen at once**, "eloquent caveman" style; verbose
   instruction makes players tune out. (PvZ / Fan)
5. **Narrative-framed teaching.** Deliver mechanics through story events (a mentor,
   a first job gone sideways) — a common technique in the best strategy tutorials.
   (gamedeveloper CK3; gamedesignskills)
6. **Reveal the dream first.** Open on the aspiration (the empire you could build),
   then teach the short-term moves. (medium.com ironsource — §5.2)
7. **Respect decision fatigue.** Gate how many options are live at once; each choice
   spends willpower. Don't expose the whole map, tech tree, and market on minute one.
   (Sid Meier)

---

## 10. Player Agency & Paths

- Multiple viable playstyles: **violent, business/diplomatic, political,
  low-profile, tech-focused** — each satisfies autonomy, the leading enjoyment
  driver in narrative games. (frontiersin 847120)
- Moral/stress systems shape (but never fully script) outcomes.
- Branching consequences based on reputation and prior choices; the world
  *remembers*. (gamedesignskills text-based)
- **Violence is a valid path but not the hook.** Violent content is *not*, on
  average, a significant motivator once need satisfaction is accounted for —
  autonomy and competence predict enjoyment, not violence level. Sell the *empire
  and the choices*, not the body count. (SDT 2010)

---

## 11. Session-End Hooks (Don't Let Them Leave Clean)

Because the metagame is the retention backbone (§5.2) and idle rewards return
(§6), every session should end on an **open loop**:

- A deal in flight that resolves on return.
- A rival's move telegraphed but not yet landed.
- A crew member's dilemma awaiting your call.
- Accumulating offline income the player will want to *allocate*.

This is the Civilization cliffhanger applied to a life sim: reward the stopping
point, then immediately dangle the next pending goal. (gamedeveloper Sid Meier;
gdcvault 1014958 nested loops)

---

## 12. Social & Competitive Layer

- **Leaderboards** (net worth, empire score, survival, seasonal) — framed as
  *aspirational context and mastery display*, never as pay-to-win ranks
  (monetization stays cosmetic/acceleration). (dl.acm 3491101)
- **Community as an acquisition + retention engine.** Football Manager credits its
  1996 forums — turning players into word-of-mouth advocates — with organic growth
  strong enough to outsell its predecessor. Build shareable "rise and fall" stories
  and empire recaps players *want* to post. (smartseries.sportspromedia)
- Friends, temporary alliances, clan/gang systems — relatedness at the meta layer.

---

## 13. Technical & Platform

- **Web-first:** HTML5/JS, cloud save sync, real-time leaderboard updates.
- **Mobile:** PWA → native. Push notifications for **optional bonus** events only
  (never "your crops are dying" guilt pings — see §8).
- **Cross-platform:** seamless progress web ↔ mobile.
- **Verisimilitude infrastructure:** FM's compulsion is built on *costly
  believability* (an 800k-entity database, 1,000+ scouts). We can't match that, but
  the lesson holds — invest in a coherent, consistent world model so nothing
  "jolts" the player out. Consistency of world logic is itself a retention feature.
  (smartseries.sportspromedia; gamedesignskills)

---

## 14. Scope & Development Phases

- **MVP (Web):** core deal loop (Loop 1–2), randomized run setup (country/prices/
  rivals, §5.4), basic empire map, crew (relatedness slice), idle/offline engine
  (§6), **permadeath + high-score/leaderboard loop (§7)**, the loan-shark lifeline
  (doc 10), the §9 onboarding, one rival arc. Deliberately ship a *small subset of
  high-impact features* well rather than everything thinly. (gdcvault 1024232 RimWorld)
- **Expansion:** full simulation depth (laundering breadth, arms, international
  routes as paradigm-shift unlocks), action missions, more rival arcs, mobile port.
- **Live Ops:** seasonal events (Cartel Wars, Carnival), balancing, new content —
  always bonus-only, never punitive.

---

## 15. Risks & Open Questions

- **F2P-mobile stats may not transfer.** The churn/session benchmarks in §9 come
  from F2P mobile data (deltaDNA, ~275 games, 2015–16). A slower single-player sim
  may retain differently. Treat the *directions* as robust, the *exact numbers* as
  hypotheses to A/B test. (gamedeveloper "how first session length")
- **Balancing depth vs. accessibility** — progressive disclosure (§9) is the
  primary tool.
- **Procedural balance (v1.1 critical)** — death must always feel *earned and
  readable*, never an arbitrary dice roll. The Chaos Engine may end a run, but only
  after telegraphed warnings and only when the player over-exposed themselves against
  odds they could see (§5.4, §6 rule 2). "Cheap" deaths are the top churn risk here.
- **Theme sensitivity** — fictional only; frame as crime *drama*, not instruction.
- **The variable-reward temptation** — the biggest ongoing risk is that live-ops
  metrics push us toward the dark path (this is *why* dark patterns usually appear —
  "us against the business guy"). §8 is the contract that resists it. (dl.acm 3491101)

---

## 16. Design Implications Checklist (ranked by strength of evidence)

**Strongest (multi-source / verified):**
1. Satisfy competence, autonomy, relatedness — the spine of engagement. (SDT ×3)
2. Nested, chained compulsion loops; close-one-open-one at every stop. (Turducken, Civ)
3. Idle = reward return, never punish absence; offline is always safe. Death is in-game & consensual (v1.1 roguelike), never from absence. (idle CHI ×2)
4. First session 10–20 min, invisible tutorial, progressive disclosure, ≤8 words. (PvZ, CK3, first-session, Gamer's Brain)
5. Layer goals; medium-term metagame is the retention backbone; reveal dream-first. (ironsource)

**Strong (single strong source / designer-attributed):**
6. Estimable-but-fair randomness; sequence losses after rewards; interesting decisions. (Sid Meier)
7. Persistent living world + believability + community. (Football Manager)
8. Short low-commitment cycles ("one more day"); withhold convenience for scarcity. (Stardew)
9. Story-generator framing; deliberate omission; small subset of high-impact features. (RimWorld)
10. Failed actions produce narrative feedback; world/NPCs remember. (text-based)

**Guardrails (ethics = retention):**
11. Random *world*, fair *odds*: high variance is fine when odds are shown and skill reads them; no hidden roll, no real-money gamble. (v1.1; problematic-gaming study)
12. No gambling on the progression path; streaks are welcome-back, not losable. (CHI'22, problematic-gaming)
13. Prefer completion/mastery rewards (safe) over random/appointment/social (risky). (problematic-gaming)
14. Frustration only as challenge-that-resolves-to-competence; transparency neutralizes darkness. (CHI'22, dark-patterns)

---

**Version:** 1.1 (roguelike pivot)
**Date:** 2026-07-08
**Basis:** v1.0 engagement-grounded GDD + `Ideas.md` design decisions (random world, permadeath, high-score, real prices)
**Author:** Danphil Daniel, with Claude

*Living document — every retention claim above is falsifiable and cited; tune or
cut on evidence, not vibe.*
