# 04 — UX & UI Direction

> Companion to `CaribbeanGangsta_GDD.md` §5.1 and §9. Key research framing:
> intuitive controls strongly predict continued play, **but that effect is fully
> mediated by competence and autonomy** (researchgate 225998888). A clean UI
> doesn't hook players — it *removes the friction that blocks* need satisfaction.
> So UX's job is to get out of the way and make competence *legible*. This is
> direction + wireframe intent, not final visual design.

## 0. UX principles (ranked)

1. **Clarity of feedback over flash.** Clear, consistent, timely feedback is one of
   the four testable features that raise need satisfaction (SDT PENS). Every action
   returns a legible result — *including failure*, which reads as narrative, not an
   error (gamedesignskills).
2. **Progressive disclosure.** Reveal systems as they unlock; never show the whole
   dashboard on day one. CK3 cut 67 tutorial boxes to ~22 and treated information
   overload as *the* first-session problem (gamedeveloper CK3).
3. **Gate decisions to fight fatigue.** Each choice spends willpower; limit live
   options at any moment (Sid Meier). One primary action per screen state.
4. **Surface consequence, hide machinery.** Show that a decision *matters* (Sid
   Meier); hide raw numbers behind prose/visual state where it deepens immersion
   (gamedesignskills — keep RPG stats lightweight).
5. **≤ ~8 words of instruction on screen at once**, "eloquent caveman" style (PvZ).

## 1. Core screens (MVP)

| Screen | Primary job | Competence/autonomy cue |
|---|---|---|
| **The Deal** (Loop 1) | Buy/sell, see price trend, see + commit to bust odds | Trend arrows = readable market skill; displayed odds = fair risk |
| **Empire Map** | Territory, fronts, routes at a glance | Growth is *visible*; next affordable step highlighted |
| **Crew** | Roster, assignments, prose status | Loyalty as behavior/dialogue, not bars (see doc 02) |
| **Laundering / Money** | Fronts, clean-cash rate, offline accrual | The return payoff, framed as *decisions to allocate* |
| **Heat / Threats** | Current LE tier, telegraphed pressure | Tension legible and estimable |
| **Legacy** | Prestige/heir, influence spend | Long-horizon aspiration made concrete |

## 2. The first-session flow (wireframe intent)

Maps to `01_Economy_and_Balancing.md` §6 and GDD §9. **No screen labeled
"Tutorial."** Teach through the fiction (PvZ / invisible tutorial):

1. **Cold open (0–2 min):** a single evocative scene → the aspiration ("the empire
   you could build") → one guided first sale. Beat the 2-minute churn cliff with a
   *win*, not a menu.
2. **First heat scare (2–8 min):** survive a close call → competence spike. Adaptive
   hints appear *only* if the player fumbles (preserves competence for fast
   learners — PvZ).
3. **First front (8–15 min):** open a laundering business → offline engine starts →
   **session ends on an open loop**: money about to accrue + one buyer waiting. The
   return hook (GDD §11).

Currency/laundering complexity is introduced ~minute 8, not minute 1 (PvZ delayed
core currency to ~level 10).

## 3. Session-end UX (the return hook)

Never let the player exit on a "clean" empty state. Every natural stopping point
shows: **one thing resolving, one thing pending, income accruing** (GDD §11; Civ
cliffhanger — Sid Meier). Close the tab and *something is mid-motion*.

## 4. Notifications (mobile) — bonus-only, never guilt

- Allowed: "A golden-hour buyer just showed up" (optional bonus).
- **Forbidden:** "Your fronts are at risk / your streak is ending / come back or
  lose X." Absence is never punished (GDD §6, §8). Optional timed content ≠ dark
  pattern; punitive timed content = dark pattern (core.ac.uk 30100776).

## 5. Visual/tonal direction

- Gritty Caribbean noir; readable at a glance on mobile.
- **Believability = retention:** consistent world logic and art; nothing that
  "jolts" the player out of the fiction (smartseries FM).
- Prose-forward where it deepens immersion (failed actions get *scene* text, not
  toast errors — gamedesignskills).

## 6. Accessibility & well-being

- Optional play-time reminder + self-set session goal (players report burnout —
  dl.acm 3491101).
- Colorblind-safe risk cues; text-scaling; one-hand mobile reach for primary action.

## 7. What to validate in playtest

- Do players understand the deal screen's risk/price cues *without* a tooltip?
  (competence legibility)
- First-session length distribution (target 10–20 min) — see doc 06.
- Do players return to allocate offline income, or ignore it? (return-hook efficacy)
