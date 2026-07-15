/**
 * Crew & NPC roster — the relatedness engine's cast and tuning (design/02 whole
 * doc; GDD §4.3, §5.1). Crew are **people you care about or hate**, not stat
 * lines: each archetype carries traits, skills, a HIDDEN agenda, a shared-history
 * bond, and seed dialogue. Loyalty is surfaced through prose/behavior (never a
 * bar), memory ripples earlier choices forward, and betrayal is a telegraphed
 * story arc — the numbers below are the levers that make those things legible.
 *
 * These are v1 tuning HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"; Prompt 26 centralizes). Ship a
 * SMALL subset done well (design/02 §7): ~6 crew archetypes + one family/personal
 * high-stakes relationship, one betrayal arc. Large rosters / deep skill trees
 * are deferred until the core loop proves out in playtest.
 *
 * The engine (`crew.ts`) is pure/deterministic: betrayal uses NO randomness at
 * all — it is a readable consequence of loyalty + agenda + how you treated them
 * (design/02 §4, Sid Meier's estimable-but-fair tension). Nothing here rolls dice.
 */

// --- Vocabulary --------------------------------------------------------------

/** Skills drive assignment effectiveness (design/02 §1). Each is 0–100. */
export type CrewSkill = 'deal' | 'muscle' | 'tech' | 'laundering' | 'driving';
export const CREW_SKILLS: readonly CrewSkill[] = [
  'deal',
  'muscle',
  'tech',
  'laundering',
  'driving',
] as const;

/** A full skill sheet — every skill present (0 if untrained). */
export type CrewSkills = Readonly<Record<CrewSkill, number>>;

/**
 * Personality traits (2–4 per crew) — the behavior/story drivers (design/02 §1,
 * §6). Traits, not levers, decide how a crew member *reads* the same treatment:
 * an `ambitious` runner resents being passed over; a `greedy` one lives on pay.
 */
export type CrewTrait =
  | 'greedy'
  | 'loyal-to-a-fault'
  | 'hot-headed'
  | 'ambitious'
  | 'cautious'
  | 'family-first'
  | 'proud'
  | 'calculating';

/** Hidden goal — the emergent-conflict seed the player INFERS (design/02 §6). */
export type CrewAgenda =
  | 'wants-own-territory'
  | 'wants-respect'
  | 'in-it-for-money'
  | 'protect-family'
  | 'climb-the-ranks'
  | 'just-survive';

/** Where a crew member sits in the org (design/02 §5). `family` is off-ladder. */
export type CrewRole = 'runner' | 'soldier' | 'lieutenant' | 'specialist' | 'family';

/** Seed dialogue lines — surfaced by state, the voice behind the prose (design/02 §2). */
export interface CrewDialogue {
  /** Everyday line when things are fine. */
  readonly greeting: string;
  /** Line that colors high-loyalty prose. */
  readonly loyal: string;
  /** Line that colors a wary / grievance state. */
  readonly wary: string;
  /** Line at the point of no return — the telegraphed betrayal voice. */
  readonly betrayal: string;
}

/** A fully-realized crew template (design/02 §7 MVP roster). */
export interface CrewArchetype {
  readonly id: string;
  readonly name: string;
  readonly role: CrewRole;
  readonly traits: readonly CrewTrait[];
  readonly skills: CrewSkills;
  /** Hidden goal — never shown as a label; implied through behavior (design/02 §6). */
  readonly agenda: CrewAgenda;
  /** Shared history with the player — the perspective-taking hook (design/02 §2). */
  readonly bond: string;
  /** Where loyalty starts (0–100, hidden). */
  readonly startingLoyalty: number;
  readonly dialogue: CrewDialogue;
  /** The family/personal high-stakes relationship (exactly one — design/02 §7). */
  readonly isFamily?: boolean;
}

/** Build a full skill sheet from a sparse spec (unlisted skills default to `base`). */
function skills(spec: Partial<CrewSkills>, base = 10): CrewSkills {
  const sheet = {} as Record<CrewSkill, number>;
  for (const s of CREW_SKILLS) sheet[s] = spec[s] ?? base;
  return sheet;
}

