/**
 * Deal-loop tuning — the bust-probability model's weights and clamp (design/01
 * §2; Prompt 26 centralizes). These are v1 balance HYPOTHESES held as config,
 * never scattered literals (prompts/README.md "Config, not literals").
 *
 * The bust clamp is a **tune-first knob** (design/01 §8.3): the displayed odds
 * must *feel* fair. The weights below are the inputs to
 * `deals.computeBustProbability` — the ONE number shown to the player and
 * rolled against (the fairness law, design/01 §0.3).
 */

/** Bust probability is always clamped into this window (design/01 §2). */
export const BUST_MIN = 0.03;
export const BUST_MAX = 0.6;

// Weights of each input to the displayed bust probability (design/01 §2:
// f(heat, market risk, crew skill, product tier)). Chosen so the clamp is
// reachable from both ends: a calm, skilled low-tier deal floors at 3%; a hot,
// unskilled high-tier deal ceils at 60%.
export const BUST_BASE = 0.05;
export const BUST_HEAT_WEIGHT = 0.35;
export const BUST_LOCATION_WEIGHT = 0.15;
export const BUST_TIER_WEIGHT = 0.12;
export const BUST_QTY_WEIGHT = 0.1;
export const BUST_CREW_WEIGHT = 0.15;
/** Quantity at which the size term saturates its weight. */
export const BUST_QTY_FULL_RISK = 100;

/** Buying is quieter than selling: buy heat is scaled down from the per-unit rate. */
export const BUY_HEAT_FACTOR = 0.5;

/**
 * Legacy per-stash unit cap. Real capacity is per-archetype (Prompt 06:
 * `getStashType(stash.type).capacity`, enforced on buys); this constant is
 * retained as a neutral reference value for callers/tests that want a round cap.
 */
export const DEFAULT_STASH_CAPACITY = 1000;
