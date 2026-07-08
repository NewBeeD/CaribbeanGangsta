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

## Realism example cards (from the transit-model grounding)

These five cards flesh out the realism triggers added to `05` §2 and the beats
docs `09`/`10` flagged for authoring. They show how the real Caribbean-transit
model (cocaine corridors, port corruption, US "Iron River" arms, adaptive routes,
loan-shark leverage — see `realism_recommendations.md`) becomes *scenes*, without
ever tipping into instruction or breaking the ethical line (GDD §8).

### CORR-01 — Plata o Plomo

- **Trigger (sim state):** First smuggling route opened (`routes_opened >= 1`);
  first shipment about to move through a port (doc 09 §B.1).
- **Trigger type:** Deterministic (unlocks the port-bribe system).
- **Act / arc:** II — corruption arc; introduces the network.
- **Characters:** *Officer Beaumont* (a customs official), the Player.
- **Loop / hook role:** Paradigm unlock (a new systems layer as rising action) +
  first interesting corruption decision (perceived impact — Sid Meier).
- **Prerequisites / one-shot?:** One-shot; unlocks the variable-bribe loop (CORR-02+).

**Scene text:**
> Beaumont doesn't touch the envelope. He just looks at it, then at the container
> manifest, then out at the water. "That box goes through clean, or it goes through
> a scanner. Your choice, not mine." He finally meets your eye. "*Plata o plomo*, my
> friend. Silver's cheaper. I'd take the silver."

**Choices:**
1. **Pay his asking price (silver)** → shows the price (≈8% of shipment value) and
   the resulting seizure % *before* you commit; drops seizure to ~3–5% this run →
   sets `port_beaumont_paid=true`. *(Estimable-but-fair — doc 09.)*
2. **Haggle** → push for less; readable gamble (odds shown) that he refuses *this*
   run → on success, cheaper; on refusal, ship at full risk or reroute.
3. **Ship anyway (walk)** → no bribe, full base seizure risk (~30%); a real gamble
   the player owns → seeds a possible RAID-01 if it goes wrong.
4. **Lean on him (violent path)** → intimidate for a discount; +Heat, and Beaumont's
   loyalty starts low → higher future flip risk (doc 09 §B.2).

**Reputation variants:**
- **Street:** the threat reads as mutual sizing-up; Beaumont respects nerve.
- **Business:** framed as a recurring arrangement — "a percentage, every box."
- **Political:** hints he answers to someone above him — seeds the payroll ladder.

**Writer notes:** The number shown *is* the number rolled (doc 09). Keep the menace
in-fiction and on the character, never the player (ethical line). Leave *who
Beaumont answers to* an implied gap. Fire `corruption_first_bribe_offered`.

---

### ROUTE-01 — The Reroute

- **Trigger (sim state):** Major route disruption — a big bust, a task-force surge,
  or a hurricane closes a working port (doc 05 §2 realism row).
- **Trigger type:** Variable (fires when the Chaos Engine disrupts an active route).
- **Act / arc:** II–III — economy/world arc; the adaptive-network beat.
- **Characters:** *Yolanda* (your logistics lieutenant), the Player.
- **Loop / hook role:** Recoverable setback → the world adapts (GDD §4.7); a
  return/session hook (a decision waiting on you).
- **Prerequisites / one-shot?:** Repeatable (once per major disruption); first firing
  opens the Guyana/Suriname corridor.

**Scene text:**
> Yolanda spreads the chart on the hood, rain still coming down. "Coast Guard's all
> over the north passage since the seizure. Nothing moves through there for weeks."
> She taps a line further south, toward the mainland rivers. "But the Guyana run's
> quiet. Longer, thinner margins, more hands to grease — and nobody's watching it.
> Yet."

**Choices:**
1. **Open the Guyana/Suriname corridor** → unlocks a new route (longer transit,
   lower heat, thinner margin) → sets `corridor_guyana=true`. *(The network
   adapts rather than collapses.)*
2. **Sit tight, let the heat cool** → no new route; existing routes idle a while
   (recoverable, no permanent loss — GDD §6). A patient/low-profile read.
