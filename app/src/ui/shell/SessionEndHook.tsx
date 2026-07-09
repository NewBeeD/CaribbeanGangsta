/**
 * The session-end hook (Prompt 22; GDD §11, design/07 §3). At a natural stopping point
 * this surfaces the **open loop** so the player never leaves on a clean, empty state:
 * one thread resolving, one decision still open, and income accruing. That's the return
 * hook — and by design the pull is an *interesting choice*, never guilt or loss (GDD §8).
 *
 * PURE composition: every line comes from `sessionEnd.model.openLoop`; there is no game
 * logic and no "you'll lose X" framing here, ever. Rendered at the foot of the Money
 * screen (the return-payoff surface, design/07 §4) — the game's natural wrap-up point.
 */

import { useGameState } from '@/store';
import { Card, SceneText, Stat } from '@/ui/components';
import { openLoop } from './sessionEnd.model';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export function SessionEndHook() {
  const state = useGameState();
  if (!state) return null;

  const loop = openLoop(state);

  return (
    <Card heading="Before you go" data-testid="session-end">
      <SceneText who="In motion:">{loop.resolving}</SceneText>
      <SceneText who="Still open:">{loop.pending}</SceneText>
      <Stat
        label="Income accruing"
        value={`${money(loop.incomeRate)}/h`}
        tone={loop.incomeRate > 0 ? 'green' : 'default'}
      />
    </Card>
  );
}
