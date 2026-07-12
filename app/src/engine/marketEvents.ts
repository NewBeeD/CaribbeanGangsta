/**
 * World price events & the rumor ticker (design/12 Item 6; Prompt 33) — the
 * Drug-Lord-2 "prices rise/fall moderately or sharply, with news that may be
 * true or false" layer, built ON TOP of the drift board (deals.ts) and the
 * finite stock pool (design/12 Item 10).
 *
 * The lifecycle, all deterministic and active-only (the world is frozen offline,
 * GDD §6):
 *  1. **Rumor posts.** Each active tick rolls (on an INDEPENDENT run-seeded
 *     stream, like chaos — never desyncs the main deal/raid RNG) whether a fresh
 *     rumor hits the ticker. A rumor names a product, a scope, and a direction,
 *     and is `credible` only `RUMOR_TRUTH_RATE` of the time — a fake points at an
 *     event that never lands (the legit/fake-intel gamble). `credible` is engine
 *     bookkeeping the UI never sees.
 *  2. **Event lands.** A credible rumor's event begins once its lead time elapses
 *     (`landsAtHours` falls inside this tick's window — so it lands exactly once).
 *     Landing adds a `MarketEvent` overlay and SHOCKS the stock pool once (a bust
 *     drains supply, a glut fills it — one system, two levers).
 *  3. **Overlay prices.** An active event multiplies the live price for its
 *     product across its scope, decaying linearly from `peakMultiplier` back to 1
 *     by `endHours`. This is read at pricing time (`marketEventMultiplier`, in
 *     deals.ts) — a pure function of the clock, so no per-tick factor mutation.
 *  4. **Everything expires.** Events drop when their window closes; rumors drop
 *     at `expiresAtHours` (outliving their landing so the player sees it come true
 *     — or never). Both are transient WORLD data, never player holdings.
 *
 * Bounded & estimable (GDD §5.4): a multiplier can never exceed the documented
 * sharp band, so a shock is always a swing the player can read, never a wipe.
 */

import { createRng, type Rng } from './rng';
import {
  COUNTRIES,
  COUNTRY_IDS,
  PRODUCT_IDS,
  getCountry,
  type ProductId,
  type Region,
} from './config/countries';
import type {
  MarketEventScope,
  MarketEventMagnitude,
  MarketEventDirection,
} from './config/events';
import { stockCapFor, type MarketState, type Markets } from './deals';
import { productDisplayName } from './world';
import type { GameState, MarketEvent, Rumor } from './state';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The world's distinct regions, derived from the roster (no separate list to drift). */
const REGIONS: readonly Region[] = Array.from(new Set(COUNTRIES.map((c) => c.region)));

// --- Rumor / event scheduling ------------------------------------------------

/**
 * Probability at least one rumor posts within a `dtHours` window: the per-hour
 * rate compounded over the window (fair across any tick size — the same shape as
 * the chaos/raid rolls). Never exceeds 1.
 */
export function rumorChance(dtHours: number, ratePerHour: number): number {
  if (dtHours <= 0) return 0;
  return clamp(1 - Math.pow(1 - ratePerHour, dtHours), 0, 1);
}

/** Whether a landed event covers `countryId` (world = all; region/country match). */
export function eventCoversCountry(event: MarketEvent, countryId: string): boolean {
  switch (event.scope) {
    case 'world':
      return true;
    case 'region':
      return event.scopeId === getCountry(countryId).region;
    case 'country':
      return event.scopeId === countryId;
  }
}

// --- Ticker prose (content, generated at post time so the UI stays pure text) --

const REGION_LABELS: Readonly<Record<Region, string>> = {
  caribbean: 'the Caribbean',
  'latin-america': 'Latin America',
  'north-america': 'North America',
  europe: 'Europe',
  asia: 'the Asian corridor',
};

/** The in-world reach label a headline names ("every market" / a region / a country). */
function scopeLabel(scope: MarketEventScope, scopeId: string | undefined): string {
  if (scope === 'world') return 'every market';
  if (scope === 'region') return REGION_LABELS[scopeId as Region] ?? 'the region';
  return getCountry(scopeId!).name;
}

/**
 * Arms events are CONFLICT events (design/12 Item 1): an up-swing is a war /
 * coup / embargo spiking demand, a down-swing is a ceasefire flooding the market
 * with surplus. Distinct prose so the ticker reads like the arms trade, not a
 * drug shortage.
 */
