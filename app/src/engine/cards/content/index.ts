/**
 * The MVP story-card set (design/08 — the worked examples, ported to data). Cards are
 * grouped by arc into sibling files; this module aggregates them into the single
 * `ALL_CARDS` list the registry indexes. Adding an arc = add its file + one entry
 * here.
 *
 * Coverage (Prompt 13): onboarding spine (first sale → guided flow → heat scare →
 * first crew → session-end hook), the first rival grudge arc, Papa Cass's debt hook
 * with its clear/default outcomes, the corruption network + its flip, the storage
 * raid + diversification lesson, the mid/late-game milestone beats, and the run-end
 * fall + tally.
 */

import type { StoryCard } from '../schema';
import { ONBOARDING_CARDS } from './onboarding';
import { RIVAL_CARDS } from './rival';
import { DEBT_CARDS } from './debt';
import { CORRUPTION_CARDS } from './corruption';
import { STORAGE_CARDS } from './storage';
import { CREW_CARDS } from './crew';
import { WORLD_CARDS } from './world';
import { ENDGAME_CARDS } from './endgame';

export const ALL_CARDS: readonly StoryCard[] = [
  ...ONBOARDING_CARDS,
  ...RIVAL_CARDS,
  ...DEBT_CARDS,
  ...CORRUPTION_CARDS,
  ...STORAGE_CARDS,
  ...CREW_CARDS,
  ...WORLD_CARDS,
  ...ENDGAME_CARDS,
];

export {
  ONBOARDING_CARDS,
  RIVAL_CARDS,
  DEBT_CARDS,
  CORRUPTION_CARDS,
  STORAGE_CARDS,
  CREW_CARDS,
  WORLD_CARDS,
  ENDGAME_CARDS,
};
