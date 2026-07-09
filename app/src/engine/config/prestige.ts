/**
 * Meta-progression tuning — the **high-score composite** and **prestige unlocks**
 * that persist past permadeath and pull the next run (design/01 §7; GDD §7).
 *
 * Two hard rules from the design, enforced by keeping this a data-only config:
 *
 *  1. **Prestige is NON-POWER.** Cross-run mastery earns cosmetic / roster /
 *     starting-scenario variety — NEVER stat multipliers. Compounding power would
 *     dilute the high-score stakes (GDD §7). Every unlock below is tagged with a
 *     `category` from a closed set that has no "power" member by construction.
 *  2. **Score banks from PEAK values.** The run score is peak net worth plus a
 *     weighted empire-size composite, so a late-game wipe still records the height
 *     climbed (design/01 §7). These weights name that composite.
 *
 * v1 tuning HYPOTHESES held as config, never scattered literals (prompts/README.md
 * "Config, not literals"; Prompt 26 centralizes). Legacy/heir inheritance is PARKED
 * (design/01 §7 "Parked") — see the clearly-marked seam in `engine/endgame.ts`.
 */

// --- Empire-size composite weights (design/01 §7) ----------------------------

/**
 * Weights for the empire-size composite
 * `w1·districts + w2·routes + w3·fronts + w4·crew + w5·actReached` (design/01 §7).
 * Districts/routes/act are the biggest paradigm-shift milestones, so they weigh
 * heaviest; fronts and crew are the steady accumulation. `engine/endgame.ts` reads
 * these; the district/route/act SYSTEMS land in later prompts, so today they resolve
 * from the best available proxies (documented at the call site).
 */
export const EMPIRE_WEIGHTS = {
  district: 3,
  route: 2,
  front: 1,
  crew: 1,
  act: 2,
} as const;

// --- Death-spiral thresholds (design/01 §4a) ---------------------------------

/**
 * The readable death-spiral chain's tuning (design/01 §4a). Each rung is a query
 * `endgame.evaluateSpiral` exposes so the UI can telegraph it — never a hidden
 * roll. v1 hypotheses (Prompt 26 tunes against the "earned/readable vs. cheap dice
 * death" telemetry, design/01 §8 top priority).
 */

/** Heat (0–100) at/above which your exposure counts as "unmanaged" in the spiral. */
export const SPIRAL_HEAT_UNMANAGED = 70;

/** Heat (0–100) at/above which the state alone is enough to start hunting you. */
export const SPIRAL_HEAT_HUNTED = 90;

/** Rival tension (0–100) at/above which a rival moves on a defenceless empire. */
export const SPIRAL_RIVAL_HUNTED = 70;

// --- Prestige unlocks (design/01 §7; GDD §7 — non-power ONLY) ----------------

/**
 * The only kinds of prestige reward allowed (design/01 §7). Note what is NOT here:
 * there is no `power`/`multiplier`/`boost` category — the type system makes a
 * power unlock unrepresentable, which is how the "non-power" guarantee is enforced.
 */
export type PrestigeCategory = 'roster' | 'scenario' | 'cosmetic';

/** How a prestige unlock is earned — all measured from a run's PEAK/terminal stats. */
export type PrestigeRequirementKind =
  | 'peak-net-worth' // how big you got (banks from peak — design/01 §7)
  | 'rivals-toppled' // rivals removed this run (GDD §4.4)
  | 'weeks-survived'; // how far a run reached (the "farthest act" proxy)

export interface PrestigeUnlockConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: PrestigeCategory;
  readonly requirement: {
    readonly kind: PrestigeRequirementKind;
    readonly threshold: number;
  };
}

/**
 * The MVP prestige roster (design/01 §7). Deliberately small and purely
 * cosmetic/roster/scenario — proof the meta-loop persists and pulls the next run
 * without ever making the player mechanically stronger. Expanded via telemetry
 * (Prompt 26).
 */
export const PRESTIGE_UNLOCKS: readonly PrestigeUnlockConfig[] = [
  {
    id: 'title-hustler',
    name: 'Hustler',
    description: 'A run-recap title for cracking your first six figures.',
    category: 'cosmetic',
    requirement: { kind: 'peak-net-worth', threshold: 100_000 },
  },
  {
    id: 'title-kingpin',
    name: 'Kingpin',
    description: 'A prestige title for a seven-figure empire at its peak.',
    category: 'cosmetic',
    requirement: { kind: 'peak-net-worth', threshold: 1_000_000 },
  },
  {
    id: 'roster-old-friend',
    name: 'An Old Friend',
    description: 'Unlocks an extra recruitable crew face in future runs (roster variety).',
    category: 'roster',
    requirement: { kind: 'rivals-toppled', threshold: 1 },
  },
  {
    id: 'scenario-clean-slate',
    name: 'Clean Slate',
    description: 'Unlocks an alternate low-heat starting scenario for future runs.',
    category: 'scenario',
    requirement: { kind: 'weeks-survived', threshold: 4 },
  },
  {
    id: 'scenario-cartel-ties',
    name: 'Cartel Ties',
    description: 'Unlocks a high-stakes starting scenario with early route access.',
    category: 'scenario',
    requirement: { kind: 'weeks-survived', threshold: 8 },
  },
] as const;

const PRESTIGE_BY_ID: ReadonlyMap<string, PrestigeUnlockConfig> = new Map(
  PRESTIGE_UNLOCKS.map((p) => [p.id, p]),
);

/** Look up a prestige unlock config without throwing (tolerant UI/prose). */
export function findPrestige(id: string): PrestigeUnlockConfig | undefined {
  return PRESTIGE_BY_ID.get(id);
}