3. **Push the hot route anyway** → ship through the watched passage at spiked
   seizure risk (odds shown) — desperate leverage, high heat.

**Reputation variants:**
- **Street:** framed as refusing to be pushed off your water.
- **Business:** framed as diversifying supply lines — never one point of failure.
- **Political:** a bought official can *reopen* the north passage early (payroll payoff).

**Writer notes:** This is the "networks reroute, they don't die" realism beat —
the disruption must always read as a *setback with an option*, never a wall.
Yolanda's competence is the relatedness hook. Fire `route_disruption_rerouted`.

---

### MARKET-01 — Fire-Sale

- **Trigger (sim state):** Supply glut or price crash (Chaos Engine drives a market
  price to the bottom of its volatility band — doc 05 §2 realism row).
- **Trigger type:** Variable (texture — a market swing, not the progression spine).
- **Act / arc:** Any — economy arc; the buy-low half of the deal loop.
- **Characters:** *A source contact* (offscreen voice / broker), the Player.
- **Loop / hook role:** Interesting decision with perceived impact (Sid Meier);
  rewards storage/capacity planning (doc 09) and liquidity (doc 10).
- **Prerequisites / one-shot?:** Repeatable; scales with market state.

**Scene text:**
> "You hearing this?" The broker's almost laughing. "Somebody flooded the market —
> whole season's crop landed at once, price is on the floor. Won't last. Word is
> half the island's buying everything that isn't nailed down." A pause. "You got
> somewhere to *put* it?"

**Choices:**
1. **Buy big — stockpile the dip** → needs storage capacity (doc 09) and cash on
   hand; profits later when price recovers. *(The reason to invest in vaults.)*
2. **Borrow to buy bigger (leverage)** → routes into a loan-shark offer (doc 10) if
   short on cash — voluntary, terms shown in full.
3. **Pass** → conservative; the glut passes and prices normalize. No loss for sitting
   out (no artificial deficit).

**Reputation variants:**
- **Street:** framed as instinct — "you feel a come-up, you take it."
- **Business:** framed as arbitrage — buy the trough, sell the peak; count twice.
- **Low-profile:** wary of a flood this convenient — could be a setup / LE sting.

**Writer notes:** Keep the swing *visible* (the price trend) so acting on it is
**skill, not a gamble** (GDD §5.4). The "could be a setup" low-profile read is a
nice apophenia gap — never confirm it. Fire `market_glut_decision`.

---

### DEBT-01 — Papa Cass's First Offer

- **Trigger (sim state):** Low cash + an opportunity the player can't yet afford
  (≈ end of first session / day 2 — doc 10 §6).
- **Trigger type:** Deterministic (offered once the come-up gap appears), but
  **entirely opt-in** — declining is a first-class outcome.
- **Act / arc:** I — the come-up; introduces the debt/leverage engine.
- **Characters:** *Papa Cass* (the street loan shark), the Player.
- **Loop / hook role:** Voluntary front-loaded tension + endowed-progress head start
  (doc 10 §1); a session-end hook (a decision left open).
- **Prerequisites / one-shot?:** One-shot for the *first* offer; unlocks the lender
  system (DEBT-CLEAR-01, DEBT-DEFAULT-01).

**Scene text:**
> Papa Cass counts a roll he isn't going to give you yet. "I heard you got a buyer
> and no product. That's a sad little story." He snaps a rubber band around the
> cash. "Fifteen hundred. You pay me back eighteen. Take your time — clock only runs
> when *you're* out here working, not when you're home sleeping. But when it's due,
> it's *due*. We understand each other?"

**Choices:**
1. **Take the loan ($1,500 @ 20%/wk)** → full terms shown up front (principal,
   weekly rate, total owed at the soft due date — no hidden balloon); interest
   **freezes offline** → sets `debt_active=true`. *(Disclosure + freeze-offline are
   the ethical contract, doc 10 §4.)*
2. **Take less / negotiate the term** → smaller principal, gentler ceiling; a
   cautious leverage read.
3. **Walk away** → no debt, slower come-up, no penalty — a completely valid path
   (the debt-free build, GDD §10). Cass shrugs: "Offer stands. It always does."

