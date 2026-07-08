/**
 * Design tokens & theme barrel (see prompts/01_design_system.md).
 *
 * `tokens.ts` is the single source of truth for the "cinematic dossier" look;
 * `GlobalStyles` injects those tokens as CSS variables and lays down the grain
 * + vignette. `global.css` (imported by GlobalStyles) holds the reset, fonts,
 * and `cg-*` component classes the primitive kit renders against.
 */
export * from './tokens';
export { cx } from './cx';
export type { ClassValue } from './cx';
export { GlobalStyles } from './GlobalStyles';
