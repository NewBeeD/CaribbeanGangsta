/**
 * Turf wars — rivals as REAL territorial actors (design "Turf Wars Between
 * Countries"). A `TurfWar` (state.ts) binds a rival to a SPECIFIC country the
 * player holds; it escalates over ACTIVE play (`pressure`) and is answered with
 * muscle + weapons + corruption + money. This is the layer that finally SPENDS
 * the armory (`arms.spendArmory`).
 *
 * Purity/determinism (prompts/README.md): pure, immutable state in → new state
 * out. Two rolls happen here and BOTH draw from an INDEPENDENT run-seeded stream
 * (`createRng(world.eventSeed + …)`, like chaos / market events), so turf wars
 * never perturb the main deal/raid RNG:
 *  - ignition (`turfWarStep`) — whether a rival opens a war this tick;
 *  - a battle (`resolveBattle`) — whether the player wins, rolled against the
 *    EXACT win chance shown by `battleStrength` (design/01 §0.3, shown = rolled).
 *
 * Offline safety (GDD §6): ignition, pressure growth, and tribute all live in the
 * active-only `turf-war` tick step — absence never opens a war, escalates one, or
 * skims a dollar. Telegraphing (design/07 §5): every escalation (opening, a lost
 * battle, the country-losing seizure) queues a `PendingChoice` BEFORE it lands.
 *
 * Open access (Ideas.md, [[open-access-design]]): the whole layer is reachable
 * from minute one; money/crew are the limiter, never a progression flag.
 */

import { createRng, type Rng } from './rng';
import { addHeat } from './heat';
import { spendArmory, type Armory } from './arms';
import { getWeaponTier, type WeaponTierId } from './config/arms';
import { COUNTRY_IDS, getCountry, REGION_DISTANCE } from './config/countries';
import { hasPoliticalProtection, hasCustomsProtection } from './corruption';
import type { TurfWarTuning } from './config';
import type { TurfWarKind } from './config/turfWar';
import type { GameState, PendingChoice, TurfWar } from './state';
import type { Rival } from './world';

const HOURS_PER_WEEK = 24 * 7;

/** Roster countries a war can be fought over — ignition ignores any stash on a
 * non-roster id (a war needs a real place to name and locate). */
const ROSTER_COUNTRIES = new Set<string>(COUNTRY_IDS);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Basic selectors -----------------------------------------------------------

/** The active turf wars in the run (a thin, stable accessor for the UI/model). */
export function activeWars(state: GameState): readonly TurfWar[] {
  return state.turfWars;
}

/** The war contesting a given country, if any (one war per country at a time). */
export function warForCountry(state: GameState, countryId: string): TurfWar | undefined {
  return state.turfWars.find((w) => w.countryId === countryId);
}

/** Distinct countries the player currently holds a stash in (sorted, stable). */
export function heldCountries(state: GameState): readonly string[] {
  return [...new Set(state.stashes.map((s) => s.countryId))].sort();
}

/** Sum of dirty cash stored in a country's stashes — what a war there puts at
 * stake, and the base the tribute/truce costs scale off. */
export function countryStake(state: GameState, countryId: string): number {
  return state.stashes
    .filter((s) => s.countryId === countryId)
    .reduce((sum, s) => sum + s.dirtyCash, 0);
}

/** The world `Rival` record behind a rival id (its per-run traits/home region). */
export function findRival(state: GameState, rivalId: string): Rival | undefined {
  return state.world.rivals.find((r) => r.id === rivalId);
}

/** Current tension (0–100) toward a rival — read from the relationship layer. */
export function rivalTension(state: GameState, rivalId: string): number {
  return state.rivals.find((r) => r.id === rivalId)?.tension ?? 0;
}

/** How a rival prosecutes a war, flavored by archetype (config/turfWar.ts). */
export function kindForArchetype(archetypeId: string): TurfWarKind {
  switch (archetypeId) {
    case 'violent-bull':
      return 'hot';
    case 'politician':
      return 'cold';
    case 'ghost':
      return 'raid';
    case 'tech-cartel':
    default:
      return 'undercut';
  }
}

/** Rivals that could be fought over a held country right now — present, not
 * toppled, and not already at war with the player somewhere else there. */