**Reputation variants:**
- **Street:** Cass tests your spine — respect is the real collateral.
- **Business:** Cass talks pure numbers — "this is the cheapest money you'll ever
  hate paying back."
- **Political:** Cass name-drops who he *also* lends to — seeds the power map.

**Writer notes:** The card must **teach the freeze-offline rule in fiction** ("clock
only runs when you're out here working") — this is where the player learns absence
is never punished (doc 10 §4). Never guilt the human; the pressure is Cass's, on the
character. Fire `debt_first_offer` + `debt_taken`/`debt_declined`.

---

### ARMS-01 — The Iron River

- **Trigger (sim state):** Arms unlock researched (`arms_unlocked==true`) — the
  paradigm-shift tier (GDD §4.6).
- **Trigger type:** Deterministic (act-defining; a new systems layer).
- **Act / arc:** III — arms arc; a whole new revenue/heat layer arrives.
- **Characters:** *Dutch* (a US-side straw-purchase contact), the Player.
- **Loop / hook role:** Paradigm-shift unlock as rising action (dl.acm 3311350) +
  a hard playstyle fork (violence/protection synergy).
- **Prerequisites / one-shot?:** One-shot; opens the arms market and its higher heat.

**Scene text:**
> Dutch talks fast, like he always does. "Gun laws down here are tight. Up *there*?"
> He grins. "Cousin walks into three shops in one afternoon, cash, no questions,
> comes out with a trunk full. Iron River, baby — it flows *south*. Handguns, rifles,
> whatever moves." He leans in. "But these bring more heat than powder ever did.
> You sure you want in?"

**Choices:**
1. **Open the arms pipeline** → unlocks arms trading (higher margin, **higher
   heat/unit** than product — doc 01 §2) → sets `arms_market=true`; synergy with
   protection/turf.
2. **Buy only for protection, not resale** → arms for your own crew/territory; less
   heat, no new revenue line — a defensive read.
3. **Pass for now** → stay powder-only, low-profile; the offer remains open later.

**Reputation variants:**
- **Street:** the muscle/turf synergy is the whole appeal.
- **Business:** framed as a margin play — "another product, another market."
- **Political:** wary of the heat — guns draw *federal* attention faster than drugs.

**Writer notes:** Ground the realism (straw purchases, guns flowing south) as
*flavor and consequence*, never a how-to — keep it at Dutch's bragging altitude,
no procedure. This beat should *feel* like the stakes just changed. Fire
`arms_unlocked` + sentiment micro-survey.

---

## Failure-side cards (the scene, never an error message)

Doc workflow step 5: **every card that can go wrong needs its failure written as a
*scene*.** These five are the negative branches of the cards above — a raid, a
default, a flipped official, a completed betrayal, a busted shipment. The rules that
make failure *healthy* rather than punishing run through all of them:

- **Failure is a scene**, enriched with sensory detail — never a bare state report
  (gamedesignskills).
- **Setbacks recover — a wipe ends the run (v1.1)** — a raid hits *one* location, a
  default takes *one* asset, so any single blow is survivable and you can usually dig
  out. But a *total wipe with no lifeline* is the death spiral (doc 01 §4a): the run
  ends and your high score banks. Recoverable is the rule; permadeath is the ceiling,
  and it's always telegraphed (dl.acm 3311350 re-read for the roguelike frame).
- **Sequence:** these land *after* the player has banked wins in the arc (Sid Meier).
- **Telegraphed:** the signs were readable beforehand, so the loss reads as
  *consequence of a choice*, not a dice-roll ambush.

### RAID-01 — They Took the Springtown Cache

- **Trigger (sim state):** A stash location is raided (seizure roll fires — doc 09
  §A.4). Higher likelihood after an unbribed shipment (CORR-01 "walk") or heat spike.
- **Trigger type:** Variable (fires on a raid), but the *loss is bounded* by the
  anti-wipe rule (deterministic guarantee — doc 09 §A.2).
- **Act / arc:** Any — storage/heat arc; the failure that teaches diversification.
- **Characters:** *A runner* (brings the news), the Player.
- **Loop / hook role:** The anti-wipe rule *felt in fiction* — a setback that
  proves the game is a safe place to experiment (dl.acm 3311350).
- **Prerequisites / one-shot?:** Repeatable; pairs with STASH-01 / CORR-01.

**Scene text:**
> The runner is out of breath. "They hit Springtown. Kicked the door at dawn, took
> everything in the back room." He watches your face. "But that's *all* they got —
> the jungle drop's clean, the container's clean. They didn't know about the rest."
> One location, one bad morning. Not the empire.

**Choices:**
1. **Spread the load (invest in storage)** → opens the diversification lesson;
   unlock/upgrade a stash type → sets `learned_antiwipe=true`. *(Competence track.)*
2. **Find the leak** → someone talked; routes into a crew-loyalty check (doc 02) —
   was a low-loyalty guard the inside job?
3. **Rebuild and move on** → recover through time; no permanent loss (GDD §6).

**Reputation variants:**
- **Street:** the instinct is to find who talked and answer it.
- **Business:** the instinct is to price in the loss and restructure storage.
- **Low-profile:** vindication for the ones who *did* spread and bury quietly.

**Writer notes:** The scene must land the anti-wipe rule emotionally — "they got
*one place*, not you." Never zero the player out. If the player was *fully*
concentrated in one stash, still cap it and make the lesson explicit. Fire
`raid_resolved` + `raid_loss_pct` (doc 06 target: <~40% for a diversified player).

---

### DEBT-DEFAULT-01 — Papa Cass Sends Someone

- **Trigger (sim state):** Soft due date passed, debt unpaid (doc 10 §5, rung 2 —
  the visit). Only after the freeze-offline clock ran *in active play*.
- **Trigger type:** Deterministic once the default ladder starts (readable,
  telegraphed — the vig-raise warning, rung 1, came first).
- **Act / arc:** I–II — debt arc; the pressure the player opted into.
- **Characters:** *Two of Papa Cass's people* (muscle), the Player.
- **Loop / hook role:** In-fiction consequence with full agency to resolve; the
  pressure is on the *character*, never the human (doc 10 §4).
- **Prerequisites / one-shot?:** Follows DEBT-01; precedes rung 3 (a stash taken).

**Scene text:**
> They're waiting on your step, not hiding it. The big one turns your own door
> handle over in his hand like he's thinking about keeping it. "Papa Cass says hi.
> Says he likes you, that's why he sent us to *talk*." He sets the handle down,
> gently. "Talk's the cheap part. Don't make him send us back."

**Choices:**
1. **Pay in full** → clears the debt, Cass warms up (a bigger line later — the
   leverage-worked payoff) → sets `debt_cleared=true`.
2. **Partial pay + a new term** → resets his patience (doc 10 §3); buys time, no
   asset lost. *(Agency at every rung.)*
3. **Do him a favor instead of cash** → a relationship branch — move a package,
   lean on someone — deepens the NPC bond.
4. **Remove the problem (violent path)** → take out Cass; +Heat, and you **inherit
   his enemies** (doc 10 §5) → sets `cass_hostile=true` / rival crossover.

**Reputation variants:**
- **Street:** a face-off; respect and menace both on the table.
- **Business:** renegotiation — "what does this cost to make it go away, exactly?"
- **Political:** leverage — you know someone Cass *doesn't* want to hear about this.

**Writer notes:** A **scare, heat-free** (doc 10 §5 rung 2) — no product or asset
taken yet; that's rung 3 if ignored. Keep the threat on the character; **no
real-world guilt, no "log in or it grows" push, ever.** The clock froze while they
were away (doc 10 §4). Fire `debt_default_visit`.

---

### CORR-FLIP-01 — The Cop Goes Quiet

- **Trigger (sim state):** A payrolled official's loyalty low **AND** (underpaid
  **OR** rival outbid **OR** heat over their threshold **OR** LE turned them) — the
  flip alignment (doc 09 §B.2).
