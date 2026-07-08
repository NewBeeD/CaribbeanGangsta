import { createGame } from '@/engine';

/**
 * Placeholder shell. UI prompts (14+) own the real app; per the README, UI only
 * renders engine state and dispatches intents. For now this proves the React +
 * Vite + `@/*` alias wiring resolves against the engine.
 */
export function App() {
  const game = createGame();

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        display: 'grid',
        placeItems: 'center',
        minHeight: '100dvh',
        gap: '0.5rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1 style={{ margin: 0 }}>Caribbean Gangsta</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        App scaffolded — engine v{game.version}
      </p>
    </main>
  );
}
