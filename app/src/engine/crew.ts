/**
 * The relatedness engine — crew as **people you care about or hate**, not stat
 * lines (design/02 whole doc; GDD §4.3, §5.1). Three laws drive everything here:
 *
 *  1. **Hide the number, surface behavior.** Loyalty is 0–100 and hidden; the UI
 *     only ever sees `describeLoyalty`'s prose ("Marco's been quiet since you
 *     passed him over"), never `58/100` (design/02 §1).
 *  2. **The world remembers.** Every loyalty shift writes a `MemoryEntry`; later
 *     dialogue/loyalty checks read the log, so a betrayed character never acts as
 *     if the wrong didn't happen (design/02 §3 consistency law).
 *  3. **Betrayal is a story beat, not a dice roll.** When loyalty + a buyable
 *     agenda + a grievance align, a betrayal ARC begins and steps
 *     `warning → point-of-no-return → flipped` ONE readable stage at a time — and
 *     any positive treatment walks it back. There is **no randomness anywhere in
 *     this module** (design/02 §4, Sid Meier's estimable-but-fair tension). A full
 *     flip turns the crew member into a wire feeding heat/LE (Prompt 05/09).
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in →
 * new state out, no `Math.random`, no wall clock. `advanceBetrayalArcs` +
 * `applyWireHeat` are the active-only tick step registered in `clock.ts`; offline
 * never runs them, so absence never advances an arc or a wire's heat (GDD §6).
 */

import { addHeat } from './heat';
import { setStashGuard } from './storage';
import {
  BETRAYAL_FLIP_LOYALTY,
  BETRAYAL_PONR_LOYALTY,
  BETRAYAL_PRONE_AGENDAS,
  BETRAYAL_WARNING_LOYALTY,
  CREW_LOYALTY_MAX,
  CREW_LOYALTY_MIN,
  CREW_SKILL_MAX,
  CREW_SKILLS,
  LOYALTY_DOLLARS_PER_POINT,
  LOYALTY_EVENT_BASE,
  LOYALTY_PAY_POINT_CAP,
  TRAIT_EVENT_MULTIPLIER,
  emptyCrewSkills,
  findCrewArchetype,
  getCrewArchetype,
  type CrewAgenda,
  type CrewSkill,
  type LoyaltyEventKind,
} from './config/crew';
import type { CrewTuning } from './config';
import type {
  BetrayalArc,
  BetrayalStage,
  CrewAssignment,
  CrewMember,
  GameState,
  MemoryEntry,
  PendingChoice,
} from './state';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function findCrew(state: GameState, id: string): CrewMember | null {
  return state.crew.find((c) => c.id === id) ?? null;
}

function withCrew(state: GameState, next: CrewMember): GameState {
  return { ...state, crew: state.crew.map((c) => (c.id === next.id ? next : c)) };
}

// --- Spawning / recruitment (design/02 §5) -----------------------------------

/**
 * Build a full `CrewMember` from a config archetype (design/02 §7). `overrides`
 * let callers pin an id or seed loyalty; unset fields take the archetype's values.
 */
export function spawnCrew(
  archetypeId: string,
  overrides: Partial<CrewMember> = {},
): CrewMember {
  const a = getCrewArchetype(archetypeId);
  const base: CrewMember = {
    id: `crew-${a.id}`,
    archetypeId: a.id,
    name: a.name,
    role: a.role,
    traits: a.traits,
    skills: a.skills,
    loyalty: a.startingLoyalty,
    bond: a.bond,
    agenda: a.agenda,
    memoryLog: [],
    assignment: { kind: 'idle' },
    ...(a.isFamily ? { isFamily: true } : {}),
  };
  return { ...base, ...overrides };
}

/**
 * Upgrade a legacy `{ id, name, loyalty }` crew stub (schema < 5) to the full
 * relatedness model with neutral defaults, preserving its loyalty. Only ever hit
 * by the 4→5 save migration; pre-Prompt-08 runs never seeded crew, so this is
 * usually unused. A `just-survive` agenda keeps a rehydrated stub off the
 * betrayal path (it has no buyable ambition).
 */
export function hydrateLegacyCrew(legacy: {
  readonly id: string;
  readonly name: string;
  readonly loyalty: number;
}): CrewMember {
  return {
    id: legacy.id,
    archetypeId: legacy.id,
    name: legacy.name,
    role: 'soldier',
    traits: [],
    skills: emptyCrewSkills(),
    loyalty: legacy.loyalty,
    bond: '',
    agenda: 'just-survive',
    memoryLog: [],
    assignment: { kind: 'idle' },
  };
}