- **Trigger type:** Variable (fires on alignment); the *arc* is deterministic and
  intervenable once open (readable — Sid Meier).
- **Act / arc:** III — corruption/heat arc; the payroll's betrayal drama.
- **Characters:** *Beaumont* (or any payrolled official), the Player.
- **Loop / hook role:** Estimable-but-fair betrayal loop applied to LE; the wire /
  counter-intel layer (doc 09 §B.2, doc 02 §4).
- **Prerequisites / one-shot?:** Follows CORR-01; can escalate to a raid he *doesn't*
  warn you about.

**Scene text:**
> Beaumont used to pick up on the first ring. Now it goes three, four, and his voice
> is careful, like someone's in the room. "Everything's fine," he says, which he's
> never once said before. The tip-off you paid for this week didn't come. Somewhere,
> quietly, the price of your safety just changed hands.

**Choices:**
1. **Raise his pay / cool your heat** → may pull him back *if* the grievance is
   material, not a done deal (doc 09 §B.2). *(Intervention window.)*
2. **Feed him false intel (counter-intel)** → if he's turned, you poison what LE
   gets — but if you're *wrong*, you burn a loyal man → sets `beaumont_fed_false`.
3. **Cut him loose** → stop paying; lose the tip-offs, remove the exposure.
4. **Remove him (violent path)** → silences the wire; big heat, and officials talk.

