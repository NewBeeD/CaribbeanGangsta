# 10 — Debt & Loan Sharks (Capital, Leverage & Pressure)

> Companion to `CaribbeanGangsta_GDD.md` §4. Adds two requested features:
> **(1)** borrowing at interest from loan sharks, and **(2)** a growing debt you
> must repay. This is a **capital *source*** (the opposite of the clean-cash sinks
> in doc 09) and the game's main early-game **pressure/tension** engine.
>
> **This system is deliberately the closest we get to the dark-pattern line**
> (loss aversion, sunk-cost, debt pressure), so it is engineered to stay on the
> healthy side of it. The design rests on four non-negotiable guarantees — read
> §4 (Ethical Contract) before tuning anything.
>
> Numbers follow `01_Economy_and_Balancing.md` (heat 0–1; weed 10/18; coke
> 200/480; front base $2,100/h). **All values are v1 hypotheses for telemetry
> tuning (doc 06).**

---

## 1. Why it exists — debt as the "come-up" hook

Borrowing is the classic crime-fantasy rise: **leverage you can't afford yet, then
sweat the repayment.** It solves a real gap the research identifies — an
open-ended sim can feel *stakeless* in its first hour (no 30-day timer like Drug
Wars). Debt supplies **voluntary, front-loaded tension** and an **endowed-progress
head start**:

- **Leverage (endowed progress):** a loan lets you buy a big shipment or open a
  front *now*, accelerating the come-up — a positive, forward-pulling hook, not a
  trap.
- **Interesting decision with perceived impact:** every loan is a risk/reward call
  the player owns (Sid Meier).
- **Relatedness:** the shark is a *character* (greed, menace, memory), not a UI —
  your first relationship in the underworld (SDT; doc 02).
- **Autonomy:** high-leverage play vs. a cautious debt-free build are two legible
  paths (GDD §10).

---

## 2. The lenders (a progression of characters)

Each is an NPC with personality, memory, and a relationship that can deepen (favors,
a standing line of credit) or sour (he becomes a rival — doc 05).

| Lender | Unlocks | Max principal | Interest (per in-game week) | Consequence ceiling |
|---|---|---|---|---|
| **Street shark** ("Papa Cass") | Early (≈ day 2) | ~$2,000 | ~20% | muscle, seizes a stash |
| **Neighborhood money-man** | District controlled | ~$25,000 | ~10% | takes a front / territory |
| **Cartel financier** | International routes | ~$500,000 | ~5% | lethal / cartel war |

- **Borrow cap = f(reputation, collateral).** Bigger sums need a stash or front put
  up as **collateral** (ties to storage/fronts, doc 09).
- Higher-tier lenders are *cheaper* but their consequences are *heavier* — a real
  trade, not a strict upgrade.

---

## 3. Loan mechanics

- **Terms shown up front, in full:** principal, weekly rate, and the **total you'll
  repay** at the soft due date — no hidden balloon. (Disclosure neutralizes
  "darkness" — core.ac.uk 30100776.)
- **Interest compounds per in-game day** at `rate / 7`, **but only during active
  play** — see §4. A soft **due date** (~2 in-game weeks for the street shark) is
  when consequences *begin*, not a hard wall.
- **Early repayment is always free** — no prepayment penalty (an ethical must; a
  penalty would punish the player for doing the healthy thing).
- **Partial payments** allowed and encouraged; they reset the shark's patience.
- **Collateral** (optional, for bigger loans): pledge a stash/front; default
  transfers *that one asset* — the anti-wipe rule (doc 09) still holds.

### Example (street shark, illustrative)
Borrow **$1,500** at 20%/wk. Play through one in-game week → owe **~$1,800**. Buy a
coke shipment with it, clear ~$2,800 profit, repay $1,800 → net **+$1,000** and a
happy shark who now lends you more. That's leverage working. Sit on it through three
played-weeks without paying → owe **~$2,600** and Papa Cass sends someone.

---

## 4. The Ethical Contract (the four guarantees)

This system is defensible **only** if all four hold. They are not optional polish —
they are what separate "tension" from "dark pattern" (GDD §8).

1. **Opt-in / consent.** The player *chooses* to borrow. A dark pattern requires
   *lack of consent* (core.ac.uk 30100776) — voluntary debt fails that test by
   definition. We never auto-enroll the player in debt.

