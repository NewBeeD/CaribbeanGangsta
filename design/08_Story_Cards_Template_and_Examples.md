# 08 — Story Cards: Template & Examples

> Companion to `05_Narrative_Beats_and_Simulation_Triggers.md`. Doc 05 is the
> *skeleton* (which sim threshold fires which beat). This doc is how we write the
> *flesh* — the actual scenes, dialogue, and choices — in a consistent form.
>
> Each beat = one **Story Card**. Anyone on the team fills the same template so the
> writing stays consistent and every card is testable. Cards are authored **beat
> first, trigger second** (dl.acm 3311350), with a variant per reputation path so
> the same moment reads differently by playstyle (autonomy).

---

## The template (copy this for each beat)

```
### CARD-ID — <short title>

- **Trigger (sim state):**  <the measurable threshold from doc 05 that fires this>
- **Trigger type:**  Deterministic (safe spine)  |  Variable (texture)
- **Act / arc:**  <I–IV, and which arc: onboarding / rival / crew / heat / personal>
- **Characters:**  <who is on screen>
- **Loop / hook role:**  <onboarding? session-end hook? return hook? plateau beat?>
- **Prerequisites / one-shot?:**  <fires once? repeatable? needs prior card?>

**Scene text:**
> <the prose the player reads. Sensory, in-world, no UI language.
>  Keep failure/negative beats sequenced AFTER wins in the arc.>

**Choices:**
1. <choice label> → <consequence: sim effect + narrative effect + which card/flag it sets>
2. ...
   (aim for 2–4; each must feel like it has real impact — perceived consequence matters)

**Reputation variants:**
- **Street:**   <how the scene/choices skew>
- **Business:** <...>
- **Political:**<...>

**Writer notes:**  <apophenia gaps to leave implied; tone; telemetry flag to fire>
```

**Rules for good cards (from the research):**
- Every action, *including failure*, returns narrative feedback — enrich it, don't
  flatten it (gamedesignskills).
- Show consequence; a choice is only interesting if it *feels* impactful (Sid Meier).
- Leave gaps on purpose — imply backstory rather than spelling it out (apophenia,
  RimWorld).
- Best rewards/beats withheld for the biggest thresholds (gamedesignskills).
- Act-defining beats use **deterministic** triggers; keep variable triggers for
  texture (GDD §5.4).

---

## Example cards (filled in from doc 05's trigger table)

### ONB-01 — First Sale

- **Trigger (sim state):** New game started; player reaches the docks (guided).
- **Trigger type:** Deterministic.
- **Act / arc:** I — onboarding.
- **Characters:** *Auntie Pearl* (fence/mentor), the Player.
- **Loop / hook role:** Onboarding hook — must produce a *win* inside 2 minutes
  (beat the 2-min churn cliff).
- **Prerequisites / one-shot?:** One-shot, first thing.

**Scene text:**
> Auntie Pearl doesn't look up from her fruit stall. "You want to eat in this town,
> you learn to move things quiet." She slides a folded cloth across the crate.
> "Somebody down the way is buying. Don't make it a story."

**Choices:**
1. **Make the sell** → guided first deal, guaranteed success → sets `first_sale=true`,
   fires ONB-02. *(Learn by doing — one demonstration teaches the loop, PvZ.)*
2. **"Why you helping me?"** → one line of Pearl's backstory (implied, not full) →
   then same sell. *(Relatedness seed via perspective.)*

**Reputation variants:**
- **Street:** Pearl respects nerve — "You got sand, I like that."
- **Business:** Pearl frames it as arithmetic — "Buy low, move fast, count twice."
- **Political:** Pearl mentions who you *don't* cross — seeds the world's power map.

**Writer notes:** ≤8 words of any UI instruction; the *scene* carries the teaching.
Fire telemetry `onboarding_first_sale_complete`. Leave Pearl's own history a gap.

---

### RIV-01 — The First Message

- **Trigger (sim state):** First district fully controlled (`districts_controlled==1`).
- **Trigger type:** Deterministic.
- **Act / arc:** II — rival arc (introduces the recurring antagonist).
- **Characters:** A runner (delivers it), *Silvio* the rival (offscreen, named).
- **Loop / hook role:** Medium-term return hook — opens a grudge that escalates over
  days (the retention backbone tier).
- **Prerequisites / one-shot?:** One-shot; unlocks the Silvio arc (RIV-02+).

**Scene text:**
> Your runner comes back without the money and with a split lip. "Man says the
> corner you just took? It had a name on it already. Silvio's name." He wipes his
> mouth. "He says enjoy it while it's warm."

**Choices:**
1. **Send a message back (violence)** → +Street rep, +Heat, escalates Silvio arc
   fast → sets `silvio_hostile=true`.
2. **Reach out, propose a split (business)** → +Business rep, delays escalation,
   opens a fragile alliance branch → sets `silvio_wary=true`.
3. **Say nothing, dig for intel (low-profile)** → no rep, unlocks an intel beat on
   Silvio's weakness later → sets `silvio_watched=true`.

**Reputation variants:** (built into the choices above — each path is one playstyle.)

