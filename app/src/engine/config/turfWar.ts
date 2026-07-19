/**
 * Turf-war tuning — rivals as REAL territorial actors (design: "Turf Wars Between
 * Countries"). Today rivals are ambient pressure (they inflate bribe asks via
 * `corruption.rivalPressure` and add a one-time `RIVAL_CLASH_HEAT`). This layer
 * lets a rival contest a SPECIFIC country the player holds: a stateful war with a
 * telegraphed opening, a `pressure` meter that escalates over ACTIVE play, and
 * battles the player answers with muscle + weapons + corruption + money.
 *
 * It also finally gives ARMS a use: weapons committed to a battle are consumed,
 * so the armory (arms.ts) is spent, not just traded.
 *
 * Laws honored by the engine (turfWar.ts), NOT tunable here (they're guardrails):
 *  - **Offline-frozen** — the `turf-war` tick step is active-only; absence never
 *    ignites, escalates, or resolves a war (GDD §6).
 *  - **Telegraphed** — every escalation (opening, each pressure step, the final
 *    country-losing battle) queues a return-hook BEFORE it lands (design/07 §5).
 *  - **Shown = rolled** — the battle win-chance displayed is the exact number
 *    `resolveBattle` rolls against (design/01 §0.3).
 *  - **Determinism** — ignition/battle rolls draw from an INDEPENDENT run-seeded
 *    stream (`rng.fork('turf-war')`), never perturbing the deal/raid RNG.
 *  - **Open access** (Ideas.md, [[open-access-design]]) — the Turf War screen is
 *    reachable from minute one; money/crew are the limiter, not a progress flag.
 *
 * Every number is a v1 balance HYPOTHESIS held as config, never a scattered
 * literal (prompts/README.md "Config, not literals"; Prompt 26 — the live values
 * are read from `state.config.turfWar`).
 */

import type { WeaponTierId } from './arms';

/** How a rival prosecutes a war — flavored by archetype (config/rivals.ts):
 *  - `hot`     the Violent Bull: guns and bodies (muscle/arms matter most);
 *  - `cold`    the Politician: corrupt cops & customs (paid officials counter it);
 *  - `raid`    the Ghost: stash raids (guards matter most);
 *  - `undercut` the Tech Cartel: a price war (money/reach matter most). */
export type TurfWarKind = 'hot' | 'cold' | 'raid' | 'undercut';

// --- Ignition (rival-started) --------------------------------------------------

/**
 * Base per-hour chance that SOME eligible rival opens a new war, before the
 * per-rival aggression/reach/vulnerability weighting. Active-only — the clock
 * only advances online, so a war can't ignite while the player is away.
 */
export const IGNITION_RATE_PER_HOUR = 0.01;

/**
 * A rival's `tension` (0–100, raised by chaos/clashes) must be AT OR ABOVE this
 * before it will open a war. Below it the rival stays ambient pressure only —
 * war is the escalation of an already-hostile relationship, never a bolt from
 * the blue.
 */
export const IGNITION_TENSION_THRESHOLD = 40;

/** Ignition-likelihood weights (multiply the base rate; read off the rival and
 * the contested country). Aggression drives who starts wars; reach lets a
 * far-off rival project power; a freshly opened (still-vulnerable) foothold
 * invites a move. */
export const IGNITION_AGGRESSION_WEIGHT = 1.5;
export const IGNITION_REACH_WEIGHT = 0.75;
export const IGNITION_VULNERABILITY_WEIGHT = 1.0;

/** One-time heat the instant a war OPENS — turf noise draws the law (reuses the
 * six-source "flashy action" idea; on the 0–100 meter). */
export const IGNITION_HEAT = 5;

/** Most simultaneous ACTIVE wars. A cap so the world can't dogpile the player
 * into an unwinnable firehose (the anti-firehose spirit of the beat plateau). */
export const MAX_ACTIVE_WARS = 3;

// --- Escalation (active-only pressure) -----------------------------------------

/**
 * Pressure (0–100) an unanswered war gains per hour of ACTIVE play. At `0.5` a
 * war crosses from opening to its country-losing head over ~8 in-game days if
 * never fought — enough time to muster crew/guns or buy a truce. Offline-frozen.
 */
