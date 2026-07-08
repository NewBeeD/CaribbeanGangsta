# 05 — Narrative Beats & Simulation Triggers

> Companion to `CaribbeanGangsta_GDD.md` §2–§3. Core principle from the research:
> in systems-driven/idle games **the economy math *is* the narrative** — narrative
> beats should be designed to key off underlying mathematical functions rather than
> scripted events, and should be authored *before* the parameters are tuned
> (dl.acm 3311350). Escalating systemic complexity acts as "rising action"
> (paradigm shifts). This doc maps which simulation thresholds fire which story
> beats.

## 0. The method

1. **Author the beat first, then bind it to a trigger.** Write the rising-and-falling
   arc (small-timer → contender → kingpin → the fall/legacy), *then* attach each
   beat to an economy/heat/crew threshold. (dl.acm 3311350)
2. **Beats key off state, not a script.** No fixed cutscene timeline; the same
   milestone (e.g., first million clean) fires the same beat whenever the *player*
   reaches it — so every player gets a personal, earned story (RimWorld story
   generator — gdcvault 1024232).
3. **Space major beats across larger intervals; build plateaus.** This is both
   pacing and an ethical anti-addiction lever (dl.acm 3311350).
4. **Withhold the best beats for the biggest thresholds** (gamedesignskills).

## 1. The macro arc (authored first)

| Act | Player state | Emotional beat |
|---|---|---|
| I — Come-up | Small dirty cash, 1 district, 1 crew | Hope, first taste of power |
| II — Contender | Multi-district, first front, a rival notices you | Rising heat, first real enemy |
| III — Kingpin | Regional empire, laundering at scale, LE task force | Paranoia, the cost of the crown |
| IV — The Fall | Death (the spiral, doc 01 §4a), prison, or voluntary retire | Reckoning → **your score banks; beat it next run** |

## 2. Trigger table (state → beat)

Each row: a **measurable simulation threshold** fires a **narrative beat**. Numbers
reference `01_Economy_and_Balancing.md` (all tunable).

| Trigger (sim state) | Beat fired | Loop / hook |
|---|---|---|
| First sale completed | Mentor line + the aspiration re-stated | Onboarding (GDD §9) |
| First district controlled | A rival "sends a message" (telegraphed, not yet violent) | Rival arc begins (medium-term hook) |
| First laundering front opened | Offline engine explained *in fiction*; a corrupt banker introduced | Idle engine + relatedness |
| Clean cash crosses 1M | "You're on the map now" — DEA opens a file (heat tier shift) | Rising action; session-end hook |
| Arms unlock researched | Paradigm-shift beat: a new systems layer arrives as rising action | Escalating complexity (dl.acm 3311350) |
| Crew loyalty + agenda + opportunity align | Betrayal arc: warning signs → point of no return | Serialized tension (Sid Meier) |
| Heat crosses CIA/Interpol threshold | The task-force antagonist gets a name and a face | Relatedness (hate object) + tension |
| First international route opened | New region unlocks; scope widens (paradigm shift) | Long-horizon aspiration |
| Major route disruption (big bust / task-force surge / hurricane closes a port) | Networks **reroute** — the Guyana/Suriname corridor opens as an alternate | Adaptive world (GDD §4.7); recoverable setback |
| Supply glut or crash (Chaos Engine) | Prices swing hard; a buyer's-market or fire-sale beat, rivals scramble | Market realism; interesting decision (Sid Meier) |
| Peak net worth milestone | The crown-weighs-heavy beat: family/vice consequences surface | Personal layer (relatedness); also updates high score (GDD §7) |
| **Wipe with no lifeline** (capital ~0, can't pay, no credit) | **Death-spiral arc:** protection collapses → hunted → the fall | Permadeath stakes (doc 01 §4a); run ends |
| Wipe **with** a lifeline (a shark/contact still fronts you) | The comeback beat: you claw back from the brink on borrowed trust | Tension → relief; loan-shark arc (doc 10) |
| Run ends (death / prison / retire) | The fall; **the tally** — score banks, "beat it next run" | High-score chase (GDD §7) |

## 3. Plateaus (deliberate rest)

Between Acts, build a **plateau** — a stretch where the sim ticks along, no major
new system, the player consolidates. The research recommends this explicitly to
create momentum *and* reduce addictive potential (dl.acm 3311350). A plateau is a
good place to surface *quiet character beats* (a crew member's personal request, a
family dinner) rather than escalation.

## 4. Failure = story (and, at the limit, the end of the run)

- Every failed action produces **narrative feedback**, enriched with sensory detail,
  not a bare state report (gamedesignskills). A busted deal is a *scene*.
- **Most failure is recoverable** (dl.acm 3311350) — a raid, a betrayal, a bad market,
  even prison routes into a *new* arc (the comeback). These are setbacks, not walls.
- **But the run itself can end (v1.1).** A total wipe with no lifeline is the
  death-spiral arc (doc 01 §4a) — the roguelike wall. Even then it's *authored as a
  fall*, not a bare "game over": a reckoning scene, then the score tally that dares
  the next run. The wall is the *genre contract*, and it's always **telegraphed**.
- **Sequence:** bad beats — and the fatal one — land *after* the player has banked
  some wins in the arc, and only after readable warning signs (Sid Meier).

## 5. Apophenia budget (leave gaps on purpose)

Don't script every relationship or motive. Strategically omitted detail makes
players imaginatively engage with content that isn't literally there (RimWorld —
gdcvault 1024232). Prefer *implied* backstory (a lieutenant's unexplained scar, a
rival's cryptic history) over fully-authored lore. This is cheaper *and* more
engaging.

## 6. Authoring workflow for the team

1. Write the beat as prose (the scene, the stakes, the choice).
2. Pick its trigger from the sim (a threshold that already exists in doc 01).
3. Tag its confidence: is the trigger *deterministic* (safe spine) or *variable*
   (texture)? Keep act-defining beats deterministic (GDD §5.4).
4. Add branch variants for the 3 reputation paths (street/business/political) so the
   same threshold reads differently per playstyle (autonomy).
5. Playtest: does the beat land as *earned*? (see doc 06 — measure beat reach rates)