export function contestableRivals(state: GameState, countryId: string): readonly Rival[] {
  if (warForCountry(state, countryId)) return [];
  const toppled = new Set(state.rivals.filter((r) => r.toppled).map((r) => r.id));
  return state.world.rivals.filter((r) => !toppled.has(r.id));
}

// --- Battle strength (itemized, shown = rolled) --------------------------------

/** One line of the battle-strength readout — a labelled contribution to a side. */
export interface StrengthTerm {
  readonly label: string;
  readonly contribution: number;
}

/** The full, itemized battle math — every term summed on each side, and the win
 * chance that `resolveBattle` rolls against (shown = rolled, design/01 §0.3). */
export interface BattleBreakdown {
  readonly playerTerms: readonly StrengthTerm[];
  readonly rivalTerms: readonly StrengthTerm[];
  readonly playerStrength: number;
  readonly rivalStrength: number;
  /** THE number rolled on the fight — in [MIN, MAX], never a sure thing. */
  readonly winChance: number;
}

/** What the player throws into a battle: crew (their muscle + loyalty) and
 * weapons committed from the armory (consumed on resolve, win or lose). */
export interface BattleCommitment {
  readonly crewIds: readonly string[];
  readonly arms: Readonly<Partial<Record<WeaponTierId, number>>>;
}

const NO_COMMITMENT: BattleCommitment = { crewIds: [], arms: {} };

/** Guards defending the contested country — crew tied to a stash there via
 * `guardCrewId` (a passive defensive term, on top of anything committed). */
function guardsInCountry(state: GameState, countryId: string): readonly string[] {
  return state.stashes
    .filter((s) => s.countryId === countryId && s.guardCrewId !== undefined)
    .map((s) => s.guardCrewId as string);
}

/**
 * Itemize a battle. Player strength blends committed crew muscle + loyalty, the
 * firepower committed from the armory (by tier), the contested country's stash
 * guards, and any standing official protection (the answer to a `cold` war).
 * Rival strength blends aggression + reach + current tension, amplified in the
 * archetype's element (`KIND_RIVAL_MULTIPLIER`). Pure — reads state, mutates
 * nothing (the armory is spent only in `resolveBattle`).
 */
