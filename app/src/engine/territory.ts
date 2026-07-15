/**
 * Territory — the pure logic behind meaningful expansion (Ideas2 item 5; Prompt
 * 41; design/07 §2). Fronts turn time into clean cash; TERRITORY turns cash (and
 * risk, and a held lieutenant) into REACH. Opening a foothold in a new country is
 * priced by reach + region distance, spikes heat, leaves the fresh stash exposed
 * for a fading window, and takes a hold period to fully consolidate — and past a
 * few countries it needs a lieutenant to run.
 *
 * The consolidation-hold and lieutenant-requirement RELAX the open-access rule
 * for territory ONLY (Ideas2 round 3, user sign-off — see `config/territory.ts`).
 *
 * PURE & deterministic (prompts/README.md): no `Math.random`, no wall clock. This
 * module reads `state` and config; it never mutates. `storage.addStash` composes
 * these helpers on the build path (charging `footholdCost`, stamping
 * `openedAtHours`, applying the takeover heat + exposure telegraph); `heat.raidChance`
 * reads `maxVulnerability`; `endgame.empireComposite` reads consolidation. Kept
 * free of any engine-module import so `heat`/`storage`/`endgame` can import it
 * without a cycle.
 */

import { COUNTRIES, REGION_DISTANCE, type Region } from './config/countries';
import { stashCost, type StashType } from './config/stashes';
import { territoryExpansionCost } from './config/territory';
import type { GameState, Stash } from './state';

const COUNTRY_REGION: ReadonlyMap<string, Region> = new Map(
  COUNTRIES.map((c) => [c.id, c.region]),
);
const COUNTRY_NAME: ReadonlyMap<string, string> = new Map(
  COUNTRIES.map((c) => [c.id, c.name]),
);

/** A country's display name, or the id itself if unknown (never throws). */
export function countryName(countryId: string): string {
  return COUNTRY_NAME.get(countryId) ?? countryId;
}

/** Whether the player already holds any stash in `countryId` (a controlled/opened country). */
export function isHeldCountry(state: GameState, countryId: string): boolean {
  return state.stashes.some((s) => s.countryId === countryId);
}

/** How many DISTINCT countries the run holds a stash in — the reach exponent. */
export function distinctCountriesHeld(state: GameState): number {
  return new Set(state.stashes.map((s) => s.countryId)).size;
}

/** The trade regions the player currently touches (a stash somewhere in each). */
function heldRegions(state: GameState): ReadonlySet<Region> {
  const regions = new Set<Region>();
  for (const s of state.stashes) {
    const r = COUNTRY_REGION.get(s.countryId);
    if (r) regions.add(r);
  }
  return regions;
}

/**
 * Geographic distance from `countryId`'s region to the NEAREST region the player
 * already touches, 0..1 — the "new-region jump" input to the cost. Returns 0 when
 * the target's region is already held (no jump), or when the country/region is
 * unknown (fail-open to no surcharge). A far continent costs the most.
 */