export interface RecruitResult {
  readonly state: GameState;
  readonly crew: CrewMember;
}

/**
 * Recruit a crew member from `archetypeId` (design/02 §5). Ids stay unique across
 * repeat recruits of the same archetype. The onboarding gate that introduces
 * exactly ONE crew first (design/02 §5) lives in the UI/onboarding prompt; the
 * engine just adds who it's told to.
 */
export function recruit(state: GameState, archetypeId: string): RecruitResult {
  const nOwned = state.crew.filter((c) => c.archetypeId === archetypeId).length;
  const id = nOwned === 0 ? `crew-${archetypeId}` : `crew-${archetypeId}-${nOwned + 1}`;
  const crew = spawnCrew(archetypeId, { id });
  return { state: { ...state, crew: [...state.crew, crew] }, crew };
}

/** Remove a crew member (fire / lose them) and clear any stash they guarded. */
export function dismiss(state: GameState, npcId: string): GameState {
  if (!state.crew.some((c) => c.id === npcId)) return state;
  const stashes = state.stashes.map((s) => {
    if (s.guardCrewId !== npcId) return s;
    const { guardCrewId: _drop, ...rest } = s;
    return rest;
  });
  return { ...state, crew: state.crew.filter((c) => c.id !== npcId), stashes };
}

// --- Memory (design/02 §3 — the world remembers) -----------------------------

/** Append a memory entry to a crew member (pure). */
export function recordMemory(npc: CrewMember, entry: MemoryEntry): CrewMember {
  return { ...npc, memoryLog: [...npc.memoryLog, entry] };
}

/**
 * Read a crew member's memory — all entries, or just those of `kind`. Later
 * dialogue/loyalty checks call this so nothing acts as if a remembered wrong
 * didn't happen (design/02 §3).
 */
export function readsMemory(
  npc: CrewMember,
  kind?: string,
): readonly MemoryEntry[] {
  return kind ? npc.memoryLog.filter((m) => m.kind === kind) : npc.memoryLog;
}

/** Whether a crew member remembers an event of `kind` (a consistency check). */
export function hasMemoryOf(npc: CrewMember, kind: string): boolean {
  return npc.memoryLog.some((m) => m.kind === kind);
}

// --- Loyalty (design/02 §4 — multi-factor, never one lever) ------------------

/**
 * A thing you did to/for a crew member that shifts loyalty (design/02 §4). Pay
 * events scale by dollars; the rest are treatment/relationship beats. The union
 * is closed so trait fit and prose stay exhaustive.
 */
export type LoyaltyEvent =
  | { readonly kind: 'paid'; readonly amount: number }
  | { readonly kind: 'shortchanged'; readonly amount?: number }
  | { readonly kind: 'promoted' }
  | { readonly kind: 'passedOver' }
  | { readonly kind: 'sharedSuccess'; readonly magnitude?: number }
  | { readonly kind: 'tookTheFall' }
  | { readonly kind: 'protected' }
  | { readonly kind: 'confronted' }
  | { readonly kind: 'neglected' }
  /** Debt collectors leaned on them over YOUR marker (design/13 B3; Prompt 44). */
  | { readonly kind: 'leanedOn' };

/** The loyalty-model slice of `CrewTuning` the delta math reads. */
type LoyaltyTuning = Pick<
  CrewTuning,
  | 'LOYALTY_EVENT_BASE'
  | 'LOYALTY_DOLLARS_PER_POINT'
  | 'LOYALTY_PAY_POINT_CAP'
  | 'TRAIT_EVENT_MULTIPLIER'
>;

const DEFAULT_LOYALTY_TUNING: LoyaltyTuning = {
  LOYALTY_EVENT_BASE,
  LOYALTY_DOLLARS_PER_POINT,
  LOYALTY_PAY_POINT_CAP,
  TRAIT_EVENT_MULTIPLIER,
};

/** Loyalty points a `$amount` pay/short is worth, capped (pay is felt, not decisive). */
function payPoints(amount: number, tuning: LoyaltyTuning): number {
  return clamp(
    amount / tuning.LOYALTY_DOLLARS_PER_POINT,
    0,
    tuning.LOYALTY_PAY_POINT_CAP,
  );
}