**Reputation variants:**
- **Street:** the read is "he's soft — handle it before it handles you."
- **Business:** the read is "outbid the rival, make loyalty the better deal."
- **Political:** pull the string above him — remind him who he really answers to.

**Writer notes:** The warning signs are **readable prose, not a bar** (three rings,
"everything's fine," the missing tip). The player had the intel to act — that's what
makes the loss *fair*. Leave *who* turned him an implied gap until it resolves. Fire
`official_flip_started` + `intervention_outcome`.

---

### CREW-BETRAY-02 — Point of No Return

- **Trigger (sim state):** A betrayal arc opened by CREW-BETRAY-01 reaches its head
  (player ignored it, or an intervention failed — doc 02 §4).
- **Trigger type:** Deterministic (the arc lands on its own timer once started).
- **Act / arc:** II–III — crew arc; the flip the warning signs pointed to.
- **Characters:** *Marco "Fingers"* (the lieutenant), *Deon* (the loyal one), Player.
- **Loop / hook role:** Payoff/consequence of a serialized tension arc; feeds heat
  (a wire) or a rival (Marco defects with intel).
- **Prerequisites / one-shot?:** Requires CREW-BETRAY-01; one-shot per lieutenant.

**Scene text:**
> Deon tells you before the evidence does — he's been carrying it a day, you can
> see. "Marco's gone. Took the Springtown book and the Portside contacts with him."
> He won't sit down. "I saw it coming. I should've said it louder." The rain the
> other night, the call he took outside — it all reads clean now, in the wrong
> direction.

**Choices:**
1. **Cut your losses, secure what's left** → re-route contacts, change what Marco
   knew; recover over time (no wipe) → sets `marco_defected=true`.
2. **Hunt him down (violent path)** → +Heat, may recover assets, closes the arc
   hard — and tests how Deon and the crew read your ruthlessness (memory log).
3. **Turn it into counter-intel** → let Marco run to the rival/LE carrying *false*
   information you planted → a business/political reversal.

**Reputation variants:**
- **Street:** loyalty betrayed demands an answer; the crew is watching.
- **Business:** damage control — contain what he knows, write off what you can't.
- **Political:** use the defection — feed the enemy a poisoned gift.

**Writer notes:** This is the **payoff of a telegraphed arc** — the signs in
CREW-BETRAY-01 must have been readable, or the flip feels like an ambush (unfair).
Deon's "I should've said it louder" rewards the player who *did* notice. The loss is
of *assets and trust*, never the game. Pull the reason from Marco's memory log so
it's *personal*. Fire `betrayal_arc_resolved` + sentiment ("did it feel earned?").

---

### ROUTE-BUST-01 — Bad Water

- **Trigger (sim state):** A shipment is seized in transit — highest odds when the
  player ran the hot route (ROUTE-01 choice 3) or walked the bribe (CORR-01 choice 3);
  the displayed seizure % came up.
