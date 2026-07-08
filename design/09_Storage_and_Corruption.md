# 09 — Contraband Storage & The Corruption Network

> Companion to `CaribbeanGangsta_GDD.md` §4. Specs three requested features:
> **(1)** storing product in vaults & secret places, **(2)** paying off port
> officials at variable prices, **(3)** putting politicians & police on the
> payroll. All three are **mid-game unlocks** revealed via progressive disclosure
> (not first-session), and all three are built on the same research spine:
>
> - **Interesting decisions with perceived impact** — *where* to stash and *who*
>   to buy are meaningful, consequential choices (Sid Meier).
> - **Estimable-but-fair risk** — every seizure %, bribe price, and flip warning is
>   shown; the number displayed is the number rolled (Sid Meier).
> - **Recoverable — until a wipe (v1.1).** A single raid or betrayal is a *setback*
>   you recover from; that's what diversification buys you. But concentrate everything
>   in one place and a raid can *wipe* you — and a wipe is the entry to the death
>   spiral (doc 01 §4a). Storage is now a **survival skill**, not just loss-capping.
>   (dl.acm 3311350 re-read for the roguelike frame.)
> - **Relatedness** — bought officials are NPCs you manage, trust, and can be
>   betrayed by (SDT; doc 02).
> - **Autonomy** — these systems are the backbone of the *business/political* and
>   *low-profile* playstyles, distinct from the *violent* path (GDD §10).
>
> Numbers below follow `01_Economy_and_Balancing.md` conventions (heat is 0–1;
> **real-dollar prices per §2** — e.g. weed ~$700–1,500/kg at source, cocaine
> ~$1,500–3,000/kg at source rising to $20k–60k+ wholesale; front/idle rates per §3).
> **All values are v1 hypotheses to be tuned by telemetry (doc 06).**

---

## SYSTEM A — Contraband Storage (Vaults & Secret Places)

### A.1 Why it exists
Product has to live *somewhere* between buy and sell, and **that location is a
risk decision**. Storage turns "how much product do I hold?" into "how much am I
willing to expose, and where?" — a planning layer that rewards the shift from
tactics to strategy the research says defines mature engagement (dl.acm 3173574).

### A.2 The core rule (diversification = survival, v1.1)
**A raid hits exactly ONE location.** So spreading inventory across stashes caps a
single night's loss to what's in one place. **This is your survival skill.** Play it
right and any one raid is a *setback*; play it wrong — everything in one stash to save
on storage cost — and a raid becomes a **wipe**, which starts the death spiral (doc 01
§4a). The choice of *how much to expose, and where* is now life-or-death, not just
loss-capping.

Seizures take **product + dirty cash stored at that location** (dirty cash has to
live somewhere too — A.3a). Clean assets in fronts and crew are not *directly* seized
(consistent with doc 01 §4) — but if a wipe leaves you unable to pay them, they walk,
and that's the spiral. So "clean cash is safe" is true *only if you survive to launder
and spend it*.

### A.3 Stash types

| Stash | Capacity | Seizure if raided | Heat footprint | Access speed | Cost |
|---|---|---|---|---|---|
| **Floor stash** (backroom, mattress) | 50 u | 90% | +small | instant | $500 |
| **Buried cache / jungle drop** | 200 u | 40% | very low (hidden) | slow (travel delay) | $3,000 |
| **Safehouse vault** | 800 u | 25% | moderate | instant | $15,000 (needs a crew guard) |
| **Container / offshore** (port-linked) | 3,000 u | 15% → **~3% if the port is paid** (System B) | low | slow | $60,000 |
| **Decoy stash** | — | absorbs a raid (misdirection) | draws heat *on purpose* | — | $2,000 |

Design notes:
- **Trade-offs, not a strict ladder:** the buried cache is *safer* than the
  safehouse but slower and smaller — so the choice is real, not just "buy the
  bigger one" (autonomy).
- **Safehouse guard = relatedness hook:** a vault guarded by a low-loyalty crew
  member raises its effective seizure risk (an inside job). Ties storage to doc 02.
- **Decoy stash** is a clever-play option: deliberately draw a raid to an empty
  place. Rewards system mastery (the "safe place to experiment" framing, dl.acm
  3311350).
- **Capacity pressure** is the sink: to stockpile for a price swing (doc 01 §2) or
  a big shipment, you must invest in storage first — a reason to spend and plan.

### A.3a Dirty cash must be stored & guarded (v1.1)
Un-laundered cash isn't safe just sitting in a "wallet" (`Ideas.md` Storage #2). Like
product, **dirty cash lives in a location and shares that location's seizure %** — and
large piles **need people guarding them**:

- **Guarded stashes:** a safehouse/vault holding significant dirty cash needs a crew
  guard (wages). An under-loyal guard raises effective seizure risk (an inside job —
  A.3 note; doc 02) *and* is a theft/flip risk.
