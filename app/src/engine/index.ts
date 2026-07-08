/**
 * Public engine API.
 *
 * The engine is a PURE, headless, deterministic simulation: no DOM, no React,
 * no store imports, no `Math.random`, no `Date.now()`. Intents in -> new
 * immutable state out. See prompts/README.md "Non-negotiable engineering rules".
 *
 * Real state/reducers/intents arrive in later prompts (03+). The randomness
 * foundation and per-run world generation (Prompt 02) live here now.
 */

// Seeded RNG — the only randomness source in the engine (Prompt 02).
export { createRng, restoreRng } from './rng';
export type { Rng, RngState } from './rng';

// Per-run world generation (Prompt 02).
export { generateWorld, describeStartingHand, VOLATILITY_RANGE } from './world';
export type {
  World,
  StartingCountry,
  StartingHand,
  ResolvedPrice,
  Rival,
  SupplierMarket,
  SupplierGeography,
} from './world';

// Economy / roster config (design/01 §0a, §2).
export {
  COUNTRIES,
  PRODUCT_PRICE_BANDS,
  PRODUCT_IDS,
} from './config/countries';
export type {
  ProductId,
  Band,
  ProductPriceBand,
  CountryConfig,
} from './config/countries';
export {
  RIVAL_ARCHETYPES,
  RIVAL_NAMES,
  RIVAL_COUNT,
} from './config/rivals';
export type { RivalArchetype } from './config/rivals';

// Core run state + reducer (Prompt 03).
export {
  SCHEMA_VERSION,
  createInitialState,
  applyIntent,
  emptyInventory,
  totalDirtyCash,
  netWorth,
  empireSize,
  rngFor,
  withRngState,
} from './state';
export type {
  GameState,
  Intent,
  RunStatus,
  Clock,
  Reputation,
  Inventory,
  Stash,
  Front,
  CrewMember,
  OfficialTie,
  Corruption,
  Debt,
  RivalState,
  PendingChoice,
  HighScore,
} from './state';

// Injected-time clock + per-tick pipeline (Prompt 03).
export { tick, settleOffline, TICK_STEPS } from './clock';
export type { TickMode, TickStep } from './clock';

export const ENGINE_VERSION = '0.0.0' as const;

export interface Game {
  readonly version: string;
}

/** Minimal placeholder factory — proves the build/test wiring end to end. */
export function createGame(): Game {
  return { version: ENGINE_VERSION };
}
