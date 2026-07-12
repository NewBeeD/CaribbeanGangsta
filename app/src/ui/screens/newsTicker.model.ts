/**
 * The news-ticker view-model (Prompt 33; design/12 Item 6). PURE read selectors
 * that turn `state.rumors` into the lines the ticker renders on the Deal and
 * World Market screens.
 *
 * Crucially, a line NEVER exposes whether its rumor is `credible` — telling legit
 * intel from a bluff is the whole gamble (design/12 Item 6). The ticker shows the
 * word on the street and the direction it points; whether the move actually lands
 * is for the player to read off the board.
 */

import type {
  GameState,
  MarketEventDirection,
  MarketEventMagnitude,
} from '@/engine';

/** One rumor as a ticker line — headline + the swing it points at (never its truth). */
export interface TickerLine {
  readonly id: string;
  readonly headline: string;
  /** Which way the rumor says the price moves (`up` shortage / `down` glut). */
  readonly direction: MarketEventDirection;
  readonly magnitude: MarketEventMagnitude;
  /** 1-based in-game day the word hit the street (a subtle timestamp). */
  readonly postedDay: number;
}

/**
 * The currently-visible ticker lines, most recent first, capped at `limit`. A
 * rumor shows from when it posts until it expires off the feed (`expiresAtHours`).
 */
export function tickerLines(state: GameState, limit = 5): readonly TickerLine[] {
  const hours = state.clock.hours;
  return state.rumors
    .filter((r) => r.postedAtHours <= hours && r.expiresAtHours > hours)
    .slice()
    .sort((a, b) => b.postedAtHours - a.postedAtHours)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      headline: r.headline,
      direction: r.direction,
      magnitude: r.magnitude,
      postedDay: Math.floor(r.postedAtHours / 24) + 1,
    }));
}
