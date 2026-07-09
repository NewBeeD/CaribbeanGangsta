/**
 * Story-card system — schema, registry, and MVP content (design/08; Prompt 13).
 *
 * Beats (design/05) are the skeleton; cards are the flesh. The engine fires a beat
 * off simulation state, the registry binds it to a card, resolves the reputation
 * variant, and turns the chosen option's *declarative* effects into new state through
 * the engine reducers — cards never mutate state directly. Pure and deterministic.
 */

export type {
  RepTrack,
  CardTriggerType,
  HookRole,
  CardArc,
  CardEffect,
  Choice,
  ReputationVariants,
  StoryCard,
  CardValidationIssue,
} from './schema';
export { dominantRepTrack, validateCard, validateEffect } from './schema';

export {
  cardForBeat,
  applyChoice,
  applyEffect,
  getCard,
  allCards,
  isCardEligible,
  prerequisitesMet,
  hasCardFired,
  cardFiredFlag,
  variantText,
  auditRegistry,
  CARD_FIRED_PREFIX,
  MVP_CRITICAL_BEATS,
} from './registry';
export type { ApplyChoiceReject, RegistryIssue } from './registry';

export { ALL_CARDS } from './content';
