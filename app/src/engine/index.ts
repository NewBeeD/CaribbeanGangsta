/**
 * Public engine API.
 *
 * The engine is a PURE, headless, deterministic simulation: no DOM, no React,
 * no store imports, no `Math.random`, no `Date.now()`. Intents in -> new
 * immutable state out. See prompts/README.md "Non-negotiable engineering rules".
 *
 * This is a scaffold placeholder only. Real state/reducers/intents arrive in
 * later prompts (02+). It exists now so the test harness and imports resolve.
 */

export const ENGINE_VERSION = '0.0.0' as const;

export interface Game {
  readonly version: string;
}

/** Minimal placeholder factory — proves the build/test wiring end to end. */
export function createGame(): Game {
  return { version: ENGINE_VERSION };
}