/** An all-zero skill sheet (every skill present at 0) — for hydrating stubs. */
export function emptyCrewSkills(): CrewSkills {
  return skills({}, 0);
}

// --- The MVP roster (design/02 §7) -------------------------------------------

/**
 * ~6 crew archetypes + one family relationship, each with traits + memory hooks
 * and a legible path into the single betrayal arc. Agendas are left as *implied*
 * gaps (design/02 §6): the player infers "Marco wants his own territory" from how
 * he behaves when passed over, we never print it. Deliberately small.
 */
export const CREW_ARCHETYPES: readonly CrewArchetype[] = [
  {
    id: 'deon',
    name: 'Deon',
    role: 'runner',
    traits: ['loyal-to-a-fault', 'cautious'],
    skills: skills({ driving: 55, deal: 35 }),
    agenda: 'just-survive',
    bond: 'Came up with you on the same block; ran your first package on trust alone.',
    startingLoyalty: 72,
    dialogue: {
      greeting: '"Say the word, boss. I got you."',
      loyal: '"We started with nothing. I ain\'t going nowhere."',
      wary: '"...You left me out there in Kingston. I remember that."',
      betrayal: '"I never wanted this. But you made me a ghost out here."',
    },
  },
  {
    id: 'marco',
    name: 'Marco',
    role: 'lieutenant',
    traits: ['ambitious', 'proud', 'calculating'],
    skills: skills({ deal: 70, laundering: 45, tech: 30 }),
    agenda: 'wants-own-territory',
    bond: 'Built the east-side routes for you and expects a seat at the table for it.',
    startingLoyalty: 58,
    dialogue: {
      greeting: '"I\'ve got moves lined up. When do I get to run them?"',
      loyal: '"Give me a territory and I\'ll double it. You know I\'m good for it."',
      wary: '"Marco\'s been quiet since you passed him over."',
      betrayal: '"You had your shot to make me a partner. I\'ll make my own."',
    },
  },
  {
    id: 'yolanda',
    name: 'Yolanda',
    role: 'specialist',
    traits: ['calculating', 'cautious'],
    skills: skills({ laundering: 75, tech: 60, deal: 40 }),
    agenda: 'in-it-for-money',
    bond: 'Your accountant — turns dirty weekends into clean quarterly filings.',
    startingLoyalty: 60,
    dialogue: {
      greeting: '"Numbers are clean this week. Keep them that way."',
      loyal: '"You pay right and you listen. That buys a lot of discretion."',
      wary: '"The margins you\'re giving me insult us both."',
      betrayal: '"I\'ve been keeping a second set of books. For leverage."',
    },
  },
  {
    id: 'tpopz',
    name: 'Topz',
    role: 'soldier',
    traits: ['hot-headed', 'greedy'],
    skills: skills({ muscle: 75, driving: 45 }),
    agenda: 'wants-respect',
    bond: 'Took a bullet meant for you outside the docks and never lets you forget it.',
    startingLoyalty: 50,
    dialogue: {
      greeting: '"Who we hitting? I\'m ready."',
      loyal: '"I bled for this crew. Nobody touches you while I\'m standing."',
      wary: '"I did the work and you shorted me. That\'s twice now."',
      betrayal: '"Respect is paid in cash or in blood. You chose."',
    },
  },
  {
    id: 'reyes',
    name: 'Reyes',
    role: 'soldier',
    traits: ['ambitious', 'greedy'],
    skills: skills({ muscle: 60, deal: 45, driving: 40 }),
    agenda: 'climb-the-ranks',
    bond: 'Poached from a rival crew; loyal to opportunity more than to you.',
    startingLoyalty: 44,
    dialogue: {
      greeting: '"I switch teams for the right reasons. Keep giving me reasons."',
      loyal: '"You move up, I move up. That\'s the deal I like."',
      wary: '"Your rivals have been asking about me. Just so you know."',
      betrayal: '"Better offer came in. Nothing personal — it\'s a career."',
    },
  },
  {
    id: 'iris',
    name: 'Iris',
    role: 'specialist',
    traits: ['loyal-to-a-fault', 'calculating'],
    skills: skills({ tech: 80, laundering: 35 }),
    agenda: 'wants-respect',
    bond: 'Your comms and counter-surveillance; sees the whole board before you do.',
    startingLoyalty: 64,
    dialogue: {
      greeting: '"I\'ve got eyes on everything. You\'re clean for now."',
      loyal: '"I watch your back on the wire. Nobody snoops on us."',
      wary: '"You stopped listening to my briefings. That gets people caught."',
      betrayal: '"Every line I secured, I can also open. Remember that."',
    },
  },
  // The single family/personal high-stakes relationship (design/02 §2, §7).
  {
    id: 'nadia',
    name: 'Nadia',
    role: 'family',
    traits: ['family-first', 'proud'],
    skills: skills({ deal: 30, laundering: 40 }),
    agenda: 'protect-family',
    bond: 'Your younger sister. She didn\'t choose this life — you pulled her into it.',
    startingLoyalty: 80,
    isFamily: true,
    dialogue: {
      greeting: '"Promise me you\'ll come home tonight."',
      loyal: '"Whatever this costs us, we\'re still family. I\'m with you."',
      wary: '"You keep spending us like we\'re disposable. We\'re not."',
      betrayal: '"I\'m taking what\'s left and getting out before you bury us both."',
    },
  },
] as const;