**Writer notes:** Silvio stays *offscreen* here — a name and a threat, no face yet.
He gets a face only at the heat/CIA threshold (HEAT-03), withholding the payoff for
a bigger beat. Telegraph, don't land — this is a session-end cliffhanger.

---

### CREW-BETRAY-01 — Warning Signs

- **Trigger (sim state):** A lieutenant's `loyalty` low **AND** `agenda` active
  **AND** a rival opportunity exists (the betrayal-alignment condition, doc 02 §4).
- **Trigger type:** Variable (fires when the alignment occurs) — but the *arc* it
  opens is deterministic once started (readable, intervenable).
- **Act / arc:** II–III — crew arc.
- **Characters:** *Marco "Fingers"* (the wavering lieutenant), the Player.
- **Loop / hook role:** Serialized tension; gives the player agency to detect &
  intervene (estimable-but-fair — the signs are readable, Sid Meier).
- **Prerequisites / one-shot?:** Starts the betrayal chain (→ POINT-OF-NO-RETURN card).

**Scene text:**
> Marco's numbers are clean. Too clean. The Springtown take is up, but he's stopped
> looking you in the eye, and last night he took a call outside in the rain rather
> than in the room. Deon noticed it too. He didn't say anything. He didn't have to.

**Choices:**
1. **Confront him** → forces the arc to a head early; outcome depends on his memory
   log (did you treat him right?). *(NPC memory ripples forward — gamedesignskills.)*
2. **Buy him back (raise pay / give him territory)** → may reset loyalty *if* the
   grievance is material, not personal.
3. **Set a trap / feed him false info** → +intel, but if wrong you *create* the
   betrayal you feared. *(Consequential choice.)*
4. **Ignore it** → arc proceeds toward the flip on its own timer.

**Reputation variants:**
- **Street:** confrontation framed as respect/violence.
- **Business:** framed as renegotiation.
- **Political:** framed as leverage/information.

**Writer notes:** The *reason* for Marco's wavering reads from his memory log
(passed over? underpaid? family pressure?) — the same card personalizes per player.
Leave *who* he was calling implied until the next card. Fire `betrayal_arc_started`.

---

### HEAT-03 — It Gets Personal

- **Trigger (sim state):** Heat crosses the CIA/Interpol threshold (`heat>=60`).
- **Trigger type:** Deterministic.
- **Act / arc:** III — heat arc; the task force gets a face.
- **Characters:** *Agent Reyes* (the antagonist investigator), the Player.
- **Loop / hook role:** Rising action + a relatedness *hate* object; paradigm-level
  escalation.
- **Prerequisites / one-shot?:** One-shot at first crossing.

**Scene text:**
> The photo on your burner isn't from your people. It's of you — grainy, long lens,
> the marina last Tuesday. A number you don't know sends one line: "We should talk
> before this gets loud. — Reyes." Somebody finally put your file on their own desk
> and decided to make it their career.

**Choices:**
1. **Go dark, spend to cool heat** → expensive, buys time, Reyes arc pauses.
2. **Feel her out (meet)** → risky; opens a corruption/informant branch.
3. **Escalate — make yourself too expensive to chase** → +Heat, +Street, dangerous.

**Reputation variants:**
- **Political:** a corrupt-official branch opens (call in a favor above Reyes).
- **Business:** a "make the problem cost more than it's worth" bribe branch.
- **Street:** intimidation branch (high risk of making Reyes a martyr/zealot).

**Writer notes:** This is a *big* withheld beat — the faceless heat system finally
gets a person. Don't spend Reyes cheaply; she's a season-long antagonist. Telemetry
`heat_tier_cia_reached` + sentiment micro-survey ("did that land as earned?").

---

### PLATEAU-01 — A Quiet Night (rest beat)

- **Trigger (sim state):** Between acts, no major system unlocked recently (a
  deliberate plateau — doc 05 §3).
- **Trigger type:** Variable (opportunistic, during a lull).
- **Act / arc:** Interstitial — personal/relatedness.
- **Characters:** A family member (the personal layer), the Player.
- **Loop / hook role:** Plateau/consolidation beat — reduces escalation pressure
  (ethical pacing, dl.acm 3311350) and deepens relatedness.

**Scene text:**
> Your sister sets a plate in front of you like she used to before any of this.
> "You don't have to tell me what you do," she says. "I just want to know you're
> still in there." The rice is exactly how you remember it.

**Choices:**
1. **Be honest** → deepens the bond; raises stakes (she now knows, can be leverage).
2. **Keep her out of it** → protects her; a small quiet cost to the bond.
3. **Use the moment (ask a favor)** → transactional; a Business/Political tell.

**Writer notes:** No sim reward here on purpose — this is a *breath*. The value is
relatedness and contrast that makes the next escalation hit harder. Keep it short.

---

## How the team uses this doc

1. Open `05_Narrative_Beats_and_Simulation_Triggers.md` §2 (the trigger table).
2. For each row, copy the template and write a card (like the five above).
3. Tag trigger type; keep act-defining beats deterministic.
4. Write all three reputation variants.
5. Write the **failure/negative** version of any card that can go wrong — as a
   *scene*, never an error message.
6. Add the telemetry flag so doc 06 can measure beat reach + "did it land as earned?"
```