export function newRegionDistance(state: GameState, countryId: string): number {
  const target = COUNTRY_REGION.get(countryId);
  if (!target) return 0;
  const held = heldRegions(state);
  if (held.has(target)) return 0;
  let nearest = 1;
  for (const r of held) {
    const d = REGION_DISTANCE[r][target];
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/**
 * The cost, $, to build the next foothold of `type` in `countryId` — the SINGLE
 * price path shared by the Empire-map view-model and `addStash` (fairness law:
 * shown = paid). OPENING a new country pays the reach-and-region surcharge
 * (`territoryExpansionCost`); REINFORCING a country already held pays the plain
 * `stashCost` upgrade step (storage-screen builds and home reinforcement are
 * unchanged). `countryId` omitted resolves against the home country (never a new
 * open), matching `addStash`'s default target.
 */
export function footholdCost(
  state: GameState,
  type: StashType,
  countryId?: string,
): number {
  const nOwned = state.stashes.filter((s) => s.type === type).length;
  const base = stashCost(type, nOwned, state.config.stashes);
  const target = countryId ?? state.world.startingCountry.id;
  if (isHeldCountry(state, target)) return base; // reinforce — plain upgrade step
  return territoryExpansionCost(
    base,
    distinctCountriesHeld(state),
    newRegionDistance(state, target),
    state.config.territory,
  );
}

// --- Crew requirement (flag gate) --------------------------------------------

/** Whether opening ANOTHER new country now requires a lieutenant (reach past the free tier). */
export function requiresLieutenant(state: GameState): boolean {
  return distinctCountriesHeld(state) >= state.config.territory.TERRITORY_LT_REQUIRED_AFTER;
}

/** Whether a non-wire lieutenant is on the crew to run a new district. */
export function hasAvailableLieutenant(state: GameState): boolean {
  return state.crew.some((c) => c.role === 'lieutenant' && !c.isWire);
}

/**
 * Whether the crew gate BLOCKS opening a new country right now: the reach past
 * the free tier is reached AND no lieutenant is available to run it. Opening an
 * already-held country (reinforcing) is never blocked.
 */
export function crewGateBlocksOpen(state: GameState, countryId: string): boolean {
  if (isHeldCountry(state, countryId)) return false;
  return requiresLieutenant(state) && !hasAvailableLieutenant(state);
}

// --- Vulnerability window (emergent raid risk) -------------------------------

/**
 * A single stash's raid-risk SURCHARGE, 0..(MULT-1): its share of the fading
 * exposure a freshly opened foothold carries. `0` for an established stash
 * (`openedAtHours` absent — home, reinforcements, legacy saves) or one past the
 * window; peaks at `VULNERABILITY_RAID_MULTIPLIER - 1` the instant it opens and
 * fades LINEARLY to 0 across `VULNERABILITY_WINDOW_HOURS` of active play.
 */
export function stashVulnerability(state: GameState, stash: Stash): number {
  if (stash.openedAtHours === undefined) return 0;
  const cfg = state.config.territory;
  const age = state.clock.hours - stash.openedAtHours;
  if (age < 0 || age >= cfg.VULNERABILITY_WINDOW_HOURS) return 0;
  const remaining = 1 - age / cfg.VULNERABILITY_WINDOW_HOURS; // 1 at open → 0 at window end
  return (cfg.VULNERABILITY_RAID_MULTIPLIER - 1) * remaining;
}

/**
 * The largest exposure surcharge across all stashes — what `heat.raidChance`
 * multiplies onto the per-hour rate (`× (1 + maxVulnerability)`). One fresh
 * foothold raises the whole run's raid chance until it consolidates; `0` once no
 * stash is inside its window.
 */
export function maxVulnerability(state: GameState): number {
  return state.stashes.reduce((m, s) => Math.max(m, stashVulnerability(state, s)), 0);
}

// --- Consolidation hold (time gate) ------------------------------------------

/**
 * Whether a stash counts as CONSOLIDATED (fully controlled): established stashes
 * (`openedAtHours` absent) are controlled from the start; an opened foothold
 * consolidates once held `CONSOLIDATION_HOURS` of active play.
 */
export function isStashConsolidated(state: GameState, stash: Stash): boolean {
  if (stash.openedAtHours === undefined) return true;
  return state.clock.hours - stash.openedAtHours >= state.config.territory.CONSOLIDATION_HOURS;
}

/**
 * Whether a COUNTRY is fully controlled: it has at least one consolidated stash.
 * A country you've held long enough (or an established/home country) is
 * controlled; a country whose every stash is still within its hold window is
 * CONTESTED (doesn't yet count toward empire reach).
 */
export function isCountryConsolidated(state: GameState, countryId: string): boolean {
  const here = state.stashes.filter((s) => s.countryId === countryId);
  return here.length > 0 && here.some((s) => isStashConsolidated(state, s));
}

/**
 * How far a stash is through its consolidation hold, 0..1 (1 = fully controlled).
 * Established stashes are 1. Used by the map's "consolidating…" readout.
 */
export function consolidationProgress(state: GameState, stash: Stash): number {
  if (stash.openedAtHours === undefined) return 1;
  const held = state.config.territory.CONSOLIDATION_HOURS;
  if (held <= 0) return 1;
  const age = state.clock.hours - stash.openedAtHours;
  const p = age / held;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