const ARCHETYPE_BY_ID: ReadonlyMap<string, CrewArchetype> = new Map(
  CREW_ARCHETYPES.map((a) => [a.id, a]),
);

/** Resolve a crew archetype, throwing on an unknown id (closed-roster guard). */
export function getCrewArchetype(id: string): CrewArchetype {
  const cfg = ARCHETYPE_BY_ID.get(id);
  if (!cfg) throw new Error(`getCrewArchetype(): unknown crew archetype "${id}"`);
  return cfg;
}

/**
 * Look up a crew archetype WITHOUT throwing (returns `undefined` if unknown).
 * Used by prose/sign helpers, which must tolerate a hydrated legacy stub whose
 * archetype id predates the roster.
 */
export function findCrewArchetype(id: string): CrewArchetype | undefined {
  return ARCHETYPE_BY_ID.get(id);
}

// --- Loyalty tuning (design/02 §4 — multi-factor, never one lever) -----------

export const CREW_LOYALTY_MIN = 0;
export const CREW_LOYALTY_MAX = 100;

/**
 * Base loyalty shift per event kind, BEFORE trait fit (design/02 §4). Loyalty
 * moves on **pay, treatment, shared success, and trait fit** — no single lever.
 * `paid`/`shortchanged` are scaled by dollars in the engine; the rest are flat.
 */
export const LOYALTY_EVENT_BASE = {
  /** Fair/generous pay (scaled by amount in the engine). */
  paid: 6,
  /** Underpaying / stiffing a cut — the classic grievance seed. */
  shortchanged: -9,
  /** Promotion to lieutenant — the biggest positive for the ambitious. */
  promoted: 12,
  /** Someone else got the seat they wanted (design/02 §4 danger combo). */
  passedOver: -11,
  /** A shared win — coming up together (design/02 §4 shared success). */
  sharedSuccess: 7,
  /** You left them to take the fall (the canonical remembered wrong, §3). */
  tookTheFall: -26,
  /** You spent capital/risk to protect them. */
  protected: 18,
  /** You confronted them about the drift — clearing the air (intervention). */
  confronted: 6,
  /** Left idle/neglected while others worked. */
  neglected: -4,
  /** A debt collector leaned on them over YOUR unpaid marker (design/13 B3;
   * Prompt 44) — your problem became their problem, and they remember. */
  leanedOn: -10,
} as const;

export type LoyaltyEventKind = keyof typeof LOYALTY_EVENT_BASE;

