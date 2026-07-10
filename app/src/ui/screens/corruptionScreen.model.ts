/**
 * The Corruption screen's view-model (Prompt 20; design/09 System B, GDD §4.9). PURE
 * read selectors that turn the `GameState` into the *who to buy* decision made
 * legible: per-shipment **port bribes** (the asking price + resulting seizure %
 * shown BEFORE you commit, with the haggle odds), and the **standing payroll**
 * (weekly cost + standing benefit, raise-asks, and telegraphed flip warnings as
 * prose). Every number shown is exactly the number the engine charges / rolls (the
 * fairness law, design/09 B intro).
 *
 * Ethics (design/09 B.3): payroll is optional, deterministic power — not a loot box,
 * never pay-to-win. A missed payment is an in-fiction consequence the player
 * controls; the menace lands on the character, never as guilt at the human.
 *
 * The screen composes these and dispatches corruption intents through the store; it
 * authors NO price/loyalty/probability math (README UI rule).
 */

import {
  COUNTRIES,
  HAGGLE_DISCOUNT,
  HAGGLE_REFUSE_CHANCE,
  OFFICIALS,
  PRODUCT_IDS,
  boardFor,
  getMarketPrice,
  getStashType,
  isTraded,
  quoteBribe,
  type GameState,
  type OfficialId,
  type OfficialTie,
  type ProductId,
  type Stash,
} from '@/engine';

/** The shown-and-rolled chance a haggle is refused this run (fairness law), as a %. */
export const HAGGLE_REFUSE_PCT = Math.round(HAGGLE_REFUSE_CHANCE * 100);
/** How much a successful haggle knocks off the ask, as a %. */
export const HAGGLE_DISCOUNT_PCT = Math.round(HAGGLE_DISCOUNT * 100);

/** Display name for a country id (a port is keyed by the country it sits in). */
function countryName(id: string): string {
  return COUNTRIES.find((c) => c.id === id)?.name ?? id;
}

/** Container (port-linked) stashes — the only ones a paid port protects (design/09 A.3). */
function portStashes(state: GameState): readonly Stash[] {
  return state.stashes.filter((s) => getStashType(s.type).portLinked);
}

/**
 * The dollar value staged through a country's port — its container stashes' dirty
 * cash plus product units valued at their live sell price. This is the shipment
 * value the bribe ask scales against (design/09 B.1), read straight off the markets
 * so the shown ask matches what `payBribe` charges.
 */
export function shipmentValueAt(state: GameState, countryId: string): number {
  // Units are valued at THIS country's live sell price; a product with no local
  // market (Ideas2 §5 regional cultures) is valued at its global source board.
  const sellPrice = (s: Stash, id: ProductId): number =>
    isTraded(s.countryId, id)
      ? getMarketPrice(state, id, s.countryId).sell
      : Math.round(boardFor(state.world, id).sell);
  return portStashes(state)
    .filter((s) => s.countryId === countryId)
    .reduce((sum, s) => {
      const product = PRODUCT_IDS.reduce(
        (v, id) => v + (s.inventory[id] ?? 0) * sellPrice(s, id),
        0,
      );
      return sum + s.dirtyCash + product;
    }, 0);
}

/** Whether a country's port is currently paid (and not lapsed) — feeds container seizure. */
function isPortPaid(state: GameState, countryId: string): boolean {
  return state.corruption.paidPorts.some(
    (p) =>
      p.portId === countryId &&
      (p.paidUntilHours === undefined || p.paidUntilHours > state.clock.hours),
  );
}

/** Whether a country's paid port is STANDING (a customs chief — never expires). */
function isPortStanding(state: GameState, countryId: string): boolean {
  return state.corruption.paidPorts.some(
    (p) => p.portId === countryId && p.paidUntilHours === undefined,
  );
}

/** One port's bribe negotiation — everything shown BEFORE committing (design/09 B.1). */
export interface PortRow {
  /** The port id == the country id (a container stash routes through it). */
  readonly portId: string;
  readonly name: string;
  readonly shipmentValue: number;
  /** The asking price, $ — exactly what `payBribe` charges (shown == charged). */
  readonly ask: number;
  /** Seizure % if you DON'T pay, and the floor once you do — both as whole percents. */
  readonly unpaidSeizurePctLabel: string;
  readonly paidSeizurePctLabel: string;
  readonly paid: boolean;
  readonly standing: boolean;
  readonly containerNames: readonly string[];
}

/**
 * A port row per country that holds a container stash (the only place a port bribe
 * has a visible effect). Empty when no container stash exists yet — the screen then
 * points the player to build one.
 */
