import './global.css';
import { rootCssText } from './tokens';

/**
 * Mounts the design system's global layer, once, near the app root:
 *  - injects the token `:root { --cg-* }` custom properties (from `tokens.ts`),
 *  - lays down the film-grain and vignette atmosphere overlays.
 *
 * The base reset, font `@import`, and component classes live in `global.css`,
 * imported here. Render this above any `cg-*` component; without it the tokens
 * are undefined and styles fall flat.
 */
export function GlobalStyles() {
  return (
    <>
      {/* Static, token-derived string — no user input, safe to inline. */}
      <style dangerouslySetInnerHTML={{ __html: rootCssText() }} />
      <div className="cg-grain" aria-hidden="true" />
      <div className="cg-vignette" aria-hidden="true" />
    </>
  );
}
