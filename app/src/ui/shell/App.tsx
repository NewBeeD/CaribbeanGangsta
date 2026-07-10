import { GlobalStyles } from '@/ui/theme';
import { StyleGallery } from '@/ui/screens/StyleGallery';
import { AppShell } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { TelemetryOverlay } from './TelemetryOverlay';
import { useHash } from './useHash';

/**
 * Root component. Mounts the design system, then the live app shell inside the
 * global error boundary (Prompt 14). The design-system gallery stays reachable at
 * `#/theme` as a manual visual-check surface (prompts/01); everything else routes
 * through the shell.
 */
export function App() {
  const hash = useHash();

  return (
    <>
      <GlobalStyles />
      {hash === '#/theme' ? (
        <StyleGallery />
      ) : (
        <ErrorBoundary>
          <AppShell />
          <TelemetryOverlay />
        </ErrorBoundary>
      )}
    </>
  );
}
