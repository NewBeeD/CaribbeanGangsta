/**
 * The story-card registry (design/08; Prompt 13). Two jobs:
 *
 *  1. **Bind cards to beats** and resolve the reputation variant — `cardForBeat`
 *     picks the eligible card for a fired beat, skipping one-shots that already fired
 *     and cards whose prerequisite chain isn't met, and stamps the player's dominant
 *     rep track onto the returned card (design/08 variant selection).
 *  2. **Apply a choice** — `applyChoice` turns a choice's *declarative* `CardEffect`s
 *     into a new `GameState`, each routed through the matching engine reducer
 *     (`addHeat`, `loyaltyDelta`, …). This is the ONE place a card touches state, so
 *     every card stays auditable and testable (Prompt 13 acceptance).
 *
 * Purity/determinism (prompts/README.md): pure reads over `GameState`, immutable in →
 * out, no randomness, no wall clock. Cards never mutate state directly.
 */

import { addHeat } from '../heat';
import { loyaltyDelta } from '../crew';
import { emptyInventory } from '../state';
import type { GameState, Inventory, PendingChoice } from '../state';
import { BEAT_TRIGGERS } from '../beats';
import {
  dominantRepTrack,
  type CardEffect,
  type StoryCard,
} from './schema';
import { ALL_CARDS } from './content';

// --- Card-fired bookkeeping (one-shot tracking, in `state.flags`) ------------

/** Flag-key prefix marking a card that has fired this run (one-shot bookkeeping). */
export const CARD_FIRED_PREFIX = '@card-fired/';

/** The flag key that records `cardId` has fired. */
export function cardFiredFlag(cardId: string): string {
  return CARD_FIRED_PREFIX + cardId;
}

/** True if `cardId` has already fired this run. */
export function hasCardFired(state: GameState, cardId: string): boolean {
  return state.flags[cardFiredFlag(cardId)] === true;
}

// --- Registry indices --------------------------------------------------------

const CARD_BY_ID: ReadonlyMap<string, StoryCard> = new Map(
  ALL_CARDS.map((c) => [c.id, c]),
);

/** All cards bound to a given beat id, authoring order preserved. */
const CARDS_BY_BEAT: ReadonlyMap<string, readonly StoryCard[]> = (() => {
  const m = new Map<string, StoryCard[]>();
  for (const c of ALL_CARDS) {
    if (c.trigger === null) continue;
    const list = m.get(c.trigger) ?? [];
    list.push(c);
    m.set(c.trigger, list);
  }
  return m;
})();

/** Look up a card by id (chained cards included). */
export function getCard(cardId: string): StoryCard | null {
  return CARD_BY_ID.get(cardId) ?? null;
}

/** Every registered card (beat-bound and chained). */
export function allCards(): readonly StoryCard[] {
  return ALL_CARDS;
}

// --- Eligibility + variant selection -----------------------------------------

/** All this card's prerequisite flags are set (chain gating — design/08). */
export function prerequisitesMet(state: GameState, card: StoryCard): boolean {
  return card.prerequisites.every((flag) => state.flags[flag] === true);
}

/**
 * Is `card` eligible to present right now? Eligible = its prerequisite chain is met
 * AND (if one-shot) it hasn't already fired this run. Pure read.
 */
export function isCardEligible(state: GameState, card: StoryCard): boolean {
  if (card.oneShot && hasCardFired(state, card.id)) return false;
  return prerequisitesMet(state, card);
}

/**
 * The card to present for a fired beat (design/08 — beat first, then the scene),
 * with its reputation variant resolved to the player's dominant track. Returns the
 * first eligible card bound to `beatId`, or `null` when the beat has no card, or its
 * card already fired / isn't unlocked yet. The returned card is a *resolved copy*
 * carrying `activeVariant` (presentation reads the matching `reputationVariants`
 * line). Pure.
 */
export function cardForBeat(beatId: string, state: GameState): StoryCard | null {
  const candidates = CARDS_BY_BEAT.get(beatId);
  if (!candidates) return null;
  const card = candidates.find((c) => isCardEligible(state, c));
  if (!card) return null;
  return { ...card, activeVariant: dominantRepTrack(state.reputation) };
}

// --- Effect application (the one place a card touches state) ------------------

/** Set every entry of `flags` (defaulting to `true`) on the state. */
function setFlags(state: GameState, flags: Readonly<Record<string, boolean>>): GameState {
  return { ...state, flags: { ...state.flags, ...flags } };
}

/** Adjust an aggregate inventory line, never below zero. */
function adjustInventory(inv: Inventory, product: keyof Inventory, units: number): Inventory {
  const next = Math.max(0, inv[product] + units);
  return next === inv[product] ? inv : { ...inv, [product]: next };
}

/**
 * Apply ONE declarative effect through the matching engine reducer (design/08;
 * Prompt 13). Every mutation the card layer makes funnels through here, so the whole
 * effect vocabulary is auditable in one place. Pure: immutable state in → out.
 */
