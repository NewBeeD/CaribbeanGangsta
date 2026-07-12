/**
 * The Chaos Engine event table & tuning (design/05 §2; design/01 §4.7; GDD §4.7).
 *
 * The Chaos Engine is the game's **variable-reward core** — the thing that makes
 * two runs of the same seed-family feel different — and it is deliberately built
 * to be *powerful but bounded* (GDD §5.4, §8): every event's odds and effects are
 * estimable, never a hidden roll and never a real-money gamble. A hurricane, a big
 * bust, a task-force surge, a supply glut/crash, a rival move, or a windfall each
 * carry a trigger `weight`, a bounded `effect`, and `telegraph` prose the player
 * reads (design/05 §2).
 *
 * **Adaptive routes, not dead ends** (design/05 §2; GDD §4.7): a *major*
 * disruption doesn't collapse the world — it **opens an alternate corridor**
 * (Guyana/Suriname). `chaos.ts` reads `major` and opens that route as a flag so a
 * setback is always recoverable.
 *
 * These are v1 balance HYPOTHESES held as config, never scattered literals
 * (prompts/README.md "Config, not literals"; Prompt 26 centralizes tuning).
 */

import type { Band, ProductId } from './countries';

/** The chaos events (design/05 §2 table). */
export type ChaosEventId =
  | 'hurricane'
  | 'big-bust'
  | 'taskforce-surge'
  | 'supply-glut'
  | 'supply-crash'
  | 'rival-move'
  | 'windfall';

/**
 * A single bounded effect an event applies. Every magnitude is small and
 * estimable — the "powerful but bounded" contract (GDD §5.4). A `price-shock`
 * pushes the live market factor a fraction of the way to its band edge (it can
 * NEVER leave the `1 ± volatility` band the deal loop already guarantees), so the
 * swing is always within the range the player can read off the board.
 */
export type ChaosEffect =
  | {
      readonly kind: 'price-shock';
      /** Push prices toward the top (`up`) or bottom (`down`) of the volatility band. */
      readonly direction: 'up' | 'down';
      /** Fraction of the remaining distance to the band edge, 0..1 (bounded). */
      readonly magnitude: number;
      /** Which product the shock hits, or `all` markets. */
      readonly scope: 'all' | ProductId;
    }
  | { readonly kind: 'heat-surge'; readonly amount: number }
  | { readonly kind: 'rival-tension'; readonly amount: number }
  | { readonly kind: 'windfall-cash'; readonly amount: number };

export interface ChaosEventConfig {
  readonly id: ChaosEventId;
  readonly name: string;
  /** Relative likelihood this event is the one that fires when chaos rolls. */
  readonly weight: number;
  /**
   * A **major disruption** (design/05 §2): opens the Guyana/Suriname alternate
   * corridor rather than dead-ending, and fires the "networks reroute" beat.
   */
  readonly major: boolean;
  /** The telegraph prose the player reads (design/05 §2 — a scene, not a stat). */
  readonly telegraph: string;
  /** The narrative-beat key this event flags for the beat engine (design/05 §2). */
  readonly beatKey: string;
  readonly effects: readonly ChaosEffect[];
}

/**
 * The event table (design/05 §2). Weights sum to nothing in particular — they are
 * relative. Effects are intentionally modest: chaos is *texture and opportunity*,
 * never a progress gamble that can wipe a careful player in one roll.
 */