- **The pressure to launder:** holding dirty cash is exposure — it can be seized in a
  raid and it costs guard wages. That's the mechanical push toward the laundering
  engine (doc 01 §3), and a real reason clean cash is worth the haircut.
- **Wipe interaction:** a raid that hits your main cash stash can zero your operating
  capital in one night → death spiral (doc 01 §4a). So *cash* diversification matters
  as much as *product* diversification.

### A.4 Raid resolution (estimable-but-fair)
- Each location shows its **current seizure %** on the storage screen — and that
  is exactly the number rolled if it's raided.
- Raids are **telegraphed** where possible (a bought cop tips you off — System B —
  giving you a turn to move product; a session-end/return hook).
- Loss renders as a **scene**, not an error ("They took the Springtown cache. The
  cash under the floor they missed."), and never zeroes the player out.

### A.5 Progression
A deterministic **competence track**: unlock stash types, upgrade capacity
(`cost(n) = base × 1.15^n`, doc 01), and improve concealment. Safe, non-gambling
progression (meta-achievement style — tandfonline 1521326).

---

## SYSTEM B — The Corruption Network

Two tiers: **one-off port bribes** (variable, per-shipment) and **standing payroll**
(recurring, for politicians & police). Both are the heart of the *buy-your-way-to-
safety* playstyle and the main **sink for clean cash** (giving the idle laundering
payoff, doc 01 §3, somewhere meaningful to go).

### B.1 Port officials — variable, per-shipment bribes

**What it does:** every shipment through a port carries a base seizure risk
(start: **30%**). Paying the port official lowers it (down to ~3–5%) and/or unlocks
higher throughput. It's a **negotiation**, not a fixed toll.

**The price is variable** — that's the point. Asking price =

```
base_bribe  ×  (1 + heat)  ×  (1 + rival_pressure)  ×  greed_trait  ×  rep_discount
```

| Driver | Effect | Why (research) |
|---|---|---|
| `base_bribe` | **~5–20%+ of shipment value** (starts ~8%) | real port-bribe range; scales with what's at stake (UNODC/InSight Crime) |
| **Heat** | hotter empire → pricier (officials risk more) | consequence of your own play (perceived impact) |
| **Rival pressure** | if a rival also buys this port, a bidding war raises the price | rivals as living pressure (GDD §4.4) |
| **Greed trait** | 0.7–1.3 per official | NPCs are people (relatedness) |
| **Reputation discount** | high Business/Political rep lowers it | rewards the playstyle (autonomy) |
| **Recent regional bust** (Chaos Engine event) | temporary spike across all ports | emergent, estimable event |

**The interaction is a decision, not a rubber-stamp** (Sid Meier):
- See the **asking price + the resulting seizure %** before committing.
- **Haggle** — push for a lower price at the risk of the official refusing *this*
  run (a readable gamble, odds shown).
- **Walk** — ship anyway at full risk, or route through a different port.

Prices **drift each cycle**, so the "cheap port" this week isn't guaranteed next
week — a light appointment-*less* reason to re-check (a bonus to catch, never a
punishment to miss — the ethical line, core.ac.uk 30100776).

### B.2 Standing payroll — politicians & police

**What it does:** put people on a recurring retainer (paid weekly, ideally from
**clean** cash) for standing protection. This is deterministic value — you pay, you
get the benefit — with a *variable, telegraphed betrayal risk* as the only
uncertainty (texture, not gamble; GDD §5.4).

| On the payroll | Cost/wk | Standing benefit |
|---|---|---|
| **Beat cop** | $1,500 | Tip-offs on *local* raids (a turn's warning to move product); faster local heat decay |
| **Detective / DEA insider** | $8,000 | Advance warning on task-force moves; intel on which routes/ports are watched; bury one charge per season |
| **Customs chief** | $6,000 | Standing low seizure on their port (a permanent version of B.1) |
| **Local politician** | $12,000 | Protection for a front/territory; slows LE-tier escalation; permits that unlock new fronts; **+Political reputation** |
| **Judge** | big retainer | Can dismiss charges — **softens the "imprisonment" end-state**, keeping a run alive for a comeback instead of ending it (GDD §7) |

**"Plata o plomo" — the corruption dilemma made real.** The network runs on the
classic transit-corridor logic (*silver or lead*): an official takes the money, or
becomes a problem. The player wields it (buy an official, or — the violent path —
remove one who won't take the deal), and can have it turned back on *them* by a
rival or the state. It stays on the healthy side of the ethical line (B.3) — the
menace is in-fiction and telegraphed, never aimed at the human player.

**Retainers are not fixed — officials demand more as you grow (v1.1).** Any official
can **ask for a raise at any moment**, and the ask scales realistically with your
**reputation and business level** (`Ideas.md` Storage #3): the bigger and hotter your
empire, the more they know they're worth — and the more they risk protecting you. A
customs chief who took $6k/wk when you were a district hustler wants far more once
you're moving international weight. Drivers of the ask:

```
new_ask = current_retainer × (1 + Δbusiness_level) × (1 + heat) × greed_trait × rival_pressure
```

You can **accept, negotiate, or refuse** — but refusing (or ignoring the ask) is
exactly an *underpayment*, which feeds the flip risk below. This makes payroll a
**growing, scaling clean-cash sink** that keeps pace with your income (so success
doesn't trivialize protection) and a constant, in-fiction pressure — never a
real-world guilt timer (B.3).

**Benefits are the point; the flip is the drama.** Each official has hidden
**loyalty**. Flip risk rises — and is *telegraphed* — when:
- you **miss/underpay** a retainer,
- your **heat crosses their comfort threshold** (they distance themselves to
  survive),
- a **rival outbids you** (a bidding war — crossover with the rival arc), or
- **LE turns them** into a double agent who now feeds your info back (the wire /
  snitch mechanic, doc 02 §4).

Warning signs are **readable** (they get nervous, ask for more, go quiet — surfaced
as prose, not a bar). The player has agency to intervene: **raise pay, cool heat,
feed them false intel (counter-intel), or remove them** (the violent path). This is
the estimable-but-fair betrayal loop from doc 02, applied to LE — and it's *why*
this is compulsion-through-mastery, not through fear.

### B.3 Ethics check (this stays on the healthy side)
- Payroll is **optional power**, deterministic benefit — not a loot box, not
  pay-to-win, no gambling on the progression path (GDD §8; dl.acm 3491101).
- Missing a payment is an **in-fiction consequence the player controls**, not a
  punitive "don't-break-your-streak" pattern aimed at the *player's* real life
  (tandfonline 1521326). The pressure is on the character, never guilt-tripping the
  human.
- Recurring cost = a **healthy clean-cash sink** that gives the idle payoff purpose.

---

## Integration

### Heat & law enforcement (GDD §4.5, doc 01 §4)
Corruption is the primary **heat-management** lever besides lying low: bought
officials slow escalation and buy warnings; the network *is* your counter-intel.
Raids (which storage defends against) are what the network warns you about — the
three features form one loop: **stockpile → protect → get tipped off → move in time.**

### Economy (doc 01)
- Storage upgrades and payroll are the two big **sinks** that keep clean cash from
  piling up meaninglessly (giving the laundering engine a destination).
- Variable bribes make smuggling margins *fluctuate*, deepening the buy-low/sell-
  high decision layer.

### Playstyles / autonomy (GDD §10)
- **Business/Political:** lean on payroll and reputation discounts; buy safety.
- **Low-profile:** small hidden caches, minimal payroll, stay invisible (low heat).
- **Violent:** fewer bribes, more intimidation; remove officials who waver.
Three legible ways to play the same systems — the autonomy pillar in action.

### Narrative beats (doc 05) — new trigger rows
| Trigger (sim state) | Beat |
|---|---|
| First smuggling route opened | A port official makes his first offer (unlock B.1) |
| A bought cop's tip fires before a raid | Payoff beat — the payroll pays off (competence + relatedness) |
| An official's loyalty + rival bid align | **Flip arc** begins (warning signs → turned) |
| Heat crosses a payrolled official's threshold | He asks for more, or starts to distance himself |
| Prison end-state **with a judge on payroll** | Charges dismissed → the run survives for a comeback instead of ending |
| **A raid wipes an over-concentrated stash** | The death-spiral arc opens (doc 01 §4a) — protection starts to collapse |

### Story cards (doc 08) — beats to author
- `CORR-01` — First port official's offer (the smuggling unlock).
- `CORR-FLIP-01` — A payrolled cop goes quiet (LE turned him — the wire).
- `STASH-01` — Choosing your first real hiding place (teach the diversification rule).
- `RAID-01` — A stash gets hit; the anti-wipe rule felt in fiction.

### Telemetry (doc 06) — new signals
- **Storage diversification index** & **average raid-loss %** (is diversification
  working as a survival skill? target: a *diversified* player loses <~40% of held
  product to any one raid — while an *over-concentrated* player can still be wiped, by
  design).
- **Raid-induced wipe rate** — how often a raid tips a player into the death spiral
  (doc 01 §4a); cross-check it correlates with over-concentration, not bad luck.
- **Bribe spend / shipment** and **payroll as % of clean income** (sink health).
- **Official-flip rate** and **intervention-success rate** (is the betrayal loop
  readable, per doc 02?).

---

## MVP & sequencing (progressive disclosure)

1. **Storage first** (2–3 stash types + the anti-wipe rule) — it's close to core and
   makes raids meaningful. Introduce once the player holds enough product to fear a
   raid, not in the first session.
2. **Port bribes next** — arrives with the first smuggling route (a paradigm-shift
   unlock, GDD §4.6).
3. **Standing payroll last** — the deepest layer; unlock as the empire crosses into
   DEA attention (heat tier shift), when protection starts to matter.

Ship a **small, high-impact subset** of each before expanding the roster of stash
types and buyable officials (the RimWorld lesson — gdcvault 1024232).
