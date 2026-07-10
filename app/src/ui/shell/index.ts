/**
 * App shell (Prompt 14, revised per Ideas.md — open access): the store-connected
 * React layer, the offline return hook, the new-run gate, and the global error
 * boundary. Every screen is reachable from the start — money limits options, not
 * menus. Screens (Prompts 15–23) plug into `screens.tsx`; everything else here is
 * chrome + routing.
 */

export { App } from './App';
export { AppShell } from './AppShell';
export { ErrorBoundary } from './ErrorBoundary';
export { NewRunGate } from './NewRunGate';
export type { NewRunGateProps } from './NewRunGate';
export { ReturnHook } from './ReturnHook';
export type { ReturnHookProps } from './ReturnHook';
export { StoryCardModal } from './StoryCardModal';
export type { StoryCardModalProps } from './StoryCardModal';
export { SessionEndHook } from './SessionEndHook';
export { nextCardScene, pendingCardScenes } from './storyCardPresenter.model';
export type { CardScene } from './storyCardPresenter.model';
export { openLoop } from './sessionEnd.model';
export type { OpenLoop } from './sessionEnd.model';
export { TelemetryOverlay, telemetryOverlayEnabled } from './TelemetryOverlay';
export { telemetryOverlayModel, describeEvent } from './telemetryOverlay.model';
export type { TelemetryOverlayModel, OverlayLogRow } from './telemetryOverlay.model';
export { useHash, navigate } from './useHash';
export { SCREENS } from './screens';
export {
  SCREEN_NODES,
  DEFAULT_SCREEN,
  getScreenNode,
  screenForHash,
} from './nav';
export type { ScreenId, ScreenNode } from './nav';