export const CHAOS_EVENTS: readonly ChaosEventConfig[] = [
  {
    id: 'hurricane',
    name: 'Hurricane',
    weight: 3,
    major: true, // a port closes — the network reroutes (design/05 §2)
    telegraph:
      'A hurricane is closing the main port. Shipments stall — but a back-door corridor is opening up.',
    beatKey: 'chaos.disruption.hurricane',
    effects: [
      { kind: 'price-shock', direction: 'up', magnitude: 0.7, scope: 'all' },
    ],
  },
  {
    id: 'big-bust',
    name: 'Big Bust',
    weight: 4,
    major: true, // a corridor gets hot — supply reroutes (design/05 §2)
    telegraph:
      'A rival shipment just got seized on the main route. Everyone is spooked; the smart money is finding another way in.',
    beatKey: 'chaos.disruption.bust',
    effects: [
      { kind: 'price-shock', direction: 'up', magnitude: 0.6, scope: 'cocaine' },
      { kind: 'heat-surge', amount: 8 },
    ],
  },
  {
    id: 'taskforce-surge',
    name: 'Task-Force Surge',
    weight: 3,
    major: false,
    telegraph: 'A joint task force is sweeping the region. The streets are hot.',
    beatKey: 'chaos.taskforce-surge',
    effects: [{ kind: 'heat-surge', amount: 12 }],
  },
  {
    id: 'supply-glut',
    name: 'Supply Glut',
    weight: 4,
    major: false,
    telegraph: "The market's flooded — product is everywhere and cheap. A buyer's market.",
    beatKey: 'chaos.supply-shock',
    effects: [{ kind: 'price-shock', direction: 'down', magnitude: 0.7, scope: 'all' }],
  },
  {
    id: 'supply-crash',
    name: 'Supply Crash',
    weight: 4,
    major: false,
    telegraph: 'A drought upstream — supply dried up and prices are spiking. A seller\'s market.',
    beatKey: 'chaos.supply-shock',
    effects: [{ kind: 'price-shock', direction: 'up', magnitude: 0.7, scope: 'all' }],
  },
  {
    id: 'rival-move',
    name: 'Rival Move',
    weight: 4,
    major: false,
    telegraph: 'A rival is making a move on your turf. Tension is rising.',
    beatKey: 'chaos.rival-move',
    effects: [{ kind: 'rival-tension', amount: 15 }],
  },
  {
    id: 'windfall',
    name: 'Windfall',
    weight: 2,
    major: false,
    telegraph: 'A contact came through with a clean, no-strings favor. Money in hand.',
    beatKey: 'chaos.windfall',
    effects: [{ kind: 'windfall-cash', amount: 5_000 }],
  },
] as const;

const EVENT_BY_ID: ReadonlyMap<ChaosEventId, ChaosEventConfig> = new Map(
  CHAOS_EVENTS.map((e) => [e.id, e]),
);

/** Resolve an event config, throwing on an unknown id (closed-roster guard). */
export function getChaosEvent(id: ChaosEventId): ChaosEventConfig {
  const cfg = EVENT_BY_ID.get(id);
  if (!cfg) throw new Error(`getChaosEvent(): unknown event "${id}"`);
  return cfg;
}

// --- Rate tuning (design/01 §4.7 — bounded, estimable) -----------------------

/**
 * Base per-hour probability that SOME chaos event fires. Kept small so chaos is a
 * seasoning, not a firehose (design/05 §3 anti-firehose / plateaus): ~7% per in-game
 * day, a handful of events per in-game month. Compounded over a tick's `dtHours`
 * (like the raid roll) so it's fair across any tick size.
 */
export const CHAOS_BASE_RATE_PER_HOUR = 0.003;

/**
 * At most one chaos event resolves per tick call — a readable world (one telegraph
 * at a time), and the ethical anti-firehose lever (design/05 §3 plateaus).
 */
export const CHAOS_MAX_PER_TICK = 1;

/** Flag set on `state.flags` when a major disruption has opened the alt corridor. */
export const ALT_ROUTE_FLAG = 'route:alt-corridor-open';

/** Flag prefix stamped per event id so the beat engine can key off "this happened". */
export const CHAOS_FLAG_PREFIX = 'chaos:';

/** Flag set the first time ANY major disruption fires (drives the "reroute" beat). */
export const CHAOS_MAJOR_DISRUPTION_FLAG = 'chaos:major-disruption';

/** Flag set the first time a supply glut/crash fires (drives the market-swing beat). */
export const CHAOS_SUPPLY_SHOCK_FLAG = 'chaos:supply-shock';

// --- Narrative-beat thresholds (design/05 §2/§3; consumed by beats.ts) --------

/** Clean cash at which "you're on the map now" — the DEA opens a file (design/05 §2). */
export const ON_THE_MAP_CLEAN_CASH = 1_000_000;