export function applyEffect(state: GameState, effect: CardEffect): GameState {
  switch (effect.kind) {
    case 'cash':
      // Clean cash has no dedicated reducer; this is the single auditable mutation.
      return effect.amount === 0
        ? state
        : { ...state, cleanCash: state.cleanCash + effect.amount };
    case 'heat':
      return addHeat(state, effect.amount, effect.source ?? 'story-card');
    case 'rep': {
      const track = effect.track;
      return {
        ...state,
        reputation: {
          ...state.reputation,
          [track]: state.reputation[track] + effect.amount,
        },
      };
    }
    case 'inventory':
      return {
        ...state,
        inventory: adjustInventory(
          state.inventory ?? emptyInventory(),
          effect.product,
          effect.units,
        ),
      };
    case 'loyalty':
      // Routes through the crew reducer — clamps loyalty AND writes a memory entry.
      return loyaltyDelta(state, effect.crewId, effect.event).state;
    case 'unlock':
      return setFlags(state, { [effect.flag]: true });
    case 'queue-choice': {
      const scene: PendingChoice = {
        id: `queued-${state.pendingChoices.length}-${state.clock.hours}`,
        kind: effect.choiceKind ?? 'card',
        summary: effect.summary,
        createdAtHours: state.clock.hours,
      };
      return { ...state, pendingChoices: [...state.pendingChoices, scene] };
    }
  }
}

/** Enqueue the next card in a chain (`firesCard`) as a pending scene (design/08). */
function queueFiredCard(state: GameState, card: StoryCard): GameState {
  const scene: PendingChoice = {
    id: `card-${card.id}-${state.clock.hours}`,
    kind: 'card',
    summary: card.sceneText,
    createdAtHours: state.clock.hours,
    // The presenter (Prompt 22) resolves the chained scene via `getCard`.
    cardId: card.id,
  };
  return { ...state, pendingChoices: [...state.pendingChoices, scene] };
}

/** A rejected `applyChoice` returns the state unchanged (defensive; presenter-guarded). */
export type ApplyChoiceReject = 'no-card' | 'bad-choice-index';

/**
 * Apply a card choice (design/08; Prompt 13 acceptance). Resolves the card + choice,
 * folds every declarative effect through `applyEffect` in order, writes the choice's
 * narrative `setsFlags`, records the card as fired (one-shot bookkeeping), and
 * enqueues any `firesCard` chain. Deterministic; immutable state in → out. A choice
 * that declares "-$5,000, +heat, unlock front" produces exactly that new state.
 *
 * Out-of-range / unknown ids return the state unchanged (a defensive no-op — the
 * presenter only ever passes valid indices).
 */
export function applyChoice(
  state: GameState,
  cardId: string,
  choiceIndex: number,
): GameState {
  const card = CARD_BY_ID.get(cardId);
  if (!card) return state;
  const choice = card.choices[choiceIndex];
  if (!choice) return state;

  let next = choice.effects.reduce(applyEffect, state);
  if (choice.setsFlags) next = setFlags(next, choice.setsFlags);

  // Record the card as fired so one-shots never re-present (design/08).
  next = setFlags(next, { [cardFiredFlag(cardId)]: true });

  if (choice.firesCard) {
    const chained = CARD_BY_ID.get(choice.firesCard);
    if (chained) next = queueFiredCard(next, chained);
  }
  return next;
}

/**
 * Resolve the story card a queued `PendingChoice` should present (Prompt 22 — the
 * presenter's entry point). A beat-sourced choice resolves via `cardForBeat` (which
 * skips already-fired one-shots and stamps the rep variant); a chained choice resolves
 * its `cardId` directly and gets the same variant stamp. Return-hook choices from
 * `settleOffline` carry neither, so they resolve to `null` (they route to a screen,
 * not a scene). Pure read — the variant is the player's dominant reputation track.
 */
export function cardForPending(state: GameState, choice: PendingChoice): StoryCard | null {
  if (choice.cardId) {
    const card = CARD_BY_ID.get(choice.cardId);
    if (!card || !isCardEligible(state, card)) return null;
    return { ...card, activeVariant: dominantRepTrack(state.reputation) };
  }
  if (choice.beatId) return cardForBeat(choice.beatId, state);
  return null;
}

/** The variant prose for a resolved card (or its `street` default). Presentation helper. */
export function variantText(card: StoryCard): string {
  const track = card.activeVariant ?? 'street';
  return card.reputationVariants[track];
}

// --- Content wiring integrity (used by tests + a dev-time guard) --------------

/** The MVP-critical beats that MUST have a card (Prompt 13 acceptance). */
export const MVP_CRITICAL_BEATS: readonly string[] = [
  'beat.first-sale',
  'beat.first-district',
  'beat.papa-cass-offer',
  'beat.first-front',
  'beat.port-official-offer',
  'beat.official-flip',
  'beat.crew-betrayal',
  'beat.death-spiral',
  'beat.run-ends',
];

/** A registry-level wiring problem (orphan beat binding, unresolved chain, …). */
export interface RegistryIssue {
  readonly cardId: string;
  readonly problem: string;
}

/**
 * Cross-check the whole card set against the beat table and each other (Prompt 13
 * acceptance): no beat-bound card points at a non-existent beat, every `firesCard`
 * resolves to a real card, and every MVP-critical beat has at least one card. Pure.
 */
export function auditRegistry(): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const beatIds = new Set(BEAT_TRIGGERS.map((t) => t.beatId));

  for (const c of ALL_CARDS) {
    if (c.trigger !== null && !beatIds.has(c.trigger)) {
      issues.push({ cardId: c.id, problem: `orphan trigger '${c.trigger}'` });
    }
    for (const choice of c.choices) {
      if (choice.firesCard && !CARD_BY_ID.has(choice.firesCard)) {
        issues.push({ cardId: c.id, problem: `firesCard '${choice.firesCard}' missing` });
      }
    }
  }
  for (const beatId of MVP_CRITICAL_BEATS) {
    if (!CARDS_BY_BEAT.has(beatId)) {
      issues.push({ cardId: '(none)', problem: `MVP beat '${beatId}' has no card` });
    }
  }
  return issues;
}
