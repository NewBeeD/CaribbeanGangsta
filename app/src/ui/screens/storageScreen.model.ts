/**
 * The Storage screen's view-model (Prompt 20; design/09 System A, GDD §4.8). PURE
 * read selectors that turn the `GameState` into the *where to stash* decision made
 * legible: each stash's capacity, its **shown seizure %** (== the number rolled on a
 * raid — the fairness law, design/09 A.4), heat footprint, access speed, and guard;
 * the priced roster of stash types to build; and the diversification cue.
 *
 * Open access (Ideas.md — the [[open-access-design]] rule): every stash type is
 * buyable from minute one — the build price is the gate, never a progression flag.
 *
 * The screen composes these and dispatches storage intents through the store; it
 * authors NO seizure/capacity/cost math (README UI rule — the number shown is the
 * number the engine uses). Raid losses are surfaced here as **scenes**, not toasts
 * (design/09 A.4; the full presenter lands in Prompt 22).
 */

import {
  GUARD_CASH_THRESHOLD,
  PRODUCTS,
  PRODUCT_IDS,
  STASH_TYPES,
  capacityRemaining,
  diversificationIndex,
  effectiveSeizurePct,
  getStashType,
  stashCapacity,
  stashCost,
  stashUnits,
  type GameState,
  type ProductId,
  type StashType,
} from '@/engine';

/** Below this diversification index (with real value at stake) the run reads as over-concentrated. */
export const CONCENTRATION_THRESHOLD = 0.4;

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** The run's home country — where a freshly built stash is planted by default. */
export function homeCountryId(state: GameState): string {
  return state.world.startingCountry.id;
}

/** Display name for a product id. */
function productName(id: ProductId): string {
  return PRODUCTS.find((p) => p.id === id)?.name ?? id;
}

/** A product held in a stash (a move source). */
export interface HeldProduct {
  readonly id: ProductId;
  readonly name: string;
  readonly qty: number;
}

/** One stash rendered as the survival trade-off it is (design/09 A.3). */
export interface StashRow {
  readonly id: string;
  readonly name: string;
  readonly type: StashType;
  readonly typeName: string;
  readonly isDecoy: boolean;
  readonly countryId: string;
  /** Product units held / total capacity, and the glanceable fill 0..1. */
  readonly capacityUsed: number;
  readonly capacityTotal: number;
  readonly capacityFree: number;
  readonly fill: number;
  /**
   * Effective seizure probability, 0..1 — EXACTLY `effectiveSeizurePct` and so
   * exactly what `resolveRaid` rolls (fairness law). `seizurePctLabel` is its
   * whole-percent display.
   */
  readonly seizurePct: number;
  readonly seizurePctLabel: string;
  /** Passive heat footprint as a whole percent (design/09 A.3). */
  readonly heatFootprintPct: number;
  /** Access speed as hours of travel delay on a move (0 = instant). */
  readonly travelDelayHours: number;
  readonly dirtyCash: number;
  /** The guard's crew id + name, when one is assigned (design/09 A.3a). */
  readonly guardCrewId: string | null;
  readonly guardName: string | null;
  /** This place SHOULD be guarded now (a vault, or a big cash pile) but isn't. */
  readonly unguardedRisk: boolean;
  readonly heldProducts: readonly HeldProduct[];
}

export function stashRows(state: GameState): readonly StashRow[] {
  return state.stashes.map((stash) => {
    const cfg = getStashType(stash.type);
    const total = stashCapacity(stash);
    const used = stashUnits(stash);
    const pct = effectiveSeizurePct(state, stash.id);
    const guard = stash.guardCrewId
      ? state.crew.find((c) => c.id === stash.guardCrewId)
      : undefined;
    const needsGuard = cfg.requiresGuard || stash.dirtyCash >= GUARD_CASH_THRESHOLD;

    const heldProducts: HeldProduct[] = PRODUCT_IDS.filter(
      (id) => stash.inventory[id] > 0,
    ).map((id) => ({ id, name: productName(id), qty: stash.inventory[id] }));

    return {
      id: stash.id,
      name: stash.name,
      type: stash.type,
      typeName: cfg.name,
      isDecoy: cfg.isDecoy,
      countryId: stash.countryId,
      capacityUsed: used,
      capacityTotal: total,
      capacityFree: capacityRemaining(stash),
      fill: total > 0 ? used / total : 0,
      seizurePct: pct,
      seizurePctLabel: `${Math.round(pct * 100)}%`,
      heatFootprintPct: Math.round(cfg.heatFootprint * 100),
      travelDelayHours: cfg.travelDelayHours,
      dirtyCash: stash.dirtyCash,
      guardCrewId: stash.guardCrewId ?? null,
      guardName: guard?.name ?? null,
      unguardedRisk: needsGuard && stash.guardCrewId === undefined,
      heldProducts,
    };
  });
}

