/**
 * The Crew screen's view-model (Prompt 17; design/07 §3, design/02 whole doc). PURE
 * read selectors that turn crew — **people, not stat lines** — into what the roster
 * and detail views render. The one inviolable rule (design/02 §1): loyalty is a
 * hidden 0–100 the UI NEVER sees. Every standing here comes from the engine's
 * `describeLoyalty` prose; this module exposes no numeric loyalty at all.
 *
 * Recruitment follows the same open-access reading the rest of the UI does (Ideas.md
 * — Drug Lord 2; the [[open-access-design]] rule that no prompt 15–28 adds a flag
 * gate): the full archetype roster is always offered, and you build it up one person
 * at a time by choosing who to bring on — the "one crew member first" of design/02
 * §5 falls out of starting empty, not a disclosure flag.
 *
 * The screen composes these selectors and dispatches crew intents through the store;
 * it authors no loyalty/skill math (README UI rule).
 */

import {
  CREW_ARCHETYPES,
  CREW_SKILLS,
  CREW_SKILL_MAX,
  COUNTRIES,
  FRONT_TYPES,
  TRAIN_COST,
  describeLoyalty,
  getProductionOp,
  shipmentRoute,
  type CrewMember,
  type CrewRole,
  type CrewSkill,
  type GameState,
  type ProductionOpId,
} from '@/engine';

/** Pips shown per skill — the "light stats only" dot track (design/07 §3). */
export const SKILL_DOTS = 4;

/**
 * The `paid` magnitude a detail-view "raise pay" gesture is worth (design/02 §4
 * intervention). A UI parameter to the engine's `paid` loyalty event — the engine
 * owns how it scales into loyalty; the screen never computes the shift itself.
 */
export const RAISE_PAY_AMOUNT = 20_000;

/** Human labels for roles (the engine keeps machine ids). */
const ROLE_LABEL: Readonly<Record<CrewRole, string>> = {
  runner: 'Runner',
  soldier: 'Soldier',
  lieutenant: 'Lieutenant',
  specialist: 'Specialist',
  family: 'Family',
};

/** Human labels for skills (matches the wireframe's "Deals / Muscle" copy). */
const SKILL_LABEL: Readonly<Record<CrewSkill, string>> = {
  deal: 'Deals',
  muscle: 'Muscle',
  tech: 'Tech',
  laundering: 'Laundering',
  driving: 'Driving',
};

export function roleLabel(role: CrewRole): string {
  return ROLE_LABEL[role];
}

/** Display name for a front's type id (tolerates an unknown id — falls back to it). */
function frontTypeName(type: string): string {
  return FRONT_TYPES.find((f) => f.id === type)?.name ?? type;
}

/** Filled pips for a 0–100 skill value on the `SKILL_DOTS` track. */
export function skillFilled(value: number): number {
  const per = CREW_SKILL_MAX / SKILL_DOTS;
  return Math.max(0, Math.min(SKILL_DOTS, Math.round(value / per)));
}

/** One skill rendered as a labelled dot track (never the raw number). */
export interface SkillDots {
  readonly skill: CrewSkill;
  readonly label: string;
  readonly filled: number;
  readonly total: number;
}

function dotsFor(member: CrewMember, skill: CrewSkill): SkillDots {
  return {
    skill,
    label: SKILL_LABEL[skill],
    filled: skillFilled(member.skills[skill]),
    total: SKILL_DOTS,
  };
}

/** Every skill as a dot track, in canonical order (the detail view). */
export function allSkillDots(member: CrewMember): readonly SkillDots[] {
  return CREW_SKILLS.map((s) => dotsFor(member, s));
}

/** The `n` strongest skills as dot tracks — the compact roster readout. */
export function topSkillDots(member: CrewMember, n = 2): readonly SkillDots[] {
  return [...CREW_SKILLS]
    .sort((a, b) => member.skills[b] - member.skills[a])
    .slice(0, n)
    .map((s) => dotsFor(member, s));
}

/** A readable "what they're doing right now" line for an assignment (design/07 §3). */
export function assignmentLabel(state: GameState, member: CrewMember): string {
  const a = member.assignment;
  switch (a.kind) {
    case 'idle':
      return 'Unassigned';
    case 'guard': {
      const stash = state.stashes.find((s) => s.id === a.targetId);
      return stash ? `Guarding ${stash.name}` : 'Guarding a stash';
    }
    case 'front': {
      const front = state.fronts.find((f) => f.id === a.targetId);
      return front ? `Running ${frontTypeName(front.type)}` : 'Running a front';
    }
    case 'territory': {
      const country = COUNTRIES.find((c) => c.id === a.targetId);
      return country ? `Holding ${country.name}` : 'Holding territory';
    }
    case 'deal-crew':
      return 'On the deal crew';
    case 'courier': {
      const shipment = state.shipments.find((s) => s.id === a.targetId);
      return shipment ? `Riding a shipment (${shipmentRoute(state, shipment)})` : 'Riding a shipment';
    }
    case 'production': {
      const op = state.productionOps.find((o) => o.id === a.targetId);
      return op
        ? `Running ${getProductionOp(op.type as ProductionOpId, state.config.production.PRODUCTION_OPS).name}`
        : 'Running a grow';
    }
  }
}

