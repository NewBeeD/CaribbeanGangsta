# Caribbean Gangsta — Rise of the Drug Lord

## Game Design Document (v1.0 — Engagement-Grounded)

> Supersedes `DrugLord_Rising_GDD.md` (v0.1). This version keeps that document's
> vision and systems, and rebuilds the progression/retention layer on top of the
> engagement research in `research/` (164 extracted claims, ~91 verified, 0
> refuted). Every retention mechanic below cites the finding it rests on so the
> design can be defended, tuned, or cut on evidence rather than intuition.
> Sources are given inline as short tags; full URLs are in `research/checkpoints/claims-slim.json`.

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
| [`design/08_Story_Cards_Template_and_Examples.md`](design/08_Story_Cards_Template_and_Examples.md) | The story-writing form + 5 worked example beats (input to content authoring) |
| [`design/09_Storage_and_Corruption.md`](design/09_Storage_and_Corruption.md) | Contraband storage (vaults/secret places) + the corruption network (variable port bribes, politician/police payroll) |

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
| **Genre** | Crime-empire management sim with idle/incremental progression |
| **Platform** | Web-first (HTML5/JS, cloud save) → PWA → native mobile |
| **Audience** | 18+. Fans of Dope Wars, Cartel Tycoon, Football Manager, idle tycoons, RimWorld-style story generators |
| **Core fantasy** | Rise from a small-time Caribbean hustler to an international drug lord through smart deals, ruthless calls, and empire management |
| **Session shape** | 5–20 min core sessions, playable in the gaps of daily life; progresses while you're away |
| **End conditions** | Death or long-term imprisonment; **legacy/heir mode** continues the bloodline (a New Game+ that keeps this from being an unrecoverable fail state — see §7) |

**Unique selling points**
- A **story generator**, not a script: emergent rise-and-fall tales from system
  interaction (rivals, crew, weather, markets, heat). RimWorld's designer credits
  exactly this framing — "not a game, but a story generator" — with unlocking
  compelling play. (gdcvault 1024232)
- **Idle progression done ethically**: the empire runs while you're offline and
  *rewards* your return without *punishing* your absence.
- **Deep, human crew**: NPCs you actually care about — the relatedness engine.
- **Modern crime realism**: laundering, arms, global law enforcement, crypto.

---

## 2. Setting & Narrative

- **World:** A fictional Caribbean island chain — tourist hubs, remote jungle
  labs, working ports — expanding along Latin America → US → Europe routes. A
  **persistent, living world**: seasons, rival empires, and markets keep moving
  whether or not you're watching. Football Manager credits its persistent
  "living, breathing world" as the thing that differentiates it and sustains
  long-term play. (smartseries.sportspromedia)
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

**Loop 4 — Epic (weeks+): The Legacy.**
Become the untouchable kingpin / topple the cartel above you / die rich and
feared. Long-term goals are *aspirational framing* — only ~10% of players finish
AAA games, so this tier sets direction; it is not content most players complete.
(medium.com ironsource)

> **Design rule:** at every potential stopping point, close one loop and open the
> next in the same beat — reward the milestone, then immediately point at the next
> pending goal. That cliffhanger structure is exactly how Civ engineers "just one
> more turn." (gamedeveloper "just one more turn" / Sid Meier)

---

## 4. Key Systems

The systems below are inherited from v0.1; the **"Engagement hook"** notes are new
and tie each to a research finding.

### 4.1 Empire Building & Economy
- Supply chain: farms/labs → smuggling (boats, planes, subs, drones) →
  distribution.
- Diversification: drugs (weed, cocaine, synthetics), arms, precursors.
- **Dynamic markets:** prices move on supply, events, rivals, and law enforcement.
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
- Sourcing and trading weapons; synergies with protection and expansion.
- **Engagement hook:** a **paradigm-shift unlock** — a whole new systems layer that
  arrives mid-game as "rising action," creating fresh momentum without new content
  art. (dl.acm 3311350)

### 4.7 Chaos Engine (Procedural & Emergent)
- System-driven random events: hurricanes, betrayals, market crashes, rival moves,
  windfalls.
- **Engagement hook:** this is the **variable-reward core** — powerful and
  double-edged. See §5 and §8 for how we use it *and* how we bound it.

### 4.8 Contraband Storage — *vaults & secret places* → [`design/09`](design/09_Storage_and_Corruption.md)
- Store product across floor stashes, buried jungle caches, safehouse vaults, and
  port containers — each a different trade of **capacity vs. seizure risk vs. heat
  vs. access speed**.
- **The anti-wipe rule:** a raid hits exactly *one* location, so diversifying caps
  your maximum loss — a bad night is a setback, never a wipe.
- **Engagement hook:** *where to stash* is an **interesting decision with perceived
  impact** (Sid Meier), and the anti-wipe rule keeps it a "safe place to
  experiment" with **no unrecoverable loss** (dl.acm 3311350). Learning to spread
  inventory is a **competence** track.

### 4.9 The Corruption Network — *port bribes & payroll* → [`design/09`](design/09_Storage_and_Corruption.md)
- **Port officials (variable bribes):** pay per shipment to cut seizure risk; the
  price floats on your heat, rival bidding, the official's greed, and your
  reputation — a **negotiation**, not a fixed toll. Asking price + resulting odds
  are shown before you commit; you can haggle or walk.