2. **Absence is never punished — debt is frozen offline.** Interest accrues **only
   during active play** (per in-game day you actually play through). Real-world time
   away **never increases what you owe.** This is the hard line the whole game holds
   (contrast FarmVille's punitive timers — core.ac.uk 30100776; dl.acm 3173574).
   Combined with the idle engine (doc 06), *being away is never net-negative*: your
   fronts keep earning, your debt sits still.
   - **No debt-guilt notifications, ever.** No "log in or your debt grows" push.
     The pressure lives inside the fiction, on the *character* — never on the human
     (contrast the streak-guilt patterns players flag — tandfonline 1521326).

3. **No unrecoverable fail state.** You can always dig out. Missed payments escalate
   *in fiction* (see §5) but never silently end the game; the worst case routes into
   a story arc, and true death only ever becomes a **Legacy** reset (GDD §7), like
   any other death (dl.acm 3311350).

4. **Frustration only as challenge that resolves into competence.** Managing debt is
   a *skill* the player masters, not an artificial deficit engineered to extract.
   "Interested" is the marker of healthy engagement; designed-in frustration to
   force investment is the failure mode we avoid (dl.acm 3491101).

> **Watch item (doc 06):** debt is the system most likely to produce the *need-
> frustration signature* (rising playtime + falling sentiment + rage-quits →
> predicts churn, tandfonline 0144929X). If telemetry shows borrowers churning, the
> rates/consequences are too harsh — treat it as a balance bug, not a KPI win.

---

## 5. Default escalation ladder (all recoverable, all in-fiction)

Missing the soft due date advances a **readable, telegraphed** ladder — never a
sudden punishment (estimable-but-fair; Sid Meier). Each rung is a **story beat**:

1. **Vig added** — the shark quietly raises the rate. A warning.
2. **A visit** — muscle intimidates you (a scare, heat-free). "Papa Cass says hi."
3. **Collateral / a stash taken** — he seizes *one* pledged stash or a cut of income
   (doc 09 anti-wipe rule intact).
4. **A front / corner taken** — he moves on an asset; recoverable over time.
5. **Marked** — he puts a price on you or becomes a **rival** (doc 05 rival arc);
   lethal outcomes feed **Legacy**, never a silent game-over.

At every rung the player has **agency**: pay, partial-pay, negotiate a new term, do
the shark a *favor* instead of cash (a relationship branch), or — the violent path —
remove him (and inherit his enemies).

---

## 6. Integration

### Economy (doc 01)
Debt is the one **capital source** that front-loads cash, mirror-image to the
storage/payroll **sinks** (doc 09). It makes the early economy elastic: borrow to
seize an opportunity, repay from the margin. Add a `debt` ledger to state (principal,
rate, accrued interest, due-day, collateral ref).

### Storage & corruption (doc 09)
Collateral = a pledged stash/front. A defaulting shark seizes exactly one location
(anti-wipe preserved). A high-tier financier may double as a corruption/rival node.

### Crew & NPCs (doc 02)
The shark is an NPC with loyalty/memory: pay reliably and he becomes a *resource*
(bigger lines, intel, a contact); burn him and he becomes an *enemy*. Reuses the
relationship/betrayal machinery.

### Narrative beats (doc 05) — new trigger rows
| Trigger (sim state) | Beat |
|---|---|
| Low cash + an opportunity the player can't afford (≈ day 2) | Papa Cass makes his **first offer** (unlock) |
| First loan repaid in full & on time | Payoff beat — the shark extends a bigger line (competence + relatedness) |
| Soft due date passed, unpaid | **Default arc** begins (the ladder, §5) |
| Debt cleared after a scare | "You dug out" — a rise beat |
| Shark marks the player | Crossover into a **rival arc** (doc 05 §2) |

### Story cards (doc 08) — beats to author
- `DEBT-01` — Papa Cass's first offer (teach the terms *and* the freeze-offline rule
  in fiction).
- `DEBT-CLEAR-01` — Paid in full, on time (the leverage-worked payoff).
- `DEBT-DEFAULT-01` — The first visit (escalation rung 2, felt as a scene).

### First session (GDD §9 / doc 01 §6)
The loan shark is a strong, genre-authentic **early hook** — but it must stay
**optional** and post-competence. Recommended: introduce Papa Cass's offer at the
*end of the first session or start of day 2*, framed as leverage to grow faster —
never as a requirement, and never before the player has felt a few wins.

### Telemetry (doc 06) — new signals
- **Borrow rate**, **average leverage** (borrowed ÷ net worth), **default rate**,
  **dig-out rate** (defaulted → recovered).
- **Borrower sentiment & retention vs. non-borrowers** — the frustration-signature
  watch from §4.
- Confirm **no correlation between real-world absence and owed balance** (proves the
  freeze-offline guarantee is working as built).

---

## 7. MVP & sequencing

1. **Street shark only**, one loan at a time, the four guarantees, and the first
   three ladder rungs (vig → visit → stash seizure). Enough to test whether debt
   *feels* like exciting leverage or stressful extraction.
2. Add **collateral** + the **neighborhood money-man** once storage (doc 09) is in.
3. Add the **cartel financier** with international routes (late-game, lethal stakes).

Ship the smallest version that proves the *feel*, then expand — and let doc 06's
borrower-sentiment signal, not raw engagement, decide whether the tuning is right.