- **Trigger type:** Variable (the seizure roll — but the odds were *shown* first).
- **Act / arc:** II–III — economy/heat arc; the smuggling loss felt as a scene.
- **Characters:** *Yolanda* (logistics), the Player.
- **Loop / hook role:** Estimable-but-fair loss (the number shown was the number
  rolled — doc 09); reinforces *why* the bribe/route decision mattered.
- **Prerequisites / one-shot?:** Repeatable; the negative branch of the deal loop.

**Scene text:**
> Yolanda says it flat, because dressing it up won't help. "They took the boat off
> the point. Whole load, and the two we sent with it are in a cell by now." She lets
> that sit. "We knew the water was hot. We rolled it anyway." No blame in it — you
> both saw the number before you chose.

**Choices:**
1. **Pay the lawyers, get the crew back** → clean-cash sink; protects loyalty (the
   crew remembers you came for them — doc 02 memory log).
2. **Write it off, tighten up** → eat the loss, reroute (ROUTE-01) or start paying
   the port (CORR-01) → the lesson lands: safety was purchasable.
3. **Suspect a tip-off** → routes into CORR-FLIP-01 or a crew leak — was this bad
   luck, or was it sold?

**Reputation variants:**
- **Street:** the crew in the cell is the priority — you don't leave people.
- **Business:** the loss is a line item; the fix is process, not feeling.
- **Political:** a call to a judge/official (doc 09 payroll) can make the arrests
  quietly disappear — the payroll pays off.

**Writer notes:** Never let this read as a **random ambush** — Yolanda's "you both
saw the number before you chose" makes the loss *fair* and keeps the deal loop
honest (Sid Meier). The captured-crew hook ties the economic loss to relatedness.
Sequence it *after* wins in the arc. Fire `shipment_seized` + `loss_value`.

---

## Payoff cards (the system pays off — competence felt)

These two are the **reward branches** the trigger tables in docs `09`/`10` point to
but hadn't yet fleshed out: paying a debt back and having a paid-for tip actually
fire. Payoff cards do the work loss cards can't — they make the earlier *investment*
feel smart, which is the competence loop closing (GDD §5.1). Rules that make a payoff
land clean:

- **Sequence: the payoff comes *after* the player earned it** — the leverage they
  took, the official they paid — so it reads as mastery, not a handout (Sid Meier).
- **Withhold the best payoff for the bigger beat** — DEBT-CLEAR-01 opens a *bigger*
  line; the tip-off *saves the load*, both are earned upgrades (gamedesignskills).
- **Point at the next goal in the same beat** — close one loop, open the next
  (GDD §11 session-end hook).

### DEBT-CLEAR-01 — Paid In Full

- **Trigger (sim state):** First loan repaid in full and on time (`debt_cleared=true`
  with no default flag — doc 10 §5 trigger table, the leverage-worked payoff).
- **Trigger type:** Deterministic (fires on clean repayment).
- **Act / arc:** I–II — debt arc; the come-up beat where leverage visibly worked.
- **Characters:** *Papa Cass* (the street shark), the Player.
- **Loop / hook role:** Competence + relatedness payoff; **opens a bigger line of
  credit** (the next goal dangled in the same beat — GDD §11).
- **Prerequisites / one-shot?:** Follows DEBT-01; one-shot for the *first* clean
  repayment (unlocks the standing-credit relationship).

**Scene text:**
> Papa Cass takes the money and, for once, actually counts it slow — not because he
> doubts it, because he's enjoying it. "On time. In full." He says it like it's a
> rare thing, and from him it is. He peels the rubber band off a *fatter* roll this
> time and lets you see it before he puts it away. "So. Now we can talk about real
> numbers. You and me, we're gonna do business a while."

**Choices:**
1. **Take the bigger line now** → unlocks a higher principal cap (doc 10 §2); a
   standing relationship (intel, favors) → sets `cass_line_extended=true`. *(The
   leverage-worked payoff, next loop opened.)*
2. **Thank him, borrow later** → bank the goodwill; the bigger line stays open on
   your terms — a debt-free-for-now read (no penalty, GDD §10).
3. **Ask about *his* world (relatedness)** → one line of Cass's history/network,
   implied not spelled out → seeds the power map / a future favor branch.

