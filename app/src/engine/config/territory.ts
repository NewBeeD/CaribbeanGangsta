/**
 * Territory-expansion tuning (Ideas2 item 5; Prompt 41). Opening a foothold in a
 * NEW country is no longer a flat floor-stash step. Holding ground is made to feel
 * earned and vulnerable:
 *
 *  - **Reach-scaled cost.** The price of the next new country climbs with your
 *    REACH (how many countries you already hold) and JUMPS when you cross into a
 *    trade REGION you don't yet touch (scaled by `REGION_DISTANCE`). A bigger
 *    number, always shown and live the moment you can pay — still a money gate.
 *  - **Vulnerability window.** A freshly opened foothold is EXPOSED — a decaying
 *    raid-risk surcharge that fades to nothing over `VULNERABILITY_WINDOW_HOURS`
 *    of ACTIVE play. Over-expansion is dangerous, never blocked; offline-frozen
 *    like all raid math.
 *  - **Takeover heat.** Opening a route draws a one-time heat bump — expansion
 *    attracts attention.
 *  - **Consolidation hold (time gate).** A new district isn't FULLY CONTROLLED —
 *    doesn't count toward empire reach (`empireComposite`) — until you've HELD it
 *    for `CONSOLIDATION_HOURS` of active play. Until then it reads "contested."
 *  - **Crew requirement (flag gate).** Past `TERRITORY_LT_REQUIRED_AFTER` countries,
 *    opening ANOTHER needs a (non-wire) lieutenant to run it — and the requirement
 *    SCALES: one lieutenant per `TERRITORY_COUNTRIES_PER_LIEUTENANT` held.
 *  - **Expansion cooldown (time gate).** You must wait `TERRITORY_EXPANSION_COOLDOWN_HOURS`
 *    of active play between OPENING new countries — consolidate before you blob out.
 *  - **Heat ceiling (heat gate).** Opening is blocked while heat is at/above
 *    `TERRITORY_MAX_HEAT_TO_EXPAND` — expansion is loud; cool down first.
 *  - **Cross-region capital floor (net-worth gate).** Jumping into a region you don't
 *    yet touch requires a minimum NET WORTH (`TERRITORY_CAPITAL_FLOOR_*`), scaled by
 *    distance — no leapfrogging to a far continent you can't sustain.
 *
 * All the gates past the reach cost RELAX the standing open-access rule (money is
 * the only gate) for TERRITORY specifically — an explicit product decision with user
 * sign-off (Ideas2 round 3; escalated at the user's request so access gets harder as
 * the empire grows): the extra realism is worth the gate here, and here only. Every
 * number is a v1 HYPOTHESIS held as config, never a scattered literal
 * (prompts/README.md "Config, not literals"; Prompt 26).
 */

/**
 * Each distinct country ALREADY held multiplies the next new foothold's cost:
 * `base × REACH_GROWTH^(distinctCountriesHeld)`. Steeper reach as the empire
 * widens, so the tenth flag costs far more than the second.
 */
export const TERRITORY_REACH_GROWTH = 1.4;

/**
 * Extra cost multiplier when the target country sits in a trade REGION you don't
 * yet touch, scaled by the geographic `REGION_DISTANCE` from your NEAREST held
 * region: `× (1 + NEW_REGION_JUMP × distance)`. Planting your first flag on a
 * far continent is a leap; an adjacent-region hop is a smaller step. Applied on
 * top of the reach growth. Same-region opens pay no jump (distance 0 ⇒ ×1).
 */
export const TERRITORY_NEW_REGION_JUMP = 1.5;

/**
 * One-time heat added the instant a takeover OPENS a brand-new route (a new
 * country). Expansion draws attention — an emergent consequence, not a gate.
 * On the 0–100 meter (config/heat.ts scale convention).
 */
export const TERRITORY_TAKEOVER_HEAT = 6;

/**
 * Hours of ACTIVE play a freshly opened foothold stays EXPOSED. The raid-risk
 * surcharge starts at its peak the instant the stash opens and fades LINEARLY to
 * zero across this window (offline-frozen — the clock only advances online, so
 * absence neither exposes nor protects). ~3 in-game days at 24h/day.
 */
export const VULNERABILITY_WINDOW_HOURS = 72;

/**
 * Peak raid-CHANCE multiplier the instant a foothold opens, fading to ×1 across
 * `VULNERABILITY_WINDOW_HOURS`. `2` ⇒ a brand-new stash momentarily doubles the
 * run's raid chance; a day in, the surcharge is a third of that; past the window
 * it's gone. Bounded and telegraphed — dangerous, never a hidden lock.
 */
export const VULNERABILITY_RAID_MULTIPLIER = 2;

