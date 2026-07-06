# 02 — Crew & NPC Systems (The Relatedness Engine)

> Companion to `CaribbeanGangsta_GDD.md` §4.3. Relatedness is one of the three
> needs that *independently* predict enjoyment and intention to keep playing
> (SDT). In a single-player game it's satisfied through **connection with fictional
> characters, primarily via perspective-taking** (frontiersin 847120). This doc
> specs how we make crew members people you care about — or hate — not stat lines.

## 0. Why this doc matters

The research is blunt: violence is *not* a significant motivator once need
satisfaction is accounted for (SDT 2010). What retains players in a crime sim is
the *people* — the loyal runner who came up with you, the lieutenant who might
flip, the rival with a grudge. Relatedness is the pillar most easily under-built in
a management game, so it gets its own systems doc.

## 1. NPC data model

Each significant NPC carries:

| Field | Purpose |
|---|---|
| **Traits** (2–4, e.g. *greedy, loyal-to-a-fault, hot-headed, ambitious*) | Drive behavior + emergent story |
| **Skills** (deal, muscle, tech, laundering, driving) | Assignment effectiveness |
| **Loyalty** (0–100, hidden — surfaced via prose, not a bar) | Betrayal/snitch risk |
| **Bond** (shared history with player) | Perspective-taking hooks |
| **Agenda** (hidden goal, e.g. *wants his own territory*) | Emergent conflict |
| **Memory log** | Records what you did to/for them |

**Hide the numbers where possible.** Lightweight RPG stats work in text games, but
are most effective kept lightweight rather than exposed as full simulation
(gamedesignskills). Surface loyalty as *behavior and dialogue* ("Marco's been quiet
since you passed him over"), not a 73/100 bar.

## 2. Perspective-taking = the relatedness lever

Nearly all relatedness-based enjoyment in the narrative-game study came from
**taking characters' perspectives** (frontiersin 847120). So:

- Crew members get **short interior scenes** — a runner nervous before his first
  big job, a lieutenant's loyalty tested by a rival's offer *shown from their side*.
- Key decisions occasionally **frame the choice through an NPC's eyes** before you
  make it.
- The family/personal layer (GDD §2) is the highest-intensity relatedness object —
  a partner, a sibling, a kid — whose fate the empire endangers.

## 3. Memory & consequence (the world remembers)

NPC memory that ripples earlier choices forward deepens felt connection to
decisions (gamedesignskills). Concretely:

- Every promise kept/broken, promotion given/withheld, and life saved/spent writes
  to the NPC's memory log.
- Later dialogue and loyalty checks read that log ("You left Deon to take the fall
  in Kingston. He hasn't forgotten.").
- **Consistency is a retention feature** — an NPC acting against their established
  memory "jolts" the player out of the fiction (smartseries FM). Never let a
  betrayed character act like nothing happened.

## 4. Loyalty, betrayal & snitching

- Loyalty shifts from **pay, treatment, shared success, and trait fit** — not a
  single lever. Underpaying an ambitious lieutenant with a rival ally is the danger
  combo.
- **Betrayal is a story beat, not a dice roll.** When loyalty + agenda + opportunity
  align, a betrayal *arc* begins (warning signs → point of no return → the flip),
  giving the player agency to detect and intervene. This is a serialized
  medium-term hook (GDD §5.2) and an estimable-but-fair tension system (Sid Meier) —
  the signs are readable.
- Snitching ties to the heat/LE system: a flipped crew member becomes a wire.

## 5. Recruitment & development

- **Recruit** via events, poaching from rivals, family/community ties.
- **Train** to raise skills (a deterministic competence track — GDD §5.3).
- **Promote** to lieutenant (runs a territory/front autonomously = idle delegation).
- Onboarding introduces exactly **one** crew member first (decision-fatigue gate —
  Sid Meier); the full roster system unlocks later via progressive disclosure.

## 6. Emergent story generation

Crew + rivals + Chaos Engine = the "story generator" (RimWorld — gdcvault 1024232):

- Trait collisions spawn events (two hot-headed lieutenants, one territory).
- **Deliberately leave gaps** — don't fully script relationships; let players'
  imaginations fill them (apophenia). A hidden agenda the player *infers* is more
  compelling than one spelled out.
- Emergent arcs become the shareable "rise and fall" stories that drive community
  acquisition (GDD §12).

## 7. MVP scope

Ship a **small subset done well** (RimWorld lesson):
- ~5–8 fully-realized crew archetypes with traits + memory + one betrayal arc.
- One rival with a full grudge arc.
- The family/personal layer as a single high-stakes relationship.

Defer: large rosters, deep skill trees, faction politics — add once the core
relatedness loop is proven in playtest (measure: do players name their crew?).
