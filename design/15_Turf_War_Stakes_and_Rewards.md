# 15 — Turf War Stakes and Rewards

Source: user feedback (July 2026): "There should be some benefit towards turf
wars … do a deep analysis and add some extra benefits or losses to having turf
wars." Played against the working-tree build at schema v24 (turf wars v22,
consignment v23, semi-sub charters v24).

This doc analyzes why the turf-war layer (`engine/turfWar.ts`,
`engine/config/turfWar.ts`) feels unrewarding, then proposes reward and stakes
mechanics grouped into three workstreams (A–C), sized as candidate prompts
**57–59**. Workstream A is the minimum fix; B is the flagship new system; C is
the second wave that makes rivals matter while alive.

House rules that bind everything below (prompts/README.md, Ideas.md):

- **Engine stays pure and deterministic** — all new mechanics live in
  `app/src/engine`; UI only renders view-models and dispatches intents. Rolls
  draw from the independent run-seeded turf-war stream (`world.eventSeed`
  forks), never the deal/raid RNG.
- **Config, not literals** — every new number goes in
  `app/src/engine/config/turfWar.ts` and reads live from
  `state.config.turfWar`. New persisted shape ⇒ bump `SCHEMA_VERSION` in
  `state.ts` + a hydrate migration that never seizes anything a player earned.
- **Money is the only gate** (open access, [[open-access-design]]) — nothing
  below adds a progression flag. Rewards are earned, never unlocked.
- **Offline is frozen** (GDD §6) — every drip or ongoing effect below is an
  ACTIVE-only tick step; absence never earns, never bleeds.
- **Telegraphed + shown = rolled** (design/01 §0.3, design/07 §5) — spoils and
  penalties are announced via `PendingChoice` before/as they land; any new odds
  shown are the exact number rolled.
- Definition of done per prompt: `npm run typecheck`, `npm run lint`,
  `npm run test` all green; re-run the Prompt 25 batch sim after any retune.

---

## 0 — Analysis: why turf wars feel pointless

### 0.1 The cost/benefit ledger is one-sided

What a war costs today (all real, all visible):

| Cost | Where |
| --- | --- |
| $250k clean to declare, +11 heat (6 declare + 5 open) | `declareWar`, `openTurfWar` |
| Arms consumed every battle, **win or lose** | `resolveBattle` → `spendArmory` |
| Per loss: +15 pressure, +8 heat, −6 street rep, −12 loyalty casualty | `resolveBattle` loss branch |
| Tribute while lost-but-active: 20%/week of the country's stashed dirty cash, from clean cash | `applyTribute` |
| Terminal loss (pressure ≥ 80 AND 3+ losses): every stash in the country wiped | `seizeCountry` |

What winning pays today:

| Reward | Visibility |
| --- | --- |
| Topple zeroes the rival's tension → lower `rivalPressure` → cheaper port bribes and retainer raises (`corruption.ts`) | Invisible unless you read the code |
| "An Old Friend" prestige (1 lifetime topple → extra roster face) | One-time, meta |
| Run-end / leaderboard `rivalsToppled` stat | Cosmetic |
| A defensive win: the war ends | Status quo restored, minus the guns |

Winning is *threat removal*, never gain. A rational player only fights when
forced, which orphans the offensive layer and the armory-spending loop the
feature was built to create (turf wars are the only sink for `arms.ts`).

### 0.2 Rivals barely exist outside the war system

Audit of every engine module: rivals touch exactly two things — corruption
asks (tension → `rivalPressure`) and chaos events (which raise tension). They
have **zero presence** in regional markets, plugs, travel interdiction, street
sales, production, or fronts. A rival being alive costs nothing measurable, so
removing one can't feel valuable. This is the root problem: the war layer
punishes, but the rival layer doesn't, so both the threat and the victory are
hollow.

### 0.3 The war kinds are flavor, not mechanics

`hot / cold / raid / undercut` only scale rival strength
(`KIND_RIVAL_MULTIPLIER`). An "undercut" price war never touches prices; a
"raid" war never raids a stash; a "cold" war never leans on your officials.
The fiction promises consequences the engine doesn't deliver.

### 0.4 Offense has no economic story

Wars are only fought over countries the **player** holds — there is no
conquest. Declaring war spends $250k + heat + guns to, at best, restore the
map to how it already looked. The Declare War button is never the +EV move.

### 0.5 Exploit check on adding rewards