**Reputation variants:**
- **Street:** Cass respects that you didn't flinch — you're "good people" now.
- **Business:** framed as a credit rating earned — "cheapest money just got cheaper."
- **Political:** Cass hints who *else* is on his book — a contact worth having.

**Writer notes:** This is where the player *feels* that voluntary debt was leverage,
not a trap — the whole ethical case for doc 10 pays off in this scene. Don't oversell
it; Cass's warmth is the reward. Leave his network an apophenia gap. Fire
`debt_repaid_clean` + `credit_line_extended`.

---

### CORR-TIP-01 — The Call That Saves the Load

- **Trigger (sim state):** A payrolled official (beat cop / customs / DEA insider)
  fires a **tip-off before a raid** on the player's product (doc 09 §B.2 benefit;
  doc 09 trigger table "a bought cop's tip fires before a raid").
- **Trigger type:** Deterministic (the paid-for benefit triggers when a raid is
  incoming and the official is loyal/paid).
- **Act / arc:** II–III — corruption/heat arc; the payroll pays off.
- **Characters:** *Beaumont* (or the beat cop on payroll), the Player.
- **Loop / hook role:** The corruption investment *works* — competence + relatedness
  payoff; a return/session hook (you get **one turn to move product** — doc 09 §A.4).
- **Prerequisites / one-shot?:** Repeatable; the positive mirror of CORR-FLIP-01 and
  the warning that *prevents* RAID-01.

**Scene text:**
> The phone buzzes once, past midnight — Beaumont, and he doesn't waste words.
> "Springtown. Before sunrise. I didn't tell you." The line's already dead. Out in
> the dark your product is sitting exactly where the raid is headed, and for the next
> few hours it's still *yours* to move. This is what the money bought.

**Choices:**
1. **Move the product now** → relocate to another stash (doc 09) before dawn;
   turns a would-be RAID-01 into a clean escape → sets `raid_dodged=true`. *(The
   payoff felt — stockpile → protect → get tipped → move in time.)*
2. **Set a decoy (clever play)** → leave a decoy stash to absorb the raid, draw heat
   *on purpose* (doc 09 §A.3), and keep LE chasing empty rooms.
3. **Can't move it all in time (partial)** → move what you can; a *reduced* seizure —
   still a win the tip made possible → the anti-wipe rule with a paid-for edge.

**Reputation variants:**
- **Street:** the crew scrambles at 3 a.m.; adrenaline, loyalty proven under fire.
- **Business:** cool logistics — the contingency plan you paid to have, executing.
- **Political:** a quiet nod that Beaumont is *worth* the retainer — reinvest upward.

**Writer notes:** This is the **payroll's competence payoff** — the player *sees* the
money working, which is what justifies the recurring clean-cash sink (doc 09). Keep
Beaumont's loyalty visible here so his *later* possible flip (CORR-FLIP-01) hurts
more by contrast. Time-pressure is the drama; never make it un-actionable. Fire
`payroll_tip_fired` + `raid_dodged`.

---

### ROUTE-PAYOFF-01 — The Quiet River Runs Gold

- **Trigger (sim state):** The Guyana/Suriname corridor opened by ROUTE-01 completes
  a full run cycle profitably (`corridor_guyana=true` **AND** first shipment cleared
  — doc 05 §2 realism row; GDD §4.7).
- **Trigger type:** Deterministic (fires on the first clean run through the new
  corridor) — the reward for adapting instead of forcing the hot route.
- **Act / arc:** II–III — economy/world arc; the adaptive-network payoff.
- **Characters:** *Yolanda* (logistics lieutenant), the Player.
- **Loop / hook role:** Competence payoff — the *patient* choice paid off; **withheld
  reward for the bigger beat** (a whole corridor matured), and a next-goal hook
  (scale it, or it draws its own heat — GDD §11).
- **Prerequisites / one-shot?:** Follows ROUTE-01 (choice 1); one-shot for the
  corridor's *first* clean cycle, then repeatable as a mature route.

