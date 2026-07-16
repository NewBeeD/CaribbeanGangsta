/**
 * Prompt 33 — world price events & the legit/fake rumor ticker (design/12 Item 6).
 *
 * The acceptance contract:
 *  - an active event multiplies its market's price, decaying deterministically
 *    from `peakMultiplier` back to 1 across its window;
 *  - a FAKE rumor lands no event; a credible one lands exactly one, once;
 *  - an event's multiplier never exceeds the documented sharp band (bounded);
 *  - events shock the finite stock pool (bust drains, glut fills);
 *  - a plug's contract price is immune (drift-free AND event-free);
 *  - the world is frozen offline (the step is active-only + a dt<=0 no-op);
 *  - the tick is deterministic (same seed → same rumors/events);
 *  - the ticker never leaks a rumor's truth.
 */

import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  tunedConfig,
  getMarketPrice,
  marketEventMultiplier,
  eventFromRumor,
  shockStockForEvent,
  eventCoversCountry,
  marketEventStep,
  stockCapFor,
  tick,
  TICK_STEPS,
  type GameState,
  type MarketEvent,
  type Rumor,
} from '@/engine';
import { tickerLines } from '@/ui/screens/newsTicker.model';

/** A state whose clock sits at `hours` (events price off the clock). */
function atHour(state: GameState, hours: number): GameState {
  return { ...state, clock: { ...state.clock, hours } };
}

/** A hand-built market event for deterministic overlay assertions. */
function event(over: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id: 'ev-1',
    product: 'cocaine',
    scope: 'country',
    scopeId: 'miami',
    direction: 'up',
    magnitude: 'sharp',
    peakMultiplier: 2,
    startHours: 100,
    endHours: 100 + 48,
    ...over,
  };
}

/** A world-scope event (no `scopeId` — omitted, not undefined). */
function worldEvent(over: Partial<MarketEvent> = {}): MarketEvent {
  const { scopeId: _drop, ...rest } = event({ scope: 'world', ...over });
  void _drop;
  return rest;
}

/** A hand-built rumor landing at `landsAtHours`. */
function rumor(over: Partial<Rumor> = {}): Rumor {
  return {
    id: 'rm-1',
    product: 'cocaine',
    scope: 'country',
    scopeId: 'miami',
    direction: 'up',
    magnitude: 'moderate',
    credible: true,
    headline: 'test line',
    postedAtHours: 80,
    landsAtHours: 100,
    expiresAtHours: 200,
    ...over,
  };
}

describe('event price overlay (design/12 Item 6)', () => {
  it('multiplies at the peak on landing and decays linearly to 1', () => {
    const born = createInitialState('overlay');
    const ev = event({ peakMultiplier: 2, startHours: 100, endHours: 148 });

    const atStart = atHour({ ...born, marketEvents: [ev] }, 100);
    expect(marketEventMultiplier(atStart, 'cocaine', 'miami')).toBeCloseTo(2, 6);

    const atMid = atHour({ ...born, marketEvents: [ev] }, 124);
    expect(marketEventMultiplier(atMid, 'cocaine', 'miami')).toBeCloseTo(1.5, 6);

    const atEnd = atHour({ ...born, marketEvents: [ev] }, 148);
    // The window is [start, end); at/after end it no longer applies.
    expect(marketEventMultiplier(atEnd, 'cocaine', 'miami')).toBe(1);
  });

  it('moves the live price by the multiplier for the covered market', () => {
    const born = createInitialState('price-move');
    const bare = atHour(born, 100);
    const withEv = atHour({ ...born, marketEvents: [event({ peakMultiplier: 2 })] }, 100);
    const basePrice = getMarketPrice(bare, 'cocaine', 'miami').price;
    const shocked = getMarketPrice(withEv, 'cocaine', 'miami').price;
    // ~2× at the peak (rounding the product vs. the rounded base differs by ≤1).
    expect(Math.abs(shocked - basePrice * 2)).toBeLessThanOrEqual(1);
  });

  it('only touches covered markets (scope) and its own product', () => {
    const born = createInitialState('scope');
    const worldEv = atHour(
      { ...born, marketEvents: [worldEvent()] },
      100,
    );
    // World scope covers every country…
    expect(marketEventMultiplier(worldEv, 'cocaine', 'miami')).toBeGreaterThan(1);
    expect(marketEventMultiplier(worldEv, 'cocaine', 'rotterdam')).toBeGreaterThan(1);
    // …but never a different product.
    expect(marketEventMultiplier(worldEv, 'weed', 'miami')).toBe(1);

    const countryEv = atHour({ ...born, marketEvents: [event({ scope: 'country', scopeId: 'miami' })] }, 100);
    expect(marketEventMultiplier(countryEv, 'cocaine', 'rotterdam')).toBe(1);
  });

  it("a plug's contract price is immune to events (drift-free AND event-free)", () => {
    const born = createInitialState('plug-immune');
    // Colombia is the cocaine source — its price is plug-priced (contract).
    const worldEv = { ...born, marketEvents: [worldEvent()] };
    const bare = getMarketPrice(atHour(born, 100), 'cocaine', 'colombia');
    const under = getMarketPrice(atHour(worldEv, 100), 'cocaine', 'colombia');
    expect(bare.plugPriced).toBe(true);
    expect(under.price).toBe(bare.price); // unchanged despite a world cocaine event
  });
});