function armsHeadlineTemplates(
  direction: MarketEventDirection,
  magnitude: MarketEventMagnitude,
): readonly ((product: string, where: string) => string)[] {
  if (direction === 'up') {
    return magnitude === 'sharp'
      ? [
          (_p, w) => `War just broke out across ${w} — every faction's buying iron, prices going vertical.`,
          (_p, w) => `A coup lit up ${w}. Embargo's coming; whoever's holding hardware right now is about to get rich.`,
        ]
      : [
          (_p, w) => `Tensions rising across ${w} — the militias are re-arming, prices ticking up.`,
          (_p, w) => `Word is a crackdown squeezed the pipeline into ${w}. Guns getting scarce, dear.`,
        ];
  }
  return magnitude === 'sharp'
    ? [
        (_p, w) => `Ceasefire signed across ${w} — the whole arsenal's hitting the market at once. Floor's dropping out.`,
        (_p, w) => `A peacekeeping surge flooded ${w} with confiscated hardware. Arms about to crater.`,
      ]
    : [
        (_p, w) => `Things are cooling across ${w} — surplus iron loosening up, prices softening.`,
        (_p, w) => `Chatter says a stockpile leaked into ${w}. A buyer's window on hardware, maybe.`,
      ];
}

/** Direction × magnitude → a small pool of ticker lines; one is picked per rumor. */
function headlineTemplates(
  direction: MarketEventDirection,
  magnitude: MarketEventMagnitude,
): readonly ((product: string, where: string) => string)[] {
  if (direction === 'up') {
    return magnitude === 'sharp'
      ? [
          (p, w) => `They're saying a major bust just gutted ${p} across ${w}. Brace for a spike.`,
          (p, w) => `Word is a war upstream choked off ${p} — ${w} about to run bone dry.`,
        ]
      : [
          (p, w) => `Word on the docks: a squeeze on ${p} is tightening ${w} — prices creeping up.`,
          (p, w) => `Talk is ${p} is getting scarce around ${w}. Might be worth holding what you've got.`,
        ];
  }
  return magnitude === 'sharp'
    ? [
        (p, w) => `Whole season's ${p} hit ${w} at once — word is the floor's about to drop out.`,
        (p, w) => `They're saying someone flooded ${w} with ${p}. Prices set to crater.`,
      ]
    : [
        (p, w) => `Rumor mill: extra ${p} is landing in ${w} — prices should soften.`,
        (p, w) => `Chatter says ${p} is loosening up around ${w}. A buyer's window, maybe.`,
      ];
}

function buildHeadline(
  rng: Rng,
  product: ProductId,
  productName: string,
  direction: MarketEventDirection,
  magnitude: MarketEventMagnitude,
  where: string,
): string {
  const templates =
    product === 'arms'
      ? armsHeadlineTemplates(direction, magnitude)
      : headlineTemplates(direction, magnitude);
  const template = rng.pick(templates);
  return template(productName.toLowerCase(), where);
}

// --- Rolling a rumor ---------------------------------------------------------

/**
 * Roll (on the passed independent stream) whether a fresh rumor posts this tick,
 * and if so build it. Pure — consumes `rng`, reads only config + the world for
 * prose. Returns `null` when nothing posts.
 */
export function rollRumor(state: GameState, rng: Rng, dtHours: number): Rumor | null {
  const tuning = state.config.events;
  if (!rng.chance(rumorChance(dtHours, tuning.MARKET_EVENT_RATE_PER_HOUR))) return null;

  const hours = state.clock.hours;
  const product = rng.pick(PRODUCT_IDS);
  const scope = rng.weighted(
    (Object.keys(tuning.MARKET_EVENT_SCOPE_WEIGHTS) as MarketEventScope[]).map(
      (s) => [s, tuning.MARKET_EVENT_SCOPE_WEIGHTS[s]] as [MarketEventScope, number],
    ),
  );
  const scopeId =
    scope === 'world' ? undefined : scope === 'region' ? rng.pick(REGIONS) : rng.pick(COUNTRY_IDS);
  const direction: MarketEventDirection = rng.chance(0.5) ? 'up' : 'down';
  const magnitude: MarketEventMagnitude = rng.chance(tuning.MARKET_EVENT_SHARP_CHANCE)
    ? 'sharp'
    : 'moderate';
  const credible = rng.chance(tuning.RUMOR_TRUTH_RATE);
  const lead = rng.float(tuning.RUMOR_LEAD_DAYS.min, tuning.RUMOR_LEAD_DAYS.max) * 24;
  const landsAtHours = hours + lead;
  const headline = buildHeadline(
    rng,
    product,
    productDisplayName(state.world, product),
    direction,
    magnitude,
    scopeLabel(scope, scopeId),
  );

  return {
    id: `rumor-${Math.round(hours)}-${product}-${scope}`,
    product,
    scope,
    ...(scopeId !== undefined ? { scopeId } : {}),
    direction,
    magnitude,
    credible,
    headline,
    postedAtHours: hours,
    landsAtHours,
    expiresAtHours: Math.max(landsAtHours, hours + tuning.RUMOR_TTL_DAYS * 24),
  };
}

