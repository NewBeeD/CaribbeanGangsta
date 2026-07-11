/**
 * Plugs — connections to the TRUE SOURCE (Ideas2 §2; design/11 §2).
 *
 * A country with `plugFor` products (Colombia coke, Mexico meth/fentanyl,
 * Rotterdam synthetics, the Golden Crescent heroin/hash) sells those products
 * only to CONNECTIONS. Establishing the plug is a one-time cash intro
 * (`plugCost`); once connected, those products buy at the plug's fixed contract
 * price — the cheapest standing price in the game (`plugPriceFactor` off the
 * global board, drift-free; `world.basePriceAt`).
 *
 * Open access (Ideas.md — the tested guardrail): the plug is a PURE MONEY gate.
 * It is offered, priced, and buyable from minute one — no time lock, no
 * progression flag, no hidden requirement. "You can't get a connection to the
 * source from the get-go" (Ideas2) is true *economically*: a fresh run simply
 * can't afford the intro yet. Money is the only limiter.
 *
 * The intro is paid in CLEAN cash (the same capital pool as footholds,
 * design/09 A.5 — cartels don't bank street money they can't trace to you), and
 * taking the meeting carries a small, shown heat cost: the DEA watches who
 * flies to the source.
 */

import {
  COUNTRIES,
  findCountry,
  type CountryConfig,
  type ProductId,
} from './config/countries';
import { addHeat } from './heat';
import type { GameState } from './state';

// Moved to `config/plugs.ts` (Prompt 26); live reads use `state.config.plugs`.
export { PLUG_MEETING_HEAT } from './config/plugs';

export interface BuyPlugIntent {
  readonly type: 'buyPlug';
  readonly countryId: string;
}

export type PlugRejectReason =
  | 'unknown-country'
  /** This country is not a true source — there is no plug to buy. */
  | 'no-plug-offered'
  | 'already-connected'
  | 'insufficient-funds';

export interface PlugQuote {
  readonly countryId: string;
  readonly countryName: string;
  /** One-time clean-cash intro cost (money is the only gate). */
  readonly cost: number;
  /** The products this plug unlocks at the contract price. */
  readonly products: readonly ProductId[];
  /** Heat the meeting itself generates (shown before commit — fairness). */
  readonly meetingHeat: number;
  readonly connected: boolean;
}

export interface PlugResult {
  readonly state: GameState;
  readonly ok: boolean;
  readonly rejected?: PlugRejectReason;
  /** Clean cash spent (0 on rejection). */
  readonly cost: number;
  /** Narrative scene key (never a raw error string). */
  readonly sceneKey: string;
}

function plugCountry(countryId: string): CountryConfig | null {
  const country = findCountry(countryId);
  if (!country || !country.plugFor || country.plugFor.length === 0) return null;
  return country;
}

/** Whether the run holds the plug to `countryId`. */
export function hasPlug(state: GameState, countryId: string): boolean {
  return state.plugs.includes(countryId);
}

/** Every country that OFFERS a plug, with its standing quote (always visible). */
export function plugQuotes(state: GameState): readonly PlugQuote[] {
  const quotes: PlugQuote[] = [];
  for (const country of COUNTRIES) {
    const quote = plugQuote(state, country.id);
    if (quote) quotes.push(quote);
  }
  return quotes;
}

/** The standing quote for one country's plug, or `null` if none is offered. */
export function plugQuote(state: GameState, countryId: string): PlugQuote | null {
  const country = plugCountry(countryId);
  if (!country) return null;
  return {
    countryId: country.id,
    countryName: country.name,
    cost: country.plugCost ?? 0,
    products: country.plugFor ?? [],
    meetingHeat: state.config.plugs.PLUG_MEETING_HEAT,
    connected: hasPlug(state, country.id),
  };
}

function rejectPlug(state: GameState, rejected: PlugRejectReason): PlugResult {
  return { state, ok: false, rejected, cost: 0, sceneKey: 'plug.reject' };
}

/**
 * Establish the plug to `countryId`: spend the clean-cash intro, record the
 * connection, and take the meeting's shown heat. Rejections never mutate state.
 * Pure and deterministic — the intro is a priced purchase, never a roll.
 */
export function buyPlug(state: GameState, countryId: string): PlugResult {
  const country = findCountry(countryId);
  if (!country) return rejectPlug(state, 'unknown-country');
  if (!plugCountry(countryId)) return rejectPlug(state, 'no-plug-offered');
  if (hasPlug(state, countryId)) return rejectPlug(state, 'already-connected');

  const cost = country.plugCost ?? 0;
  if (state.cleanCash < cost) return rejectPlug(state, 'insufficient-funds');

  let next: GameState = {
    ...state,
    cleanCash: state.cleanCash - cost,
    plugs: [...state.plugs, countryId],
  };
  next = addHeat(next, state.config.plugs.PLUG_MEETING_HEAT, 'plug.meeting');

  return { state: next, ok: true, cost, sceneKey: 'plug.connected' };
}
