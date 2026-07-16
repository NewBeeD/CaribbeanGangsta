/**
 * Stash-type table — the risk/capacity/cost trade-offs of *where* you hide
 * product and dirty cash (design/09 System A, A.3/A.5; GDD §4.8). Storage is the
 * survival skill: a raid hits exactly ONE location (heat.ts owns whether/where),
 * so spreading inventory caps a single night's loss — and over-concentration lets
 * one raid wipe you (the death-spiral entry, owned by Prompt 11).
 *
 * These are v1 tuning HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"; Prompt 26 centralizes). The seizure
 * percentages here are the base the storage screen shows AND the number rolled on
 * a raid (the fairness law) once `storage.ts` adjusts them for guard loyalty and
 * (for ports) whether the port is paid.
 *
 * Trade-offs, not a strict ladder (design/09 A.3): the buried cache is *safer*
 * than the safehouse but slower and smaller, so the choice is real. Access speed
 * is modeled as a `travelDelayHours` on moves (slow stashes cost in-game time).
 */

/** The stash archetypes (design/09 A.3). `floor` is the run's starting backroom. */
export type StashType = 'floor' | 'buried' | 'safehouse' | 'container' | 'decoy';

export interface StashTypeConfig {
  readonly id: StashType;
  readonly name: string;
  /**
   * Base (Level-1) unit capacity this location holds; upgrade LEVELS scale it up
   * the `STASH_CAPACITY_GROWTH` curve (`stashLevelCapacity` — design/13 G; Prompt
   * 49). Decoys hold nothing (0) at every level.
   */
  readonly capacity: number;
  /**
   * Base seizure probability if this location is raided, 0..1 (design/09 A.3).
   * This is the number surfaced to the player before adjustments — and, after
   * `effectiveSeizurePct`, exactly the number rolled (fairness law, design/09 A.4).
   */
  readonly seizurePct: number;
  /**
   * Port-linked reduced seizure once the port is paid (design/09 A.3; the hook
   * is wired by the corruption network, Prompt 09). Present only for `container`.
   */
  readonly seizurePctPaid?: number;
  /** Whether this stash routes through a port (so a paid port lowers its seizure). */
  readonly portLinked: boolean;
  /**
   * Passive heat footprint of running this location, 0..1 (design/09 A.3). Hidden
   * caches are low; a decoy draws heat *on purpose*. Reserved for raid-targeting
   * bias / passive heat in a later prompt; carried here so the roster is complete.
   */
  readonly heatFootprint: number;
  /**
   * Access speed as in-game hours of travel delay incurred when moving product
   * in/out (design/09 A.3). Instant stashes are 0; the buried cache and container
   * are slow. Enforced by `moveProduct`, which reports the delay to the caller.
   */
  readonly travelDelayHours: number;
  /** Base build cost, $ — grown by `stashCost` along the upgrade curve. */
  readonly baseCost: number;
  /**
   * Whether a significant pile here needs a crew guard (design/09 A.3a). An
   * unguarded vault raises its effective seizure (an inside job waiting to happen).
   */
  readonly requiresGuard: boolean;
  /** A decoy holds nothing and absorbs a raid as misdirection (design/09 A.3). */
  readonly isDecoy: boolean;
}

/**
 * The stash roster (design/09 A.3). Container seizure drops 15% → ~3% when the
 * port is paid (Prompt 09). A decoy has zero capacity — its whole value is
 * drawing a raid onto an empty place.
 */
export const STASH_TYPES: readonly StashTypeConfig[] = [
  {
    id: 'floor',
    name: 'Floor Stash',
    capacity: 50,
    seizurePct: 0.9,
    portLinked: false,
    heatFootprint: 0.1,
    travelDelayHours: 0,
    baseCost: 500,
    requiresGuard: false,
    isDecoy: false,
  },
  {
    id: 'buried',
    name: 'Buried Cache',
    capacity: 200,
    seizurePct: 0.4,
    portLinked: false,
    heatFootprint: 0.02, // hidden — very low footprint
    travelDelayHours: 8, // slow: a jungle drop is a trek
    baseCost: 3000,
    requiresGuard: false,
    isDecoy: false,
  },
  {
    id: 'safehouse',
    name: 'Safehouse Vault',
    capacity: 800,
    seizurePct: 0.25,
    portLinked: false,
    heatFootprint: 0.15,
    travelDelayHours: 0,
    baseCost: 15000,
    requiresGuard: true, // a vault left unguarded is an inside job (design/09 A.3a)
    isDecoy: false,
  },
  {
    id: 'container',
    name: 'Container / Offshore',
    capacity: 3000,
    seizurePct: 0.15,
    seizurePctPaid: 0.03, // ~3% once the port is paid (Prompt 09)
    portLinked: true,
    heatFootprint: 0.05,
    travelDelayHours: 12, // slow: offshore logistics
    baseCost: 60000,
    requiresGuard: false,
    isDecoy: false,
  },
  {
    id: 'decoy',
    name: 'Decoy Stash',
    capacity: 0,
    seizurePct: 0,
    portLinked: false,
    heatFootprint: 0.3, // draws heat on purpose — misdirection
    travelDelayHours: 0,
    baseCost: 2000,
    requiresGuard: false,
    isDecoy: true,
  },
] as const;