/** Peak net worth at which the crown-weighs-heavy beat fires (design/05 §2). */
export const CROWN_PEAK_NET_WORTH = 10_000_000;

/** At most this many act-defining beats fire per tick — plateau spacing (design/05 §3). */
export const MAJOR_BEATS_PER_TICK = 1;

// --- World price events & rumors (design/12 Item 6; Prompt 33) ----------------
//
// A MarketEvent is a TEMPORARY multiplier laid over the drift board: a shortage
// (up) or a glut (down) that lands, peaks, and decays back to baseline across a
// few in-game days — the Drug-Lord-2 "prices rise/fall moderately or sharply"
// texture. Every event is heralded by a RUMOR on the news ticker, and a rumor is
// only true `RUMOR_TRUTH_RATE` of the time: fake intel points at an event that
// never lands (the legit/fake-news gamble the player asked for). Events also
// shock the finite stock pool (design/12 Item 10) — a bust drains supply, a glut
// fills it — so it is one system driving two levers. All bounded and estimable
// (GDD §5.4): the multiplier can never exceed the documented sharp band.
//
// v1 balance HYPOTHESES held as config (prompts/README.md "Config, not literals").

/** A market event's reach across the world board. */
export type MarketEventScope = 'world' | 'region' | 'country';

/** How hard an event moves the price — the two Drug-Lord-2 severities. */
export type MarketEventMagnitude = 'moderate' | 'sharp';

/** Which way an event moves a market: `up` = shortage/bust, `down` = glut. */
export type MarketEventDirection = 'up' | 'down';

/**
 * Per-hour probability a fresh RUMOR is posted — the rumor, not the event, is
 * the scheduled thing (a true one becomes an event after its lead time). ~1 per
 * in-game week, so the ticker breathes rather than floods (design/05 §3). Rolled
 * on an INDEPENDENT run-seeded stream (like chaos), compounded over the tick.
 */
export const MARKET_EVENT_RATE_PER_HOUR = 0.008;

/** Chance a posted rumor is TRUE (its event actually lands). The rest are fake
 * intel pointing at nothing — the legit/fake-news read (design/12 Item 6). */
export const RUMOR_TRUTH_RATE = 0.65;

/** Lead time, in in-game DAYS, between a (true) rumor posting and its event
 * landing — the news always precedes the move, so acting on it is a skill. */
export const RUMOR_LEAD_DAYS: Band = { min: 0.5, max: 2 };

/** How long a posted news line stays on the ticker, in in-game DAYS (a rumor
 * outlives its landing so the player can see it come true — or never). */
export const RUMOR_TTL_DAYS = 3;

/** How long a landed event's multiplier takes to decay back to baseline, DAYS. */
export const MARKET_EVENT_DURATION_DAYS: Band = { min: 2, max: 5 };

/** The peak price multiplier band for a MODERATE up-event (a crash is its
 * inverse — ×1/mult — so a moderate glut is a symmetric dip). */
export const MARKET_EVENT_MODERATE_MULT: Band = { min: 1.3, max: 1.6 };

/** The peak price multiplier band for a SHARP up-event — the documented outer
 * bound on how far ANY event can move a price (a crash is its inverse). */
export const MARKET_EVENT_SHARP_MULT: Band = { min: 2.0, max: 3.0 };

/** Fraction of rolled events that are SHARP rather than moderate (sharp is the
 * rarer, headline swing). */
export const MARKET_EVENT_SHARP_CHANCE = 0.3;

/** Fraction of a market's stock CEILING an event moves on landing: an up-event
 * (bust) drains this much, a down-event (glut) adds it (design/12 Item 10). */
export const MARKET_EVENT_STOCK_SHOCK = 0.5;

/** At most this many events overlay the board at once — a readable world (one
 * or two live swings, not a storm). Extra rolls are dropped, not queued. */
export const MARKET_EVENT_MAX_ACTIVE = 3;

/** Relative likelihoods of each scope when a rumor rolls — most events are
 * local, a few regional, world-wide is rare (the big one). */
export const MARKET_EVENT_SCOPE_WEIGHTS: Readonly<Record<MarketEventScope, number>> = {
  country: 5,
  region: 3,
  world: 1,
};