export const PRESSURE_GROWTH_PER_HOUR = 0.5;

/** Pressure at/above which the NEXT lost battle can push the player out of the
 * contested country (the final rung). Below it a loss only taxes/bruises. */
export const PRESSURE_SEIZE_THRESHOLD = 80;

/** Distinct lost battles in a war at/above which a loss can seize the country —
 * a second guard on the terminal rung so one unlucky roll never strips a
 * country outright (escalating & recoverable, per the plan). */
export const SEIZE_COUNTRY_AFTER_LOSSES = 3;

// --- Battle strength (itemized, shown = rolled) --------------------------------

/**
 * Floor strength both sides carry so an early, crewless battle isn't a 0/0
 * divide — the player always has SOME chance, and a rival is never a pushover.
 */
export const BATTLE_BASE_STRENGTH = 10;

/** Player strength per point of MUSCLE skill on a crew member committed to the
 * fight (soldiers/lieutenants assigned to the contested country). */
export const BATTLE_MUSCLE_WEIGHT = 0.4;

/** Player strength added per WEAPON UNIT committed, by tier. Higher tiers hit
 * far harder — the reason to climb the arms ladder. Units are CONSUMED on
 * commit (win or lose), so firepower is spent, not free. */
export const BATTLE_ARMS_TIER_WEIGHT: Readonly<Record<WeaponTierId, number>> = {
  pistols: 1,
  rifles: 2.5,
  automatic: 6,
  military: 15,
};

/** Player strength per point of a stash GUARD's muscle in the contested country
 * (defensive advantage — matters most against a `raid` war). */
export const BATTLE_GUARD_WEIGHT = 0.3;

/** Player strength per point of a committed LIEUTENANT's loyalty (a loyal
 * commander fights harder; a wavering one is a liability — ties battles to the
 * crew loyalty system). */
export const BATTLE_LOYALTY_WEIGHT = 0.1;

/** Player strength from a PAID official (customs/cop protection) in the
 * contested country — the good answer to a `cold` (Politician) war. A flat bonus
 * per relevant protection held. */
export const BATTLE_OFFICIAL_WEIGHT = 8;

/** Rival strength weights — read off the rival's per-run traits and the war's
 * current tension. */
export const RIVAL_AGGRESSION_WEIGHT = 25;
export const RIVAL_REACH_WEIGHT = 18;
export const RIVAL_TENSION_WEIGHT = 0.35;

/**
 * Win-chance clamp — no battle is ever a sure thing either way (the fairness
 * "always a chance / always a risk" rule). Even a hopeless fight keeps `MIN`
 * hope; even a dominant one carries `1 − MAX` risk.
 */
export const BATTLE_WIN_CHANCE_MIN = 0.05;
export const BATTLE_WIN_CHANCE_MAX = 0.95;

/**
 * Per-`kind` multiplier on the SIDE each war leans on, so archetype shapes the
 * fight: a `hot` war rewards firepower (the rival's aggression bites harder,
 * countered by muscle/arms), a `cold` war rewards officials, a `raid` rewards
 * guards, an `undercut` rewards money/reach. Applied to the rival's dominant
 * trait so the "right" counter is legible.
 */
export const KIND_RIVAL_MULTIPLIER: Readonly<Record<TurfWarKind, number>> = {
  hot: 1.3,
  cold: 1.15,
  raid: 1.1,
  undercut: 1.0,
};

// --- Outcomes ------------------------------------------------------------------

/** Pressure removed from a war on a WON battle — a decisive win cools the
 * conflict; enough wins end it (and, for an offensive war, topple the rival). */
export const BATTLE_WIN_PRESSURE_DROP = 35;

/** At/below this pressure a WON war is over — de-escalated to peace. An
 * offensive (player-declared) war ending this way TOPPLES the rival. */
export const WAR_RESOLVED_PRESSURE = 5;

/** Pressure ADDED to a war on a LOST battle — losing emboldens the rival and
 * marches the conflict toward the country-losing head. */
export const BATTLE_LOSS_PRESSURE_GAIN = 15;

