# Prompt 58 — Protection Turf: Tribute in Reverse

**Depends on:** 57 (turf-war rewards, schema v25), turf wars (schema v22,
`engine/turfWar.ts`), 26 (config), 03 (clock/tick steps).
**Design authority:** `design/15_Turf_War_Stakes_and_Rewards.md` Workstream
**B** — the flagship: "held, defended turf produces income."

## Objective

Answer "why hold many countries?" with income (design/15 §B3). When a war over
a country ends in the player's favor — a defensive war fought off, or an
offensive topple — that country becomes **protection turf**: local operators
pay a weekly dirty-cash drip into the country's stash, exactly like street-team
proceeds (dirty, located). Declare War gains a payback period a player can
reason about; defending turf becomes defending revenue. Open decision resolved
per the doc's recommendation: a bought truce never creates protection turf —
pay-for-peace stays strictly worse than winning.

## Deliverables

- **The claim.** `TurfClaim { countryId, wonAtHours, source: 'defense' |
  'topple' }` list on `GameState.turfClaims` (the doc's B2 claim-list option —
  it survives stash upgrades). Created in the `resolveBattle` war-ended win
  branch only: a rival-initiated war fought off (`source: 'defense'`) or a
  player-declared topple (`source: 'topple'`). `sueForTruce` never creates
  one. Schema bump to **v26** with a migration seeding `turfClaims: []`
  (nothing seized; existing saves start with no claims).
- **The drip.** A new ACTIVE-only `turf-income` tick step:
  `perWeek = PROTECTION_PCT × wealthIndex × PROTECTION_BASE_PER_WEEK`,
  pro-rated over `dtHours`, deposited as dirty cash into the claimed country's
  stash. `wealthIndex` is the country's **static** demand character
  (`demandBias` band midpoint — `countryWealthIndex`, config/countries.ts),
  **never** `countryStake` (§0.5 anti-compounding: parked cash must not grow
  the drip). Frozen offline and while incarcerated (GDD §6 / the B4 sentence
  rule — same as laundering/street sales).
- **Suspension and lapse.** A new war igniting over claimed turf suspends the
  drip until the war is resolved again (rivals want profitable turf back — the
  ignition layer gains a purpose); resolution in the player's favor, or a
  bought truce, resumes it. If the last stash in the country is sold or lost,
  the claim lapses (the drip needs somewhere to land) — permanently, until won
  again. A terminal seizure loss removes the claim with the ground.
- **Surface it.** The war-won telegraph names the weekly number the claim
  starts paying (shown = applied). The Turf War screen's war card adds
  protection income to the "a win pays" line, and a Protection Turf card lists
  every claim: country, per-week figure, and a "contested — suspended" note
  while a war is live over it.

## Acceptance criteria

- [ ] Win a defensive (rival-initiated) war to resolution → a `defense` claim
      exists and the drip starts; the telegraph names the weekly number.
- [ ] Topple on a player-declared war → a `topple` claim, same drip.
- [ ] `sueForTruce` ends a war without creating a claim.
- [ ] The drip lands `perWeek × dtHours / 168` dirty in the claimed country's
      stash, scales off the static wealth index, and is UNCHANGED by parking
      more cash in the country (anti-compounding).
- [ ] A new ignition over claimed turf suspends the drip; the war's resolution
      resumes it. No stash left in the country → the claim lapses.
- [ ] Offline earns zero (`settleOffline` leaves stashes and claims untouched).
- [ ] Migrating a v25 save yields `turfClaims: []`, the new config knobs from
      the default, and no change to cash/holdings/RNG.
- [ ] Full suite green, `tsc` clean, lint clean; batch sim (in-suite) confirms
      turf income stays a minority stream (tune `PROTECTION_PCT` down if it
      dominates).

## Ethical guardrails

- Every number lives in `config/turfWar.ts` and reads live from
  `state.config.turfWar` — no literals in the engine.
- Offline stays frozen — the drip is an ACTIVE-only tick step; absence never
  earns, never bleeds.
- Telegraphed and exact: the weekly figure shown on the win card and the Turf
  War screen is the number the tick step deposits.
- Open access holds: no gates, no flags — turf is won in the fight, never
  unlocked.