/** One roster row — a person, surfaced through behaviour (design/02 §1). */
export interface CrewRow {
  readonly id: string;
  readonly name: string;
  readonly role: CrewRole;
  readonly roleLabel: string;
  /** The ONLY loyalty surface — prose from `describeLoyalty`, never a number. */
  readonly loyaltyLine: string;
  readonly assignment: string;
  readonly skills: readonly SkillDots[];
  readonly isFamily: boolean;
  readonly isWire: boolean;
  /** True while a betrayal arc is telegraphing — the row flags a warning (design/02 §4). */
  readonly hasArc: boolean;
}

export function crewRoster(state: GameState): readonly CrewRow[] {
  return state.crew.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    roleLabel: ROLE_LABEL[m.role],
    loyaltyLine: describeLoyalty(m),
    assignment: assignmentLabel(state, m),
    skills: topSkillDots(m),
    isFamily: m.isFamily === true,
    isWire: m.isWire === true,
    hasArc: m.activeArc !== undefined,
  }));
}

/** An archetype the player can still bring on (not already on the roster). */
export interface RecruitOption {
  readonly archetypeId: string;
  readonly name: string;
  readonly role: CrewRole;
  readonly roleLabel: string;
  readonly bond: string;
}

/**
 * Everyone not yet recruited — the open-access roster of who you can bring on
 * (design/02 §5, read through open access). Named characters are unique, so an
 * archetype already on the crew drops out of the offer.
 */
export function recruitableArchetypes(state: GameState): readonly RecruitOption[] {
  const owned = new Set(state.crew.map((c) => c.archetypeId));
  return CREW_ARCHETYPES.filter((a) => !owned.has(a.id)).map((a) => ({
    archetypeId: a.id,
    name: a.name,
    role: a.role,
    roleLabel: ROLE_LABEL[a.role],
    bond: a.bond,
  }));
}

/** A memory entry ready to render — prose from the NPC's side (design/02 §3). */
export interface MemoryLine {
  readonly atHours: number;
  readonly kind: string;
  readonly note: string;
  /** Whether the remembered event cooled loyalty (a grievance) — for emphasis only. */
  readonly grievance: boolean;
}

/** A front a promotion can delegate to a lieutenant (design/02 §5). */
export interface PromoteFront {
  readonly frontId: string;
  readonly name: string;
}

/** A train option for one skill — priced, with why it might be unavailable. */
export interface TrainOption {
  readonly skill: CrewSkill;
  readonly label: string;
  readonly cost: number;
  /** Already at the cap — training is rejected (design/02 §5). */
  readonly maxed: boolean;
  /** Cap reached OR clean cash short. */
  readonly disabled: boolean;
}

/** The tap-through detail (design/07 §3): the person, their memory, their arc. */
export interface CrewDetailView {
  readonly member: CrewMember;
  readonly roleLabel: string;
  readonly loyaltyLine: string;
  readonly assignment: string;
  readonly bond: string;
  readonly skills: readonly SkillDots[];
  /** Newest-first memory log — what they remember you did (design/02 §3). */
  readonly memory: readonly MemoryLine[];
  /** The current betrayal-arc sign as prose, when an arc is live (design/02 §4). */
  readonly arcSign: string | null;
  readonly arcStage: string | null;
  readonly isFamily: boolean;
  readonly isWire: boolean;
  readonly trainOptions: readonly TrainOption[];
  /** Fronts a promotion can be delegated to (empty ⇒ promotion unavailable). */
  readonly promoteFronts: readonly PromoteFront[];
  /** Whether a promotion makes sense (not already a lieutenant/family). */
  readonly canPromote: boolean;
  /** The player's clean cash — for enabling paid actions in the view. */
  readonly cleanCash: number;
}

/** Build the detail view for one crew member, or `null` if they're gone. */
export function crewDetail(state: GameState, id: string): CrewDetailView | null {
  const member = state.crew.find((c) => c.id === id);
  if (!member) return null;

  const memory: MemoryLine[] = [...member.memoryLog]
    .reverse()
    .map((m) => ({ atHours: m.atHours, kind: m.kind, note: m.note, grievance: m.delta < 0 }));

  const promoteFronts: PromoteFront[] = state.fronts.map((f) => ({
    frontId: f.id,
    name: frontTypeName(f.type),
  }));

  const trainOptions: TrainOption[] = CREW_SKILLS.map((skill) => {
    const maxed = member.skills[skill] >= CREW_SKILL_MAX;
    return {
      skill,
      label: SKILL_LABEL[skill],
      cost: TRAIN_COST,
      maxed,
      disabled: maxed || state.cleanCash < TRAIN_COST,
    };
  });

  return {
    member,
    roleLabel: ROLE_LABEL[member.role],
    loyaltyLine: describeLoyalty(member),
    assignment: assignmentLabel(state, member),
    bond: member.bond,
    skills: allSkillDots(member),
    memory,
    arcSign: member.activeArc?.sign ?? null,
    arcStage: member.activeArc?.stage ?? null,
    isFamily: member.isFamily === true,
    isWire: member.isWire === true,
    trainOptions,
    promoteFronts,
    canPromote: member.role !== 'lieutenant' && member.role !== 'family',
    cleanCash: state.cleanCash,
  };
}
