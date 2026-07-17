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

// --- Crew requirement (flag gate, SCALES with reach) -------------------------

/** How many non-wire lieutenants are on the crew to run districts. */
export function availableLieutenantCount(state: GameState): number {
  return state.crew.filter((c) => c.role === 'lieutenant' && !c.isWire).length;
}

/**
 * How many lieutenants the current reach REQUIRES to keep opening new countries:
 * `0` inside the free tier (`< TERRITORY_LT_REQUIRED_AFTER` countries), then ONE at
 * the boundary and one MORE for every `TERRITORY_COUNTRIES_PER_LIEUTENANT` countries
 * held beyond it — `1 + floor((held − free) / per)`. The gate scales: a wider empire
 * needs more management depth, not a single hire that satisfies it forever.
 */
export function requiredLieutenants(state: GameState): number {
  const cfg = state.config.territory;
  const held = distinctCountriesHeld(state);
  const free = cfg.TERRITORY_LT_REQUIRED_AFTER;
  if (held < free) return 0;
  const per = cfg.TERRITORY_COUNTRIES_PER_LIEUTENANT;
  if (per <= 0) return 1;
  return 1 + Math.floor((held - free) / per);
}

/** Whether opening ANOTHER new country now requires more lieutenants than are held. */
export function requiresLieutenant(state: GameState): boolean {
  return requiredLieutenants(state) > 0;
}

/** Whether at least one non-wire lieutenant is on the crew (view-model readout). */
export function hasAvailableLieutenant(state: GameState): boolean {
  return availableLieutenantCount(state) > 0;
}

/**
 * Whether the crew gate BLOCKS opening a new country right now: the reach demands
 * more lieutenants (`requiredLieutenants`) than are available. Opening an
 * already-held country (reinforcing) is never blocked.
 */
export function crewGateBlocksOpen(state: GameState, countryId: string): boolean {
  if (isHeldCountry(state, countryId)) return false;
  return availableLieutenantCount(state) < requiredLieutenants(state);
}

// --- Expansion cooldown (time gate) ------------------------------------------

/**
 * The clock hour of the MOST RECENT country open (the max `openedAtHours` across
 * stashes), or `undefined` when nothing has been opened (only established/home
 * stashes — reinforcing never stamps `openedAtHours`). Drives the cooldown.
 */
export function lastOpenedAtHours(state: GameState): number | undefined {
  let latest: number | undefined;
  for (const s of state.stashes) {
    if (s.openedAtHours === undefined) continue;
    if (latest === undefined || s.openedAtHours > latest) latest = s.openedAtHours;
  }
  return latest;
}

/**
 * Hours of active play still to wait before another country may be OPENED, `0`
 * when clear. Offline-frozen (the in-game clock only advances online), so absence
 * neither burns nor extends the cooldown.
 */
export function expansionCooldownRemaining(state: GameState): number {
  const last = lastOpenedAtHours(state);
  if (last === undefined) return 0;
  const window = state.config.territory.TERRITORY_EXPANSION_COOLDOWN_HOURS;
  const remaining = window - (state.clock.hours - last);
  return remaining > 0 ? remaining : 0;
}

/** Whether the expansion cooldown currently BLOCKS opening a new country. */
export function expansionOnCooldown(state: GameState): boolean {
  return expansionCooldownRemaining(state) > 0;
}

// --- Heat ceiling (heat gate) ------------------------------------------------

/**
 * Whether the run is too HOT to open a new country: heat at or above
 * `TERRITORY_MAX_HEAT_TO_EXPAND` (0–100 meter). Expansion is loud — cool down
 * first. Reinforcing an already-held country is never blocked by this.
 */
export function heatBlocksExpansion(state: GameState): boolean {
  return state.heat >= state.config.territory.TERRITORY_MAX_HEAT_TO_EXPAND;
}

// --- Cross-region capital floor (net-worth gate) -----------------------------

/**
 * The net-worth FLOOR, $, required to open a foothold in `countryId`: `0` for a
 * country in a region you already touch (or an unknown region — fail-open), else
 * `BASE × (1 + PER_DISTANCE × regionDistance)` rounded. A capital-proof gate ON
 * TOP of the one-time open cost. PURE (region distance + config only) so this
 * module stays free of a `netWorth`/engine import — `storage.addStash` performs
 * the `netWorth` comparison against this shown figure (fairness law: shown = paid).
 */
export function capitalFloorFor(state: GameState, countryId: string): number {
  const distance = newRegionDistance(state, countryId);
  if (distance <= 0) return 0;
  const cfg = state.config.territory;
  return Math.round(cfg.TERRITORY_CAPITAL_FLOOR_BASE * (1 + cfg.TERRITORY_CAPITAL_FLOOR_PER_DISTANCE * distance));
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
