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
 * from clean cash).
 *
 * Territory expansion is now MEANINGFUL (Ideas2 item 5; Prompt 41): the open price
 * scales with reach + region distance, a fresh foothold is EXPOSED (raid-risk
 * window) and CONTESTED (a consolidation hold before it counts toward reach), and
 * past a couple of countries opening another needs a lieutenant to run it. Money is
 * still the primary gate — every price is shown and live the moment you can pay —
 * but the consolidation hold and the lieutenant requirement deliberately relax the
 * pure open-access rule FOR TERRITORY (an explicit product decision, user sign-off).
 * All numbers/gates come from the engine (`footholdCost`, `isCountryConsolidated`,
 * `crewGateBlocksOpen`); this model authors none of them.
 */

import {
  COUNTRIES,
  capitalFloorFor,
  cleanCashRate,
  consolidationProgress,
  crewGateBlocksOpen,
  effectiveCapacity,
  empireComposite,
  expansionCooldownRemaining,
  expansionOnCooldown,
  footholdCost,
  hasAvailableLieutenant,
  heatBlocksExpansion,
  isCountryConsolidated,
  nextUpgradeCost,
  netWorth,
  requiresLieutenant,
  stashUnits,
  stashVulnerability,
  type GameState,
  type Stash,
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
  /** How many stashes (distinct spots) the player holds in this country. */
  readonly stashCount: number;
  /** Product units stored across this country's stashes. */
  readonly capacityUsed: number;
  /** Total product capacity across this country's stashes (0 when unowned). */
  readonly capacityTotal: number;
  /** Capacity fill 0..1 — the glanceable presence bar (0 when unowned). */
  readonly fill: number;
  /** Shown-to-player opening hooks (flavour for an unopened route). */
  readonly hooks: readonly string[];
  /**
   * Cost, $, of this district's next STEP — the reach-and-region OPEN price when
   * unowned (exactly what `addStash` charges), or the UPGRADE price of its lead
   * stash when held (exactly what `upgradeStash` charges — design/13 G; Prompt 49).
   * `0` when held but its lead stash is maxed (nothing to reinforce; `reinforceMaxed`).
   */
  readonly openCost: number;
  /**
   * The stash this district's "Reinforce" UPGRADES (its lead spot — the floor stash
   * if present, else the first held), or `null` when unowned (design/13 G; Prompt 49).
   */
  readonly reinforceStashId: string | null;
  /** Held but its lead stash is already at `STASH_MAX_LEVEL` — no further upgrade. */
  readonly reinforceMaxed: boolean;
  /**
   * Held but not yet FULLY CONTROLLED — a freshly opened district still inside its
   * consolidation hold (Ideas2 item 5). Doesn't count toward empire reach yet.
   * Always false for an unowned or established (home) district.
   */
  readonly contested: boolean;
  /** Progress through the consolidation hold, 0..1 (1 = controlled). */
  readonly consolidationPct: number;
  /** A stash here is inside its raid-risk VULNERABILITY window (runs hot). */
  readonly exposed: boolean;
  /**
   * Unowned AND the crew gate blocks opening it — reach demands more lieutenants
   * than are held (Prompt 41, now SCALING). The price still shows; the action is
   * held until enough lieutenants are on the crew (a non-money gate for territory).
   */
  readonly blockedByCrew: boolean;
  /** Unowned AND heat is at/above the expansion ceiling — cool down before opening. */
  readonly blockedByHeat: boolean;
  /** Unowned AND the expansion cooldown is still running (opened another country too recently). */
  readonly blockedByCooldown: boolean;
  /**
   * Unowned in an untouched REGION AND net worth is below the capital floor for it —
   * the shown `capitalFloor` must be cleared before this cross-region open (0 when
   * same-region or already clear).
   */
  readonly blockedByCapital: boolean;
  /** The net-worth floor, $, to open this district (0 when same-region — no floor). */
  readonly capitalFloor: number;
}

/**
 * Cost of the next foothold in `countryId`, $ — the reach-and-region OPEN price
 * for a new country, or the plain reinforce step for one already held. Computed
 * by the engine's `footholdCost`, EXACTLY as `addStash` charges it (fairness law:
 * shown = paid). Unlike the old flat curve, the price now depends on the
 * destination (reach + region distance), so a far new region costs more than a
 * neighbour (Ideas2 item 5). `countryId` omitted resolves against the FIRST
 * unowned country in roster order — the representative "next open" price.
 */
export function expansionCost(state: GameState, countryId?: string): number {
  const target =
    countryId ??
    COUNTRIES.find((c) => !state.stashes.some((s) => s.countryId === c.id))?.id ??
    state.world.startingCountry.id;
  return footholdCost(state, EXPANSION_TYPE, target);
}

/** Whether the run's clean cash covers the next foothold (money is the primary gate). */
export function canAffordExpansion(state: GameState): boolean {
  return state.cleanCash >= expansionCost(state);
}

/**
 * The stash a held district's "Reinforce" UPGRADES — its lead spot (design/13 G;
 * Prompt 49): the floor/home stash if present (the cheap, instant foothold every
 * route opens as), else the first held stash. `null` for an unowned country.
 */