/** The stash type the run's home/backroom starts as (design/09 A.3 "floor stash"). */
export const STARTING_STASH_TYPE: StashType = 'floor';

const STASH_BY_ID: ReadonlyMap<StashType, StashTypeConfig> = new Map(
  STASH_TYPES.map((s) => [s.id, s]),
);

/**
 * Resolve a stash-type config, throwing on an unknown id (closed union guard).
 * Pass an alternate `types` (e.g. `state.config.stashes.STASH_TYPES`) to
 * resolve against an injected tuning (Prompt 26).
 */
export function getStashType(
  id: StashType,
  types: readonly StashTypeConfig[] = STASH_TYPES,
): StashTypeConfig {
  const cfg = types === STASH_TYPES ? STASH_BY_ID.get(id) : types.find((s) => s.id === id);
  if (!cfg) throw new Error(`getStashType(): unknown stash type "${id}"`);
  return cfg;
}

// --- Upgrade curve & seizure adjustment tuning -------------------------------

/**
 * Each UPGRADE of a stash costs 15% more than the last, along the classic idle
 * geometric curve (design/09 A.5; design/13 G — the `cost × 1.15^level` family
 * shared by fronts/production/vessels). Prompt 49 repurposes this: it no longer
 * prices a stacked second stash (that model is gone) but the next LEVEL on the one
 * stash a spot holds.
 */
export const STASH_COST_GROWTH = 1.15;

/**
 * Levels run 1–8 for every stash (design/13 G; Prompt 49) — the depth you can buy
 * into ground you already hold. Level 1 is the archetype's base capacity; each
 * upgrade multiplies it by `STASH_CAPACITY_GROWTH`. A migrated legacy save that
 * folded many stacked stashes into one can carry a level ABOVE this cap (the fold
 * never shrinks capacity — `foldStashesOnePerSpot`); the cap only bounds live
 * `upgradeStash` purchases.
 */
export const STASH_MAX_LEVEL = 8;

/**
 * Capacity multiplier per level (design/13 G; Prompt 49) — `capacity =
 * baseCapacity × STASH_CAPACITY_GROWTH^(level-1)`. STEEP by design so investing in
 * one spot's depth is a real alternative to spreading out: a maxed (L8) FLOOR holds
 * `50 × 1.7^7 ≈ 2,051` base units — about 7× the old ~290-unit home ceiling the
 * round-4 feedback called out ("production maxes out at 290 units") — and a maxed
 * CONTAINER holds `3,000 × 1.7^7 ≈ 123k`, swallowing many container-ship manifests
 * (2,000 units each — Prompt 47 synergy). The crew-carry bonus still stacks on top.
 */
export const STASH_CAPACITY_GROWTH = 1.7;

/**
 * A stash's BASE unit capacity at `level` (before crew-carry): `baseCapacity ×
 * STASH_CAPACITY_GROWTH^(level-1)`, rounded to whole units (design/13 G; Prompt
 * 49). Level 1 is exactly `baseCapacity`; a 0-capacity archetype (a decoy) stays 0
 * at every level. `growth` injects an alternate curve (`state.config.stashes`).
 */
export function stashLevelCapacity(
  baseCapacity: number,
  level: number,
  growth: number = STASH_CAPACITY_GROWTH,
): number {
  if (baseCapacity <= 0) return 0;
  return Math.round(baseCapacity * Math.pow(growth, Math.max(1, level) - 1));
}

/**
 * The smallest level whose base capacity is ≥ `targetCapacity` (round UP — design/13
 * G; Prompt 49): the level a fold needs so the survivor never holds LESS than the
 * stashes it absorbed. NOT bounded by `STASH_MAX_LEVEL` — a fold must preserve every
 * unit of capacity even past the live upgrade cap. Returns 1 for a 0-capacity
 * archetype (a decoy can't grow) or a non-positive target.
 */
