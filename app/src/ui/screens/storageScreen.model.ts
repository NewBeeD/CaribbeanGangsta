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
  STASH_MAX_LEVEL,
  STASH_TYPES,
  countryName,
  diversificationIndex,
  effectiveCapacity,
  effectiveCapacityRemaining,
  effectiveSeizurePct,
  getStashType,
  nextUpgradeCost,
  stashCost,
  stashLevel,
  stashUnits,
  type GameState,
  type ProductId,
  type StashType,
  type StorageRejectReason,
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
  /** Display name of the country this stash sits in (the "which country" cue). */
  readonly countryName: string;
  /** True when this stash is in the run's home country. */
  readonly isHome: boolean;
  /** Current upgrade level and the cap (design/13 G; Prompt 49). */
  readonly level: number;
  readonly maxLevel: number;
  /** At `STASH_MAX_LEVEL` — no further upgrade (a migrated fold can read this true above the cap). */
  readonly maxed: boolean;
  /** Cost of the NEXT level, $ (`null` when maxed) — exactly what `upgradeStash` charges. */
  readonly upgradeCost: number | null;
  /** Effective capacity AFTER the next upgrade (the "current → next" readout). */
  readonly nextCapacityTotal: number;
  /** Clean cash covers the next upgrade (money is the only gate — open access). */
  readonly upgradeAffordable: boolean;
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
  const homeId = homeCountryId(state);
  return state.stashes.map((stash) => {
    const cfg = getStashType(stash.type);
    // Effective (crew-scaled) capacity — the real holding limit (design/12 Item 4).
    const total = effectiveCapacity(state, stash);
    const used = stashUnits(stash);
    const pct = effectiveSeizurePct(state, stash.id);
    const guard = stash.guardCrewId
      ? state.crew.find((c) => c.id === stash.guardCrewId)
      : undefined;
    const needsGuard = cfg.requiresGuard || stash.dirtyCash >= GUARD_CASH_THRESHOLD;

    const heldProducts: HeldProduct[] = PRODUCT_IDS.filter(
      (id) => stash.inventory[id] > 0,
    ).map((id) => ({ id, name: productName(id), qty: Math.floor(stash.inventory[id]) }));

    // Upgrade readout — the "current → next capacity" at its live price (design/13 G).
    const level = stashLevel(stash);
    const upgradeCost = nextUpgradeCost(state, stash);
    const maxed = upgradeCost === null;
    const nextCapacityTotal = maxed
      ? Math.floor(total)
      : Math.floor(effectiveCapacity(state, { ...stash, level: level + 1 }));

    return {
      id: stash.id,
      name: stash.name,
      type: stash.type,
      typeName: cfg.name,
      isDecoy: cfg.isDecoy,
      countryId: stash.countryId,
      countryName: countryName(stash.countryId),
      isHome: stash.countryId === homeId,
      level,
      maxLevel: STASH_MAX_LEVEL,
      maxed,
      upgradeCost,
      nextCapacityTotal,
      upgradeAffordable: upgradeCost !== null && state.cleanCash >= upgradeCost,
      // Shown as whole units (fill keeps the exact ratio for a smooth bar).
      capacityUsed: Math.floor(used),
      capacityTotal: Math.floor(total),
      capacityFree: effectiveCapacityRemaining(state, stash),
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

/** A country's stashes, grouped for a "which stash belongs to which country" readout. */
export interface CountryStashGroup {
  readonly countryId: string;
  readonly countryName: string;
  readonly isHome: boolean;
  /** Product units held / total capacity across this country's stashes. */
  readonly capacityUsed: number;
  readonly capacityTotal: number;
  readonly rows: readonly StashRow[];
}

/**
 * Every stash grouped under its country, home first (design/09 — the survival read
 * is per-place). Makes the "this stash is in THIS country" mapping explicit instead
 * of leaving a wall of generically named cards. Countries keep roster order after home.
 */
export function stashRowsByCountry(state: GameState): readonly CountryStashGroup[] {
  const homeId = homeCountryId(state);
  const rows = stashRows(state);
  const order: string[] = [];
  const byCountry = new Map<string, StashRow[]>();
  for (const row of rows) {
    if (!byCountry.has(row.countryId)) {
      byCountry.set(row.countryId, []);
      order.push(row.countryId);
    }
    byCountry.get(row.countryId)!.push(row);
  }
  return order
    .map((countryId) => {
      const groupRows = byCountry.get(countryId)!;
      return {
        countryId,
        countryName: countryName(countryId),
        isHome: countryId === homeId,
        capacityUsed: groupRows.reduce((sum, r) => sum + r.capacityUsed, 0),
        capacityTotal: groupRows.reduce((sum, r) => sum + r.capacityTotal, 0),
        rows: groupRows,
      };
    })
    .sort((a, b) => (a.isHome ? -1 : b.isHome ? 1 : 0));
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

/**
 * The stash types NOT yet built at `countryId` (default: home), as build options —
 * each is a FIRST-of-its-kind foothold to open in that country (design/13 G; Prompt
 * 49). A type already there is dropped from the list (the "add another stash here"
 * affordance is gone — you UPGRADE the one you have via its stash card instead).
 * Every remaining type is live from minute one (open access — the price is the only
 * gate). Restrict the target to a HELD country (see `buildCountries`): building a new
 * archetype where you already have a foothold is a reinforce, so `stashCost` (shown)
 * equals `footholdCost` (paid) — the fairness law. `nOwned` counts this type across
 * ALL countries, so opening the next one anywhere steps up the same shared curve.
 */
export function buildOptions(
  state: GameState,
  countryId?: string,
): readonly BuildOption[] {
  const target = countryId ?? homeCountryId(state);
  const presentHere = new Set(
    state.stashes.filter((s) => s.countryId === target).map((s) => s.type),
  );
  return STASH_TYPES.filter((cfg) => !presentHere.has(cfg.id)).map((cfg) => {
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

/** A country you hold territory in — a valid target to plant a new stash type. */
export interface BuildCountryOption {
  readonly countryId: string;
  readonly name: string;
  readonly isHome: boolean;
  /** How many distinct stash spots you already hold here (for the "3 spots" cue). */
  readonly stashCount: number;
  /** Stash types NOT yet built here — 0 means the country's slate is full. */
  readonly buildableTypes: number;
}

/**
 * The countries you can build a new stash in — every country you already hold a
 * foothold in (home + opened routes), home first. You plant new archetypes on ground
 * you control; OPENING fresh ground stays the Empire Map's job (`addStash` as a
 * foothold, with its reach price + exposure). Restricting builds to held countries is
 * what keeps `buildOptions`' shown price equal to the paid `footholdCost` (reinforce).
 */
export function buildCountries(state: GameState): readonly BuildCountryOption[] {
  const homeId = homeCountryId(state);
  const heldIds = [...new Set(state.stashes.map((s) => s.countryId))];
  return heldIds
    .map((id) => {
      const here = state.stashes.filter((s) => s.countryId === id);
      const present = new Set(here.map((s) => s.type));
      return {
        countryId: id,
        name: countryName(id),
        isHome: id === homeId,
        stashCount: here.length,
        buildableTypes: STASH_TYPES.filter((cfg) => !present.has(cfg.id)).length,
      };
    })
    .sort((a, b) =>
      a.isHome ? -1 : b.isHome ? 1 : a.name.localeCompare(b.name),
    );
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

/**
 * A `moveProduct` rejection as SPECIFIC prose with its numbers (design/13 A4) —
 * each `StorageRejectReason` gets its own line ("Container is full — 12 of 40
 * fit", "That stash doesn't hold 30 weed"), never the one generic "check space
 * and what's held". Pure read; mirrors exactly the checks `moveProduct` makes.
 */
export function moveRejectProse(
  state: GameState,
  rejected: StorageRejectReason,
  ctx: {
    readonly fromId: string;
    readonly toId: string;
    readonly product: ProductId;
    readonly qty: number;
  },
): string {
  const from = state.stashes.find((s) => s.id === ctx.fromId);
  const to = state.stashes.find((s) => s.id === ctx.toId);
  const prod = productName(ctx.product).toLowerCase();
  switch (rejected) {
    case 'insufficient-capacity': {
      const free = to ? effectiveCapacityRemaining(state, to) : 0;
      return `${to?.name ?? 'That stash'} is full — ${Math.min(Math.floor(free), ctx.qty)} of ${ctx.qty} fit.`;
    }
    case 'insufficient-inventory': {
      const held = from ? Math.floor(from.inventory[ctx.product] ?? 0) : 0;
      return `${from?.name ?? 'That stash'} doesn’t hold ${ctx.qty} ${prod} — ${held} here.`;
    }
    case 'cross-country':
      return `${to?.name ?? 'That stash'} sits in ${
        to ? countryName(to.countryId) : 'another country'
      } — cross-border weight ships from the Transport desk, not a local move.`;
    case 'invalid-qty':
      return 'Whole units only — pick how many units to move.';
    case 'invalid-move':
      return 'It’s already there — pick a different stash to move it to.';
    case 'no-stash':
      return 'That stash isn’t on the books anymore.';
    default:
      return 'Couldn’t move that.';
  }
}

/**
 * A `storeCash` rejection as specific prose with its numbers (design/13 A4) —
 * the dirty-cash counterpart of `moveRejectProse`.
 */
export function cashMoveRejectProse(
  state: GameState,
  rejected: StorageRejectReason,
  ctx: { readonly fromId: string; readonly amount: number },
): string {
  const from = state.stashes.find((s) => s.id === ctx.fromId);
  switch (rejected) {
    case 'insufficient-funds':
      return `${from?.name ?? 'That stash'} only holds ${money(from?.dirtyCash ?? 0)} dirty — ${money(ctx.amount)} doesn’t fit the move.`;
    case 'invalid-amount':
      return 'Pick an amount of dirty cash to move.';
    case 'invalid-move':
      return 'It’s already there — pick a different stash.';
    case 'no-stash':
      return 'That stash isn’t on the books anymore.';
    default:
      return 'Couldn’t move that cash.';
  }
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