function leadStash(here: readonly Stash[]): Stash | null {
  return here.find((s) => s.type === EXPANSION_TYPE) ?? here[0] ?? null;
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
    const owned = here.length > 0;
    const status: DistrictStatus = owned ? (isHome ? 'home' : 'route') : 'unowned';
    const contested = owned && !isCountryConsolidated(state, c.id);
    // How close the district is to full control — the furthest-along stash leads
    // (a country consolidates when ANY of its stashes does).
    const consolidationPct = owned
      ? Math.max(...here.map((s) => consolidationProgress(state, s)))
      : 0;
    // Held → the next step is an UPGRADE of the lead stash; unowned → the open price.
    const lead = leadStash(here);
    const upgradeCost = lead ? nextUpgradeCost(state, lead) : null;
    const reinforceMaxed = owned && upgradeCost === null;
    const openCost = owned
      ? (upgradeCost ?? 0)
      : footholdCost(state, EXPANSION_TYPE, c.id);
    return {
      countryId: c.id,
      name: c.name,
      isHome,
      status,
      stashCount: here.length,
      // Shown as whole units (fill keeps the exact ratio for a smooth bar).
      capacityUsed: Math.floor(capacityUsed),
      capacityTotal: Math.floor(capacityTotal),
      fill: capacityTotal > 0 ? capacityUsed / capacityTotal : 0,
      hooks: c.openingHooks,
      openCost,
      reinforceStashId: lead?.id ?? null,
      reinforceMaxed,
      contested,
      consolidationPct,
      exposed: here.some((s) => stashVulnerability(state, s) > 0),
      blockedByCrew: !owned && crewGateBlocksOpen(state, c.id),
      blockedByHeat: !owned && heatBlocksExpansion(state),
      blockedByCooldown: !owned && expansionOnCooldown(state),
      blockedByCapital: !owned && netWorth(state) < capitalFloorFor(state, c.id),
      capitalFloor: owned ? 0 : capitalFloorFor(state, c.id),
    };
  });
}

/** The glanceable empire summary row (design/07 §2). */
export interface EmpireSummary {
  readonly fronts: number;
  readonly crew: number;
  /** Distinct countries held beyond home — the total smuggling reach (footprint). */
  readonly routes: number;
  /** Held countries still consolidating (contested — not yet counting toward reach). */
  readonly contested: number;
  /** Rivals still standing (untoppled). */
  readonly rivals: number;
  /** The weighted empire-size composite (design/01 §7) — CONSOLIDATED reach only. */
  readonly composite: number;
  /** Opening another new country now needs a lieutenant (reach past the free tier). */
  readonly lieutenantRequired: boolean;
  /** A non-wire lieutenant is on the crew to run a new district. */
  readonly lieutenantReady: boolean;
  /** Hours of active play still to wait before another country may be opened (0 = clear). */
  readonly expansionCooldownHours: number;
  /** Heat is at/above the expansion ceiling — no new country may be opened until it cools. */
  readonly tooHotToExpand: boolean;
}

export function empireSummary(state: GameState): EmpireSummary {
  const homeId = state.world.startingCountry.id;
  const countries = [...new Set(state.stashes.map((s) => s.countryId))];
  const routes = countries.filter((c) => c !== homeId).length;
  const contested = countries.filter((c) => !isCountryConsolidated(state, c)).length;
  return {
    fronts: state.fronts.length,
    crew: state.crew.length,
    routes,
    contested,
    rivals: state.rivals.filter((r) => !r.toppled).length,
    composite: empireComposite(state),
    lieutenantRequired: requiresLieutenant(state),
    lieutenantReady: hasAvailableLieutenant(state),
    expansionCooldownHours: expansionCooldownRemaining(state),
    tooHotToExpand: heatBlocksExpansion(state),
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
 * OPENING the cheapest affordable new route that isn't GATED (the biggest
 * `empireComposite` gain); if none can be opened, reinforce the affordable held
 * district with the most room to grow. `null` when nothing is in reach (nothing is
 * highlighted, but every option still shows its price + any gate — never a hidden
 * menu). A gated open (crew, cooldown, heat, or capital) is NOT a next step until
 * its gate clears.
 */
export function nextAffordableStep(state: GameState): NextStep | null {
  const districts = districtViews(state);

  const openable = districts
    .filter(
      (d) =>
        d.status === 'unowned' &&
        !d.blockedByCrew &&
        !d.blockedByCooldown &&
        !d.blockedByHeat &&
        !d.blockedByCapital &&
        state.cleanCash >= d.openCost,
    )
    .sort((a, b) => a.openCost - b.openCost)[0];
  if (openable) {
    return { countryId: openable.countryId, kind: 'open', cost: openable.openCost };
  }

  const reinforce = districts
    .filter(
      (d) => d.status !== 'unowned' && !d.reinforceMaxed && state.cleanCash >= d.openCost,
    )
    .sort((a, b) => a.fill - b.fill)[0];
  return reinforce
    ? { countryId: reinforce.countryId, kind: 'reinforce', cost: reinforce.openCost }
    : null;
}