/** Product of every trait's multiplier for this event kind (absent → ×1). */
function traitMultiplier(
  traits: CrewMember['traits'],
  kind: LoyaltyEventKind,
  tuning: LoyaltyTuning,
): number {
  let m = 1;
  for (const t of traits) {
    const f = tuning.TRAIT_EVENT_MULTIPLIER[t][kind];
    if (f !== undefined) m *= f;
  }
  return m;
}

/**
 * The signed loyalty delta for an event on `npc` — the multi-factor model
 * (design/02 §4): a pay/treatment/success BASE, scaled by the event's magnitude
 * and multiplied by **trait fit**. So the SAME event moves two crew differently
 * (an ambitious lieutenant passed over drops far more than a content runner), and
 * pay alone never decides it. Pure; no clamping (the caller clamps loyalty).
 */
export function loyaltyDeltaValue(
  npc: CrewMember,
  event: LoyaltyEvent,
  tuning: LoyaltyTuning = DEFAULT_LOYALTY_TUNING,
): number {
  let base: number;
  switch (event.kind) {
    case 'paid':
      base = payPoints(event.amount, tuning);
      break;
    case 'shortchanged':
      base = -(event.amount !== undefined
        ? payPoints(event.amount, tuning)
        : Math.abs(tuning.LOYALTY_EVENT_BASE.shortchanged));
      break;
    case 'sharedSuccess':
      base = tuning.LOYALTY_EVENT_BASE.sharedSuccess * (event.magnitude ?? 1);
      break;
    default:
      base = tuning.LOYALTY_EVENT_BASE[event.kind];
  }
  return base * traitMultiplier(npc.traits, event.kind, tuning);
}

/** Prose for a memory entry, written from the NPC's side (design/02 §3). */
function noteFor(npc: CrewMember, event: LoyaltyEvent): string {
  const n = npc.name;
  switch (event.kind) {
    case 'paid':
      return `You looked after ${n} with a fair cut.`;
    case 'shortchanged':
      return `You shorted ${n} on the take.`;
    case 'promoted':
      return `You gave ${n} a seat at the table.`;
    case 'passedOver':
      return `You passed ${n} over for the promotion.`;
    case 'sharedSuccess':
      return `${n} shared in a big score with you.`;
    case 'tookTheFall':
      return `You left ${n} to take the fall.`;
    case 'protected':
      return `You put yourself on the line to protect ${n}.`;
    case 'confronted':
      return `You confronted ${n} and cleared the air.`;
    case 'neglected':
      return `You left ${n} sitting idle while others worked.`;
    case 'leanedOn':
      return `Collectors leaned on ${n} over your unpaid marker.`;
  }
}

export interface LoyaltyResult {
  readonly state: GameState;
  readonly crew: CrewMember | null;
  readonly delta: number;
  readonly memory?: MemoryEntry;
  readonly rejected?: 'no-crew';
}

/**
 * Apply a loyalty event to a crew member (design/02 §4): compute the multi-factor
 * delta, clamp loyalty to [0, 100], and **write a memory entry** for the shift
 * (every shift is remembered — §3). Does NOT advance the betrayal arc; that is
 * the telegraphed, one-stage-per-tick job of `advanceBetrayalArcs`, so a single
 * event can never jump a crew member straight to a flip.
 */
export function loyaltyDelta(
  state: GameState,
  npcId: string,
  event: LoyaltyEvent,
): LoyaltyResult {
  const npc = findCrew(state, npcId);
  if (!npc) return { state, crew: null, delta: 0, rejected: 'no-crew' };

  const delta = loyaltyDeltaValue(npc, event, state.config.crew);
  const loyalty = clamp(npc.loyalty + delta, CREW_LOYALTY_MIN, CREW_LOYALTY_MAX);
  const memory: MemoryEntry = {
    atHours: state.clock.hours,
    kind: event.kind,
    note: noteFor(npc, event),
    delta: round1(delta),
  };
  const next: CrewMember = { ...npc, loyalty, memoryLog: [...npc.memoryLog, memory] };
  return { state: withCrew(state, next), crew: next, delta, memory };
}

// --- Loyalty as prose (design/02 §1 — hide the number) -----------------------

/**
 * Describe a crew member's standing as PROSE — never the raw number (design/02
 * §1). Blends a loyalty bucket with their archetype's voice and, when they've
 * cooled, their most recent grievance ("Marco's been quiet since you passed him
 * over"). This is the ONLY loyalty surface the UI is allowed to show.
 */
