/**
 * App shell (Prompt 14): the store-connected React layer, progressive disclosure,
 * the offline return hook, the new-run gate, and the global error boundary. Screens
 * (Prompts 15–23) plug into `screens.tsx`; everything else here is chrome + routing.
 */

export { App } from './App';
export { AppShell } from './AppShell';
export { ErrorBoundary } from './ErrorBoundary';
export { NewRunGate } from './NewRunGate';
export type { NewRunGateProps } from './NewRunGate';
export { ReturnHook } from './ReturnHook';
export type { ReturnHookProps } from './ReturnHook';
export { useHash, navigate } from './useHash';
export { SCREENS } from './screens';
export {
  DISCLOSURE_NODES,
  DEFAULT_SCREEN,
  disclosureState,
  resolveDisclosure,
  getDisclosureNode,
  isScreenAccessible,
  screenForHash,
} from './Disclosure';
export type { ScreenId, DisclosureState, DisclosureNode } from './Disclosure';
