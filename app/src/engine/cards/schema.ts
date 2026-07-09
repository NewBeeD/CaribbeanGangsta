/**
 * The story-card schema (design/08 — the copy-this template every card fills). A
 * card is the **flesh** on a narrative beat (design/05 is the skeleton): the same
 * sim threshold fires the same beat, and the beat renders as this scene. Cards are
 * authored **beat first, trigger second** with a variant per reputation path so the
 * same moment reads differently by playstyle (design/08 intro).
 *
 * The load-bearing rule (design/08 intro; Prompt 13 acceptance): a card is **pure
 * data** — its choices carry *declarative* `CardEffect`s, never code. Nothing here
 * mutates state. The registry's `applyChoice` is the ONE place effects turn into a
 * new `GameState`, and it does so only through engine reducers (`addHeat`,
 * `loyaltyDelta`, …). That keeps every card auditable and testable (the acceptance
 * bar: a choice that says "-$5,000, +heat, unlock front" does exactly that).
 *
 * Purity/determinism (prompts/README.md): the types are plain JSON-cloneable data;
 * no functions live on a card, so content round-trips and diffs cleanly.
 */

import type { ProductId } from '../config/countries';
import type { Reputation } from '../state';
import type { LoyaltyEvent } from '../crew';
import type { BeatAct } from '../beats';

/** The three reputation tracks = three viable paths (design/01 §1; design/08). */
export type RepTrack = keyof Reputation;

/**
 * How a card is reached (design/08; design/05 §6). `deterministic` = the safe spine
 * (act-defining beats), `variable` = texture bound to a beat, `chained` = a card with
 * no beat of its own, reached only via another card's `firesCard` (e.g. the loan's
 * clear/default outcomes). Only `deterministic`/`variable` cards bind to a beat id.
 */
export type CardTriggerType = 'deterministic' | 'variable' | 'chained';

/** Which loop/retention tier this card serves (design/08 "Loop / hook role"). */
export type HookRole = 'onboarding' | 'session-end' | 'return' | 'plateau' | 'core';

/** The narrative arc a card belongs to (design/08 "Act / arc"). */
export type CardArc =
  | 'onboarding'
  | 'rival'
  | 'crew'
  | 'heat'
  | 'corruption'
  | 'storage'
  | 'debt'
  | 'economy'
  | 'arms'
  | 'endgame'
  | 'personal';

/**
 * A **declarative** engine mutation (design/08 intro; Prompt 13). A choice lists
 * these; the registry applies each through the matching engine reducer. Effects are
 * the ONLY way a card touches state — auditable, testable, deterministic.
 *
 *  - `cash`      ± clean cash (the safe, launderable money — design/01 §1).
 *  - `heat`      ± heat, routed through `addHeat` (the canonical meter mutator).
 *  - `rep`       ± one reputation track (street/business/political).
 *  - `inventory` ± aggregate units of a product.
 *  - `loyalty`   a crew loyalty event routed through `loyaltyDelta` (writes memory).
 *  - `unlock`    set a progression/onboarding flag true (a systems gate opens).
 *  - `queue-choice` enqueue a follow-up scene as a `PendingChoice` (return hook).
 */
export type CardEffect =
  | { readonly kind: 'cash'; readonly amount: number }
  | { readonly kind: 'heat'; readonly amount: number; readonly source?: string }
  | { readonly kind: 'rep'; readonly track: RepTrack; readonly amount: number }
  | { readonly kind: 'inventory'; readonly product: ProductId; readonly units: number }
  | { readonly kind: 'loyalty'; readonly crewId: string; readonly event: LoyaltyEvent }
  | { readonly kind: 'unlock'; readonly flag: string }
  | {
      readonly kind: 'queue-choice';
      readonly summary: string;
      /** Kind tag for the queued `PendingChoice` (defaults to `'card'`). */
      readonly choiceKind?: string;
    };

/**
 * One option on a card (design/08 "Choices"). `effects` are the declarative sim
 * mutations; `setsFlags` writes narrative/story flags (e.g. `silvio_hostile`);
 * `firesCard` chains to the next card (queued as a `PendingChoice`); `sceneResult`
 * is the prose shown *after* choosing (presentation only — no state).
 *
 * Aim for 2–4 choices, each with real perceived impact (Sid Meier; design/08 rules).
 */
export interface Choice {
  readonly label: string;
  readonly effects: readonly CardEffect[];
  /** Story flags this choice sets true (narrative bookkeeping, not sim effects). */
  readonly setsFlags?: Readonly<Record<string, boolean>>;
  /** Card id to fire next — chains a beat into a scene sequence (design/08). */
  readonly firesCard?: string;
  /** Prose shown after the choice resolves (presentation only — never state). */
  readonly sceneResult?: string;
}

/**
 * Per-track prose skews (design/08 "Reputation variants"). The same scene reads
 * differently by playstyle. Kept as prose only — the load-bearing `effects` live on
 * the shared `choices`, so `applyChoice` stays deterministic regardless of track
 * (the variant colours the telling, never the mechanics).
 */
export interface ReputationVariants {
  readonly street: string;
  readonly business: string;
  readonly political: string;
}

