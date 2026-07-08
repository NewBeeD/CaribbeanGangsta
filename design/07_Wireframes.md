# 07 — Wireframes (Text/Layout Sketches)

> Companion to `04_UX_and_UI.md`. These are **low-fidelity wireframes** — layout
> and content only, no color or final art. They turn doc 04's screen list into
> "what goes where." The next step after these is a visual mockup pass (art,
> color, the Caribbean-noir look). Design targets are annotated in *(italics)* with
> the research reason.
>
> Layout is mobile-first / portrait (web adapts to wider). One **primary action**
> per screen state to respect decision fatigue (Sid Meier).

Legend: `[ Button ]` · `( status/value )` · `====` progress bar · `>` tap-through

---

## 1. THE DEAL (Loop 1 — the core moment)

*Goal: make buy-low/sell-high a legible skill (competence) and risk fair &
estimable (Sid Meier). Failure reads as a scene, not an error (text-based).*

```
+------------------------------------------+
|  < Back        KINGSTON DOCKS     Heat ●●○ |   (Heat as dots, not a number)
+------------------------------------------+
|                                          |
|   COCAINE            ▲ price rising       |   (trend arrow = readable market)
|   Buy   $200 /unit                        |
|   Sell  $480 /unit   (+140%)              |
|                                          |
|   You hold: 12 units   Cash: $8,450       |
|                                          |
|   +----------------------------------+    |
|   |  RISK THIS RUN                   |    |
|   |  Clean chance:  70%   ●●●●●●●○○○  |    |   (displayed odds MUST match real)
|   |  If busted: lose product + cash  |    |
|   +----------------------------------+    |
|                                          |
|         [  - ]   8 units   [ + ]         |
|                                          |
|            [   MAKE THE SELL   ]          |   (single primary action)
+------------------------------------------+
```

**Success state** → short scene text ("The buyer counts it twice, nods, gone.") +
cash animates up.
**Bust state** → *narrative* failure, never a toast error:
> "Blue lights hit the alley before the deal closed. You ran; the product didn't."

*Losses are sequenced after some wins in the session (Sid Meier). Odds shown = odds
felt (fairness).*

---

## 2. EMPIRE MAP (Loop 3 — the metagame backbone)

*Goal: make growth visible and always show the next affordable step. Progressive
disclosure — locked zones are visible but greyed (aspiration), not hidden.*

```
+------------------------------------------+
|  EMPIRE            Clean $ ▲ accruing...  |
+------------------------------------------+
|                                          |
|     [KINGSTON]===== controlled            |
|         |                                 |
|     [SPRINGTOWN] 60% ====○   > push       |   (next affordable step highlighted)
|         |                                 |
|     [PORT ROYAL] 🔒 needs a route          |   (visible-but-locked = aspiration)
|         :                                 |
|     [ MIAMI  🔒 ] international            |
|                                          |
+------------------------------------------+
|  Fronts 3   Crew 5   Routes 1   Rivals 1  |   (glanceable empire summary)
+------------------------------------------+
|  [ Deals ] [ Crew ] [ Money ] [ Heat ]    |   (bottom nav — persistent)
+------------------------------------------+
```

---

## 3. CREW (the relatedness engine)

*Goal: loyalty as behavior/prose, not a bar (doc 02). Players should end up
naming these people.*

```
+------------------------------------------+
|  CREW                          5 people   |
+------------------------------------------+
|  MARCO "Fingers"        Lieutenant        |
|  Running: Springtown fronts               |
|  "Been quiet since you passed him over."  |   (loyalty surfaced as a line, no #)
|                                     >     |
+------------------------------------------+
|  DEON                   Runner            |
|  Skill: Deals ●●●○   Muscle ●○○○          |   (light stats only)
|  "Owes you his life. Won't forget it."    |
|                                     >     |
+------------------------------------------+
|  ...                                      |
+------------------------------------------+
|            [ + Recruit ]                  |
+------------------------------------------+
```

