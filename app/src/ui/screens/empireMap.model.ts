/**
 * The Empire Map's view-model (Prompt 16; design/07 §2). PURE read selectors that
 * turn the `GameState` into the numbers the map renders — the territory footprint,
 * the priced next foothold, the clean-cash accrual rate, and the glanceable empire
 * summary. The screen composes these; it authors NO economic math (prompt guardrail
 * "no economic logic in the component").
 *
 * Territory model (open access, Ideas.md): the engine has no separate district /
 * route-control system — `empireComposite` (endgame.ts) DEFINES the mapping the
 * codebase uses: **districts ≈ distinct countries the player holds a stash in;
 * routes ≈ those beyond home**. So the map treats the `COUNTRIES` roster as the
 * districts: your home country is the seat you control, and every other country is
 * a route you OPEN by planting a foothold there (`addStash({ countryId })`, paid
 * from clean cash). Money is the only gate — the price is shown and the option is
 * live the moment you can pay, never behind a progression flag.
 */

import {
  COUNTRIES,
  cleanCashRate,
  effectiveCapacity,
  empireComposite,
  stashCost,
  stashUnits,
  type GameState,
  type StashType,
} from '@/engine';

/**
 * The stash type a foothold is planted as — the cheapest, instant `floor` stash,
 * so opening a route is an affordable first step (design/07 §2 "next step always
 * in reach"). Deeper per-type storage choices live on the Storage screen (Prompt 20).
 */
export const EXPANSION_TYPE: StashType = 'floor';

/** How this country reads on the map. */
export type DistrictStatus = 'home' | 'route' | 'unowned';

/** One country's row on the empire map: control state, presence, capacity. */
export interface DistrictView {
  readonly countryId: string;
  readonly name: string;
  readonly isHome: boolean;
  /** 'home' = the seat you control; 'route' = a foothold opened elsewhere;
   *  'unowned' = a buyable route (shows its price, actionable when affordable). */
  readonly status: DistrictStatus;
  /** How many stashes the player holds in this country. */
  readonly stashCount: number;
  /** Product units stored across this country's stashes. */
  readonly capacityUsed: number;
  /** Total product capacity across this country's stashes (0 when unowned). */
  readonly capacityTotal: number;
  /** Capacity fill 0..1 — the glanceable presence bar (0 when unowned). */
  readonly fill: number;
  /** Shown-to-player opening hooks (flavour for an unopened route). */
  readonly hooks: readonly string[];
}

/**
 * Cost of the next foothold, $ — `stashCost(EXPANSION_TYPE, nOwned)` where `nOwned`
 * is how many `floor` stashes already exist. Computed EXACTLY as the engine's
 * `addStash` charges it (design/09 A.5 upgrade curve), so the price shown is the
 * price paid. The curve depends on the count, not the destination, so every route
 * costs the same next step wherever you plant it.
 */
export function expansionCost(state: GameState): number {
  const nOwned = state.stashes.filter((s) => s.type === EXPANSION_TYPE).length;
  return stashCost(EXPANSION_TYPE, nOwned);
}

/** Whether the run's clean cash covers the next foothold (money is the only gate). */
export function canAffordExpansion(state: GameState): boolean {
  return state.cleanCash >= expansionCost(state);
}

/** Every country as a district row, in roster order — the whole map, from minute one. */
export function districtViews(state: GameState): readonly DistrictView[] {
  const homeId = state.world.startingCountry.id;
  return COUNTRIES.map((c) => {
    const here = state.stashes.filter((s) => s.countryId === c.id);
    // Effective (crew-scaled) capacity — the real holding limit (design/12 Item 4).
    const capacityTotal = here.reduce(
      (sum, s) => sum + effectiveCapacity(state, s),
      0,
    );
    const capacityUsed = here.reduce((sum, s) => sum + stashUnits(s), 0);
    const isHome = c.id === homeId;
    const status: DistrictStatus =
      here.length > 0 ? (isHome ? 'home' : 'route') : 'unowned';
    return {
      countryId: c.id,
      name: c.name,
      isHome,
      status,
      stashCount: here.length,
      capacityUsed,
      capacityTotal,
      fill: capacityTotal > 0 ? capacityUsed / capacityTotal : 0,
      hooks: c.openingHooks,
    };
  });
}

/** The glanceable empire summary row (design/07 §2). */
export interface EmpireSummary {
  readonly fronts: number;
  readonly crew: number;
  /** Distinct countries held beyond home — the smuggling reach (`empireComposite`). */
  readonly routes: number;
  /** Rivals still standing (untoppled). */
  readonly rivals: number;
  /** The weighted empire-size composite (design/01 §7). */
  readonly composite: number;
}

export function empireSummary(state: GameState): EmpireSummary {
  const homeId = state.world.startingCountry.id;
  const countries = new Set(state.stashes.map((s) => s.countryId));
  const routes = [...countries].filter((c) => c !== homeId).length;
  return {
    fronts: state.fronts.length,
    crew: state.crew.length,
    routes,
    rivals: state.rivals.filter((r) => !r.toppled).length,
    composite: empireComposite(state),
  };
}

/** Clean-cash accrual rate, $/h — the map header's "Clean $ ▲ accruing…" figure. */
export function cleanRate(state: GameState): number {
  return cleanCashRate(state);
}

/** The single highlighted expansion — the "next affordable step" (design/07 §2). */
export interface NextStep {
  readonly countryId: string;
  /** Opening a brand-new route, or reinforcing an existing foothold. */
  readonly kind: 'open' | 'reinforce';
  readonly cost: number;
}

/**
 * The next affordable step given current cash — the "one more day" lever. Prefer
 * OPENING a new route (the biggest `empireComposite` gain); if every country is
 * already held, reinforce the one with the most room to grow. `null` when the next
 * foothold is out of reach (nothing is highlighted, but every option still shows
 * its price — money is the gate, not a hidden menu).
 */
export function nextAffordableStep(state: GameState): NextStep | null {
  const cost = expansionCost(state);
  if (state.cleanCash < cost) return null;

  const districts = districtViews(state);
  const unowned = districts.find((d) => d.status === 'unowned');
  if (unowned) return { countryId: unowned.countryId, kind: 'open', cost };

  const emptiest = [...districts].sort((a, b) => a.fill - b.fill)[0];
  return emptiest ? { countryId: emptiest.countryId, kind: 'reinforce', cost } : null;
}