export function describeLoyalty(npc: CrewMember): string {
  const dlg = findCrewArchetype(npc.archetypeId)?.dialogue;
  const n = npc.name;
  const L = npc.loyalty;

  if (npc.isWire) {
    return `${n} smiles and nods, but the warmth is gone. You can't shake the feeling you're being watched.`;
  }
  if (L >= 85) return `${n} is devoted to you. ${dlg?.loyal ?? ''}`.trim();
  if (L >= 68) return `${n} is solid — no drama, does the work, has your back.`;
  if (L >= 50) return `${n} is steady and professional. Hard to read, but reliable.`;
  if (L >= BETRAYAL_WARNING_LOYALTY) {
    return `${n} has cooled toward you lately. ${dlg?.wary ?? ''}`.trim();
  }
  if (L >= BETRAYAL_PONR_LOYALTY) {
    return `${n} is sullen and keeps their distance. ${dlg?.wary ?? ''}`.trim();
  }
  return `${n} barely looks at you anymore. ${dlg?.betrayal ?? ''}`.trim();
}

// --- Betrayal arc (design/02 §4 — telegraphed, deterministic) ----------------

/** Stage ladder, including the implicit `'none'` (no arc). Index gives ordering. */
const STAGE_LADDER: readonly (BetrayalStage | 'none')[] = [
  'none',
  'warning',
  'point-of-no-return',
  'flipped',
];

function stageIndex(stage: BetrayalStage | 'none'): number {
  return STAGE_LADDER.indexOf(stage);
}

function isBetrayalProne(agenda: CrewAgenda): boolean {
  return BETRAYAL_PRONE_AGENDAS.includes(agenda);
}

/** A grievance = at least one remembered wrong (a negative memory) — design/02 §4. */
function hasGrievance(npc: CrewMember): boolean {
  return npc.memoryLog.some((m) => m.delta < 0);
}

/**
 * The stage this crew member's loyalty + agenda + history POINT toward right now
 * (a pure query). Betrayal only opens for a buyable agenda that also carries a
 * grievance — so it's always a consequence of how you treated them, never a bolt
 * from the blue. The arc walks toward this target one step at a time.
 */
export function betrayalTarget(
  npc: CrewMember,
  thresholds?: Pick<
    CrewTuning,
    'BETRAYAL_WARNING_LOYALTY' | 'BETRAYAL_PONR_LOYALTY' | 'BETRAYAL_FLIP_LOYALTY'
  >,
): BetrayalStage | 'none' {
  if (npc.isWire) return 'flipped'; // a full flip is terminal (dismiss to be rid of them)
  if (!isBetrayalProne(npc.agenda) || !hasGrievance(npc)) return 'none';
  const L = npc.loyalty;
  if (L < (thresholds?.BETRAYAL_FLIP_LOYALTY ?? BETRAYAL_FLIP_LOYALTY)) return 'flipped';
  if (L < (thresholds?.BETRAYAL_PONR_LOYALTY ?? BETRAYAL_PONR_LOYALTY)) {
    return 'point-of-no-return';
  }
  if (L < (thresholds?.BETRAYAL_WARNING_LOYALTY ?? BETRAYAL_WARNING_LOYALTY)) {
    return 'warning';
  }
  return 'none';
}

/** The readable sign shown at each arc stage (design/02 §4 — signs are legible). */
function signFor(npc: CrewMember, stage: BetrayalStage): string {
  const dlg = findCrewArchetype(npc.archetypeId)?.dialogue;
  const n = npc.name;
  switch (stage) {
    case 'warning':
      return `${n} has been distant and short with you. ${dlg?.wary ?? ''}`.trim();
    case 'point-of-no-return':
      return `${n} has been seen meeting people they shouldn't. ${dlg?.betrayal ?? ''}`.trim();
    case 'flipped':
      return `${n} has flipped — they're a wire now, feeding the other side.`;
  }
}

/**
 * Step one crew member's betrayal arc AT MOST ONE stage toward its target
 * (design/02 §4). Advancing UP telegraphs the crossing as a readable
 * `PendingChoice`; reaching `flipped` marks them a wire (feeds heat via
 * `applyWireHeat`). Because it moves a single stage per call, `warning` always
 * precedes `point-of-no-return` always precedes the flip — and any positive
 * treatment (which raises loyalty, lowering the target) walks the arc back down
 * on the next evaluation: the intervention window at every stage. Fully
 * deterministic — no RNG.
 */