export function portRows(state: GameState): readonly PortRow[] {
  const countryIds = [...new Set(portStashes(state).map((s) => s.countryId))];
  return countryIds.map((countryId) => {
    const value = shipmentValueAt(state, countryId);
    const quote = quoteBribe(state, countryId, value);
    const here = portStashes(state).filter((s) => s.countryId === countryId);
    return {
      portId: countryId,
      name: `${countryName(countryId)} port`,
      shipmentValue: value,
      ask: quote.ask,
      unpaidSeizurePctLabel: `${Math.round(quote.baseSeizurePct * 100)}%`,
      paidSeizurePctLabel: `${Math.round(quote.resultingSeizurePct * 100)}%`,
      paid: isPortPaid(state, countryId),
      standing: isPortStanding(state, countryId),
      containerNames: here.map((s) => s.name),
    };
  });
}

/** An official the player can put on the payroll (design/09 B.2). */
export interface HireOption {
  readonly officialId: OfficialId;
  readonly name: string;
  readonly retainerPerWeek: number;
  readonly benefitSummary: string;
  readonly affordable: boolean;
  /** A customs chief covers a specific port — hiring needs a port country. */
  readonly needsPort: boolean;
}

/** The roster of officials not yet hired — all offered from minute one (open access). */
export function hireOptions(state: GameState): readonly HireOption[] {
  const owned = new Set(state.corruption.officials.map((o) => o.officialId));
  return OFFICIALS.filter((o) => !owned.has(o.id)).map((o) => ({
    officialId: o.id,
    name: o.name,
    retainerPerWeek: o.retainerPerWeek,
    benefitSummary: o.benefitSummary,
    affordable: state.cleanCash >= o.retainerPerWeek,
    needsPort: o.benefit === 'port-seizure-floor',
  }));
}

/** The country a customs chief's standing port defaults to (a container's port, else home). */
export function defaultPortCountryId(state: GameState): string {
  return portStashes(state)[0]?.countryId ?? state.world.startingCountry.id;
}

/** A pending raise-ask surfaced as prose + its number (design/09 B.2 v1.1). */
export interface RaiseAskView {
  readonly newRetainer: number;
  readonly reason: string;
}

/** One official on the payroll — status read as prose, never a loyalty number. */
export interface PayrollRow {
  readonly id: string;
  readonly officialId: string;
  readonly name: string;
  readonly retainerPerWeek: number;
  readonly benefitSummary: string;
  /** Their standing, as prose (design/02 §1 — loyalty is never a bar/number). */
  readonly statusLine: string;
  readonly isWire: boolean;
  /** The current flip-arc sign, when an arc is telegraphing (design/09 B.2). */
  readonly arcSign: string | null;
  /** Heat is above their comfort threshold — cooling it walks the arc back. */
  readonly nervous: boolean;
  readonly pendingRaise: RaiseAskView | null;
}

/** The status prose for an official — flip sign, nerves, or steady (no numbers). */
function statusLine(state: GameState, o: OfficialTie): string {
  if (o.isWire) return 'Flipped — a wire now, feeding the other side everything.';
  if (o.activeArc) return o.activeArc.sign;
  if (state.heat > o.comfortHeat) {
    return 'Getting nervous — the heat’s above what they’re comfortable with.';
  }
  return 'On the payroll and steady.';
}

export function payrollRows(state: GameState): readonly PayrollRow[] {
  return state.corruption.officials.map((o) => {
    const cfg = OFFICIALS.find((c) => c.id === o.officialId);
    return {
      id: o.id,
      officialId: o.officialId,
      name: o.name,
      retainerPerWeek: o.retainerPerWeek,
      benefitSummary: cfg?.benefitSummary ?? 'Standing protection.',
      statusLine: statusLine(state, o),
      isWire: o.isWire === true,
      arcSign: o.activeArc?.sign ?? null,
      nervous: !o.isWire && state.heat > o.comfortHeat,
      pendingRaise: o.pendingRaise
        ? { newRetainer: o.pendingRaise.newRetainer, reason: o.pendingRaise.reason }
        : null,
    };
  });
}

/** Total weekly payroll — the standing-cost readout (design/09 B.2). */
export function payrollPerWeek(state: GameState): number {
  return state.corruption.payrollPerWeek;
}

/** A telegraphed flip queued as a scene (design/09 B.2 — a warning, never a surprise). */
export interface FlipWarning {
  readonly id: string;
  readonly text: string;
}

/** Any pending official-flip telegraphs, surfaced as scenes (presenter lands in Prompt 22). */
export function flipWarnings(state: GameState): readonly FlipWarning[] {
  return state.pendingChoices
    .filter((c) => c.kind === 'official-flip')
    .map((c) => ({ id: c.id, text: c.summary }));
}