export function battleStrength(
  state: GameState,
  war: TurfWar,
  commitment: BattleCommitment = NO_COMMITMENT,
  tuning: TurfWarTuning = state.config.turfWar,
): BattleBreakdown {
  const playerTerms: StrengthTerm[] = [
    { label: 'Base', contribution: tuning.BATTLE_BASE_STRENGTH },
  ];

  const committed = commitment.crewIds
    .map((id) => state.crew.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  const muscle = committed.reduce((sum, c) => sum + c.skills.muscle, 0);
  if (muscle > 0) {
    playerTerms.push({ label: 'Crew muscle', contribution: muscle * tuning.BATTLE_MUSCLE_WEIGHT });
  }
  const loyalty = committed.reduce((sum, c) => sum + c.loyalty, 0);
  if (loyalty > 0) {
    playerTerms.push({ label: 'Crew resolve', contribution: loyalty * tuning.BATTLE_LOYALTY_WEIGHT });
  }

  // Firepower — each tier weighted, capped at what's actually on hand (so the
  // shown strength can never exceed what a resolve could spend).
  let armsContribution = 0;
  for (const tier of Object.keys(tuning.BATTLE_ARMS_TIER_WEIGHT) as WeaponTierId[]) {
    const have = state.armory[tier] ?? 0;
    const want = Math.max(0, Math.floor(commitment.arms[tier] ?? 0));
    const units = Math.min(have, want);
    armsContribution += units * tuning.BATTLE_ARMS_TIER_WEIGHT[tier];
  }
  if (armsContribution > 0) {
    playerTerms.push({ label: 'Firepower', contribution: armsContribution });
  }

  // Guards defending the ground (not double-counting anyone already committed).
  const committedIds = new Set(commitment.crewIds);
  const guardMuscle = guardsInCountry(state, war.countryId)
    .filter((id) => !committedIds.has(id))
    .map((id) => state.crew.find((c) => c.id === id)?.skills.muscle ?? 0)
    .reduce((sum, m) => sum + m, 0);
  if (guardMuscle > 0) {
    playerTerms.push({ label: 'Guards', contribution: guardMuscle * tuning.BATTLE_GUARD_WEIGHT });
  }

  // Standing official protection — the good answer to a Politician's cold war.
  const protections =
    (hasPoliticalProtection(state) ? 1 : 0) + (hasCustomsProtection(state) ? 1 : 0);
  if (protections > 0) {
    playerTerms.push({
      label: 'Officials on payroll',
      contribution: protections * tuning.BATTLE_OFFICIAL_WEIGHT,
    });
  }

  const playerStrength = playerTerms.reduce((s, t) => s + t.contribution, 0);

  // Rival side.
  const rival = findRival(state, war.rivalId);
  const aggression = rival?.aggression ?? 0.5;
  const reach = rival?.reach ?? 0.5;
  const tension = rivalTension(state, war.rivalId);
  const kindMult = tuning.KIND_RIVAL_MULTIPLIER[war.kind];
  const rivalTerms: StrengthTerm[] = [
    { label: 'Base', contribution: tuning.BATTLE_BASE_STRENGTH },
    { label: 'Aggression', contribution: aggression * tuning.RIVAL_AGGRESSION_WEIGHT * kindMult },
    { label: 'Reach', contribution: reach * tuning.RIVAL_REACH_WEIGHT * kindMult },
    { label: 'Tension', contribution: tension * tuning.RIVAL_TENSION_WEIGHT * kindMult },
  ];
  const rivalStrength = rivalTerms.reduce((s, t) => s + t.contribution, 0);

  const raw = playerStrength / (playerStrength + rivalStrength);
  const winChance = clamp(raw, tuning.BATTLE_WIN_CHANCE_MIN, tuning.BATTLE_WIN_CHANCE_MAX);

  return { playerTerms, rivalTerms, playerStrength, rivalStrength, winChance };
}

// --- Opening a war -------------------------------------------------------------

function queue(state: GameState, kind: string, summary: string): GameState {
  const choice: PendingChoice = {
    id: `${kind}-${state.clock.hours}-${state.turfWars.length}`,
    kind,
    summary,
    createdAtHours: state.clock.hours,
  };
  return { ...state, pendingChoices: [...state.pendingChoices, choice] };
}

export interface OpenWarResult {
  readonly state: GameState;
  readonly war?: TurfWar;
  readonly rejected?:
    | 'country-not-held'
    | 'already-at-war'
    | 'rival-unknown'
    | 'rival-toppled'
    | 'max-wars';
}

/**
 * Open a turf war over a held country. Applies the one-time ignition heat and
 * queues the telegraph. Shared by rival ignition (`turfWarStep`) and the player's
 * offensive `declareWar` (which charges the money/heat first). Pure.
 */
export function openTurfWar(
  state: GameState,
  countryId: string,
  rivalId: string,
  initiatedBy: 'rival' | 'player',
): OpenWarResult {
  if (!state.stashes.some((s) => s.countryId === countryId)) {
    return { state, rejected: 'country-not-held' };
  }
  if (warForCountry(state, countryId)) return { state, rejected: 'already-at-war' };
  if (state.turfWars.length >= state.config.turfWar.MAX_ACTIVE_WARS) {
    return { state, rejected: 'max-wars' };
  }
  const rival = findRival(state, rivalId);
  if (!rival) return { state, rejected: 'rival-unknown' };
  if (state.rivals.find((r) => r.id === rivalId)?.toppled) {
    return { state, rejected: 'rival-toppled' };
  }

  const war: TurfWar = {
    id: `war-${countryId}-${rivalId}-${state.clock.hours}`,
    countryId,
    rivalId,
    kind: kindForArchetype(rival.archetypeId),
    initiatedBy,
    startedAtHours: state.clock.hours,
    pressure: 0,
    lossCount: 0,
    tributeActive: false,
    repEarned: 0,
  };

  let next: GameState = { ...state, turfWars: [...state.turfWars, war] };
  next = addHeat(next, state.config.turfWar.IGNITION_HEAT, 'turf-war.open');
  const place = getCountry(countryId).name;
  const summary =
    initiatedBy === 'player'
      ? `You made your move on ${rival.name}'s people in ${place}. It's a war now.`
      : `${rival.name} is moving on your ${place} operation. This is a turf war.`;
  next = queue(next, 'turf-war-open', summary);
  return { state: next, war };
}

// --- Player offense: declare war ----------------------------------------------

export interface DeclareWarResult {
  readonly state: GameState;
  readonly war?: TurfWar;
  readonly rejected?: OpenWarResult['rejected'] | 'cant-afford';
}

/** The up-front cost, $, to declare war on a rival — shown before the player
 * commits (fairness). A flat config cost; money is the gate. */
export function declareWarCost(state: GameState): number {
  return state.config.turfWar.DECLARE_WAR_COST;
}

/**
 * Go on the offensive: pay the up-front cost from clean cash, take the
 * conspicuous heat, and open a `player`-initiated war (winning it can TOPPLE the
 * rival). Rejects without mutating if the player can't afford it.
 */
export function declareWar(
  state: GameState,
  countryId: string,
  rivalId: string,
): DeclareWarResult {
  const cost = declareWarCost(state);
  if (state.cleanCash < cost) return { state, rejected: 'cant-afford' };

  const opened = openTurfWar(state, countryId, rivalId, 'player');
  if (!opened.war) return { state, rejected: opened.rejected };

  const charged: GameState = { ...opened.state, cleanCash: opened.state.cleanCash - cost };
  const withHeat = addHeat(charged, state.config.turfWar.DECLARE_WAR_HEAT, 'turf-war.declare');
  return { state: withHeat, war: opened.war };
}

// --- Rewards (design/15 Workstream A — winning has to PAY) ----------------------

const dollars = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * The weapon units a WON battle captures from the rival — deterministic, no
 * roll: the war kind's `CAPTURE_UNITS_BY_KIND` table scaled by the rival's
 * aggression (an aggressive rival fields more guns), rounded, floored at 0.
 * The single source for both the resolve path and the UI preview (shown =
 * applied). Pure.
 */
export function battleCapture(
  state: GameState,
  war: TurfWar,
  tuning: TurfWarTuning = state.config.turfWar,
): Readonly<Partial<Record<WeaponTierId, number>>> {
  const aggression = findRival(state, war.rivalId)?.aggression ?? 0.5;
  const scale = 1 + (aggression - 0.5) * tuning.CAPTURE_AGGRESSION_SCALE;
  const table = tuning.CAPTURE_UNITS_BY_KIND[war.kind];
  const capture: Partial<Record<WeaponTierId, number>> = {};
  for (const [tier, base] of Object.entries(table) as [WeaponTierId, number][]) {
    const units = Math.max(0, Math.round(base * scale));
    if (units > 0) capture[tier] = units;
  }
  return capture;
}

/**
 * The DIRTY cash a topple seizes from the broken rival's operation — scaled by
 * their traits so the scariest rivals are the richest prizes ($150k–$500k band,
 * roughly recouping `DECLARE_WAR_COST`). Lands in the contested country's stash
 * (their money is never clean — it feeds the wash pipeline). Not farmable:
 * rivals are finite per run and topple is permanent. Pure.
 */
export function toppleSpoils(
  state: GameState,
  rivalId: string,
  tuning: TurfWarTuning = state.config.turfWar,
): number {
  const rival = findRival(state, rivalId);
  const reach = rival?.reach ?? 0.5;
  const aggression = rival?.aggression ?? 0.5;
  return Math.round(
    tuning.TOPPLE_SPOILS_BASE *
      (1 + reach * tuning.TOPPLE_REACH_WEIGHT + aggression * tuning.TOPPLE_AGGRESSION_WEIGHT),
  );
}

/** Street rep the NEXT won battle in this war would pay — `BATTLE_WIN_REP`
 * clamped by what the war has already paid (`WIN_REP_CAP_PER_WAR`). Pure. */
export function winRepAvailable(
  state: GameState,
  war: TurfWar,
  tuning: TurfWarTuning = state.config.turfWar,
): number {
  return clamp(tuning.WIN_REP_CAP_PER_WAR - war.repEarned, 0, tuning.BATTLE_WIN_REP);
}

/** Add captured units to the armory (immutably; missing tiers default to 0). */
function addToArmory(
  armory: Armory,
  capture: Readonly<Partial<Record<WeaponTierId, number>>>,
): Armory {
  const next = { ...armory };
  for (const [tier, units] of Object.entries(capture) as [WeaponTierId, number][]) {
    next[tier] = (next[tier] ?? 0) + units;
  }
  return next;
}

/** Deposit dirty cash into the country's (first) stash — located, like street
 * proceeds. A war only exists over a held country, so a stash is there. */
function depositDirty(state: GameState, countryId: string, amount: number): GameState {
  const target = state.stashes.find((s) => s.countryId === countryId) ?? state.stashes[0];
  if (!target || amount <= 0) return state;
  return {
    ...state,
    stashes: state.stashes.map((s) =>
      s.id === target.id ? { ...s, dirtyCash: s.dirtyCash + amount } : s,
    ),
  };
}

/** "2 rifles and 1 military-grade" — the haul, named for the outcome scene. */
function describeCapture(capture: Readonly<Partial<Record<WeaponTierId, number>>>): string {
  const parts = (Object.entries(capture) as [WeaponTierId, number][]).map(
    ([tier, units]) => `${units} ${getWeaponTier(tier).name.toLowerCase()}`,
  );
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// --- Resolving a battle --------------------------------------------------------

export interface BattleResult {
  readonly state: GameState;
  readonly rejected?: 'no-war';
  readonly won?: boolean;
  /** The chance that was shown AND rolled (fairness). */
  readonly winChance?: number;
  /** The war ended in peace this battle (won past the resolve threshold). */
  readonly warEnded?: boolean;
  /** An offensive win toppled the rival for the rest of the run. */
  readonly toppled?: boolean;
  /** A loss past the terminal rung pushed the player out of the country. */
  readonly seizedCountry?: boolean;
  /** Weapon units captured from the rival on a win (design/15 A1). */
  readonly captured?: Readonly<Partial<Record<WeaponTierId, number>>>;
  /** Dirty spoils a topple seized into the contested country's stash (A2). */
  readonly spoils?: number;
  /** Street rep this win paid, after the per-war cap (A3). */
  readonly repGained?: number;
}

/** The independent per-battle RNG stream — deterministic per run, per war, per
 * attempt (lossCount + hours advance between fights), and never touches the main
 * deal/raid stream. */
function battleRng(state: GameState, war: TurfWar): Rng {
  return createRng(
    `${state.world.eventSeed}::turf-war::${war.id}::${war.lossCount}::${state.clock.hours}`,
  );
}

function removeWar(state: GameState, warId: string): GameState {
  return { ...state, turfWars: state.turfWars.filter((w) => w.id !== warId) };
}

function updateWar(state: GameState, warId: string, patch: Partial<TurfWar>): GameState {
  return {
    ...state,
    turfWars: state.turfWars.map((w) => (w.id === warId ? { ...w, ...patch } : w)),
  };
}

/** Seize the contested country: the rival takes the ground — every stash there
 * (its stored dirty cash + inventory) is lost. NEVER the home country: your
 * base can't be taken, so a war there stays a drain, never a wipe. */
function seizeCountry(state: GameState, countryId: string): GameState {
  if (countryId === state.world.startingCountry.id) return state;
  return { ...state, stashes: state.stashes.filter((s) => s.countryId !== countryId) };
}

/**
 * Fight a battle in an active war. Consumes the committed weapons (win or lose),
 * rolls the SHOWN win chance from the independent stream, and applies the
 * outcome:
 *  - **Win** — pressure drops; at/below the resolve floor the war ENDS (an
 *    offensive win TOPPLES the rival); tribute clears.
 *  - **Loss** — pressure climbs, a crew casualty takes a loyalty hit, heat +
 *    street-rep bruise, tribute switches on; only past BOTH the pressure and
 *    loss-count thresholds does the rival seize the country (recoverable until
 *    then). Every branch queues a telegraph.
 *
 * `rng` is injectable for tests; production passes the derived `battleRng`.
 */
export function resolveBattle(
  state: GameState,
  warId: string,
  commitment: BattleCommitment = NO_COMMITMENT,
  rng?: Rng,
): BattleResult {
  const war = state.turfWars.find((w) => w.id === warId);
  if (!war) return { state, rejected: 'no-war' };

  const cfg = state.config.turfWar;
  const { winChance } = battleStrength(state, war, commitment, cfg);

  // Spend firepower first — arms are consumed whether the fight is won or lost.
  const { armory } = spendArmory(state.armory, commitment.arms);
  let next: GameState = { ...state, armory: armory as Armory };

  const draw = (rng ?? battleRng(state, war)).next();
  const won = draw < winChance;
  const place = getCountry(war.countryId).name;
  const rival = findRival(state, war.rivalId);
  const rivalName = rival?.name ?? 'The rival';

  if (won) {
    // Rewards (design/15 A) — captured arms + capped street rep on EVERY won
    // battle, applied before the telegraph so the summary names what landed.
    const captured = battleCapture(state, war, cfg);
    next = { ...next, armory: addToArmory(next.armory, captured) };
    const repGained = winRepAvailable(state, war, cfg);
    if (repGained > 0) {
      next = {
        ...next,
        reputation: { ...next.reputation, street: next.reputation.street + repGained },
      };
    }
    const haul = describeCapture(captured);
    const haulNote = haul ? ` You took their guns — ${haul}.` : '';

    const pressure = Math.max(0, war.pressure - cfg.BATTLE_WIN_PRESSURE_DROP);
    if (pressure <= cfg.WAR_RESOLVED_PRESSURE) {
      next = removeWar(next, warId);
      let toppled = false;
      let spoils: number | undefined;
      if (war.initiatedBy === 'player') {
        toppled = true;
        next = {
          ...next,
          rivals: next.rivals.map((r) =>
            r.id === war.rivalId ? { ...r, toppled: true, tension: 0 } : r,
          ),
        };
        // Topple spoils — a cut of the broken rival's operation, seized DIRTY
        // into the contested country's stash (their money is never clean).
        spoils = toppleSpoils(state, war.rivalId, cfg);
        next = depositDirty(next, war.countryId, spoils);
      }
      next = queue(
        next,
        'turf-war-won',
        toppled
          ? `You broke ${rivalName} for good. ${place} is yours, and their operation pays: ${dollars(spoils ?? 0)} dirty, seized on the ground.${haulNote}`
          : `You pushed ${rivalName} out of ${place}. The war's over.${haulNote}`,
      );
      return {
        state: next,
        won: true,
        winChance,
        warEnded: true,
        toppled,
        captured,
        repGained,
        ...(spoils !== undefined ? { spoils } : {}),
      };
    }
    next = updateWar(next, warId, {
      pressure,
      tributeActive: false,
      repEarned: war.repEarned + repGained,
    });
    next = queue(
      next,
      'turf-war-battle',
      `You won the block in ${place}. ${rivalName} falls back — for now.${haulNote}`,
    );
    return { state: next, won: true, winChance, captured, repGained };
  }

  // Loss.
  const pressure = Math.min(100, war.pressure + cfg.BATTLE_LOSS_PRESSURE_GAIN);
  const lossCount = war.lossCount + 1;
  next = addHeat(next, cfg.BATTLE_LOSS_HEAT, 'turf-war.loss');
  next = {
    ...next,
    reputation: {
      ...next.reputation,
      street: Math.max(0, next.reputation.street - cfg.BATTLE_LOSS_REP),
    },
  };
  // A casualty: the committed crew member with the most muscle took the worst of
  // it — a loyalty wound that ripples through the roster (a direct hit, with a
  // memory entry, since there's no "comrade fell" loyalty-event kind).
  next = applyCasualty(next, commitment, cfg.CASUALTY_LOYALTY_HIT);

  const canSeize =
    pressure >= cfg.PRESSURE_SEIZE_THRESHOLD && lossCount >= cfg.SEIZE_COUNTRY_AFTER_LOSSES;
  const isHome = war.countryId === state.world.startingCountry.id;

  if (canSeize && !isHome) {
    next = seizeCountry(next, war.countryId);
    next = removeWar(next, warId);
    next = queue(
      next,
      'turf-war-lost-country',
      `${rivalName} overran ${place}. You're out — the stash there is gone.`,
    );
    return { state: next, won: false, winChance, seizedCountry: true };
  }

  next = updateWar(next, warId, { pressure, lossCount, tributeActive: true });
  next = queue(
    next,
    'turf-war-battle',
    isHome && canSeize
      ? `${rivalName} is leaning hard on ${place}, but they can't take your home ground. The tribute bites.`
      : `You lost the block in ${place}. ${rivalName} is taxing the operation now.`,
  );
  return { state: next, won: false, winChance };
}

/** Apply the battle casualty — the highest-muscle committed member takes a fixed
 * loyalty hit, written to memory so the world remembers it (design/02 §3). */
function applyCasualty(
  state: GameState,
  commitment: BattleCommitment,
  hit: number,
): GameState {
  const committed = commitment.crewIds
    .map((id) => state.crew.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  if (committed.length === 0) return state;
  const casualty = committed.reduce((worst, c) =>
    c.skills.muscle > worst.skills.muscle ? c : worst,
  );
  // Route through the loyalty engine with a negative "shortchanged"-style hit,
  // then correct the magnitude to the configured casualty value — keeping the
  // memory-write and clamp behaviour while honouring the config number.
  const loyalty = Math.max(0, casualty.loyalty - hit);
  const memory = {
    atHours: state.clock.hours,
    kind: 'casualty',
    note: `${casualty.name} caught it in the fighting.`,
    delta: -hit,
  };
  const wounded = { ...casualty, loyalty, memoryLog: [...casualty.memoryLog, memory] };
  return { ...state, crew: state.crew.map((c) => (c.id === casualty.id ? wounded : c)) };
}

// --- Truce / appeasement -------------------------------------------------------

/** The lump sum, $, to sue for a full truce over a country — scales with what's
 * at stake there, floored so it's never trivial. Shown before committing. */
export function truceCost(state: GameState, countryId: string): number {
  const cfg = state.config.turfWar;
  return Math.max(cfg.TRUCE_COST_MIN, Math.round(countryStake(state, countryId) * cfg.TRUCE_COST_VALUE_MULTIPLE));
}

export interface TrucePayResult {
  readonly state: GameState;
  readonly rejected?: 'no-war' | 'cant-afford';
}

/** Sue for peace: pay the truce lump sum from clean cash and END the war
 * outright (tribute cleared). The clean, expensive exit. */
export function sueForTruce(state: GameState, warId: string): TrucePayResult {
  const war = state.turfWars.find((w) => w.id === warId);
  if (!war) return { state, rejected: 'no-war' };
  const cost = truceCost(state, war.countryId);
  if (state.cleanCash < cost) return { state, rejected: 'cant-afford' };
  let next: GameState = { ...state, cleanCash: state.cleanCash - cost };
  next = removeWar(next, warId);
  const place = getCountry(war.countryId).name;
  next = queue(next, 'turf-war-truce', `You bought peace in ${place}. The war's settled.`);
  return { state: next };
}

/** The appeasement payment, $, to buy breathing room WITHOUT ending the war —
 * cheaper than a truce; drops pressure but leaves the tax on. */
export function appeaseCost(state: GameState, countryId: string): number {
  const cfg = state.config.turfWar;
  return Math.max(
    Math.round(cfg.TRUCE_COST_MIN / 2),
    Math.round(countryStake(state, countryId) * cfg.TRIBUTE_PCT),
  );
}

/**
 * Pay tribute: appease the rival to drop the war's pressure back from the brink,
 * WITHOUT ending it. Cheaper than a truce, but the tax stays on (`tributeActive`)
 * and pressure will climb again. Buys time to muster real force.
 */
export function payTribute(state: GameState, warId: string): TrucePayResult {
  const war = state.turfWars.find((w) => w.id === warId);
  if (!war) return { state, rejected: 'no-war' };
  const cost = appeaseCost(state, war.countryId);
  if (state.cleanCash < cost) return { state, rejected: 'cant-afford' };
  const cfg = state.config.turfWar;
  const pressure = Math.max(0, war.pressure - cfg.BATTLE_WIN_PRESSURE_DROP);
  let next: GameState = { ...state, cleanCash: state.cleanCash - cost };
  next = updateWar(next, warId, { pressure, tributeActive: true });
  const place = getCountry(war.countryId).name;
  next = queue(next, 'turf-war-tribute', `You paid ${findRival(state, war.rivalId)?.name ?? 'them'} off. ${place} stays quiet — for a price.`);
  return { state: next };
}

// --- The tick step (active-only) ----------------------------------------------

/** Whether a country's foothold is still in its post-open vulnerability window
 * (fresh territory invites a move — reuses the territory window length). */
function countryVulnerable(state: GameState, countryId: string): boolean {
  const window = state.config.territory.VULNERABILITY_WINDOW_HOURS;
  return state.stashes.some(
    (s) =>
      s.countryId === countryId &&
      s.openedAtHours !== undefined &&
      state.clock.hours - s.openedAtHours < window,
  );
}

/** Region distance 0..1 between a rival's home region and a country's region —
 * a far-off rival's reach is discounted by geography at ignition. */
function rivalDistance(rival: Rival, countryId: string): number {
  const region = getCountry(countryId).region;
  return REGION_DISTANCE[rival.homeRegion][region];
}

/** Per-hour ignition likelihood for one (rival, country) pair, before the
 * dt-compounded roll. Reads the rival's aggression/reach, geography, and whether
 * the ground is freshly vulnerable. */
function ignitionRatePerHour(
  state: GameState,
  rival: Rival,
  countryId: string,
): number {
  const cfg = state.config.turfWar;
  const distance = rivalDistance(rival, countryId);
  const reachTerm = rival.reach * cfg.IGNITION_REACH_WEIGHT * (1 - distance);
  const aggrTerm = rival.aggression * cfg.IGNITION_AGGRESSION_WEIGHT;
  const vulnTerm = countryVulnerable(state, countryId) ? cfg.IGNITION_VULNERABILITY_WEIGHT : 0;
  return cfg.IGNITION_RATE_PER_HOUR * (1 + aggrTerm + reachTerm + vulnTerm);
}

/** Passive tribute drain for a tributed war — TRIBUTE_PCT of the country's stake
 * per in-game week, pulled from CLEAN cash only (never stored stash cash — the
 * B2 guardrail), pro-rated over the tick. Active-only. */
function applyTribute(state: GameState, dtHours: number): GameState {
  let clean = state.cleanCash;
  for (const war of state.turfWars) {
    if (!war.tributeActive) continue;
    const perWeek = countryStake(state, war.countryId) * state.config.turfWar.TRIBUTE_PCT;
    const skim = Math.min(clean, (perWeek * dtHours) / HOURS_PER_WEEK);
    clean = Math.max(0, clean - skim);
  }
  return clean === state.cleanCash ? state : { ...state, cleanCash: clean };
}

/**
 * The `turf-war` tick step (clock.ts, active-only). In order: grow every active
 * war's pressure over the elapsed play time, skim any active tribute from clean
 * cash, then roll ONE possible new ignition from the independent run-seeded
 * stream (so the world never dogpiles more than one fresh war per tick, and the
 * roll never perturbs the deal/raid RNG). Offline never runs this — absence is
 * safe (GDD §6).
 */
export function turfWarStep(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const cfg = state.config.turfWar;

  // 1) Pressure growth on active wars.
  let next: GameState = {
    ...state,
    turfWars: state.turfWars.map((w) => ({
      ...w,
      pressure: Math.min(100, w.pressure + cfg.PRESSURE_GROWTH_PER_HOUR * dtHours),
    })),
  };

  // 2) Tribute drain (clean cash only).
  next = applyTribute(next, dtHours);

  // 3) Ignition — at most one new war per tick, once under the cap.
  if (next.turfWars.length < cfg.MAX_ACTIVE_WARS) {
    const rng = createRng(`${next.world.eventSeed}::turf-war-step::${next.clock.hours}`);
    const toppled = new Set(next.rivals.filter((r) => r.toppled).map((r) => r.id));
    const countries = heldCountries(next).filter((c) => ROSTER_COUNTRIES.has(c));
    outer: for (const rivalState of next.rivals) {
      if (toppled.has(rivalState.id)) continue;
      if (rivalState.tension < cfg.IGNITION_TENSION_THRESHOLD) continue;
      const rival = findRival(next, rivalState.id);
      if (!rival) continue;
      for (const countryId of countries) {
        if (warForCountry(next, countryId)) continue;
        const rate = ignitionRatePerHour(next, rival, countryId);
        const p = 1 - Math.pow(1 - clamp(rate, 0, 1), dtHours);
        if (rng.next() < p) {
          const opened = openTurfWar(next, countryId, rivalState.id, 'rival');
          if (opened.war) {
            next = opened.state;
            break outer; // one ignition per tick
          }
        }
      }
    }
  }

  return next;
}