describe('rumor → event landing', () => {
  it('a credible rumor lands exactly one event, once', () => {
    const born = createInitialState('lands');
    const state = atHour({ ...born, rumors: [rumor({ landsAtHours: 100 })] }, 100);
    const after = marketEventStep(state, 24); // window (76, 100] contains 100
    const landed = after.marketEvents.filter((e) => e.id === 'event-rm-1');
    expect(landed).toHaveLength(1);

    // Ticking again past the window does not re-land it (idempotent).
    const later = marketEventStep(atHour(after, 130), 24);
    expect(later.marketEvents.filter((e) => e.id === 'event-rm-1')).toHaveLength(1);
  });

  it('a FAKE rumor never lands an event', () => {
    const born = createInitialState('fake');
    const state = atHour({ ...born, rumors: [rumor({ credible: false, landsAtHours: 100 })] }, 100);
    const after = marketEventStep(state, 24);
    expect(after.marketEvents.some((e) => e.id === 'event-rm-1')).toBe(false);
  });

  it('landing shocks the finite stock pool: bust drains, glut fills', () => {
    const born = createInitialState('stock-shock');
    const cap = stockCapFor('miami', 'cocaine', born.config.markets);
    // Seed the pool at the ceiling so a drain is unambiguous.
    const full: GameState = {
      ...born,
      markets: {
        ...born.markets,
        miami: {
          ...born.markets.miami!,
          cocaine: { ...born.markets.miami!.cocaine, stock: cap },
        },
      },
    };
    const bust = shockStockForEvent(full, event({ direction: 'up' }));
    expect(getMarketPrice(bust, 'cocaine', 'miami').stock).toBeLessThan(cap);

    const drained: GameState = {
      ...born,
      markets: {
        ...born.markets,
        miami: { ...born.markets.miami!, cocaine: { ...born.markets.miami!.cocaine, stock: 0 } },
      },
    };
    const glut = shockStockForEvent(drained, event({ direction: 'down' }));
    expect(getMarketPrice(glut, 'cocaine', 'miami').stock).toBeGreaterThan(0);
  });
});