/** A stash type the player can build, priced along the upgrade curve (design/09 A.5). */
export interface BuildOption {
  readonly type: StashType;
  readonly name: string;
  /** `base × 1.15^nOwned` — exactly what `addStash` charges (shown = paid). */
  readonly cost: number;
  readonly affordable: boolean;
  readonly capacity: number;
  /** Base seizure % (before guard/port adjustments) as a whole percent. */
  readonly baseSeizurePctLabel: string;
  /** For a container: the seizure % once its port is paid (~3%). */
  readonly paidSeizurePctLabel: string | null;
  readonly travelDelayHours: number;
  readonly heatFootprintPct: number;
  readonly portLinked: boolean;
  readonly requiresGuard: boolean;
  readonly isDecoy: boolean;
}

/** The whole stash roster as build options — every type live from minute one (open access). */
export function buildOptions(state: GameState): readonly BuildOption[] {
  return STASH_TYPES.map((cfg) => {
    const nOwned = state.stashes.filter((s) => s.type === cfg.id).length;
    const cost = stashCost(cfg.id, nOwned);
    return {
      type: cfg.id,
      name: cfg.name,
      cost,
      affordable: state.cleanCash >= cost,
      capacity: cfg.capacity,
      baseSeizurePctLabel: `${Math.round(cfg.seizurePct * 100)}%`,
      paidSeizurePctLabel:
        cfg.seizurePctPaid !== undefined
          ? `${Math.round(cfg.seizurePctPaid * 100)}%`
          : null,
      travelDelayHours: cfg.travelDelayHours,
      heatFootprintPct: Math.round(cfg.heatFootprint * 100),
      portLinked: cfg.portLinked,
      requiresGuard: cfg.requiresGuard,
      isDecoy: cfg.isDecoy,
    };
  });
}

/**
 * The diversification cue — informational, never nagging (design/09 A.2 telemetry).
 * `concentrated` flags an over-exposed run (one raid could take most of it); the
 * `line` reads it as a fact, not a scolding.
 */
export interface DiversificationCue {
  readonly index: number;
  readonly hasValue: boolean;
  readonly concentrated: boolean;
  readonly line: string;
}

export function diversificationCue(state: GameState): DiversificationCue {
  const index = diversificationIndex(state);
  const totalValue = state.stashes.reduce(
    (sum, s) => sum + s.dirtyCash + stashUnits(s),
    0,
  );
  const hasValue = totalValue > 0;
  const concentrated = hasValue && index < CONCENTRATION_THRESHOLD;
  const line = !hasValue
    ? 'Nothing stashed yet — spread it out as it comes in.'
    : concentrated
      ? 'Most of your weight sits in one place. One raid could take it all.'
      : 'Your weight is well spread — no single raid wipes you out.';
  return { index, hasValue, concentrated, line };
}

/** A crew member who can be posted as a guard (design/09 A.3a). */
export interface GuardOption {
  readonly id: string;
  readonly name: string;
  /** Already turned — posting a wire as a guard is exactly the inside job. */
  readonly isWire: boolean;
}

/** Everyone on the crew, as guard candidates (a wire is flagged, not hidden). */
export function guardOptions(state: GameState): readonly GuardOption[] {
  return state.crew.map((c) => ({ id: c.id, name: c.name, isWire: c.isWire === true }));
}

/** The other stashes a move can target (everything but `fromId`). */
export function moveTargets(state: GameState, fromId: string): readonly StashRow[] {
  return stashRows(state).filter((s) => s.id !== fromId);
}

/** A raid outcome queued as a scene (design/09 A.4 — loss is a scene, never a toast). */
export interface RaidScene {
  readonly id: string;
  readonly text: string;
}

/** Any pending raid results, surfaced as scenes until the presenter lands (Prompt 22). */
export function raidScenes(state: GameState): readonly RaidScene[] {
  return state.pendingChoices
    .filter((c) => c.kind === 'raid')
    .map((c) => ({ id: c.id, text: c.summary }));
}

/** Total clean cash — for enabling the build actions in the view. */
export function cleanCashLabel(state: GameState): string {
  return money(state.cleanCash);
}