export function advanceBetrayalArc(state: GameState, npcId: string): GameState {
  const npc = findCrew(state, npcId);
  if (!npc) return state;

  const current = npc.activeArc?.stage ?? 'none';
  const target = betrayalTarget(npc, state.config.crew);
  const ci = stageIndex(current);
  const ti = stageIndex(target);
  if (ti === ci) return state; // stable — nothing to telegraph

  const dir = ti > ci ? 1 : -1;
  const nextStage = STAGE_LADDER[ci + dir]!;

  let updated: CrewMember;
  if (nextStage === 'none') {
    const { activeArc: _dropArc, ...rest } = npc;
    updated = rest;
  } else {
    const arc: BetrayalArc = {
      stage: nextStage,
      startedAtHours: npc.activeArc?.startedAtHours ?? state.clock.hours,
      advancedAtHours: state.clock.hours,
      sign: signFor(npc, nextStage),
    };
    updated = { ...npc, activeArc: arc };
    if (nextStage === 'flipped') updated = { ...updated, isWire: true };
  }

  let next = withCrew(state, updated);
  if (dir > 0) {
    const scene: PendingChoice = {
      id: `crew-arc-${npc.id}-${nextStage}-${state.clock.hours}`,
      kind: 'crew-betrayal',
      summary: nextStage === 'none' ? '' : signFor(npc, nextStage),
      createdAtHours: state.clock.hours,
    };
    next = { ...next, pendingChoices: [...next.pendingChoices, scene] };
  }
  return next;
}

/** Advance every crew member's betrayal arc one stage (the tick-step body). */
export function advanceBetrayalArcs(state: GameState): GameState {
  let next = state;
  for (const id of state.crew.map((c) => c.id)) {
    next = advanceBetrayalArc(next, id);
  }
  return next;
}

// --- Wires → heat (design/02 §4; Prompt 05/09) -------------------------------

/** Passive heat/hr from every flipped crew member acting as an embedded wire. */
export function wireHeatPerHour(state: GameState): number {
  return state.crew.filter((c) => c.isWire).length * state.config.crew.WIRE_HEAT_PER_HOUR;
}

/**
 * Apply flipped-wire heat over `dtHours` of ONLINE time (design/02 §4). Adds heat
 * only; registered active-only in `clock.ts`, so a wire never raises heat while
 * the player is away (GDD §6). A run with no wires is a no-op.
 */
export function applyWireHeat(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const heat = wireHeatPerHour(state) * dtHours;
  return heat > 0 ? addHeat(state, heat, 'crew.wire') : state;
}

/**
 * The crew tick step (registered active-only in `clock.ts`): advance betrayal
 * arcs one telegraphed stage, then apply any wire heat. Pure; no RNG, no wall
 * clock — offline never runs it.
 */
export function crewStep(state: GameState, dtHours: number): GameState {
  return applyWireHeat(advanceBetrayalArcs(state), dtHours);
}

// --- Development: train, promote, assign (design/02 §5) -----------------------

export type CrewRejectReason =
  | 'no-crew'
  | 'invalid-skill'
  | 'max-skill'
  | 'insufficient-funds'
  | 'invalid-target';

export interface TrainResult {
  readonly state: GameState;
  readonly crew: CrewMember | null;
  readonly rejected?: CrewRejectReason;
}

/**
 * Train a crew member's `skill` by a FIXED increment (design/02 §5 — a
 * deterministic competence track, GDD §5.3, not a gamble). Paid from clean cash.
 * Rejects without mutating on an unknown crew/skill, a maxed skill, or a shortfall.
 */
export function train(
  state: GameState,
  npcId: string,
  skill: CrewSkill,
): TrainResult {
  const npc = findCrew(state, npcId);
  if (!npc) return { state, crew: null, rejected: 'no-crew' };
  if (!CREW_SKILLS.includes(skill)) return { state, crew: npc, rejected: 'invalid-skill' };
  if (npc.skills[skill] >= CREW_SKILL_MAX) return { state, crew: npc, rejected: 'max-skill' };
  const cfg = state.config.crew;
  if (state.cleanCash < cfg.TRAIN_COST) {
    return { state, crew: npc, rejected: 'insufficient-funds' };
  }

  const raised = Math.min(CREW_SKILL_MAX, npc.skills[skill] + cfg.TRAIN_SKILL_GAIN);
  const next: CrewMember = { ...npc, skills: { ...npc.skills, [skill]: raised } };
  return {
    state: withCrew({ ...state, cleanCash: state.cleanCash - cfg.TRAIN_COST }, next),
    crew: next,
  };
}

/** Where a promotion delegates the new lieutenant (design/02 §5). */
export interface PromoteTarget {
  readonly kind: 'front' | 'territory';
  readonly targetId: string;
}