/** Dollars of pay/short per one loyalty point (so pay is felt, not decisive alone). */
export const LOYALTY_DOLLARS_PER_POINT = 2_500;
/** Cap on the pay-scaled magnitude of a single `paid`/`shortchanged` event. */
export const LOYALTY_PAY_POINT_CAP = 10;

/**
 * Trait fit multipliers applied on top of the base (design/02 §4 "trait fit").
 * A trait absent from an event's row contributes ×1. Multiple traits stack
 * multiplicatively, so an `ambitious`+`proud` crew passed over drops hardest —
 * the emergent danger combo, not a scripted flag.
 */
export const TRAIT_EVENT_MULTIPLIER: Readonly<
  Record<CrewTrait, Partial<Record<LoyaltyEventKind, number>>>
> = {
  greedy: { paid: 1.6, shortchanged: 1.7, protected: 0.8 },
  'loyal-to-a-fault': {
    // Forgives grievances (halves the sting); a shared win means the world.
    shortchanged: 0.4,
    passedOver: 0.4,
    tookTheFall: 0.5,
    neglected: 0.4,
    sharedSuccess: 1.4,
  },
  'hot-headed': { shortchanged: 1.5, passedOver: 1.4, tookTheFall: 1.3, confronted: 0.6 },
  ambitious: { promoted: 1.7, passedOver: 1.8, sharedSuccess: 1.2 },
  cautious: { protected: 1.3, shortchanged: 0.9 },
  'family-first': { protected: 1.6, tookTheFall: 1.5, sharedSuccess: 1.3 },
  proud: { passedOver: 1.5, tookTheFall: 1.4, shortchanged: 1.3 },
  calculating: { paid: 1.3, shortchanged: 1.2, promoted: 1.1, tookTheFall: 0.9 },
};

// --- Betrayal arc tuning (design/02 §4 — a story beat, not a dice roll) -------

/**
 * Agendas that can turn against you when mistreated (design/02 §4). A crew whose
 * agenda is NOT here (e.g. `just-survive`, `protect-family`) may resent you but
 * won't flip to a wire — they leave or endure instead. Betrayal is reserved for
 * the ambitions that a rival can *buy*.
 */
export const BETRAYAL_PRONE_AGENDAS: readonly CrewAgenda[] = [
  'wants-own-territory',
  'climb-the-ranks',
  'in-it-for-money',
  'wants-respect',
];

/**
 * Loyalty thresholds the betrayal arc steps through (design/02 §4). Each is a
 * READABLE gate: crossing down a threshold advances at most ONE stage per
 * evaluation, so warning always precedes point-of-no-return always precedes the
 * flip — and any positive loyalty event pulls the target stage back up, which is
 * the intervention window. No randomness anywhere in the arc.
 */
export const BETRAYAL_WARNING_LOYALTY = 40;
export const BETRAYAL_PONR_LOYALTY = 25;
export const BETRAYAL_FLIP_LOYALTY = 12;

/**
 * A flipped crew member becomes a **wire** feeding the heat/LE system (Prompt
 * 05/09): this much passive heat per online hour while they remain embedded.
 * Removing them (fire) stops it. Offline never runs this (GDD §6).
 */
export const WIRE_HEAT_PER_HOUR = 0.6;

// --- Development tuning (design/02 §5 — a deterministic competence track) -----

/** One `train` session raises a skill by this much (deterministic — no RNG). */
export const TRAIN_SKILL_GAIN = 12;
/** Skills cap here; training past it is rejected (there's always a next step below). */
export const CREW_SKILL_MAX = 100;
/** Clean-cash cost of one training session (a clean-cash sink; design/02 §5). */
export const TRAIN_COST = 1_500;

/**
 * Extra laundering output a **promoted lieutenant** running a front generates —
 * the "runs a front autonomously = idle delegation" payoff (design/02 §5). A
 * flipped (wire) lieutenant gives no bonus; they're sabotaging, not delegating.
 * Read by `laundering.ts` so promotion has a real, tested economic effect.
 */
export const LIEUTENANT_FRONT_BONUS = 0.15;