export function smallestLevelForCapacity(
  baseCapacity: number,
  targetCapacity: number,
  growth: number = STASH_CAPACITY_GROWTH,
): number {
  if (baseCapacity <= 0 || targetCapacity <= baseCapacity) return 1;
  // level = 1 + ceil(log_growth(target / base)); guard the (theoretically
  // impossible) growth ≤ 1 with a bounded linear fallback.
  if (growth <= 1) {
    let level = 1;
    while (stashLevelCapacity(baseCapacity, level, growth) < targetCapacity && level < 10_000) {
      level++;
    }
    return level;
  }
  const level = 1 + Math.ceil(Math.log(targetCapacity / baseCapacity) / Math.log(growth));
  return Math.max(1, level);
}

/**
 * Extra unit capacity every crew member adds to a stash's archetype base
 * (design/12 Item 4 — crew-scaled carry). Effective capacity =
 * `base + CREW_CARRY_PER_MEMBER × crew.length` (`storage.effectiveCapacity`).
 * With recruiting unbounded (open access), capacity is unbounded too — "no hard
 * max" without deleting the storage system or its raid-seizure stakes. v1: 40
 * units/member, so a handful of soldiers meaningfully deepens every hold.
 */
export const CREW_CARRY_PER_MEMBER = 40;

/** Injected stash tuning shape shared by the cost helpers (a subset of `StashesTuning`). */
export interface StashCostTuning {
  readonly STASH_TYPES?: readonly StashTypeConfig[];
  readonly STASH_COST_GROWTH?: number;
}

/**
 * Cost to open the `nOwned`-th+1 stash-SPOT of `type`: `base × 1.15^nOwned`
 * (design/09 A.5). A "spot" is one (country, type) foothold (Prompt 49) — so
 * `nOwned` is how many countries already hold this type, and opening the next one
 * costs 15% more. Deterministic, non-gambling progression. `tuning` injects an
 * alternate roster/growth (e.g. `state.config.stashes` — Prompt 26). For the
 * per-country reach/region surcharge on a NEW country see `territoryExpansionCost`.
 */
export function stashCost(
  type: StashType,
  nOwned: number,
  tuning?: StashCostTuning,
): number {
  const base = getStashType(type, tuning?.STASH_TYPES ?? STASH_TYPES).baseCost;
  const growth = tuning?.STASH_COST_GROWTH ?? STASH_COST_GROWTH;
  return Math.round(base * Math.pow(growth, nOwned));
}

/**
 * Cost to raise a stash from `level` → `level + 1`: `base × 1.15^level` (design/13
 * G; Prompt 49 — the same `cost × 1.15^level` family fronts/production/vessels use,
 * anchored to the archetype's `baseCost`). Level 1→2 costs `base × 1.15`. `tuning`
 * injects an alternate roster/growth (`state.config.stashes`).
 */
export function stashUpgradeCost(
  type: StashType,
  level: number,
  tuning?: StashCostTuning,
): number {
  const base = getStashType(type, tuning?.STASH_TYPES ?? STASH_TYPES).baseCost;
  const growth = tuning?.STASH_COST_GROWTH ?? STASH_COST_GROWTH;
  return Math.round(base * Math.pow(growth, Math.max(1, level)));
}

/**
 * Dirty cash at or above this in one location counts as a "significant pile" that
 * needs a guard (design/09 A.3a) — unguarded, it carries the inside-job penalty.
 */
export const GUARD_CASH_THRESHOLD = 50_000;

/**
 * Most a low-loyalty guard adds to a stash's effective seizure %, at loyalty 0
 * (design/09 A.3a — the inside job). A fully loyal guard adds nothing.
 */
export const GUARD_MAX_PENALTY = 0.2;

/**
 * Penalty added to a stash that *should* be guarded (a vault, or a big cash pile)
 * but has no guard assigned. Kept equal to `GUARD_MAX_PENALTY` so leaving a vault
 * open is exactly as risky as guarding it with someone who'd sell you out.
 */
export const GUARD_UNGUARDED_PENALTY = 0.2;

/**
 * Operating capital (all dirty + clean cash) at or below this after a raid marks
 * the seizure as having `wipedOperatingCapital` — the readable signal Prompt 11
 * reads to evaluate the death spiral (design/09 A.3a; design/01 §4a). Storage
 * never ends the run itself.
 */
export const WIPE_CAPITAL_THRESHOLD = 100;

/** Total product capacity across a full slate of one of every stash type. */
export const TOTAL_ARCHETYPE_CAPACITY = STASH_TYPES.reduce(
  (sum, s) => sum + s.capacity,
  0,
);