- **Standing payroll (politicians & police):** put beat cops, a DEA insider, a
  customs chief, a politician, or a judge on a weekly retainer for standing
  protection — raid tip-offs, slowed escalation, dismissed charges. A **judge can
  soften the imprisonment end-state**, feeding Legacy (§7).
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

### 5.4 Variable rewards — use, but bound

Variable-ratio (unpredictable) rewards are the most extinction-resistant schedule —
the engine of "one more turn." They are also the reward type most strongly linked
to *problematic* gaming, and the risk is **higher for vulnerable players (e.g.
ADHD)**. (tandfonline 1521326; dl.acm 3311350)

So we use variable reward for **texture, not for the spine of progression**:
- ✅ A deal occasionally pays out unusually well; a random windfall; a
  golden-hour surprise buyer.
- ❌ Never gate *core progress* behind a gamble. No loot boxes on the
  progression path. Core advancement runs on **deterministic, competence-based**
  tracks (§5.3) so a player is never *forced* to gamble to progress.

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
   slept. (dl.acm 3173574)
2. **No unrecoverable fail state.** Sub-optimal decisions recover through time;
   progression is always possible; the player can disengage at any point without
   substantial consequence. Design the empire as a "safe place" to experiment.
   (dl.acm 3311350)
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

## 7. Progression, Legacy & Prestige

- **Legacy / Heir mode = ethical New Game+.** On death or imprisonment, continue
  through an heir who inherits partial assets, reputation, and permanent bonuses.
  This turns the "fail state" into voluntary meta-progression: players erase current
  progress in exchange for compounding advantages next run — a defining, *voluntary*
  retention mechanic of the idle/incremental genre, and the mechanism that makes
  "death" not an unrecoverable loss. (dl.acm 3173574; dl.acm 3311350)
- **Prestige tracks** reward mastery across runs (routes mastered, empires built,
  rivals toppled) as safe meta-achievement progression. (tandfonline 1521326)
- **Research/tech tree** provides deterministic long-horizon competence goals.
- **Consecutive-day play:** if used at all, keep it a *bonus* (a small returning
  boost), never a *streak you can lose*. Streak/contingency rewards are among the
  patterns players flag as manipulative and are the ones most linked to problematic
  play, especially for ADHD players. Prefer "welcome back" over "don't break your
  streak." (dl.acm 3491101; tandfonline 1521326)

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
| No loot boxes / gacha on the progression path | Gambling mechanics were unanimously rated the darkest pattern, and players regret them even while engaging. (dl.acm 3491101) |
| Streaks are "welcome back" bonuses, never losable | Contingency/streak rewards link to problematic play, worse for vulnerable players. (tandfonline 1521326) |
| Core progression is deterministic & competence-based; variable reward is texture only | Keeps the healthy compulsion (mastery) as the spine, the risky compulsion (gambling) as garnish. (§5.4) |
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

- **MVP (Web):** core deal loop (Loop 1–2), basic empire map, crew (relatedness
  slice), idle/offline engine (§6), legacy mode (§7), the §9 onboarding, one
  rival arc, leaderboards. Deliberately ship a *small subset of high-impact
  features* well rather than everything thinly. (gdcvault 1024232 RimWorld)
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
- **Procedural balance** — the Chaos Engine must avoid unrecoverable frustration
  (§6 rule 2).
- **Theme sensitivity** — fictional only; frame as crime *drama*, not instruction.
- **The variable-reward temptation** — the biggest ongoing risk is that live-ops
  metrics push us toward the dark path (this is *why* dark patterns usually appear —
  "us against the business guy"). §8 is the contract that resists it. (dl.acm 3491101)

---

## 16. Design Implications Checklist (ranked by strength of evidence)

**Strongest (multi-source / verified):**
1. Satisfy competence, autonomy, relatedness — the spine of engagement. (SDT ×3)
2. Nested, chained compulsion loops; close-one-open-one at every stop. (Turducken, Civ)
3. Idle = reward return, never punish absence; no unrecoverable fail state. (idle CHI ×2)
4. First session 10–20 min, invisible tutorial, progressive disclosure, ≤8 words. (PvZ, CK3, first-session, Gamer's Brain)
5. Layer goals; medium-term metagame is the retention backbone; reveal dream-first. (ironsource)

**Strong (single strong source / designer-attributed):**
6. Estimable-but-fair randomness; sequence losses after rewards; interesting decisions. (Sid Meier)
7. Persistent living world + believability + community. (Football Manager)
8. Short low-commitment cycles ("one more day"); withhold convenience for scarcity. (Stardew)
9. Story-generator framing; deliberate omission; small subset of high-impact features. (RimWorld)
10. Failed actions produce narrative feedback; world/NPCs remember. (text-based)

**Guardrails (ethics = retention):**
11. Variable reward as texture, not progression spine. (problematic-gaming study)
12. No gambling on the progression path; streaks are welcome-back, not losable. (CHI'22, problematic-gaming)
13. Prefer completion/mastery rewards (safe) over random/appointment/social (risky). (problematic-gaming)
14. Frustration only as challenge-that-resolves-to-competence; transparency neutralizes darkness. (CHI'22, dark-patterns)

---

**Version:** 1.0 (engagement-grounded)
**Date:** 2026-07-05
**Basis:** `DrugLord_Rising_GDD.md` v0.1 + `research/` engagement study (164 claims, ~91 verified, 0 refuted)
**Author:** Danphil Daniel, with Claude

*Living document — every retention claim above is falsifiable and cited; tune or
cut on evidence, not vibe.*