/** One-time heat on a LOST battle — the fight was loud and it went badly. */
export const BATTLE_LOSS_HEAT = 8;

/** Street-reputation hit on a LOST battle — you looked weak (lowers borrow cap
 * & leverage elsewhere, via the reputation system). */
export const BATTLE_LOSS_REP = 6;

/** Loyalty hit applied to the crew member wounded/lost as a battle CASUALTY on a
 * loss (a `tookTheFall`-adjacent negative that ripples through the roster). */
export const CASUALTY_LOYALTY_HIT = 12;

/** Ongoing tribute — the fraction of the contested country's income skimmed by
 * the rival while a LOST-but-active war stands (the "pay to survive" drain;
 * cleared when the war is won or bought off). */
export const TRIBUTE_PCT = 0.2;

// --- Rewards (design/15 Workstream A — winning has to PAY) ----------------------

/**
 * Weapon units CAPTURED from the rival on a WON battle, by war kind — the
 * counter-play fiction holds: a `hot` (Violent Bull) war drops real firepower, a
 * `raid` (Ghost) war drops pistols, `cold`/`undercut` a thin mixed bag (their
 * strength was never guns). Deterministic — no roll; scaled by the rival's
 * aggression (`CAPTURE_AGGRESSION_SCALE`) and floored at 0. Partially refunds
 * the armory the battle consumed, so firepower stops being a pure sunk cost.
 */
export const CAPTURE_UNITS_BY_KIND: Readonly<
  Record<TurfWarKind, Readonly<Partial<Record<WeaponTierId, number>>>>
> = {
  hot: { rifles: 3, automatic: 1 },
  raid: { pistols: 4 },
  cold: { pistols: 2 },
  undercut: { pistols: 1, rifles: 1 },
};

/**
 * How hard the rival's `aggression` (0–1) scales the capture table: units are
 * `base × (1 + (aggression − 0.5) × SCALE)`, rounded, floored at 0 — an
 * aggressive rival fields more guns to take; a timid one travels light. At `1`
 * the haul swings ±50% around the table value.
 */
export const CAPTURE_AGGRESSION_SCALE = 1;

/**
 * War spoils on a TOPPLE — breaking a rival for good seizes a cut of their
 * operation as DIRTY cash (their money is never clean; it lands in the contested
 * country's stash and feeds the wash/laundering pipeline). Scaled by the rival's
 * traits so the scariest rivals are the richest prizes:
 * `BASE × (1 + reach × REACH_WEIGHT + aggression × AGGRESSION_WEIGHT)` — a
 * $150k–$500k band, so a declared war roughly recoups `DECLARE_WAR_COST`.
 * Not farmable: rivals are finite per run and topple is permanent.
 */
export const TOPPLE_SPOILS_BASE = 150_000;
export const TOPPLE_REACH_WEIGHT = 1.0;
export const TOPPLE_AGGRESSION_WEIGHT = 0.75;

/** Street-reputation GAIN on a WON battle — the mirror of `BATTLE_LOSS_REP`
 * (you looked strong; rep raises the borrow cap, keeps the lifeline open, and
 * discounts corruption asks). */
export const BATTLE_WIN_REP = 3;

/** Most street rep a single war can pay across its won battles (tracked by
 * `TurfWar.repEarned`) — belt-and-braces against grinding one long war. */
export const WIN_REP_CAP_PER_WAR = 9;

// --- Player offense (declare war) ----------------------------------------------

/** Up-front cost, $, to DECLARE war on a rival over a country you hold — arming
 * up, paying soldiers, buying the first move. Shown before commit. */
export const DECLARE_WAR_COST = 250_000;

/** One-time heat for declaring war — going on the offensive is conspicuous. */
export const DECLARE_WAR_HEAT = 6;

// --- Truce / tribute buy-off ---------------------------------------------------

/** Cost to sue for a TRUCE, as a multiple of the contested country's current
 * stash value — buying peace scales with what you're protecting. */
export const TRUCE_COST_VALUE_MULTIPLE = 0.25;

/** Minimum truce cost, $, so a truce is never trivially cheap on a thin stash. */
export const TRUCE_COST_MIN = 100_000;