- **Topple spoils can't be farmed**: rivals are finite per run and topple is
  permanent (`RivalState.toppled`, checked at ignition and declaration).
- **Per-battle spoils are self-limiting**: a won battle drops pressure 35 and
  the war ends at ≤ 5, so a war yields at most ~3 winning battles; pressure
  regrows at only 0.5/hr and every battle consumes arms. Cap spoils per war
  anyway (belt and braces).
- **Turf income must scale off the country, not the player's stake** — scaling
  off `countryStake` (stashed cash) would compound: park cash → bigger drip →
  park more. Scale off the country's static `wealthIndex` instead.

---

## A — Make winning pay (Prompt 57) · the minimum fix

Three rewards, almost no new state. Together they turn the battle/topple loop
from pure sink into a rough break-even in cash and a clear win in strategy.

### A1. Captured arms on a won battle

Winning seizes a fraction of the firepower the rival brought. Units are added
straight to `state.armory`, tier flavored by the war kind so the counter-play
fiction holds:

- `hot` (Violent Bull) drops `rifles` / `automatic`;
- `raid` (Ghost) drops `pistols`;
- `cold` (Politician) and `undercut` (Tech Cartel) drop a thin mixed bag —
  their strength was never guns.

Mechanics: deterministic (no roll) — `CAPTURE_UNITS_BY_KIND` config table,
scaled by the rival's `aggression` (an aggressive rival fields more guns),
floored at 0. Applied in the `resolveBattle` win branch before the telegraph;
the `turf-war-battle` summary names the haul ("…and you took their guns.").
Partially refunds the consumed commitment, so firepower stops being a pure
sunk cost.

Config: `CAPTURE_UNITS_BY_KIND: Record<TurfWarKind, Partial<Record<WeaponTierId, number>>>`,
`CAPTURE_AGGRESSION_SCALE`.

### A2. War spoils on a topple

Breaking a rival for good seizes a cut of their operation as **dirty** cash
(their money is never clean — it lands in the current-country stash and feeds
the wash/laundering pipeline, a deliberate loop). Scaled by the rival's traits
so the scariest rivals are the richest prizes:

```
spoils = TOPPLE_SPOILS_BASE × (1 + reach × TOPPLE_REACH_WEIGHT
                                 + aggression × TOPPLE_AGGRESSION_WEIGHT)
```

Target band $150k–$500k (v1 hypothesis: BASE 150_000, weights 1.0 / 0.75), so
a declared war roughly recoups `DECLARE_WAR_COST` in cash and profits in
strategic terms. Applied in the topple branch of `resolveBattle`; the
`turf-war-won` telegraph names the number. Not farmable (§0.5).

### A3. Street rep on won battles

Mirror the existing `BATTLE_LOSS_REP = 6` with `BATTLE_WIN_REP` (v1: 3),
capped per war (`WIN_REP_CAP_PER_WAR`, v1: 9 — needs a small `repEarned`
counter on `TurfWar`, schema bump). Rep already has teeth in the engine — it
raises the borrow cap (`debt.ts` `CAP_REPUTATION_SCALE`), keeps the lifeline
open (`LIFELINE_MIN_REPUTATION`), and discounts corruption asks
(`repDiscount`) — so this is a real economic reward with zero new systems.

Acceptance (A): win a battle → armory gained per kind table and summary names
it; topple → dirty spoils land in-country and telegraph names the number; rep
rises on wins and clamps at the per-war cap; sim re-run shows declared wars
near cash break-even; no reward path reachable from a `rejected` branch.

---

## B — Protection turf: tribute in reverse (Prompt 58) · the flagship

The single strongest lever for making offense attractive: **held, defended
turf produces income**.

### B1. Design

When a war over a country ends in the player's favor — a defensive war fought
off, or an offensive topple — that country becomes **protection turf**: local
operators pay you. A weekly dirty-cash drip lands in that country's stash
(dirty, located, exactly like street-team proceeds):

```
perWeek = PROTECTION_PCT × country.wealthIndex × PROTECTION_BASE_PER_WEEK
```

- Scales off the country's static `wealthIndex`, **never** `countryStake`
  (§0.5 anti-compounding).
- ACTIVE-only tick step (`turf-income`), pro-rated over `dtHours`, same shape
  as `applyTribute` — offline earns nothing (GDD §6).
- Requires a stash still standing in the country (the drip needs somewhere to
  land); if the last stash there is sold/lost, the turf claim lapses.
- A **new war igniting over that country suspends the drip** until the war is
  resolved again — protection turf is a thing rivals want to take back, which
  feeds the ignition layer a purpose.