**Scene text:**
> Yolanda doesn't gloat — she just lays the count on the hood where the chart used to
> be. "North passage is still crawling with Coast Guard. And us?" She taps the long
> southern line, the one everybody called too slow to bother with. "Three runs, not
> a single boat stopped. Thin margins add up when *nobody's looking*." She almost
> smiles. "We didn't fight the water. We went around it."

**Choices:**
1. **Scale the corridor (reinvest)** → upgrade throughput/storage on the new route
   (doc 09) → it becomes a mainstay → sets `corridor_guyana_mature=true`. *(Close one
   loop, open the next — success now draws its own attention.)*
2. **Keep it small and quiet (low-profile)** → cap volume to stay invisible; lower
   ceiling, near-zero heat — a legible playstyle, not a lesser choice.
3. **Reopen the north passage too (both routes)** → run both for volume; higher heat,
   redundancy against the *next* disruption — the diversify read.

**Reputation variants:**
- **Street:** pride in outlasting the heat — "they blinked, we didn't."
- **Business:** it reads as supply-chain redundancy proven — never one point of failure.
- **Political:** a bought official could formalize the corridor (permits/protection —
  doc 09 payroll) — turn a quiet route into a sanctioned one.

**Writer notes:** This is the **payoff of adapting** — it must reward the player who
took ROUTE-01's patient reroute over forcing the hot water (contrast ROUTE-BUST-01).
Yolanda's competence deepens the relatedness; the thin-margin/high-volume truth stays
authentic to the transit model. Withhold the *big* windfall for when the corridor
matures, not the first boat. Fire `corridor_first_clean_cycle` + `route_scaled`.

---

### CREW-LOYAL-01 — The One Who Stayed

- **Trigger (sim state):** A lieutenant's loyalty stays high through a stress test
  (a rival's offer refused, a raid survived, a betrayal by *someone else* — the
  positive mirror of CREW-BETRAY-01/02, reading the NPC memory log — doc 02 §3–4).
- **Trigger type:** Variable (fires when loyalty is *proven under pressure*), opening
  a deterministic reward branch (promotion / a deepened bond).
- **Act / arc:** II–III — crew arc; the relatedness payoff the whole engine is for.
- **Characters:** *Deon* (the loyal one — the counterweight to Marco), the Player.
- **Loop / hook role:** Relatedness payoff (the pillar most easily under-built —
  doc 02 §0); unlocks **idle delegation** (promote to run a territory/front — doc 02
  §5); a shareable "the one who stayed" story beat (GDD §12).
- **Prerequisites / one-shot?:** One-shot per lieutenant; strongest right after a
  betrayal card (CREW-BETRAY-02) landed the *contrast*.

**Scene text:**
> Deon finds you after the dust settles, and for a second he just stands there. "You
> remember Kingston?" he says. "When it went bad and you came back for me. Nobody
> came back for me before that." He's not asking for anything — that's the thing. "So
> when Silvio's people made me an offer last week? I told them where to put it. Figured
> you should hear it from me, not from somebody else."

**Choices:**
1. **Promote him (make him a lieutenant / give him territory)** → he runs a
   front/district autonomously (idle delegation — doc 02 §5) → sets
   `deon_promoted=true`. *(Trust rewarded; a new self-running income node.)*
2. **Cut him in deeper (a stake, not a wage)** → shift him from paid to *partner*;
   loyalty ceiling rises, and so do the stakes if he ever *did* turn (relatedness
   raises the drama both ways).
3. **Just say it plainly (relatedness, no sim reward)** → acknowledge the Kingston
   debt out loud; no mechanical payoff, deepens the bond — a *breath* like PLATEAU-01.

**Reputation variants:**
- **Street:** loyalty answered with loyalty — you don't forget who stayed.
- **Business:** promotion framed as equity — align his incentives with the empire's.
- **Political:** Deon becomes a trusted proxy — someone to send where you can't go.

**Writer notes:** The payoff reads straight from Deon's **memory log** ("you came back
for me") — it only lands because the player *earned* it in an earlier choice, which is
the memory system paying off (doc 02 §3). Keep it understated; the reward is that he
*chose* you. Best placed right after a betrayal (CREW-BETRAY-02) so loyalty and
treachery frame each other. Fire `crew_loyalty_proven` + `lieutenant_promoted`.

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