describe('bounds, determinism & the freeze', () => {
  it('no rolled event ever exceeds the documented sharp band', () => {
    // Drive many ticks across many seeds; every event that lands stays bounded.
    const sharp = createInitialState('bounds').config.events.MARKET_EVENT_SHARP_MULT;
    for (let s = 0; s < 25; s++) {
      let state = createInitialState(`bounds-${s}`);
      for (let i = 0; i < 40; i++) state = tick(state, 24);
      for (const ev of state.marketEvents) {
        expect(ev.peakMultiplier).toBeLessThanOrEqual(sharp.max + 1e-9);
        expect(ev.peakMultiplier).toBeGreaterThanOrEqual(1 / sharp.max - 1e-9);
      }
    }
  });

  it('an up-event is >1 and within band; a down-event is its inverse (<1)', () => {
    const born = createInitialState('inverse');
    const mod = born.config.events.MARKET_EVENT_MODERATE_MULT;
    const up = eventFromRumor(born, rumor({ direction: 'up', magnitude: 'moderate' }));
    const down = eventFromRumor(born, rumor({ id: 'rm-2', direction: 'down', magnitude: 'moderate' }));
    // Up peaks inside the moderate band; down is the inverse of an in-band draw.
    expect(up.peakMultiplier).toBeGreaterThanOrEqual(mod.min - 1e-9);
    expect(up.peakMultiplier).toBeLessThanOrEqual(mod.max + 1e-9);
    expect(down.peakMultiplier).toBeLessThan(1);
    const impliedUp = 1 / down.peakMultiplier;
    expect(impliedUp).toBeGreaterThanOrEqual(mod.min - 1e-9);
    expect(impliedUp).toBeLessThanOrEqual(mod.max + 1e-9);
  });

  it('the market-events tick step never runs offline and is a dt<=0 no-op', () => {
    const step = TICK_STEPS.find((s) => s.id === 'market-events');
    // Runs while incarcerated too (the B4 sentence — the world moves inside),
    // but never on the frozen offline path (GDD §6).
    expect(step?.modes).toEqual(['active', 'incarcerated']);
    const state = createInitialState('freeze');
    expect(marketEventStep(state, 0)).toBe(state);
  });

  it('the tick is deterministic: same seed → identical rumors & events', () => {
    let a = createInitialState('determinism');
    let b = createInitialState('determinism');
    for (let i = 0; i < 30; i++) {
      a = tick(a, 24);
      b = tick(b, 24);
    }
    expect(JSON.stringify(a.rumors)).toBe(JSON.stringify(b.rumors));
    expect(JSON.stringify(a.marketEvents)).toBe(JSON.stringify(b.marketEvents));
  });

  it('the rumor rate knob gates spawning (tune-first, config not literals)', () => {
    let off = createInitialState('off', tunedConfig({ events: { MARKET_EVENT_RATE_PER_HOUR: 0 } }));
    for (let i = 0; i < 60; i++) off = tick(off, 24);
    expect(off.rumors).toHaveLength(0);
    expect(off.marketEvents).toHaveLength(0);
  });
});

describe('eventCoversCountry', () => {
  it('world covers all; region matches the region; country matches the id', () => {
    expect(eventCoversCountry(worldEvent(), 'rotterdam')).toBe(true);
    expect(eventCoversCountry(event({ scope: 'country', scopeId: 'miami' }), 'miami')).toBe(true);
    expect(eventCoversCountry(event({ scope: 'country', scopeId: 'miami' }), 'rotterdam')).toBe(false);
    // Miami is North America; Rotterdam is Europe.
    expect(eventCoversCountry(event({ scope: 'region', scopeId: 'north-america' }), 'miami')).toBe(true);
    expect(eventCoversCountry(event({ scope: 'region', scopeId: 'north-america' }), 'rotterdam')).toBe(false);
  });
});

describe('the news ticker never leaks truth (design/12 Item 6)', () => {
  it('shows visible lines, most recent first, with no credibility field', () => {
    const born = createInitialState('ticker');
    const state = atHour(
      {
        ...born,
        rumors: [
          rumor({ id: 'old', headline: 'older', postedAtHours: 50, expiresAtHours: 200 }),
          rumor({ id: 'new', headline: 'newer', postedAtHours: 90, expiresAtHours: 200 }),
          rumor({ id: 'gone', headline: 'expired', postedAtHours: 10, expiresAtHours: 40 }),
        ],
      },
      100,
    );
    const lines = tickerLines(state);
    expect(lines.map((l) => l.id)).toEqual(['new', 'old']); // recent first, expired dropped
    for (const line of lines) {
      expect(line).not.toHaveProperty('credible');
    }
  });
});