export interface PromoteResult {
  readonly state: GameState;
  readonly crew: CrewMember | null;
  readonly rejected?: CrewRejectReason;
}

/** Who else wanted that seat — the ambitious feel passed over (design/02 §4). */
function wantedThePromotion(npc: CrewMember): boolean {
  if (npc.role === 'lieutenant' || npc.role === 'family') return false;
  return (
    npc.traits.includes('ambitious') ||
    npc.agenda === 'wants-own-territory' ||
    npc.agenda === 'climb-the-ranks'
  );
}

/**
 * Promote a crew member to LIEUTENANT and delegate a front/territory they run
 * autonomously — idle delegation (design/02 §5). This is a multi-party beat: the
 * promoted member gains loyalty (a `promoted` event), while every OTHER ambitious
 * crew member feels `passedOver` (the danger combo, §4). A front delegation is
 * read by `laundering.ts` (a real output bonus); a territory is a forward hook.
 * Rejects without mutating on an unknown crew member or an unknown front.
 */
export function promote(
  state: GameState,
  npcId: string,
  target: PromoteTarget,
): PromoteResult {
  const npc = findCrew(state, npcId);
  if (!npc) return { state, crew: null, rejected: 'no-crew' };
  if (target.kind === 'front' && !state.fronts.some((f) => f.id === target.targetId)) {
    return { state, crew: npc, rejected: 'invalid-target' };
  }

  // The promotion itself — a strong positive treatment beat.
  let next = loyaltyDelta(state, npcId, { kind: 'promoted' }).state;

  const assignment: CrewAssignment = { kind: target.kind, targetId: target.targetId };
  const promoted: CrewMember = { ...findCrew(next, npcId)!, role: 'lieutenant', assignment };
  next = withCrew(next, promoted);

  // Everyone else who wanted the seat now carries a grievance (emergent conflict).
  for (const other of next.crew) {
    if (other.id === npcId || !wantedThePromotion(other)) continue;
    next = loyaltyDelta(next, other.id, { kind: 'passedOver' }).state;
  }

  return { state: next, crew: findCrew(next, npcId) };
}

/**
 * Set a crew member's assignment (design/02 §5). A `guard` assignment also wires
 * them into `storage.ts` as the stash's guard, so their loyalty flows into that
 * location's effective seizure % (design/09 A.3a — the inside job). No-op for an
 * unknown crew member.
 */
export function assign(
  state: GameState,
  npcId: string,
  assignment: CrewAssignment,
): GameState {
  const npc = findCrew(state, npcId);
  if (!npc) return state;
  let next = withCrew(state, { ...npc, assignment });
  if (assignment.kind === 'guard' && assignment.targetId !== undefined) {
    next = setStashGuard(next, assignment.targetId, npcId);
  }
  return next;
}

/**
 * The laundering bonus a promoted lieutenant running the front `frontId` adds
 * (design/02 §5). Read by `laundering.ts`, so promotion has a real, tested
 * economic effect. A flipped (wire) lieutenant contributes nothing. Returns 0
 * when no lieutenant runs the front — keeping a crew-less run's rates unchanged.
 */
export function frontLieutenantBonus(state: GameState, frontId: string): number {
  const running = state.crew.some(
    (c) =>
      c.role === 'lieutenant' &&
      !c.isWire &&
      c.assignment.kind === 'front' &&
      c.assignment.targetId === frontId,
  );
  return running ? state.config.crew.LIEUTENANT_FRONT_BONUS : 0;
}

/**
 * The yield bonus a promoted lieutenant running the production op `opId` adds
 * (Ideas2 item 3 crew delegation — "transfer a crew member to manage the grow").
 * Read by `production.ts`, so assigning a lieutenant has a real, tested effect;
 * unassigning (or a flip to a wire) restores the base yield. Reuses the SAME
 * `LIEUTENANT_FRONT_BONUS` and the SAME assignment machinery as the front
 * delegation (`assign(npc, { kind: 'production', targetId })`), so there is no new
 * randomness and no new gate. Returns 0 when no lieutenant runs the op.
 */
export function productionLieutenantBonus(state: GameState, opId: string): number {
  const running = state.crew.some(
    (c) =>
      c.role === 'lieutenant' &&
      !c.isWire &&
      c.assignment.kind === 'production' &&
      c.assignment.targetId === opId,
  );
  return running ? state.config.crew.LIEUTENANT_FRONT_BONUS : 0;
}