- Buying a truce does **not** create protection turf (peace is not dominance);
  only a battle-won resolution or topple does.

### B2. State + persistence

`TurfClaim { countryId, wonAtHours, source: 'defense' | 'topple' }` list on
`GameState` (or a `protectedSince` field on the stash spot — decide in
implementation; the claim list survives stash upgrades either way). Schema
bump + migration (existing saves start with no claims — nothing seized).

### B3. Why this is the keystone

It answers "why hold many countries?" with income, gives Declare War a payback
period a player can reason about, makes defending turf feel like defending
revenue rather than avoiding paperwork, and creates a natural target for
future rival behavior (they come for the profitable turf first).

Acceptance (B): win a defensive war → drip starts, visible on the Turf War
screen (per-country per-week number); topple → same; truce → no claim; new
ignition suspends, resolution resumes; offline earns zero; migration on an
existing v24 save yields no claims and no crash; batch sim confirms turf
income stays a minority income stream (< ~20% of late-run income, tune
`PROTECTION_PCT` down if it dominates).

---

## C — Rivals that bite while alive (Prompt 59) · second wave

Make the war kinds real (§0.3) so ending a war is relief you can measure, and
add teeth to the terminal rung. Bigger lift — touches markets, corruption,
storage — ship after A/B prove out.

### C1. Kind effects while a war is active (contested country only)

- **`undercut`** — your sell prices in the contested country are depressed
  (`UNDERCUT_SELL_PENALTY`, v1: −15%), itemized in the deal quote so the
  player sees who's costing them.
- **`cold`** — port bribes and official retainer raises for that country
  inflate (`COLD_BRIBE_SURCHARGE`, v1: +25% on the ask), itemized in the
  corruption quote.
- **`raid`** — a telegraphed periodic skim off the contested country's stash
  unless every stash there has a guard (`RAID_SKIM_PCT` per week of stored
  dirty cash, guards zero it) — finally makes `guardCrewId` a war decision.
- **`hot`** — casualties bite harder: `CASUALTY_LOYALTY_HIT` ×
  `HOT_CASUALTY_MULTIPLIER` (v1: 1.5) in hot wars.

All four are pure modifiers read where the number is already computed
(`deals.ts` quote, `corruption.ts` asks, a small addition to the `turf-war`
tick, `resolveBattle`); no new screens — surface in the existing quotes and
the Turf War screen's war card.

### C2. Guards fall with the country

On the terminal seizure loss, crew assigned as guards in the seized country
are lost with the ground (removed from roster, a roster-wide loyalty ripple
via the memory log). Harsh, so it is double-telegraphed: the war card warns
("your people are still in there") from the moment `canSeize` conditions are
one loss away. Turns the guard strength term into a real commitment.

### C3. Fear ripple on a topple

Toppling drops every other rival's tension by `TOPPLE_FEAR_TENSION_DROP`
(v1: 20) — they saw what you did. Compounds the bribe benefit, delays the next
ignition, and makes a topple visibly change the weather. (Variant considered
and parked: the *last* remaining rival spikes instead — a desperation endgame.
Revisit if endgame pacing needs a third-act villain.)

### C4. War-zone logistics risk (optional, cuttable)

Shipments with a leg origin or destination in a contested country take an
interdiction-odds penalty (`WARZONE_INTERDICTION_PENALTY`), itemized in the
Prompt 47 odds quote (shown = rolled holds). Makes wars interact with the
logistics layer; cut first if C runs long.

Acceptance (C): each kind effect measurable in its quote and gone the tick the
war ends; raid skim zeroed by full guard coverage; seizure removes guards with
telegraphs in place; topple lowers all rivals' tension; sim shows no
death-spiral from stacked kind effects at MAX_ACTIVE_WARS = 3.

---

## Open decisions (need a user call before the affected prompt)

1. **A2 spoils size** — break-even with `DECLARE_WAR_COST` (recommended), or
   deliberately profitable to push offense harder?
2. **B truce parity** — confirmed that truces never create protection turf?
   (Recommended: yes — pay-for-peace staying strictly worse than winning is
   the point of the reward.)
3. **C2 severity** — guards *die* (roster removal) or are *captured* (return
   after N days, wages accruing)? Removal is simpler and harsher; capture
   reuses no existing machinery and adds state.
4. **Sequencing** — A and B could merge into one prompt if 57 lands small;
   C stays separate regardless.
