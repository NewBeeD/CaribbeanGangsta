/**
 * Screen registry (Prompt 14). The shell routes to one component per `ScreenId`.
 * The remaining entries are minimal, wired PLACEHOLDERS that later prompts replace
 * one-for-one (deals is now the real screen, Prompt 15):
 *
 *   deals → Prompt 15 (live)   empire → Prompt 16   crew  → Prompt 17
 *   money → Prompt 18          heat   → Prompt 19   highscore → Prompt 23
 *
 * They already read live run state through the store selector (proving the shell
 * plumbs state through), and render nothing but glanceable status — no intents, no
 * game logic (README UI rule). Swap the mapping entry as each real screen lands.
 */

import { useGameState } from '@/store';
import { Card, SceneText } from '@/ui/components';
import { DealScreen } from '@/ui/screens/DealScreen';
import { getDisclosureNode, type ScreenId } from './Disclosure';

interface PlaceholderProps {
  readonly id: ScreenId;
  readonly promptNo: number;
}

function PlaceholderScreen({ id, promptNo }: PlaceholderProps) {
  const state = useGameState();
  const node = getDisclosureNode(id);
  const label = node?.label ?? id;

  return (
    <Card heading={label}>
      <SceneText tone="default">
        {node?.aspiration ?? 'Coming together.'}
      </SceneText>
      <p className="cg-label" style={{ marginTop: 12 }}>
        Screen under construction · Prompt {promptNo}
      </p>
      {state ? (
        <p className="cg-label" style={{ marginTop: 6 }}>
          Day {state.clock.day} · Week {state.clock.week}
        </p>
      ) : null}
    </Card>
  );
}

/** The route-to-component table the shell renders from. */
export const SCREENS: Readonly<Record<ScreenId, () => JSX.Element>> = {
  deals: () => <DealScreen />,
  empire: () => <PlaceholderScreen id="empire" promptNo={16} />,
  crew: () => <PlaceholderScreen id="crew" promptNo={17} />,
  money: () => <PlaceholderScreen id="money" promptNo={18} />,
  heat: () => <PlaceholderScreen id="heat" promptNo={19} />,
  highscore: () => <PlaceholderScreen id="highscore" promptNo={23} />,
};
