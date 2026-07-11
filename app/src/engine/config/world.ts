/**
 * World-generation tuning — the randomization **variety bounds** (design/01 §0a;
 * Prompt 26 centralizes). A tune-first knob (design/01 §8.7): runs must feel
 * *different* without any spawning *unwinnable* — widen these for variety, narrow
 * them for fairness, and watch the dead-on-arrival seed count (target ~0).
 *
 * These are v1 balance HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"). The per-country starting-cash and
 * bias bands live on the country roster (`config/countries.ts`); the bounds here
 * are the roster-independent draws `world.generateWorld` makes.
 */

import type { Band } from './countries';

/** Per-product price swing band; live price = base × (1 ± volatility) (design/01 §2). */
export const VOLATILITY_RANGE: Band = { min: 0.2, max: 0.5 } as const;

/** Per-run supplier heat-factor draw (>1 = a hot source this run). */
export const SUPPLIER_HEAT_FACTOR_RANGE: Band = { min: 0.8, max: 1.5 } as const;

/** A supplier whose per-run cost factor lands below this reads "cheap" this run. */
export const CHEAP_SUPPLIER_THRESHOLD = 0.95;

/** A supplier whose per-run heat factor lands above this reads "hot" this run. */
export const HOT_SUPPLIER_THRESHOLD = 1.2;