/**
 * Hours of ACTIVE play you must HOLD a new district before it's FULLY CONTROLLED
 * (consolidated) and counts toward empire reach (`empireComposite`). Until then
 * it reads "contested." ~5 in-game days at 24h/day. A TIME GATE — relaxes open
 * access for territory (Ideas2 round 3, user sign-off). Offline-frozen: the hold
 * clock only advances while the player is online (the in-game clock never moves
 * offline), so absence never consolidates or un-consolidates a district.
 */
export const CONSOLIDATION_HOURS = 120;

/**
 * Distinct countries held (home counts) AT OR ABOVE which opening ANOTHER new
 * country REQUIRES a (non-wire) lieutenant on the crew to run it. At `2`: your
 * home seat plus your first opened route are free of the requirement; the next
 * new country needs a promoted lieutenant. A FLAG GATE — relaxes open access for
 * territory (user sign-off). Reinforcing a country already held is never gated.
 */
export const TERRITORY_LT_REQUIRED_AFTER = 2;

/**
 * Countries a single lieutenant can run BEYOND the free-tier boundary — the crew
 * gate now SCALES with reach instead of one lieutenant satisfying it forever.
 * Required lieutenants = `1 + floor((held − TERRITORY_LT_REQUIRED_AFTER) / this)`
 * once you hold `TERRITORY_LT_REQUIRED_AFTER`+ countries. At `3` (with the free tier
 * at 2): the first lieutenant is needed to open the 2nd new country and covers you
 * through ~4 countries, a 2nd is needed around the 5th, a 3rd around the 8th — a wide
 * empire needs real management depth. A FLAG GATE (relaxes open access for territory,
 * user sign-off). Reinforcing a country already held is never gated.
 */
export const TERRITORY_COUNTRIES_PER_LIEUTENANT = 3;

/**
 * Hours of ACTIVE play you must wait between OPENING new countries — a fresh
 * foothold can't be followed by another until this cools. Forces you to consolidate
 * before blobbing outward; reinforcing/home builds are never on cooldown. Measured
 * from the most recent open (`openedAtHours`); offline-frozen like every clock (the
 * in-game clock only advances online). ~2 in-game days at 24h/day. A TIME GATE
 * (relaxes open access for territory, user sign-off).
 */
export const TERRITORY_EXPANSION_COOLDOWN_HOURS = 48;

/**
 * Heat ceiling (0–100 meter) AT OR ABOVE which opening a NEW country is blocked —
 * expansion is loud, so you must cool down first. The price still shows; the open
 * is held until heat drops below this. A HEAT GATE (relaxes open access for
 * territory, user sign-off). Reinforcing a country already held is never blocked.
 */
export const TERRITORY_MAX_HEAT_TO_EXPAND = 60;

/**
 * The net-worth FLOOR, $, required to open a foothold in a trade REGION you don't
 * yet touch — a capital-proof gate ON TOP of the one-time open cost, so a lucky
 * early run can't leapfrog to a far continent it can't sustain. Same-region opens
 * (region distance 0) have NO floor. The floor scales with distance:
 * `BASE × (1 + PER_DISTANCE × regionDistance)`. A NET-WORTH GATE (relaxes open
 * access for territory, user sign-off).
 */
export const TERRITORY_CAPITAL_FLOOR_BASE = 500_000;

/**
 * How steeply the cross-region capital floor climbs with geographic distance:
 * `TERRITORY_CAPITAL_FLOOR_BASE × (1 + this × regionDistance)`. At `9` with
 * `BASE = 500k`, an adjacent-region hop (distance ~0.25) needs ~$1.6M net worth and
 * the farthest continent (distance 1.0) needs ~$5M.
 */
export const TERRITORY_CAPITAL_FLOOR_PER_DISTANCE = 9;

/**
 * The reach-and-region adjusted cost of opening a NEW foothold, from primitives
 * so it stays free of any `state`/engine import (the state-aware wrapper lives in
 * `engine/territory.ts`). `base` is the plain `stashCost` for the type; the
 * result is `base × REACH_GROWTH^held × (1 + NEW_REGION_JUMP × regionDistance)`,
 * rounded. Both the Empire-map view-model and the engine's `addStash` charge
 * path resolve through this ONE helper, so the price shown is the price paid
 * (fairness law). `tuning` injects an alternate group (Prompt 26).
 */
export function territoryExpansionCost(
  base: number,
  distinctCountriesHeld: number,
  regionDistance: number,
  tuning?: {
    readonly TERRITORY_REACH_GROWTH?: number;
    readonly TERRITORY_NEW_REGION_JUMP?: number;
  },
): number {
  const growth = tuning?.TERRITORY_REACH_GROWTH ?? TERRITORY_REACH_GROWTH;
  const jump = tuning?.TERRITORY_NEW_REGION_JUMP ?? TERRITORY_NEW_REGION_JUMP;
  const reach = Math.pow(growth, Math.max(0, distinctCountriesHeld));
  const region = 1 + jump * Math.max(0, regionDistance);
  return Math.round(base * reach * region);
}
