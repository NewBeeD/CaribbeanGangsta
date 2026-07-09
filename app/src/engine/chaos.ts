/**
 * The Chaos Engine (design/05 §2; design/01 §4.7; GDD §4.7) — the procedural
 * world-event system that is the game's **variable-reward core**: hurricanes, big
 * busts, task-force surges, supply gluts/crashes, rival moves, and windfalls.
 *
 * The whole design is "powerful but bounded" (GDD §5.4, §8):
 *  - **Estimable, never a hidden gamble.** Event odds come from a small per-hour
 *    rate compounded over the tick window (fair across any `dtHours`, exactly like
 *    the raid roll), and every effect is a bounded, readable nudge — price shocks
 *    can never leave the `1 ± volatility` band the deal loop already guarantees.
 *  - **Adaptive routes, not dead ends** (design/05 §2). A *major* disruption
 *    (hurricane / big bust) OPENS the Guyana/Suriname alternate corridor (a flag)
 *    instead of collapsing the world — so a setback is always recoverable.
 *  - **Telegraphed.** Every fired event enqueues its telegraph prose as a
 *    `PendingChoice` for the story-card layer (Prompt 13) — a scene, not a toast.
 *
 * Reproducibility: chaos draws from an INDEPENDENT stream keyed by the run's
 * `world.eventSeed` + the current in-game hour, so it is deterministic per run and
 * never desyncs the main deal/raid RNG (the same fork rationale as world.ts). No
 * `Math.random`, no wall clock (prompts/README.md). Registered active-only in
 * clock.ts — offline is frozen/safe (GDD §6), so absence never triggers chaos.
 */

import { createRng, type Rng } from './rng';
import { PRODUCT_IDS, type ProductId } from './config/countries';
import { LOCATION_IDS, type LocationId } from './config/locations';
import {
  ALT_ROUTE_FLAG,
  CHAOS_BASE_RATE_PER_HOUR,
  CHAOS_EVENTS,
  CHAOS_FLAG_PREFIX,
  CHAOS_MAJOR_DISRUPTION_FLAG,
  CHAOS_MAX_PER_TICK,
  CHAOS_SUPPLY_SHOCK_FLAG,
  type ChaosEffect,
  type ChaosEventConfig,
  type ChaosEventId,
} from './config/events';
import { addHeat } from './heat';
import type { MarketState, Markets } from './deals';
import type { GameState, PendingChoice, RivalState } from './state';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A fired chaos event — the config plus the run context, for telegraph + apply. */
export interface ChaosEvent {
  readonly id: ChaosEventId;
  readonly name: string;
  readonly major: boolean;
  readonly telegraph: string;
  readonly beatKey: string;
  readonly effects: readonly ChaosEffect[];
}

function toEvent(cfg: ChaosEventConfig): ChaosEvent {
  return {
    id: cfg.id,
    name: cfg.name,
    major: cfg.major,
    telegraph: cfg.telegraph,
    beatKey: cfg.beatKey,
    effects: cfg.effects,
  };
}

// --- Rolling which events fire ----------------------------------------------

/**
 * The probability at least one chaos event fires within a `dtHours` window: the
 * base per-hour rate compounded over the window (never exceeds 1). Estimable and
 * bounded — the same fair-across-tick-size shape the raid roll uses.
 */
export function chaosChance(dtHours: number): number {
  if (dtHours <= 0) return 0;
  return clamp(1 - Math.pow(1 - CHAOS_BASE_RATE_PER_HOUR, dtHours), 0, 1);
}

/**
 * Roll the Chaos Engine over `dtHours`. Returns the events that fire this tick
 * (at most `CHAOS_MAX_PER_TICK`, for a readable world), drawn by trigger weight.
 * Consumes the passed `rng` — an independent, run-seeded stream, so it is
 * reproducible per run and can never desync the main deal/raid RNG.
 */
export function rollChaos(_state: GameState, rng: Rng, dtHours: number): ChaosEvent[] {
  if (dtHours <= 0) return [];
  const events: ChaosEvent[] = [];
  for (let i = 0; i < CHAOS_MAX_PER_TICK; i++) {
    if (!rng.chance(chaosChance(dtHours))) break;
    const cfg = rng.weighted(CHAOS_EVENTS.map((e) => [e, e.weight]));
    events.push(toEvent(cfg));
  }
  return events;
}

// --- Applying an event's effects --------------------------------------------