/**
 * Build the overlay event a credible rumor lands. Its exact peak multiplier and
 * duration are drawn on a stream keyed by the rumor id, so landing is
 * deterministic and never touches the main RNG. A crash (`down`) is the inverse
 * of the up multiplier — a symmetric dip.
 */
export function eventFromRumor(state: GameState, r: Rumor): MarketEvent {
  const tuning = state.config.events;
  const rng = createRng(`${state.world.eventSeed}::market-event-land::${r.id}`);
  const band =
    r.magnitude === 'sharp' ? tuning.MARKET_EVENT_SHARP_MULT : tuning.MARKET_EVENT_MODERATE_MULT;
  const upMult = rng.float(band.min, band.max);
  const peakMultiplier = r.direction === 'up' ? upMult : 1 / upMult;
  const duration =
    rng.float(tuning.MARKET_EVENT_DURATION_DAYS.min, tuning.MARKET_EVENT_DURATION_DAYS.max) * 24;
  return {
    id: `event-${r.id}`,
    product: r.product,
    scope: r.scope,
    ...(r.scopeId !== undefined ? { scopeId: r.scopeId } : {}),
    direction: r.direction,
    magnitude: r.magnitude,
    peakMultiplier,
    startHours: r.landsAtHours,
    endHours: r.landsAtHours + duration,
  };
}

/**
 * Shock the finite stock pool the instant an event lands (design/12 Item 10): an
 * up-event (bust) drains `MARKET_EVENT_STOCK_SHOCK` of each covered market's
 * ceiling, a down-event (glut) adds it — clamped to `[0, cap]`. One-time, at
 * landing only.
 */
export function shockStockForEvent(state: GameState, event: MarketEvent): GameState {
  const shockFrac = state.config.events.MARKET_EVENT_STOCK_SHOCK;
  const { product } = event;
  const affected = COUNTRY_IDS.filter((cid) => eventCoversCountry(event, cid));
  if (affected.length === 0) return state;

  const nextMarkets = { ...state.markets } as Record<string, Record<ProductId, MarketState>>;
  for (const cid of affected) {
    const atCountry = state.markets[cid];
    const market = atCountry?.[product];
    if (!atCountry || !market) continue;
    const cap = stockCapFor(cid, product, state.config.markets);
    const delta = event.direction === 'up' ? -shockFrac * cap : shockFrac * cap;
    nextMarkets[cid] = { ...atCountry, [product]: { ...market, stock: clamp(market.stock + delta, 0, cap) } };
  }
  return { ...state, markets: nextMarkets as Markets };
}

// --- The tick step -----------------------------------------------------------

/**
 * The `market-events` tick step (clock.ts, ACTIVE-only — the world is frozen
 * offline, GDD §6): GC expired events/rumors, land every credible rumor whose
 * lead time elapsed this tick (adding the overlay + shocking stock once), then
 * roll one fresh rumor onto the ticker. Pure and deterministic — the rumor roll
 * draws from an independent run-seeded stream, never the main deal/raid RNG.
 */
export function marketEventStep(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const tuning = state.config.events;
  const hours = state.clock.hours;
  const windowStart = hours - dtHours;

  // 1. Drop closed events + stale rumors (transient, recomputable world data).
  let marketEvents = state.marketEvents.filter((e) => e.endHours > hours);
  const rumors = state.rumors.filter((r) => r.expiresAtHours > hours);

  // 2. Land every credible rumor whose lead elapsed THIS tick (its landing hour
  //    in (windowStart, hours] — so it lands exactly once), up to the active cap.
  let next = state;
  for (const r of rumors) {
    if (!r.credible) continue;
    if (r.landsAtHours <= windowStart || r.landsAtHours > hours) continue;
    if (marketEvents.length >= tuning.MARKET_EVENT_MAX_ACTIVE) break;
    const event = eventFromRumor(state, r);
    marketEvents = [...marketEvents, event];
    next = shockStockForEvent(next, event);
  }

  // 3. Roll one fresh rumor on the independent, run-seeded stream.
  const rng = createRng(`${state.world.eventSeed}::market-events::${hours}`);
  const posted = rollRumor(state, rng, dtHours);

  return {
    ...next,
    marketEvents,
    rumors: posted ? [...rumors, posted] : rumors,
  };
}
