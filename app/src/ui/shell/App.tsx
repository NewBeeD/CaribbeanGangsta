import { useEffect, useState } from 'react';
import { createGame } from '@/engine';
import { GlobalStyles } from '@/ui/theme';
import { StyleGallery } from '@/ui/screens/StyleGallery';

/** Read the current location hash (SSR-safe-ish; this app is client-only). */
function useHash(): string {
  const [hash, setHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/**
 * Placeholder shell. UI prompts (14+) own the real app; per the README, UI only
 * renders engine state and dispatches intents. For now this mounts the design
 * system and exposes the primitive gallery at `#/theme` (prompts/01), falling
 * back to a scaffold proof that the React + Vite + `@/*` wiring resolves.
 */
export function App() {
  const game = createGame();
  const hash = useHash();

  return (
    <>
      <GlobalStyles />
      {hash === '#/theme' ? (
        <StyleGallery />
      ) : (
        <main
          style={{
            display: 'grid',
            placeItems: 'center',
            minHeight: '100dvh',
            gap: '0.75rem',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <h1 className="cg-title" style={{ margin: 0 }}>
            Caribbean Gangsta
          </h1>
          <p className="cg-label">App scaffolded — engine v{game.version}</p>
          <a className="cg-kicker" href="#/theme">
            View design system →
          </a>
        </main>
      )}
    </>
  );
}