/**
 * Push a market factor a `magnitude` fraction of the way toward its band edge, but
 * NEVER past it — the live price stays inside the `1 ± volatility` band the deal
 * loop guarantees (design/01 §2). `prevFactor` records the pre-shock value so the
 * deal screen's trend arrow reads the swing.
 */
function shockFactor(
  market: MarketState,
  direction: 'up' | 'down',
  magnitude: number,
  volatility: number,
): MarketState {
  const edge = direction === 'up' ? 1 + volatility : 1 - volatility;
  const shocked = market.factor + (edge - market.factor) * clamp(magnitude, 0, 1);
  const factor = clamp(shocked, 1 - volatility, 1 + volatility);
  return { factor, prevFactor: market.factor };
}

function volatilityFor(state: GameState, product: ProductId): number {
  const board = state.world.priceBoards.find((b) => b.product === product);
  return board ? board.volatility : 0;
}

function applyPriceShock(
  state: GameState,
  direction: 'up' | 'down',
  magnitude: number,
  scope: 'all' | ProductId,
): GameState {
  const markets = {} as Record<LocationId, Record<ProductId, MarketState>>;
  for (const location of LOCATION_IDS) {
    const perProduct = {} as Record<ProductId, MarketState>;
    for (const product of PRODUCT_IDS) {
      const current = state.markets[location][product];
      if (scope === 'all' || scope === product) {
        perProduct[product] = shockFactor(
          current,
          direction,
          magnitude,
          volatilityFor(state, product),
        );
      } else {
        perProduct[product] = current;
      }
    }
    markets[location] = perProduct;
  }
  return { ...state, markets: markets as Markets };
}

/** Raise the tension of the highest-reach rival (the one most able to move on you). */
function applyRivalTension(state: GameState, amount: number): GameState {
  if (state.rivals.length === 0) return state;
  const targetId = state.world.rivals.reduce((top, r) =>
    r.reach > top.reach ? r : top,
  ).id;
  const rivals: readonly RivalState[] = state.rivals.map((r) =>
    r.id === targetId ? { ...r, tension: clamp(r.tension + amount, 0, 100) } : r,
  );
  return { ...state, rivals };
}

function applyEffect(state: GameState, effect: ChaosEffect): GameState {
  switch (effect.kind) {
    case 'price-shock':
      return applyPriceShock(state, effect.direction, effect.magnitude, effect.scope);
    case 'heat-surge':
      return addHeat(state, effect.amount, 'chaos');
    case 'rival-tension':
      return applyRivalTension(state, effect.amount);
    case 'windfall-cash':
      return { ...state, cleanCash: state.cleanCash + effect.amount };
  }
}

/**
 * Apply one fired chaos event: fold in its bounded effects, stamp the flags the
 * beat engine keys off (per-event, plus the major-disruption / supply-shock
 * markers), OPEN the alternate corridor on a major disruption (adaptive routes,
 * design/05 §2), and enqueue the telegraph as a `PendingChoice` scene. Pure.
 */
export function applyChaos(state: GameState, event: ChaosEvent): GameState {
  let next = state;
  for (const effect of event.effects) next = applyEffect(next, effect);

  const flags: Record<string, boolean> = {
    ...next.flags,
    [`${CHAOS_FLAG_PREFIX}${event.id}`]: true,
  };
  if (event.id === 'supply-glut' || event.id === 'supply-crash') {
    flags[CHAOS_SUPPLY_SHOCK_FLAG] = true;
  }
  if (event.major) {
    flags[CHAOS_MAJOR_DISRUPTION_FLAG] = true;
    // Adaptive routes: a major disruption opens an alternate corridor, never a
    // dead end (design/05 §2; GDD §4.7).
    flags[ALT_ROUTE_FLAG] = true;
  }

  const telegraph: PendingChoice = {
    id: `chaos-${event.id}-${next.clock.hours}`,
    kind: 'chaos',
    summary: event.telegraph,
    createdAtHours: next.clock.hours,
  };

  return { ...next, flags, pendingChoices: [...next.pendingChoices, telegraph] };
}

// --- The tick step -----------------------------------------------------------

/**
 * The `chaos-roll` tick step (clock.ts, active-only). Derives an independent,
 * run-seeded chaos stream from `world.eventSeed` + the current in-game hour (so
 * it's reproducible per run and never perturbs the main RNG), rolls the engine,
 * and applies every event that fired. Offline never runs this — absence is safe.
 */
export function chaosStep(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const rng = createRng(`${state.world.eventSeed}::chaos::${state.clock.hours}`);
  const events = rollChaos(state, rng, dtHours);
  let next = state;
  for (const event of events) next = applyChaos(next, event);
  return next;
}
