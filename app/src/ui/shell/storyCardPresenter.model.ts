/**
 * The story-card presenter's view-model (Prompt 22; design/08, design/05 §4). PURE
 * reads that turn the queued `pendingChoices` into presentable scenes. A queued choice
 * becomes a scene only when it resolves to a `StoryCard` (a beat or a chained card);
 * plain return-hooks from `settleOffline` (buyer/crew/rival) carry no card and are NOT
 * scenes here — they surface as Money-screen decisions that route into a system.
 *
 * The engine owns the resolution (`cardForPending` — beat→card + rep-variant stamp);
 * this module only orders the results for the shell. No game logic, no mutation.
 */

import { cardForPending, type GameState, type StoryCard } from '@/engine';

/** A queued scene ready to present: the queue id to resolve + the resolved card. */
export interface CardScene {
  readonly choiceId: string;
  readonly card: StoryCard;
}

/**
 * Every queued choice that resolves to a presentable story card, in queue order. Beat
 * interrupts and chained cards appear here; return-hooks (no card) are filtered out.
 */
export function pendingCardScenes(state: GameState): readonly CardScene[] {
  const scenes: CardScene[] = [];
  for (const choice of state.pendingChoices) {
    const card = cardForPending(state, choice);
    if (card) scenes.push({ choiceId: choice.id, card });
  }
  return scenes;
}

/**
 * The next scene to interrupt with (design/08 — beats present immediately). The first
 * queued card, or `null` when nothing in the queue resolves to a scene. The shell shows
 * exactly one at a time; resolving it advances to the next on the following render.
 */
export function nextCardScene(state: GameState): CardScene | null {
  return pendingCardScenes(state)[0] ?? null;
}