/**
 * A Story Card — one beat rendered as a playable scene (design/08 template).
 * Pure data; the registry binds it to a beat, resolves its rep variant, and applies
 * its choices' effects through the engine reducers.
 */
export interface StoryCard {
  readonly id: string;
  /**
   * The beat id (Prompt 12) this card renders, or `null` for a `chained` card that
   * has no beat and is reached only via another card's `firesCard`.
   */
  readonly trigger: string | null;
  readonly triggerType: CardTriggerType;
  readonly act: BeatAct;
  readonly arc: CardArc;
  readonly characters: readonly string[];
  readonly hookRole: HookRole;
  /** Fires once per run (tracked via a card-fired flag) — design/08 "one-shot?". */
  readonly oneShot: boolean;
  /** Flags that must ALL be set before this card is eligible (chain gating). */
  readonly prerequisites: readonly string[];
  readonly sceneText: string;
  readonly choices: readonly Choice[];
  readonly reputationVariants: ReputationVariants;
  readonly writerNotes: string;
  /** Telemetry event fired when the card is presented (design/08; design/06). */
  readonly telemetryFlag: string;
  /**
   * Set by `cardForBeat` when a card is resolved for presentation: the dominant rep
   * track whose variant applies. Absent on authored content. Presentation only.
   */
  readonly activeVariant?: RepTrack;
}

/**
 * The player's dominant reputation track (design/08 — the variant selector). Ties
 * resolve deterministically toward the "default" street path, then business: a track
 * wins only by being STRICTLY greater than the current best. Pure.
 */
export function dominantRepTrack(rep: Reputation): RepTrack {
  let best: RepTrack = 'street';
  let bestVal = rep.street;
  if (rep.business > bestVal) {
    best = 'business';
    bestVal = rep.business;
  }
  if (rep.political > bestVal) {
    best = 'political';
  }
  return best;
}

// --- Validation (Prompt 13 acceptance: every card validates) -----------------

/** A single schema violation found by `validateCard`. */
export interface CardValidationIssue {
  readonly cardId: string;
  readonly problem: string;
}

/** Non-empty, trimmed string check (used across required prose fields). */
function isText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Validate one declarative effect is well-formed. Returns a reason or `null`. */
export function validateEffect(e: CardEffect): string | null {
  switch (e.kind) {
    case 'cash':
    case 'heat':
      return Number.isFinite(e.amount) ? null : `${e.kind} amount must be finite`;
    case 'rep':
      if (!Number.isFinite(e.amount)) return 'rep amount must be finite';
      return e.track === 'street' || e.track === 'business' || e.track === 'political'
        ? null
        : 'rep track invalid';
    case 'inventory':
      return Number.isFinite(e.units) ? null : 'inventory units must be finite';
    case 'loyalty':
      return isText(e.crewId) && e.event ? null : 'loyalty needs crewId + event';
    case 'unlock':
      return isText(e.flag) ? null : 'unlock needs a flag';
    case 'queue-choice':
      return isText(e.summary) ? null : 'queue-choice needs a summary';
  }
}

/**
 * Validate a card against the schema (Prompt 13 acceptance). Checks required prose,
 * that beat-bound cards actually name a beat (and chained cards do not), that each
 * choice has a label and at least one effect/flag/chain, and that every effect is
 * well-formed. Beat-id existence and firesCard resolution are cross-checked at the
 * registry level (they need the beat table / full card set). Pure.
 */
export function validateCard(card: StoryCard): CardValidationIssue[] {
  const issues: CardValidationIssue[] = [];
  const fail = (problem: string) => issues.push({ cardId: card.id, problem });

  if (!isText(card.id)) fail('missing id');
  if (!isText(card.sceneText)) fail('missing sceneText');
  if (!isText(card.writerNotes)) fail('missing writerNotes');
  if (!isText(card.telemetryFlag)) fail('missing telemetryFlag');
  if (card.characters.length === 0) fail('no characters on screen');

  if (card.triggerType === 'chained') {
    if (card.trigger !== null) fail('chained card must not bind a beat');
  } else if (!isText(card.trigger)) {
    fail('beat-bound card needs a trigger beat id');
  }

  const v = card.reputationVariants;
  if (!isText(v.street) || !isText(v.business) || !isText(v.political)) {
    fail('all three reputation variants are required');
  }

  if (card.choices.length === 0) fail('a card needs at least one choice');
  card.choices.forEach((c, i) => {
    if (!isText(c.label)) fail(`choice ${i} missing label`);
    // A choice must DO something — a sim effect, a flag, a chain, or (for the
    // deliberate "breath"/no-reward choices, design/08) narrative feedback prose.
    const hasSomething =
      c.effects.length > 0 ||
      (c.setsFlags && Object.keys(c.setsFlags).length > 0) ||
      isText(c.firesCard ?? '') ||
      isText(c.sceneResult ?? '');
    if (!hasSomething) fail(`choice ${i} has no effect, flag, chain, or result`);
    c.effects.forEach((e, j) => {
      const reason = validateEffect(e);
      if (reason) fail(`choice ${i} effect ${j}: ${reason}`);
    });
  });

  return issues;
}
