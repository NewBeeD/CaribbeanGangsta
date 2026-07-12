/**
 * Screen registry (Prompt 14). The shell routes to one component per `ScreenId`.
 * Every entry is now a real screen — the placeholder era (prompts 15–23) is over:
 *
 *   deals → Prompt 15   empire → Prompt 16   crew → Prompt 17   money → Prompt 18
 *   heat  → Prompt 19   storage/corruption → 20   debt → 21   highscore → 23
 *
 * Screens read live run state through store selectors and dispatch intents through
 * store actions only — no game logic lives in the UI (README rule).
 */

import { DealScreen } from '@/ui/screens/DealScreen';
import { EmpireMap } from '@/ui/screens/EmpireMap';
import { CrewScreen } from '@/ui/screens/CrewScreen';
import { MoneyScreen } from '@/ui/screens/MoneyScreen';
import { HeatScreen } from '@/ui/screens/HeatScreen';
import { StorageScreen } from '@/ui/screens/StorageScreen';
import { WorldMarketScreen } from '@/ui/screens/WorldMarketScreen';
import { TransportScreen } from '@/ui/screens/TransportScreen';
import { CorruptionScreen } from '@/ui/screens/CorruptionScreen';
import { DebtScreen } from '@/ui/screens/DebtScreen';
import { ArmsScreen } from '@/ui/screens/ArmsScreen';
import { HighScoreScreen } from '@/ui/screens/HighScoreScreen';
import type { ScreenId } from './nav';

/** The route-to-component table the shell renders from. */
export const SCREENS: Readonly<Record<ScreenId, () => JSX.Element>> = {
  deals: () => <DealScreen />,
  empire: () => <EmpireMap />,
  market: () => <WorldMarketScreen />,
  transport: () => <TransportScreen />,
  crew: () => <CrewScreen />,
  money: () => <MoneyScreen />,
  heat: () => <HeatScreen />,
  storage: () => <StorageScreen />,
  corruption: () => <CorruptionScreen />,
  debt: () => <DebtScreen />,
  arms: () => <ArmsScreen />,
  highscore: () => <HighScoreScreen />,
};
