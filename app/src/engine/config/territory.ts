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
 *  - **Crew requirement (flag gate).** Once you already hold `TERRITORY_LT_REQUIRED_AFTER`
 *    countries, opening ANOTHER requires a (non-wire) lieutenant to run it.
 *
 * The last two RELAX the standing open-access rule (money is the only gate) for
 * TERRITORY specifically — an explicit product decision with user sign-off (Ideas2
 * round 3): the extra realism is worth the gate here, and here only. Every number
 * is a v1 HYPOTHESIS held as config, never a scattered literal (prompts/README.md
 * "Config, not literals"; Prompt 26).
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