**Crew detail (tap-through)** → their story, memory log ("You left him to take the
fall in Kingston."), assignment, and any active arc (e.g. a betrayal warning).

---

## 4. MONEY / LAUNDERING (the idle return payoff)

*Goal: the return hook. On reopen, show accrued cash AND decisions to allocate —
"the longer you're away, the more options await" (idle CHI). Never a loss.*

```
+------------------------------------------+
|  MONEY                                   |
+------------------------------------------+
|   While you were gone (7h 20m):           |
|      + $10,800 clean                      |   (return reward = cash + choices)
|                                          |
|   ➜ A buyer is waiting on you.  [ See ]   |   (pending decision = return hook)
|   ➜ Marco flagged a problem.    [ See ]   |
|                                          |
|  ----- FRONTS -----------------------     |
|   Neon Club     $1,350/h   ==== Lvl 3     |   (nightclub: $450/level — doc 01 §3a)
|      [ Upgrade  $18,300 ]                  |   (buy_in $12k × 1.15^3 — next step affordable)
|   Car Wash      $  120/h   ==  Lvl 1      |   (starter front: $120/level)
|      [ Upgrade  $2,300 ]                   |   ($2k × 1.15^1)
|                                          |
|   Dirty: $22k   Clean: $88k               |
+------------------------------------------+
```

*No "your fronts are at risk!" pressure. Absence forgoes gains, never risks
progress (idle CHI / dark-pattern boundary).*

---

## 5. HEAT / THREATS (the tension system)

*Goal: tension legible and estimable; threshold crossings are telegraphed
session-end hooks.*

```
+------------------------------------------+
|  HEAT & THREATS                          |
+------------------------------------------+
|   Current attention:  DEA                 |
|   ●●●●●●○○○○   (decays as you lie low)     |
|                                          |
|   ⚠ A task force just opened a file.      |   (telegraphed, not yet landed)
|      Cross into CIA range and it gets     |
|      personal.                            |
|                                          |
|   Reduce heat:                            |
|     [ Bribe a cop  -$5,000 ]              |
|     [ Lie low (slower income) ]           |
+------------------------------------------+
```

---

## 6. HIGH SCORE (run-end tally / cross-run chase)

*Goal: end the run on the "beat it next run" cliffhanger (roguelike, v1.1). Shown on
death/prison and as a standalone screen.*

```
+------------------------------------------+
|  THE FALL — RUN OVER                     |
+------------------------------------------+
|   Peak net worth:   $2.4M   ← banked      |
|   Empire size:      Rank 7 (best: 9)      |
|   Rivals toppled:   3                     |
|   Farthest act:     III — Kingpin         |
|                                          |
|   NEW PERSONAL BEST?   ✗  ($0.3M short)   |
|   Leaderboard:  #142 this season          |
|                                          |
|   Prestige unlocked: "Guyana corridor"    |   (new starting scenario, not power)
|   [ Start next run ]        [ Leaderboard ]|
+------------------------------------------+
```

---

## 7. FIRST-SESSION FLOW (screen-by-screen)

Maps to `04_UX_and_UI.md` §2 and `01_Economy_and_Balancing.md` §6. No screen
labeled "Tutorial"; ≤~8 words of instruction on screen at once (PvZ).

```
[Cold open scene]  >  [First guided sell]  >  [First heat scare - survived]
   0–2 min: the dream        the win              the competence spike
        |
        v
[Hire first runner]  >  [Open first front]  >  [SESSION-END HOOK]
   meet a character        idle engine starts     "$ accruing + a buyer waiting"
```

*Ends mid-motion so there's a reason to return (Civ cliffhanger / session-end
hook).*

---

## 8. Handoff notes for the mockup/art pass

- Keep **one primary action** per state; secondary actions recede.
- Numbers stay **light** — dots/bars/arrows over raw figures wherever prose or a
  glyph conveys it (hide machinery, show consequence).
- Every failure state needs **scene text** written (see `08_Story_Card...`).
- Persistent bottom nav: Deals · Crew · Money · Heat (Empire/High Score one level up).
- Next step: apply the Caribbean-noir visual direction (doc 04 §5) to these
  layouts → color mockups.
```
