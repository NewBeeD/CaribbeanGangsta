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
| IV — The Fall / Legacy | Death, prison, or voluntary retirement | Reckoning → the heir inherits |

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
| Peak net worth milestone | The crown-weighs-heavy beat: family/vice consequences surface | Personal layer (relatedness) |
| Death / prison / retirement | The fall; heir inheritance scene | Legacy NG+ (GDD §7) |

## 3. Plateaus (deliberate rest)

Between Acts, build a **plateau** — a stretch where the sim ticks along, no major
new system, the player consolidates. The research recommends this explicitly to
create momentum *and* reduce addictive potential (dl.acm 3311350). A plateau is a
good place to surface *quiet character beats* (a crew member's personal request, a
family dinner) rather than escalation.

## 4. Failure = story, never dead-end

- Every failed action produces **narrative feedback**, enriched with sensory detail,
  not a bare state report (gamedesignskills). A busted deal is a *scene*.
- No failure is unrecoverable (dl.acm 3311350) — a raid, a betrayal, even prison
  routes into a *new* arc (the comeback, the heir), never a hard wall.
- **Sequence:** bad beats land *after* the player has banked some wins in the arc
  (Sid Meier).

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
